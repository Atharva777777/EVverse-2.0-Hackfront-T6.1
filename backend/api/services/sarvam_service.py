"""
backend/api/services/sarvam_service.py
======================================
The ONLY place EVverse talks to Sarvam AI (https://docs.sarvam.ai).

APIs used (official Python SDK `sarvamai`):
    * Chat Completions  POST https://api.sarvam.ai/v1/chat/completions
        default model  `sarvam-105b-conversations` (reasoning off, low latency; override with SARVAM_CHAT_MODEL)
    * Speech-to-Text    POST https://api.sarvam.ai/speech-to-text
        default model  `saaras:v4`, mode `transcribe`, language auto-detect (`unknown`)

Guarantees
    * The API key is read from SARVAM_API_KEY on the server only. It is never returned, logged,
      or placed in a NEXT_PUBLIC_* variable.
    * Every call has a hard timeout and a bounded retry budget (429 / 500 / 502 / 503 / timeouts only).
      400 / 402 / 403 / 422 are never retried, per Sarvam's error guidance.
    * A small circuit breaker stops us hammering a failing provider.
    * Failures surface as `SarvamError` with a stable `code`; callers fall back to deterministic behaviour.
    * Logs carry operation, model, latency, attempt and error code only - never prompts, transcripts,
      audio, or user identifiers.

Nothing in the journey calculation path imports this module.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("evverse.sarvam")

DEFAULT_CHAT_MODEL = "sarvam-105b-conversations"
DEFAULT_STT_MODEL = "saaras:v4"

# Languages Saaras v4 / Sarvam chat understand (BCP-47 codes from the Sarvam docs).
SUPPORTED_LANGUAGES: Dict[str, str] = {
    "en-IN": "English", "hi-IN": "Hindi", "bn-IN": "Bengali", "ta-IN": "Tamil", "te-IN": "Telugu",
    "mr-IN": "Marathi", "gu-IN": "Gujarati", "kn-IN": "Kannada", "ml-IN": "Malayalam",
    "pa-IN": "Punjabi", "od-IN": "Odia", "as-IN": "Assamese", "ur-IN": "Urdu", "ne-IN": "Nepali",
    "kok-IN": "Konkani", "ks-IN": "Kashmiri", "sd-IN": "Sindhi", "sa-IN": "Sanskrit",
    "sat-IN": "Santali", "mni-IN": "Manipuri", "brx-IN": "Bodo", "mai-IN": "Maithili", "doi-IN": "Dogri",
}

MAX_AUDIO_BYTES = 3 * 1024 * 1024  # sync STT is limited to 30 s; this is a generous size guard


class SarvamError(Exception):
    """Provider problem. `code` is stable and safe to show; `message` never contains secrets."""

    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class SarvamSettings:
    api_key: Optional[str]
    chat_model: str
    stt_model: str
    timeout_s: float
    max_retries: int


def load_settings() -> SarvamSettings:
    def _num(name: str, default: float, lo: float, hi: float) -> float:
        try:
            return min(hi, max(lo, float(os.environ.get(name, default))))
        except ValueError:
            return default

    key = (os.environ.get("SARVAM_API_KEY") or "").strip() or None
    return SarvamSettings(
        api_key=key,
        chat_model=os.environ.get("SARVAM_CHAT_MODEL", DEFAULT_CHAT_MODEL).strip() or DEFAULT_CHAT_MODEL,
        stt_model=os.environ.get("SARVAM_STT_MODEL", DEFAULT_STT_MODEL).strip() or DEFAULT_STT_MODEL,
        timeout_s=_num("SARVAM_TIMEOUT_SECONDS", 12.0, 2.0, 60.0),
        max_retries=int(_num("SARVAM_MAX_RETRIES", 2, 0, 3)),  # hard-bounded
    )


# ── Circuit breaker ───────────────────────────────────────────────────────────

class _Breaker:
    FAILURES_TO_OPEN = 3
    OPEN_SECONDS = 30.0
    FATAL_OPEN_SECONDS = 120.0  # bad key / no credits: retrying won't help

    def __init__(self) -> None:
        self.failures = 0
        self.open_until = 0.0

    def is_open(self) -> bool:
        return time.monotonic() < self.open_until

    def success(self) -> None:
        self.failures = 0
        self.open_until = 0.0

    def failure(self, fatal: bool) -> None:
        self.failures += 1
        if fatal:
            self.open_until = time.monotonic() + self.FATAL_OPEN_SECONDS
        elif self.failures >= self.FAILURES_TO_OPEN:
            self.open_until = time.monotonic() + self.OPEN_SECONDS


breaker = _Breaker()


def is_available() -> bool:
    """True when a key is configured and the breaker is closed. Makes no network call."""
    return load_settings().api_key is not None and not breaker.is_open()


# ── Client ────────────────────────────────────────────────────────────────────

def _make_client(api_key: str) -> Any:
    try:
        from sarvamai import AsyncSarvamAI
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise SarvamError("not_configured", "The Sarvam SDK is not installed.") from exc
    return AsyncSarvamAI(api_subscription_key=api_key)


def _classify(exc: Exception) -> SarvamError:
    """Map SDK / transport exceptions onto stable error codes."""
    if isinstance(exc, SarvamError):
        return exc
    if isinstance(exc, (asyncio.TimeoutError, httpx.TimeoutException)):
        return SarvamError("timeout", "Sarvam took too long to respond.", retryable=True)

    status = getattr(exc, "status_code", None)
    body = getattr(exc, "body", None)
    err_code = ""
    if isinstance(body, dict):
        inner = body.get("error", body)
        if isinstance(inner, dict):
            err_code = str(inner.get("code") or "")

    if status == 403:
        return SarvamError("auth", "Sarvam rejected the API key.")
    if status == 402 or err_code in ("insufficient_quota_error", "seat_budget_exhausted_error"):
        return SarvamError("quota", "Sarvam credits are exhausted.")
    if status == 429:
        return SarvamError("rate_limited", "Sarvam is rate limiting requests.", retryable=True)
    if status in (500, 502, 503):
        return SarvamError("provider_error", "Sarvam is temporarily unavailable.", retryable=True)
    if status in (400, 413, 422):
        return SarvamError("bad_request", "Sarvam could not process that request.")
    if isinstance(exc, httpx.TransportError):
        return SarvamError("provider_error", "Could not reach Sarvam.", retryable=True)
    return SarvamError("provider_error", "Unexpected Sarvam error.")


def _retry_after(exc: Exception) -> Optional[float]:
    headers = getattr(exc, "headers", None) or {}
    try:
        for k, v in headers.items():
            if str(k).lower() == "retry-after":
                return min(5.0, max(0.0, float(v)))
    except (ValueError, TypeError, AttributeError):
        pass
    return None


async def _call(op: str, model: str, fn: Any) -> Any:
    """Run `fn(request_options)` with timeout, bounded retries, breaker and safe logging."""
    cfg = load_settings()
    if cfg.api_key is None:
        raise SarvamError("not_configured", "Sarvam AI is not configured.")
    if breaker.is_open():
        raise SarvamError("circuit_open", "Sarvam AI is paused after repeated errors.")

    # We own the retry loop (so the budget is exact); the SDK must not retry underneath us.
    opts = {"timeout_in_seconds": int(max(1, round(cfg.timeout_s))), "max_retries": 0}
    attempts = 1 + cfg.max_retries
    last: Optional[SarvamError] = None

    for attempt in range(1, attempts + 1):
        started = time.monotonic()
        try:
            result = await asyncio.wait_for(fn(opts), timeout=cfg.timeout_s + 2)
            breaker.success()
            log.info("sarvam_call ok op=%s model=%s attempt=%d ms=%d", op, model, attempt, (time.monotonic() - started) * 1000)
            return result
        except Exception as exc:  # noqa: BLE001 - everything is classified below
            err = _classify(exc)
            last = err
            log.warning(
                "sarvam_call fail op=%s model=%s attempt=%d code=%s ms=%d",
                op, model, attempt, err.code, (time.monotonic() - started) * 1000,
            )
            if not err.retryable or attempt == attempts:
                break
            delay = _retry_after(exc)
            if delay is None:
                delay = min(4.0, 0.5 * (2 ** (attempt - 1))) + random.uniform(0, 0.25)
            await asyncio.sleep(delay)

    assert last is not None
    breaker.failure(fatal=last.code in ("auth", "quota"))
    raise last


# ── Operations ────────────────────────────────────────────────────────────────

_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def extract_json_object(text: str) -> str:
    """Pull the first JSON object out of a model reply (tolerates code fences / chatter)."""
    text = _THINK.sub("", text or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise SarvamError("bad_output", "The model did not return a JSON object.")
    return text[start : end + 1]


async def chat_json(system: str, user: str, *, max_tokens: int = 700, temperature: float = 0.1) -> str:
    """One chat completion constrained to a JSON object. Returns the raw JSON text (still untrusted)."""
    cfg = load_settings()

    async def run(opts: Dict[str, Any]) -> Any:
        client = _make_client(cfg.api_key or "")
        return await client.chat.completions(
            model=cfg.chat_model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
            request_options=opts,
        )

    resp = await _call("chat", cfg.chat_model, run)
    try:
        choice = resp.choices[0]
        content = choice.message.content or ""
        finish = getattr(choice, "finish_reason", None)
    except (AttributeError, IndexError, TypeError) as exc:
        raise SarvamError("bad_output", "Unexpected response from Sarvam.") from exc
    if finish == "length" or not content.strip():
        raise SarvamError("bad_output", "The model's reply was empty or cut off.")
    return extract_json_object(content)


@dataclass(frozen=True)
class Transcript:
    text: str
    language_code: Optional[str]


async def transcribe(audio: bytes, content_type: str = "audio/webm", language_code: Optional[str] = None) -> Transcript:
    """Speech-to-text with Saaras. `language_code=None` lets Sarvam auto-detect."""
    if not audio:
        raise SarvamError("bad_request", "No audio received.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise SarvamError("bad_request", "That recording is too large. Keep it under 30 seconds.")
    if language_code is not None and language_code not in SUPPORTED_LANGUAGES:
        raise SarvamError("bad_request", "Unsupported language.")

    cfg = load_settings()
    ext = {"webm": "webm", "ogg": "ogg", "mp4": "mp4", "mpeg": "mp3", "wav": "wav", "x-wav": "wav"}.get(
        content_type.split("/")[-1].split(";")[0].strip().lower(), "webm"
    )

    async def run(opts: Dict[str, Any]) -> Any:
        client = _make_client(cfg.api_key or "")
        return await client.speech_to_text.transcribe(
            file=(f"journey.{ext}", audio, content_type.split(";")[0] or "audio/webm"),
            model=cfg.stt_model,
            mode="transcribe",
            language_code=language_code or "unknown",
            request_options=opts,
        )

    resp = await _call("stt", cfg.stt_model, run)
    text = (getattr(resp, "transcript", "") or "").strip()
    if not text:
        raise SarvamError("bad_output", "We couldn't hear anything in that recording.")
    lang = getattr(resp, "language_code", None)
    return Transcript(text=text[:300], language_code=lang if lang in SUPPORTED_LANGUAGES else None)


# ── Per-driver call budget (protects the account's rate limit) ────────────────

class _Budget:
    def __init__(self, per_minute: int = 30) -> None:
        self.per_minute = per_minute
        self.hits: Dict[str, List[float]] = {}

    def allow(self, driver_id: str) -> bool:
        now = time.monotonic()
        window = [t for t in self.hits.get(driver_id, []) if now - t < 60.0]
        if len(window) >= self.per_minute:
            self.hits[driver_id] = window
            return False
        window.append(now)
        self.hits[driver_id] = window
        return True


budget = _Budget()
