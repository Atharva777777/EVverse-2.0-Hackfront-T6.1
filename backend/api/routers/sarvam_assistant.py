"""
backend/api/routers/sarvam_assistant.py
======================================
REST router for SARVAM — EVverse Conversational Intelligence Assistant.

Endpoints:
    GET   /api/v1/sarvam/status       Assistant readiness, AI status, and voice capabilities
    POST  /api/v1/sarvam/chat         Conversational chat orchestrated with Sarvam & Neo4j
    POST  /api/v1/sarvam/tts          Text-to-speech conversion (Sarvam Bulbul:v3)
    POST  /api/v1/sarvam/voice-chat   End-to-end voice query (Saaras STT -> Sarvam -> Bulbul TTS)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from backend.api.routers.driver import get_current_driver
from backend.api.services import sarvam_service as sarvam
from backend.api.services.sarvam_orchestrator import sarvam_orchestrator
from backend.graph.neo4j_client import get_graph_client

log = logging.getLogger("evverse.sarvam.router")
router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    history: List[ChatMessage] = Field(default_factory=list)
    language: Optional[str] = None
    driver_id: Optional[str] = "demo_driver_pune"


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    language: str = Field(default="en-IN")
    speaker: str = Field(default="kavya")


@router.get("/status", summary="SARVAM assistant readiness and capabilities")
def sarvam_status() -> Dict[str, Any]:
    ai_ok = sarvam.is_available()
    graph_status = get_graph_client().status()
    return {
        "status": "ready" if ai_ok and graph_status.get("connected") else "degraded",
        "bot_name": "SARVAM",
        "subtitle": "Your EV Intelligence Assistant",
        "ai_available": ai_ok,
        "neo4j_connected": graph_status.get("connected", False),
        "voice_input": ai_ok,
        "voice_output": ai_ok,
        "supported_languages": [
            {"code": "en-IN", "name": "English"},
            {"code": "hi-IN", "name": "Hindi (हिंदी)"},
            {"code": "mr-IN", "name": "Marathi (मराठी)"},
        ],
    }


@router.post("/chat", summary="Send a text message to SARVAM")
async def chat_with_sarvam(body: ChatRequest) -> Dict[str, Any]:
    history_dicts = [{"role": m.role, "content": m.content} for m in body.history]
    try:
        result = await sarvam_orchestrator.handle_message(
            message=body.message,
            conversation_history=history_dicts,
            driver_id=body.driver_id or "demo_driver_pune",
            preferred_language=body.language,
        )
        return result
    except Exception as exc:
        log.exception("Sarvam chat failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sarvam Assistant could not process that request: {str(exc)}",
        )


@router.post("/tts", summary="Generate voice audio for bot reply (Sarvam Bulbul:v3)")
async def generate_speech(body: TTSRequest) -> Dict[str, Any]:
    if not sarvam.is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sarvam AI speech generation is currently unavailable.",
        )
    try:
        audio_b64 = await sarvam.text_to_speech(
            text=body.text,
            language_code=body.language,
            speaker=body.speaker,
        )
        return {
            "audio_base64": audio_b64,
            "format": "wav",
            "speaker": body.speaker,
            "language": body.language,
        }
    except sarvam.SarvamError as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": err.code, "message": str(err)},
        )


@router.post("/voice-chat", summary="End-to-end voice query (Speech-to-Text -> Sarvam -> Audio Speech)")
async def voice_chat_with_sarvam(
    request: Request,
    language_code: Optional[str] = None,
    with_tts: bool = True,
) -> Dict[str, Any]:
    ctype = request.headers.get("content-type", "")
    if not ctype.startswith("audio/"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Send the voice query as audio (e.g. audio/webm, audio/wav).",
        )
    audio = b""
    async for chunk in request.stream():
        audio += chunk
        if len(audio) > sarvam.MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Voice query is too large. Keep recording under 30 seconds.",
            )

    if not audio:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No audio data received.")

    # 1. Transcribe with Sarvam Saaras STT
    try:
        transcript = await sarvam.transcribe(audio, ctype, language_code)
    except sarvam.SarvamError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST if err.code == "bad_request" else status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": err.code, "message": str(err)},
        )

    user_text = transcript.text
    detected_lang = transcript.language_code or language_code or "en-IN"

    # 2. Process via Sarvam Orchestrator
    sarvam_result = await sarvam_orchestrator.handle_message(
        message=user_text,
        preferred_language=detected_lang,
    )

    reply_text = sarvam_result["reply"]

    # 3. Optional TTS speech synthesis
    audio_b64 = None
    if with_tts and sarvam.is_available():
        try:
            audio_b64 = await sarvam.text_to_speech(
                text=reply_text[:300],  # Concise spoken summary
                language_code=sarvam_result["language"],
            )
        except Exception as e:
            log.warning("TTS audio generation skipped: %s", e)

    return {
        "transcription": user_text,
        "reply": reply_text,
        "language": sarvam_result["language"],
        "tools_used": sarvam_result["tools_used"],
        "data_card": sarvam_result.get("data_card"),
        "audio_base64": audio_b64,
        "timestamp": sarvam_result.get("timestamp"),
    }
