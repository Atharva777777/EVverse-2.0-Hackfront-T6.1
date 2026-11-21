# Sarvam AI in EVVERSE Journey Intelligence

Sarvam AI is an **optional assistive layer**. The deterministic engines (energy physics, feasibility, charging-stop
selection) never call it, and the planner works identically with the key absent, the provider down, or the
circuit breaker open.

## What it does

| Feature | Endpoint (FastAPI) | Sarvam API used | Fallback without Sarvam |
|---|---|---|---|
| Natural-language / multilingual journey input | `POST /api/v1/journey/intent` | Chat Completions | rule-based parser (English) through the **same** validation |
| Optional voice input | `POST /api/v1/journey/transcribe` | Speech-to-Text (Saaras) | mic button is hidden |
| Plain-language explanation of a result | `POST /api/v1/journey/explain` | Chat Completions | none shown; deterministic text is always on screen |
| Availability probe (no provider call) | `GET /api/v1/journey/ai/status` | – | `available: false` |

`POST /api/v1/journey/analyze` (the actual journey calculation) **never** touches Sarvam.

## Sarvam API details (from https://docs.sarvam.ai)

* SDK: official Python package **`sarvamai`** (`pip install sarvamai`, tested with 0.1.48), `AsyncSarvamAI(api_subscription_key=...)`.
  Integration point is the existing FastAPI service (no separate AI backend); `backend/api/services/sarvam_service.py`.
* Chat: `POST https://api.sarvam.ai/v1/chat/completions` via `client.chat.completions(...)`.
  Default model **`sarvam-105b-conversations`** (reasoning off, low latency, 32K context; suits short structured tasks).
  Override with `SARVAM_CHAT_MODEL` (e.g. `sarvam-105b`). Uses `response_format={"type":"json_object"}`, low temperature.
  (Sarvam-M / Sarvam-30B are deprecated per the docs.)
* Speech-to-text: `POST https://api.sarvam.ai/speech-to-text` via `client.speech_to_text.transcribe(...)`,
  model **`saaras:v4`**, `mode="transcribe"`, `language_code="unknown"` (auto-detect). Sync limit is 30 s of audio;
  the browser recorder stops at 15 s and the server caps uploads at 3 MB.
* Languages (23, BCP-47): en-IN, hi-IN, bn-IN, ta-IN, te-IN, mr-IN, gu-IN, kn-IN, ml-IN, pa-IN, od-IN, as-IN, ur-IN,
  ne-IN, kok-IN, ks-IN, sd-IN, sa-IN, sat-IN, mni-IN, brx-IN, mai-IN, doi-IN. The UI explanation picker offers the 11 most common.
* Auth header (handled by the SDK): `api-subscription-key`. Provider failures use 403 (bad key), 402 (no credits),
  429 (rate limit), 500/502/503 (transient).

## Setup

```bash
pip install -r requirements.txt           # includes sarvamai
# backend/.env or project .env (never committed; never NEXT_PUBLIC_*):
SARVAM_API_KEY=your-key-from-dashboard.sarvam.ai
```

Optional: `SARVAM_CHAT_MODEL`, `SARVAM_STT_MODEL`, `SARVAM_TIMEOUT_SECONDS` (default 12, 2-60),
`SARVAM_MAX_RETRIES` (default 2, hard cap 3). Restart the backend after changing them. The key is read only on the
server and is never returned by any endpoint or logged.

## Safety model

1. **Model output is untrusted.** Intent JSON is parsed, then *every field* is validated against an allow-list:
   destination must be one of the planner's known destinations (unique match or a clarification question),
   numbers are range-checked (battery 0-100, reserve 0-50, stops 0-3), enums are closed sets, vehicles can only match the
   driver's own garage, languages must be supported. Unknown keys are ignored. Nothing from the model reaches SQL,
   the vehicle/battery records, or any charging system.
2. **Proposals, not actions.** The UI shows what was understood as removable chips. Preference changes are only
   *proposed*; they are saved when the driver taps Save, through the existing validated preference endpoint. Consent
   (`personalization_enabled`) can never be set by a model.
3. **Grounded explanations.** `/explain` recomputes the result server-side (the client cannot supply facts), sends only a
   minimal fact sheet (no ids, coordinates, tokens or battery/vehicle records), and rejects the reply unless **every number
   in it appears in the fact sheet**, it contains no links/markup, and it does not claim certainty when the engine reports
   uncertainty. Station names are passed as data, with an instruction to ignore anything instruction-like inside them.
4. **Minimal data.** Intent requests carry the typed text, the planner's destination names, and make+model of the driver's
   own vehicles. Nothing is stored: no transcripts, audio or conversations.
5. **Resilience.** 12 s timeout, at most 2 retries (429/5xx/timeouts only; 400/402/403/422 never retried), a circuit breaker
   (3 failures opens it for 30 s; bad key/no credits for 120 s), and a per-driver budget of 30 AI calls/minute that degrades
   to the rule-based path. Logs contain operation, model, attempt, latency and error code only.

## Tests

`backend/tests/test_sarvam_ai.py` (fake provider, no network): retries/timeouts/breaker/log hygiene, hostile and
malformed model output, grounding checks (including Devanagari digits), prompt-injection placement, fallbacks, the
"works with and without Sarvam" guarantee, per-driver rate limiting, transcription limits.

```bash
.venv/bin/python -m pytest backend/tests -q
```

> The automated tests and the UI check used a **stubbed** provider. Output quality of the real Sarvam models (and
> real transcription accuracy) has not been measured here; verify with a real key before relying on it.
