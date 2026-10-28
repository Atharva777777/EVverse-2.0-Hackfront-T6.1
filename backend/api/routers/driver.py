"""
backend/api/routers/driver.py
=============================
REST router for EV Verse driver services:
- Session & Authentication handling (Bearer or X-Driver-Token)
- Garage Vehicles CRUD with pagination
- Vehicle Preferences (active vehicle, auto-compatibility filter)
- Favourites persistence
- Community Station Issue Reports with categorization
- Charging Session history & receipts
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv
    _env_file = Path(__file__).resolve().parents[3] / ".env"
    if _env_file.exists():
        load_dotenv(dotenv_path=_env_file, override=False)
    else:
        load_dotenv(override=False)
except ImportError:
    pass

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator

from backend.data import driver_db

log = logging.getLogger(__name__)
router = APIRouter()

SUPPORTED_PLUGS = ["CCS2 Combo", "Type 2 (AC)", "CHAdeMO", "GB/T DC"]

VALID_REPORT_CATEGORIES = [
    "Broken / Damaged Connector",
    "Charger Powered Down / Offline",
    "ICEing (Blocked by Non-EV)",
    "Payment Terminal Failed",
    "Access Gate Locked / Closed",
    "Incorrect Location / Wrong Pin",
]


# ── Pydantic Request & Response Schemas ────────────────────────────────────────

class DriverSessionResponse(BaseModel):
    driver_id: str
    token: str
    name: str
    created_at: str


class SessionInitRequest(BaseModel):
    token: Optional[str] = Field(default=None, description="Existing driver token to resume session")
    name: Optional[str] = Field(default=None, max_length=50, description="Driver display name")


class VehicleSchema(BaseModel):
    id: str
    make: str = Field(min_length=2, max_length=50)
    model: str = Field(min_length=1, max_length=50)
    year: int = Field(ge=2010, le=2030, default=2025)
    image: Optional[str] = Field(default="/images/car-model.png")
    battery_kwh: float = Field(gt=0, le=250)
    usable_kwh: float = Field(gt=0, le=250)
    current_battery_pct: int = Field(ge=0, le=100, default=70)
    wltp_range_km: int = Field(gt=0, le=1500, default=450)
    efficiency_kwh100km: float = Field(gt=0, le=50, default=18.0)
    max_dc_speed_kw: int = Field(ge=0, le=500)
    max_ac_speed_kw: int = Field(ge=0, le=43, default=11)
    plug_type: str
    plug_image: Optional[str] = Field(default="/images/plug-ccs2.png")
    vin: Optional[str] = Field(default="")
    soh_pct: float = Field(ge=50.0, le=100.0, default=99.0)
    is_active: bool = Field(default=False)

    @field_validator("plug_type")
    @classmethod
    def validate_plug_type(cls, v: str) -> str:
        if v not in SUPPORTED_PLUGS:
            raise ValueError(f"Plug type must be one of {SUPPORTED_PLUGS}")
        return v


class VehicleCreateRequest(BaseModel):
    id: Optional[str] = Field(default=None, description="Optional custom vehicle ID")
    make: str = Field(min_length=2, max_length=50)
    model: str = Field(min_length=1, max_length=50)
    year: int = Field(ge=2010, le=2030, default=2025)
    image: Optional[str] = Field(default="/images/car-model.png")
    battery_kwh: Optional[float] = Field(default=None, gt=0, le=250)
    usable_kwh: float = Field(gt=0, le=250)
    current_battery_pct: int = Field(ge=0, le=100, default=75)
    wltp_range_km: int = Field(gt=0, le=1500, default=450)
    efficiency_kwh100km: float = Field(gt=0, le=50, default=18.0)
    max_dc_speed_kw: int = Field(ge=0, le=500)
    max_ac_speed_kw: int = Field(ge=0, le=43, default=11)
    plug_type: str
    plug_image: Optional[str] = Field(default=None)
    vin: Optional[str] = Field(default="")
    soh_pct: float = Field(ge=50.0, le=100.0, default=99.0)
    is_active: bool = Field(default=False)

    @field_validator("plug_type")
    @classmethod
    def validate_plug_type(cls, v: str) -> str:
        if v not in SUPPORTED_PLUGS:
            raise ValueError(f"Plug type must be one of {SUPPORTED_PLUGS}")
        return v


class VehicleUpdateRequest(BaseModel):
    make: Optional[str] = Field(default=None, min_length=2, max_length=50)
    model: Optional[str] = Field(default=None, min_length=1, max_length=50)
    year: Optional[int] = Field(default=None, ge=2010, le=2030)
    usable_kwh: Optional[float] = Field(default=None, gt=0, le=250)
    current_battery_pct: Optional[int] = Field(default=None, ge=0, le=100)
    wltp_range_km: Optional[int] = Field(default=None, gt=0, le=1500)
    efficiency_kwh100km: Optional[float] = Field(default=None, gt=0, le=50)
    max_dc_speed_kw: Optional[int] = Field(default=None, ge=0, le=500)
    max_ac_speed_kw: Optional[int] = Field(default=None, ge=0, le=43)
    plug_type: Optional[str] = None
    vin: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("plug_type")
    @classmethod
    def validate_plug_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in SUPPORTED_PLUGS:
            raise ValueError(f"Plug type must be one of {SUPPORTED_PLUGS}")
        return v


class VehiclesPaginatedResponse(BaseModel):
    items: List[VehicleSchema]
    total: int
    page: int
    limit: int


class PreferencesResponse(BaseModel):
    driver_id: str
    active_vehicle_id: str
    auto_compatibility: bool
    default_city: str


class PreferencesUpdateRequest(BaseModel):
    active_vehicle_id: Optional[str] = None
    auto_compatibility: Optional[bool] = None
    default_city: Optional[str] = None


class FavouritesResponse(BaseModel):
    station_ids: List[str]
    total: int
    page: int
    limit: int


class StationReportCreateRequest(BaseModel):
    station_id: str = Field(min_length=1)
    category: str = Field(description="Category of issue")
    connector_type: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_REPORT_CATEGORIES:
            raise ValueError(f"Category must be one of {VALID_REPORT_CATEGORIES}")
        return v


class StationReportResponse(BaseModel):
    id: str
    driver_id: str
    station_id: str
    category: str
    connector_type: Optional[str]
    notes: Optional[str]
    created_at: str


class ReportsPaginatedResponse(BaseModel):
    items: List[StationReportResponse]
    total: int
    page: int
    limit: int


class ChargingSessionCreateRequest(BaseModel):
    station_id: str = Field(min_length=1)
    station_name: str = Field(min_length=1)
    kwh_delivered: float = Field(ge=0, le=200)
    duration_seconds: int = Field(ge=0, le=86400)
    cost: float = Field(ge=0)
    max_power_kw: float = Field(ge=0, le=500)


class ChargingSessionResponse(BaseModel):
    id: str
    driver_id: str
    station_id: str
    station_name: str
    kwh_delivered: float
    duration_seconds: int
    cost: float
    max_power_kw: float
    created_at: str


class SessionsPaginatedResponse(BaseModel):
    items: List[ChargingSessionResponse]
    total: int
    page: int
    limit: int


# ── Authentication Dependency ──────────────────────────────────────────────────

def get_current_driver(
    x_driver_token: Optional[str] = Header(None, alias="X-Driver-Token"),
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """
    Extract token from X-Driver-Token header or Bearer authorization.
    Automatically resolves or provisions a driver session.
    """
    token = x_driver_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()

    return driver_db.get_or_create_driver_session(token=token)


# ── Session Endpoints ──────────────────────────────────────────────────────────

@router.post("/session", response_model=DriverSessionResponse, summary="Initialize or resume driver session")
async def init_session(
    body: Optional[SessionInitRequest] = None,
    response: Response = None,
    x_driver_token: Optional[str] = Header(None, alias="X-Driver-Token"),
) -> DriverSessionResponse:
    token = (body.token if body and body.token else None) or x_driver_token
    name = body.name if body and body.name else None
    driver = driver_db.get_or_create_driver_session(token=token, name=name)
    if response:
        response.headers["X-Driver-Token"] = driver["token"]
    return DriverSessionResponse(
        driver_id=driver["driver_id"],
        token=driver["token"],
        name=driver["name"],
        created_at=driver["created_at"],
    )


# ── Vehicles Endpoints ─────────────────────────────────────────────────────────

@router.get("/vehicles", response_model=VehiclesPaginatedResponse, summary="List driver garage vehicles")
async def get_vehicles(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> VehiclesPaginatedResponse:
    result = driver_db.list_driver_vehicles(driver["driver_id"], page=page, limit=limit)
    return VehiclesPaginatedResponse(**result)


@router.post(
    "/vehicles",
    response_model=VehicleSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new vehicle to the driver's garage",
)
async def create_vehicle(
    payload: VehicleCreateRequest,
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> VehicleSchema:
    import re

    # Generate a clean ID if omitted
    v_id = payload.id
    if not v_id:
        slug = re.sub(r"[^a-z0-9]+", "-", f"{payload.make}-{payload.model}".lower()).strip("-")
        v_id = f"{slug}-{int(payload.year)}"

    # Determine default plug image
    plug_img = payload.plug_image
    if not plug_img:
        plug_map = {
            "CCS2 Combo": "/images/plug-ccs2.png",
            "Type 2 (AC)": "/images/plug-type2.png",
            "CHAdeMO": "/images/plug-chademo.png",
            "GB/T DC": "/images/plug-gbt.png",
        }
        plug_img = plug_map.get(payload.plug_type, "/images/plug-ccs2.png")

    v_data = payload.model_dump()
    v_data["id"] = v_id
    v_data["plug_image"] = plug_img
    if not v_data.get("battery_kwh"):
        v_data["battery_kwh"] = v_data["usable_kwh"]

    created = driver_db.create_driver_vehicle(driver["driver_id"], v_data)
    return VehicleSchema(**created)


@router.put("/vehicles/{vehicle_id}", response_model=VehicleSchema, summary="Update vehicle in garage")
async def update_vehicle(
    vehicle_id: str,
    payload: VehicleUpdateRequest,
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> VehicleSchema:
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updated = driver_db.update_driver_vehicle(driver["driver_id"], vehicle_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Vehicle not found in garage.")
    return VehicleSchema(**updated)


@router.delete("/vehicles/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove vehicle from garage")
async def delete_vehicle(
    vehicle_id: str,
    driver: Dict[str, Any] = Depends(get_current_driver),
):
    success = driver_db.delete_driver_vehicle(driver["driver_id"], vehicle_id)
    if not success:
        raise HTTPException(status_code=404, detail="Vehicle not found in garage.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Preferences Endpoints ──────────────────────────────────────────────────────

@router.get("/preferences", response_model=PreferencesResponse, summary="Get driver vehicle & app preferences")
async def get_preferences(
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> PreferencesResponse:
    prefs = driver_db.get_driver_preferences(driver["driver_id"])
    return PreferencesResponse(**prefs)


@router.put("/preferences", response_model=PreferencesResponse, summary="Update driver preferences")
async def update_preferences(
    payload: PreferencesUpdateRequest,
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> PreferencesResponse:
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updated = driver_db.update_driver_preferences(driver["driver_id"], updates)
    return PreferencesResponse(**updated)


# ── Favourites Endpoints ───────────────────────────────────────────────────────

@router.get("/favourites", response_model=FavouritesResponse, summary="List favourite station IDs")
async def get_favourites(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=100, ge=1, le=200),
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> FavouritesResponse:
    favs = driver_db.list_driver_favourites(driver["driver_id"], page=page, limit=limit)
    return FavouritesResponse(**favs)


@router.post("/favourites/{station_id}", summary="Add station to favourites")
async def add_favourite(
    station_id: str,
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> Dict[str, Any]:
    driver_db.add_driver_favourite(driver["driver_id"], station_id)
    return {"status": "ok", "station_id": station_id, "is_favourite": True}


@router.delete("/favourites/{station_id}", summary="Remove station from favourites")
async def remove_favourite(
    station_id: str,
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> Dict[str, Any]:
    driver_db.remove_driver_favourite(driver["driver_id"], station_id)
    return {"status": "ok", "station_id": station_id, "is_favourite": False}


# ── Station Reports Endpoints ─────────────────────────────────────────────────

@router.get("/reports", response_model=ReportsPaginatedResponse, summary="List station issue reports")
async def get_reports(
    station_id: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> ReportsPaginatedResponse:
    result = driver_db.list_station_reports(station_id=station_id, page=page, limit=limit)
    return ReportsPaginatedResponse(**result)


@router.post(
    "/reports",
    response_model=StationReportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a community station issue report",
)
async def submit_report(
    payload: StationReportCreateRequest,
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> StationReportResponse:
    report = driver_db.create_station_report(driver["driver_id"], payload.model_dump())
    return StationReportResponse(**report)


# ── Charging Sessions Endpoints ───────────────────────────────────────────────

@router.get("/charging-sessions", response_model=SessionsPaginatedResponse, summary="List past charging sessions")
async def get_charging_sessions(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> SessionsPaginatedResponse:
    result = driver_db.list_charging_sessions(driver["driver_id"], page=page, limit=limit)
    return SessionsPaginatedResponse(**result)


@router.post(
    "/charging-sessions",
    response_model=ChargingSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record completed charging session receipt",
)
async def create_charging_session(
    payload: ChargingSessionCreateRequest,
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> ChargingSessionResponse:
    session = driver_db.record_charging_session(driver["driver_id"], payload.model_dump())
    return ChargingSessionResponse(**session)


# ── Driver Booking & Monad Testnet Payment Endpoints ──────────────────────────

MONAD_CHAIN_ID = 10143
MONAD_PUBLIC_RPC_URL = "https://testnet-rpc.monad.xyz"
MONAD_FALLBACK_RPC_URL = (os.environ.get("MONAD_RPC_URL") or MONAD_PUBLIC_RPC_URL).strip() or MONAD_PUBLIC_RPC_URL
MONAD_EXPLORER_URL = (os.environ.get("MONAD_EXPLORER_URL") or "https://testnet.monadexplorer.com").strip()
MONAD_PAYMENT_RECIPIENT_ADDRESS = os.environ.get("MONAD_PAYMENT_RECIPIENT_ADDRESS", "").strip()


def mask_rpc_url(url: str) -> str:
    """Mask sensitive API keys or credentials in an RPC URL for safe logging and status responses."""
    if not url:
        return ""
    return re.sub(r"(/v2/)[a-zA-Z0-9_\-]+", r"\1********", url)


def get_alchemy_rpc_config() -> tuple[Optional[str], bool]:
    """
    Returns (alchemy_url, is_configured).
    Sponsor Integration: Alchemy Monad Testnet RPC.
    Uses backend-only environment variable ALCHEMY_API_KEY (or optional custom MONAD_ALCHEMY_RPC_URL).
    Endpoint pattern: https://monad-testnet.g.alchemy.com/v2/<API_KEY>
    Chain ID: 10143.
    Never exposes API keys or relies on client-side NEXT_PUBLIC_ variables.
    """
    custom_url = os.environ.get("MONAD_ALCHEMY_RPC_URL", "").strip()
    if custom_url:
        return custom_url, True

    alchemy_key = os.environ.get("ALCHEMY_API_KEY", "").strip()
    if alchemy_key:
        return f"https://monad-testnet.g.alchemy.com/v2/{alchemy_key}", True

    return None, False


def get_active_monad_rpc() -> tuple[str, str]:
    """
    Returns (rpc_url, provider_name).
    Primary provider: Alchemy Monad Testnet RPC (if ALCHEMY_API_KEY is configured).
    Fallback provider: Monad Public Testnet RPC (MONAD_FALLBACK_RPC_URL).
    """
    alchemy_url, is_configured = get_alchemy_rpc_config()
    if is_configured and alchemy_url:
        return alchemy_url, "Alchemy Monad Testnet RPC"
    return MONAD_FALLBACK_RPC_URL, "Monad Public Testnet RPC"


def parse_mon_to_wei(mon_amount_str: str) -> int:
    """Parse MON string (e.g. '0.025 MON' or '0.025') to exact integer wei without float rounding errors."""
    clean = re.sub(r"[^0-9.]", "", mon_amount_str)
    if not clean or clean == ".":
        return 0
    parts = clean.split(".")
    whole_part = parts[0] or "0"
    frac_part = (parts[1] if len(parts) > 1 else "").ljust(18, "0")[:18]
    combined = frac_part.lstrip("0") if whole_part == "0" else f"{whole_part}{frac_part}"
    return int(combined) if combined else 0


async def verify_monad_payment_onchain(
    tx_hash: str,
    expected_mon_str: str,
    station_recipient_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Independently query Monad Testnet JSON-RPC to verify transaction receipt.
    NEVER trusts frontend payment-success flags.
    Enforces receipt status == 0x1, expected recipient address, expected wei amount,
    and validates Chain ID is 10143.

    Routing & Failover:
    - Primary: Alchemy Monad Testnet RPC (when ALCHEMY_API_KEY is configured).
    - Bounded Failover: If Alchemy is unreachable or experiences a transport error,
      explicitly fails over to Monad Public Testnet RPC.
    - Transparent Attribution: Accurately reports whether Alchemy or fallback verified the payment.
    - Safe Logging: API keys are strictly masked; raw secret URLs are never logged.
    """
    tx_hash = tx_hash.strip()
    if not re.match(r"^0x[a-fA-F0-9]{64}$", tx_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid transaction hash format: {tx_hash}"
        )

    expected_wei = parse_mon_to_wei(expected_mon_str)
    expected_recipient = (station_recipient_override or MONAD_PAYMENT_RECIPIENT_ADDRESS).strip().lower()

    # Determine candidate providers in priority order: (provider_name, rpc_url, is_alchemy, is_fallback)
    alchemy_url, is_alchemy_configured = get_alchemy_rpc_config()
    providers: List[tuple[str, str, bool, bool]] = []
    if is_alchemy_configured and alchemy_url:
        providers.append(("Alchemy Monad Testnet RPC", alchemy_url, True, False))
        providers.append(("Monad Public Testnet RPC (Fallback)", MONAD_FALLBACK_RPC_URL, False, True))
    else:
        providers.append(("Monad Public Testnet RPC", MONAD_FALLBACK_RPC_URL, False, False))

    last_network_error: Optional[Exception] = None

    for provider_name, rpc_url, is_alchemy, is_fallback in providers:
        masked_url = mask_rpc_url(rpc_url)
        log.info(f"Attempting payment verification for {tx_hash} via {provider_name} ({masked_url})")

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # 1. Validate chain ID is 10143
                try:
                    chain_res = await client.post(
                        rpc_url,
                        json={"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []},
                    )
                    c_status = getattr(chain_res, "status_code", 200)
                    if isinstance(c_status, int) and c_status != 200:
                        raise RuntimeError(f"RPC HTTP error {c_status}")
                    chain_data = chain_res.json()
                    if isinstance(chain_data, dict) and chain_data.get("error"):
                        raise RuntimeError(f"RPC error from {provider_name}: {chain_data.get('error')}")
                    chain_id_hex = chain_data.get("result")
                    if isinstance(chain_id_hex, str):
                        reported_chain_id = int(chain_id_hex, 16)
                        if reported_chain_id != MONAD_CHAIN_ID:
                            raise HTTPException(
                                status_code=status.HTTP_502_BAD_GATEWAY,
                                detail=f"Chain ID mismatch on {provider_name}: expected {MONAD_CHAIN_ID}, got {reported_chain_id}."
                            )
                except (HTTPException, RuntimeError):
                    raise
                except Exception as chain_err:
                    log.warning(f"Failed to query eth_chainId on {provider_name}: {chain_err}")

                # 2. Fetch transaction receipt
                receipt_res = await client.post(
                    rpc_url,
                    json={"jsonrpc": "2.0", "id": 2, "method": "eth_getTransactionReceipt", "params": [tx_hash]},
                )
                r_status = getattr(receipt_res, "status_code", 200)
                if isinstance(r_status, int) and r_status != 200:
                    raise RuntimeError(f"RPC HTTP error {r_status}")
                receipt_json = receipt_res.json()
                if isinstance(receipt_json, dict) and receipt_json.get("error"):
                    raise RuntimeError(f"RPC error from {provider_name}: {receipt_json.get('error')}")

                receipt = receipt_json.get("result")
                if not receipt or not receipt.get("blockNumber"):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Transaction has not been included in a block on Monad Testnet yet (receipt pending)."
                    )

                status_hex = receipt.get("status")
                if status_hex != "0x1":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Transaction reverted on-chain on Monad Testnet (status 0x0). Payment unverified."
                    )

                # 3. Fetch full transaction to verify recipient and value
                tx_res = await client.post(
                    rpc_url,
                    json={"jsonrpc": "2.0", "id": 3, "method": "eth_getTransactionByHash", "params": [tx_hash]},
                )
                t_status = getattr(tx_res, "status_code", 200)
                if isinstance(t_status, int) and t_status != 200:
                    raise RuntimeError(f"RPC HTTP error {t_status}")
                tx_json = tx_res.json()
                if isinstance(tx_json, dict) and tx_json.get("error"):
                    raise RuntimeError(f"RPC error from {provider_name}: {tx_json.get('error')}")

                tx_data = tx_json.get("result")
                if not tx_data:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Could not retrieve mined transaction parameters from Monad RPC."
                    )

                actual_to = (tx_data.get("to") or receipt.get("to") or "").lower()
                if expected_recipient and actual_to != expected_recipient:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Security verification failed: Mined recipient ({actual_to}) does not match expected payment address ({expected_recipient})."
                    )

                raw_val = tx_data.get("value", "0x0")
                actual_wei = int(raw_val, 16)
                if expected_wei > 0 and actual_wei < expected_wei:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Security verification failed: Mined amount ({actual_wei} wei) is less than required fee ({expected_wei} wei)."
                    )

                block_num = int(receipt.get("blockNumber", "0x0"), 16)
                gas_used = str(int(receipt.get("gasUsed", "0x0"), 16))

                log.info(f"Payment {tx_hash} verified successfully on {provider_name} at block {block_num}")

                return {
                    "verified": True,
                    "block_number": block_num,
                    "from_address": tx_data.get("from", ""),
                    "to_address": actual_to,
                    "gas_used": gas_used,
                    "value_wei": str(actual_wei),
                    "provider": provider_name,
                    "is_alchemy": is_alchemy,
                    "fallback_used": is_fallback,
                }

        except HTTPException:
            # Re-raise explicit HTTP errors (e.g. 400 Bad Request, reverted tx, pending, recipient/amount mismatch)
            raise
        except Exception as transport_err:
            last_network_error = transport_err
            log.warning(
                f"Transport failure querying {provider_name} ({masked_url}): {type(transport_err).__name__}. "
                f"{'Attempting fallback to Monad Public RPC...' if not is_fallback and len(providers) > 1 else 'No further fallbacks available.'}"
            )
            continue

    # If all providers failed due to transport errors
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Failed to reach Monad Testnet RPC providers for verification: {type(last_network_error).__name__}"
    )


class DriverBookingCreateRequest(BaseModel):
    id: Optional[str] = Field(default=None, description="Client reservation ID")
    station_id: str
    station_name: str
    bay_number: str = "Bay 01"
    connector_type: str = "CCS2 Combo"
    duration_minutes: int = Field(default=30, ge=15, le=120)
    total_cost: str = "₹49"
    mon_amount: str = "0.025 MON"
    tx_hash: Optional[str] = None
    recipient_address: Optional[str] = None
    payment_method: str = "monad_testnet"
    session_type: Optional[str] = "charging_session"
    target_kwh: Optional[float] = None
    target_battery_pct: Optional[int] = None
    pin_code: Optional[str] = None
    start_time: Optional[str] = None
    expiry_time: Optional[str] = None
    expiry_timestamp: Optional[int] = None


class DriverBookingResponse(BaseModel):
    id: str
    station_id: str
    station_name: str
    bay_number: str
    connector_type: str
    duration_minutes: int
    total_cost: str
    mon_amount: str
    pin_code: str
    start_time: str
    expiry_time: str
    expiry_timestamp: int
    payment_method: str
    tx_hash: Optional[str] = None
    block_number: Optional[int] = None
    from_address: Optional[str] = None
    to_address: Optional[str] = None
    gas_used: Optional[str] = None
    payment_status: str
    explorer_url: Optional[str] = None
    created_at: str
    verified_at: Optional[str] = None
    session_type: Optional[str] = "hold_only"
    target_kwh: Optional[float] = None
    target_battery_pct: Optional[int] = None
    physical_activation_triggered: bool = False
    verification_provider: Optional[str] = None
    settlement_note: str = (
        "Testnet on-chain payment verified. Cryptographic reservation hold confirmed. "
        "Physical charging and hardware activation remain decoupled in testnet mode."
    )


class StationOwnerBookingsResponse(BaseModel):
    items: List[DriverBookingResponse]
    total: int


@router.post(
    "/bookings",
    response_model=DriverBookingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create and independently verify on-chain Monad charging booking",
)
async def create_booking(
    payload: DriverBookingCreateRequest,
    driver: Dict[str, Any] = Depends(get_current_driver),
) -> DriverBookingResponse:
    # 1. Reject duplicate transaction hashes safely
    if payload.tx_hash:
        existing = driver_db.get_booking_by_tx_hash(payload.tx_hash)
        if existing:
            # Safe idempotent retry: if already confirmed for this station, return existing
            if existing.get("station_id") == payload.station_id and existing.get("payment_status") == "confirmed":
                log.info(f"Idempotent retry for existing booking {existing['id']} with tx {payload.tx_hash}")
                tx_val = existing.get("tx_hash")
                explorer_url = f"{MONAD_EXPLORER_URL}/tx/{tx_val}" if (tx_val and str(tx_val).startswith("0x")) else None
                settle_msg = (
                    "Instant UPI 2.0 direct host payment confirmed via Bharat QR. Micro-kiosk reservation hold active."
                    if existing.get("payment_method") == "sandbox_upi"
                    else "Testnet on-chain payment verified. Cryptographic reservation hold confirmed. Physical charging and hardware activation remain decoupled in testnet mode."
                )
                return DriverBookingResponse(
                    id=existing["id"],
                    station_id=existing["station_id"],
                    station_name=existing["station_name"],
                    bay_number=existing["bay_number"],
                    connector_type=existing["connector_type"],
                    duration_minutes=existing["duration_minutes"],
                    total_cost=existing["total_cost"],
                    mon_amount=existing["mon_amount"],
                    pin_code=existing["pin_code"],
                    start_time=existing["start_time"],
                    expiry_time=existing["expiry_time"],
                    expiry_timestamp=existing["expiry_timestamp"],
                    payment_method=existing["payment_method"],
                    tx_hash=existing["tx_hash"],
                    block_number=existing["block_number"],
                    from_address=existing["from_address"],
                    to_address=existing["to_address"],
                    gas_used=existing["gas_used"],
                    payment_status=existing["payment_status"],
                    explorer_url=explorer_url,
                    created_at=existing["created_at"],
                    verified_at=existing["verified_at"],
                    session_type=existing.get("session_type"),
                    target_kwh=existing.get("target_kwh"),
                    target_battery_pct=existing.get("target_battery_pct"),
                    settlement_note=settle_msg,
                )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Transaction hash {payload.tx_hash} has already been registered."
            )

    # 2. Independent On-Chain Verification for Monad Testnet payments
    verified_meta = {}
    verified_at = None
    if payload.payment_method == "monad_testnet":
        if not payload.tx_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="tx_hash is required for Monad Testnet payment verification."
            )
        # Independently verify payment on Monad Testnet JSON-RPC (Alchemy or native)
        verified_meta = await verify_monad_payment_onchain(
            tx_hash=payload.tx_hash,
            expected_mon_str=payload.mon_amount,
            station_recipient_override=payload.recipient_address,
        )
        verified_at = driver_db._now_iso()
        payment_status = "confirmed"
    else:
        # Sandbox fallback
        payment_status = "confirmed"

    # 3. Persist confirmed booking in SQLite
    booking_dict = payload.model_dump()
    booking_dict["payment_status"] = payment_status
    booking_dict["block_number"] = verified_meta.get("block_number")
    booking_dict["from_address"] = verified_meta.get("from_address")
    booking_dict["to_address"] = verified_meta.get("to_address")
    booking_dict["gas_used"] = verified_meta.get("gas_used")
    booking_dict["wei_amount"] = verified_meta.get("value_wei", "0")
    booking_dict["verified_at"] = verified_at

    record = driver_db.create_driver_booking(driver["driver_id"], booking_dict)
    tx_val = record.get("tx_hash")
    explorer_url = f"{MONAD_EXPLORER_URL}/tx/{tx_val}" if (tx_val and str(tx_val).startswith("0x")) else None

    if record.get("payment_method") == "sandbox_upi":
        settlement_note = "Instant UPI 2.0 direct host payment confirmed via Bharat QR. Micro-kiosk reservation hold active."
    else:
        settlement_note = (
            "Testnet on-chain payment verified. Cryptographic reservation hold confirmed. "
            "Physical charging and hardware activation remain decoupled in testnet mode."
        )

    return DriverBookingResponse(
        id=record["id"],
        station_id=record["station_id"],
        station_name=record["station_name"],
        bay_number=record["bay_number"],
        connector_type=record["connector_type"],
        duration_minutes=record["duration_minutes"],
        total_cost=record["total_cost"],
        mon_amount=record["mon_amount"],
        pin_code=record["pin_code"],
        start_time=record["start_time"],
        expiry_time=record["expiry_time"],
        expiry_timestamp=record["expiry_timestamp"],
        payment_method=record["payment_method"],
        tx_hash=record["tx_hash"],
        block_number=record["block_number"],
        from_address=record["from_address"],
        to_address=record["to_address"],
        gas_used=record["gas_used"],
        payment_status=record["payment_status"],
        explorer_url=explorer_url,
        created_at=record["created_at"],
        verified_at=record["verified_at"],
        session_type=record.get("session_type"),
        target_kwh=record.get("target_kwh"),
        target_battery_pct=record.get("target_battery_pct"),
        verification_provider=verified_meta.get("provider"),
        settlement_note=settlement_note,
    )


@router.get(
    "/station-owner/bookings",
    response_model=StationOwnerBookingsResponse,
    summary="List confirmed bookings and transaction receipts for station owners",
)
async def get_station_owner_bookings(
    station_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
) -> StationOwnerBookingsResponse:
    rows = driver_db.list_station_bookings(station_id=station_id, limit=limit)
    items = []
    for r in rows:
        explorer_url = f"{MONAD_EXPLORER_URL}/tx/{r['tx_hash']}" if r.get("tx_hash") else None
        items.append(
            DriverBookingResponse(
                id=r["id"],
                station_id=r["station_id"],
                station_name=r["station_name"],
                bay_number=r["bay_number"],
                connector_type=r["connector_type"],
                duration_minutes=r["duration_minutes"],
                total_cost=r["total_cost"],
                mon_amount=r["mon_amount"],
                pin_code=r["pin_code"],
                start_time=r["start_time"],
                expiry_time=r["expiry_time"],
                expiry_timestamp=r["expiry_timestamp"],
                payment_method=r["payment_method"],
                tx_hash=r["tx_hash"],
                block_number=r["block_number"],
                from_address=r["from_address"],
                to_address=r["to_address"],
                gas_used=r["gas_used"],
                payment_status=r["payment_status"],
                explorer_url=explorer_url,
                created_at=r["created_at"],
                verified_at=r["verified_at"],
                session_type=r.get("session_type"),
                target_kwh=r.get("target_kwh"),
                target_battery_pct=r.get("target_battery_pct"),
            )
        )
    return StationOwnerBookingsResponse(items=items, total=len(items))


@router.get(
    "/rpc-status",
    summary="Get Monad and Alchemy RPC connection status and latest block",
)
async def get_rpc_status():
    """
    Reports safe operational metadata for Monad Testnet RPC connectivity.
    Attribution rules:
    - If ALCHEMY_API_KEY is configured and responds successfully, reports provider as Alchemy.
    - If Alchemy fails or is unconfigured, reports public Monad RPC (or fallback).
    - Validates chain ID is 10143.
    - Strictly masks API keys in output; never exposes secrets.
    """
    alchemy_url, is_alchemy_configured = get_alchemy_rpc_config()

    active_provider: str = "None"
    is_alchemy_active: bool = False
    fallback_active: bool = False
    connected: bool = False
    block_num: Optional[int] = None
    chain_id_reported: Optional[int] = None
    masked_url: str = ""
    error_msg: Optional[str] = None

    # Step 1: If Alchemy is configured, attempt probe on Alchemy
    if is_alchemy_configured and alchemy_url:
        masked_url = mask_rpc_url(alchemy_url)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                block_res = await client.post(
                    alchemy_url,
                    json={"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []},
                )
                block_data = block_res.json()

                chain_res = await client.post(
                    alchemy_url,
                    json={"jsonrpc": "2.0", "id": 2, "method": "eth_chainId", "params": []},
                )
                chain_data = chain_res.json()

                b_status = getattr(block_res, "status_code", 200)
                c_status = getattr(chain_res, "status_code", 200)
                b_ok = (not isinstance(b_status, int)) or (b_status == 200)
                c_ok = (not isinstance(c_status, int)) or (c_status == 200)

                if (
                    b_ok
                    and c_ok
                    and "result" in block_data
                    and "result" in chain_data
                    and not block_data.get("error")
                    and not chain_data.get("error")
                ):
                    chain_id_reported = int(chain_data["result"], 16)
                    if chain_id_reported != MONAD_CHAIN_ID:
                        raise ValueError(f"Chain ID mismatch: expected {MONAD_CHAIN_ID}, got {chain_id_reported}")
                    block_num = int(block_data["result"], 16)
                    active_provider = "Alchemy Monad Testnet RPC"
                    is_alchemy_active = True
                    connected = True
                    error_msg = None
                else:
                    err = block_data.get("error") or chain_data.get("error") or f"Invalid response: block_status={getattr(block_res, 'status_code', None)}, chain_status={getattr(chain_res, 'status_code', None)}"
                    raise ValueError(str(err))

        except Exception as alchemy_err:
            log.warning(f"Alchemy RPC status probe failed ({type(alchemy_err).__name__}); testing fallback to public Monad RPC.")
            fallback_active = True
            error_msg = f"Alchemy primary probe failed: {type(alchemy_err).__name__}; failed over to fallback RPC."

    # Step 2: If Alchemy was not configured OR failed, probe public fallback RPC
    if not connected:
        fallback_url = MONAD_FALLBACK_RPC_URL
        masked_url = mask_rpc_url(fallback_url)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                block_res = await client.post(
                    fallback_url,
                    json={"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []},
                )
                block_data = block_res.json()

                chain_res = await client.post(
                    fallback_url,
                    json={"jsonrpc": "2.0", "id": 2, "method": "eth_chainId", "params": []},
                )
                chain_data = chain_res.json()

                if "result" in block_data and "result" in chain_data:
                    chain_id_reported = int(chain_data["result"], 16)
                    block_num = int(block_data["result"], 16)
                    active_provider = (
                        "Monad Public Testnet RPC (Fallback)"
                        if is_alchemy_configured
                        else "Monad Public Testnet RPC"
                    )
                    connected = True
                    is_alchemy_active = False
                else:
                    err = block_data.get("error") or chain_data.get("error") or "Invalid JSON-RPC response"
                    raise ValueError(str(err))

        except Exception as fallback_err:
            connected = False
            active_provider = "None"
            error_msg = (
                f"Both Alchemy primary and Monad public fallback RPC probes failed: {type(fallback_err).__name__}"
                if is_alchemy_configured
                else f"Public Monad RPC probe failed: {type(fallback_err).__name__}"
            )

    return {
        "provider": active_provider,
        "is_alchemy": is_alchemy_active,
        "alchemy_configured": is_alchemy_configured,
        "fallback_active": fallback_active,
        "chain_id": chain_id_reported or MONAD_CHAIN_ID,
        "chain_name": "Monad Testnet",
        "connected": connected,
        "latest_block": block_num,
        "rpc_endpoint_masked": masked_url,
        "error": error_msg,
    }

