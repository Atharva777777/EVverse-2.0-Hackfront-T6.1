"""
backend/api/routers/journey.py
==============================
REST router for EVverse Journey Intelligence.

    POST   /api/v1/journey/analyze       full journey analysis (options, stops, recovery)
    POST   /api/v1/journey/parse         rule-based form filler for a typed journey sentence
    GET    /api/v1/journey/preferences   what we know about the driver's preferences (visible, editable)
    PUT    /api/v1/journey/preferences   change one preference
    DELETE /api/v1/journey/preferences   forget everything (preferences + recorded journeys)
    GET    /api/v1/journey/suggestions   preferences suggested from the driver's own history (opt-in)
    POST   /api/v1/journey/events        record a journey the driver chose to start (opt-in)

All numbers come from the existing deterministic engines; see services/journey_intelligence.py.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple, Union

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from backend.api.routers.driver import get_current_driver
from backend.api.services import journey_ai
from backend.api.services import sarvam_service as sarvam
from backend.api.services.journey_intelligence import (
    JourneyConstraints,
    JourneyInput,
    Preferences,
    VehicleDataMissing,
    analyze_journey,
    parse_journey_text,
)
from backend.data import driver_db, journey_store

log = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RouteAlternative(BaseModel):
    label: Optional[str] = None
    distance_km: float = Field(gt=0, le=3000)
    duration_mins: float = Field(gt=0)
    elevation_gain_m: Optional[float] = None


class CandidateStation(BaseModel):
    """Station as known to the client. Unknown fields stay null - nothing is defaulted."""
    model_config = {"extra": "allow"}
    station_id: str
    name: str
    latitude: float
    longitude: float
    power_kw: Optional[float] = None
    connector_types: List[str] = Field(default_factory=list)
    status: Optional[str] = None
    is_operational: Optional[bool] = None
    operator: Optional[str] = None
    address: Optional[str] = None
    source: Optional[str] = None
    sources: Optional[List[str]] = None
    last_status_update: Optional[str] = None


class ConstraintsIn(BaseModel):
    max_charging_stops: Optional[int] = Field(default=None, ge=0, le=3)
    charging_speed: Optional[Literal["fast", "standard"]] = None
    route_preference: Optional[Literal["balanced", "fewer_stops", "reliable_chargers", "safer", "faster", "economical"]] = None


class AnalyzeRequest(BaseModel):
    vehicle: Union[Dict[str, Any], str]
    distance_km: float = Field(gt=0, le=3000)
    start_battery_pct: float = Field(ge=0, le=100)
    reserve_buffer_pct: float = Field(default=15.0, ge=0, le=50)
    elevation_gain_m: float = Field(default=0.0)
    payload_kg: float = Field(default=75.0, ge=0, le=1500)
    ambient_temp_c: Optional[float] = Field(default=None, ge=-20, le=60)
    hvac_mode: str = "normal"
    driving_style: str = "normal"
    duration_mins: Optional[float] = Field(default=None, gt=0)
    origin_coords: Optional[Tuple[float, float]] = None
    destination_coords: Optional[Tuple[float, float]] = None
    candidate_stations: List[CandidateStation] = Field(default_factory=list)
    city: Optional[str] = None
    route_alternatives: List[RouteAlternative] = Field(default_factory=list)
    route_source: str = "unknown"
    elevation_source: str = "unknown"
    origin_is_approximate: bool = False
    constraints: ConstraintsIn = Field(default_factory=ConstraintsIn)


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    known_destinations: List[str] = Field(default_factory=list)


class PreferenceUpdate(BaseModel):
    key: str
    value: Optional[Union[bool, int, float]] = None  # null clears it


class JourneyEventRequest(BaseModel):
    destination_name: str = Field(min_length=1, max_length=100)
    distance_km: float = Field(gt=0)
    option_kind: str
    reserve_pct: float = Field(ge=0, le=50)
    start_battery_pct: float = Field(ge=0, le=100)
    stops_count: int = Field(ge=0, le=5)
    station_id: Optional[str] = None
    station_name: Optional[str] = None
    station_power_kw: Optional[float] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_prefs(driver_id: str) -> Preferences:
    p = journey_store.get_preferences(driver_id)
    return Preferences(
        prefer_reliable_charging=bool(p["prefer_reliable_charging"]["value"]),
        prefer_faster_chargers=bool(p["prefer_faster_chargers"]["value"]),
        prefer_fewer_stops=bool(p["prefer_fewer_stops"]["value"]),
        familiar_station_ids=journey_store.get_familiar_station_ids(driver_id),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

def _to_input(payload: AnalyzeRequest) -> JourneyInput:
    return JourneyInput(
        vehicle=payload.vehicle,
        distance_km=payload.distance_km,
        start_battery_pct=payload.start_battery_pct,
        reserve_buffer_pct=payload.reserve_buffer_pct,
        elevation_gain_m=payload.elevation_gain_m,
        payload_kg=payload.payload_kg,
        ambient_temp_c=payload.ambient_temp_c,
        hvac_mode=payload.hvac_mode,
        driving_style=payload.driving_style,
        duration_mins=payload.duration_mins,
        origin_coords=payload.origin_coords,
        destination_coords=payload.destination_coords,
        # absent != false: a null field must not be read by the engine as 'not operational'
        candidate_stations=[{k: v for k, v in s.model_dump().items() if v is not None} for s in payload.candidate_stations],
        city=payload.city,
        route_alternatives=[r.model_dump() for r in payload.route_alternatives],
        route_source=payload.route_source,
        elevation_source=payload.elevation_source,
        origin_is_approximate=payload.origin_is_approximate,
        constraints=JourneyConstraints(**payload.constraints.model_dump()),
    )


@router.post("/analyze", summary="Analyse a journey and recommend options, charging stops and recovery steps")
async def analyze(payload: AnalyzeRequest, driver: Dict[str, Any] = Depends(get_current_driver)) -> Dict[str, Any]:
    """Deterministic. Never calls an AI provider."""
    try:
        prefs = _load_prefs(driver["driver_id"])
        return analyze_journey(_to_input(payload), prefs)
    except VehicleDataMissing as err:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"We need a few more details about your vehicle before planning: {', '.join(err.missing)}.",
        )
    except (ValueError, TypeError) as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err))
    except Exception:
        log.exception("Journey analysis failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Journey analysis failed. Check server logs.")


@router.post("/parse", summary="Fill the journey form from a short typed sentence")
async def parse(payload: ParseRequest) -> Dict[str, Any]:
    return parse_journey_text(payload.text, payload.known_destinations)


@router.get("/preferences", summary="Everything personalised for this driver, and why")
async def get_preferences(driver: Dict[str, Any] = Depends(get_current_driver)) -> Dict[str, Any]:
    prefs = journey_store.get_preferences(driver["driver_id"])
    return {"preferences": list(prefs.values()), "journeys_recorded": len(journey_store.list_journey_events(driver["driver_id"]))}


@router.put("/preferences", summary="Set or clear one preference")
async def put_preference(body: PreferenceUpdate, driver: Dict[str, Any] = Depends(get_current_driver)) -> Dict[str, Any]:
    try:
        journey_store.set_preference(driver["driver_id"], body.key, body.value, source="explicit")
    except ValueError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err))
    return await get_preferences(driver)


@router.delete("/preferences", summary="Forget all preferences and recorded journeys")
async def delete_preferences(driver: Dict[str, Any] = Depends(get_current_driver)) -> Dict[str, int]:
    return journey_store.reset_personalization(driver["driver_id"])


@router.get("/suggestions", summary="Preferences suggested from your own history (only if you opted in)")
async def suggestions(driver: Dict[str, Any] = Depends(get_current_driver)) -> Dict[str, Any]:
    return {"suggestions": journey_store.derive_suggestions(driver["driver_id"])}


@router.post("/suggestions/accept", summary="Accept a suggestion so it becomes a preference you can edit")
async def accept_suggestion(body: PreferenceUpdate, driver: Dict[str, Any] = Depends(get_current_driver)) -> Dict[str, Any]:
    current = [s for s in journey_store.derive_suggestions(driver["driver_id"]) if s["key"] == body.key]
    if not current:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="That suggestion is no longer available.")
    s = current[0]
    journey_store.set_preference(driver["driver_id"], s["key"], s["value"], source="accepted_suggestion", evidence=s["evidence"])
    return await get_preferences(driver)


@router.post("/events", summary="Record a journey you chose to start (only if you opted in)")
async def record_event(body: JourneyEventRequest, driver: Dict[str, Any] = Depends(get_current_driver)) -> Dict[str, bool]:
    return {"recorded": journey_store.record_journey_event(driver["driver_id"], body.model_dump())}


# ── Sarvam-assisted endpoints (advisory; the planner works without them) ──────

class IntentRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    known_destinations: List[str] = Field(default_factory=list, max_length=40)
    selected_city: str = Field(default="Mumbai", max_length=40)


class ExplainRequest(AnalyzeRequest):
    option_kind: Literal["balanced", "fewer_charging", "safer", "faster"] = "balanced"
    language: str = "en-IN"


def _driver_vehicle_names(driver_id: str) -> List[Dict[str, str]]:
    """Only make + model of the driver's OWN vehicles - never ids, VINs or battery data."""
    try:
        items = driver_db.list_driver_vehicles(driver_id).get("items", [])
    except Exception:
        return []
    return [{"id": str(v["id"]), "name": f"{v['make']} {v['model']}"} for v in items][:10]


@router.get("/ai/status", summary="Is AI assistance available? (no provider call is made)")
async def ai_status() -> Dict[str, Any]:
    ok = sarvam.is_available()
    return {
        "available": ok,
        "voice": ok,
        "languages": [{"code": c, "name": n} for c, n in sarvam.SUPPORTED_LANGUAGES.items()],
    }


@router.post("/intent", summary="Interpret a typed or transcribed journey request into a validated proposal")
async def intent(body: IntentRequest, driver: Dict[str, Any] = Depends(get_current_driver)) -> Dict[str, Any]:
    allow = sarvam.budget.allow(driver["driver_id"])
    return await journey_ai.interpret_text(
        body.text,
        known_destinations=body.known_destinations,
        driver_vehicles=_driver_vehicle_names(driver["driver_id"]),
        selected_city=body.selected_city,
        allow_ai=allow,
    )


@router.post("/transcribe", summary="Speech to text (Sarvam Saaras). Body is raw audio; nothing is stored.")
async def transcribe(
    request: Request, language_code: Optional[str] = None, driver: Dict[str, Any] = Depends(get_current_driver),
) -> Dict[str, Any]:
    ctype = request.headers.get("content-type", "")
    if not ctype.startswith("audio/"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Send the recording as audio.")
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > sarvam.MAX_AUDIO_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="That recording is too large.")
    if not sarvam.budget.allow(driver["driver_id"]):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Please wait a moment before trying again.")
    audio = b""
    async for chunk in request.stream():
        audio += chunk
        if len(audio) > sarvam.MAX_AUDIO_BYTES:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="That recording is too large.")
    try:
        t = await sarvam.transcribe(audio, ctype, language_code)
    except sarvam.SarvamError as err:
        code = status.HTTP_400_BAD_REQUEST if err.code in ("bad_request", "bad_output") else status.HTTP_503_SERVICE_UNAVAILABLE
        raise HTTPException(code, detail={"code": err.code, "message": str(err)})
    return {"text": t.text, "language": t.language_code}


@router.post("/explain", summary="Plain-language explanation of the deterministic result (grounded; optional)")
async def explain(body: ExplainRequest, driver: Dict[str, Any] = Depends(get_current_driver)) -> Dict[str, Any]:
    """
    Recomputes the result server-side (the client cannot supply 'facts'), then asks Sarvam only to
    phrase them. Returns {"explanation": null} whenever AI is unavailable or its text is not grounded.
    """
    if body.language not in sarvam.SUPPORTED_LANGUAGES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported language.")
    if not sarvam.is_available():
        return {"explanation": None, "reason": "unavailable"}
    if not sarvam.budget.allow(driver["driver_id"]):
        return {"explanation": None, "reason": "busy"}
    try:
        analysis = analyze_journey(_to_input(body), _load_prefs(driver["driver_id"]))
    except (VehicleDataMissing, ValueError, TypeError):
        return {"explanation": None, "reason": "invalid"}
    facts = journey_ai.build_facts(analysis, body.option_kind, body.start_battery_pct)
    try:
        out = await journey_ai.explain(facts, body.language)
    except sarvam.SarvamError as err:
        return {"explanation": None, "reason": err.code}
    return {"explanation": out["text"], "language": out["language"], "source": "sarvam"}
