"""
backend/data/bee_service.py
===========================
Service for the Bureau of Energy Efficiency (BEE) EV charging station registry API.
Provides verified public EV charging station locations across India.

API Source:
- Endpoint: https://ev-charging-stations-api.vercel.app
- Docs / Routes:
    GET /v1/stations/near?lat={lat}&lng={lng}&radius={radius}&limit={limit}
    GET /v1/stations?city={city}&limit={limit}
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from dotenv import load_dotenv
    _backend_env = Path(__file__).resolve().parents[1] / ".env"
    if _backend_env.exists():
        load_dotenv(dotenv_path=_backend_env, override=False)
except ImportError:
    pass

log = logging.getLogger(__name__)

DEFAULT_BEE_BASE_URL = "https://ev-charging-stations-api.vercel.app"
DEFAULT_TIMEOUT_SECONDS = 5.0
CACHE_TTL_SECONDS = 600.0  # 10 minutes cache for government registry


@dataclass
class BEESourceMetadata:
    is_available: bool
    status: str  # "connected", "offline", "error"
    station_count: int
    last_updated: Optional[str] = None
    attribution: str = "Bureau of Energy Efficiency (BEE) National EV Registry"
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_available": self.is_available,
            "status": self.status,
            "station_count": self.station_count,
            "last_updated": self.last_updated,
            "attribution": self.attribution,
            "error_message": self.error_message,
        }


class BEEService:
    """Service to fetch verified charging stations from the BEE API."""

    def __init__(self, base_url: Optional[str] = None):
        env_url = os.getenv("BEE_API_BASE_URL")
        self.base_url = (base_url or env_url or DEFAULT_BEE_BASE_URL).rstrip("/")
        self._cache: Dict[str, Tuple[float, List[Dict[str, Any]], BEESourceMetadata]] = {}
        self._last_request_time: float = 0.0

    def _throttle(self, min_interval_seconds: float = 0.2) -> None:
        """Light throttle to avoid burst hammering public endpoints."""
        elapsed = time.time() - self._last_request_time
        if elapsed < min_interval_seconds:
            time.sleep(min_interval_seconds - elapsed)
        self._last_request_time = time.time()

    def fetch_raw_stations(
        self,
        lat: float,
        lng: float,
        city_name: str,
        radius_km: float = 25.0,
        limit: int = 100,
    ) -> Tuple[List[Dict[str, Any]], BEESourceMetadata]:
        """
        Fetches stations near the given coordinate or city.
        Checks in-memory cache first (10 min TTL).
        """
        cache_key = f"{round(lat, 3)}_{round(lng, 3)}_{city_name.lower()}_{round(radius_km, 1)}"
        now = time.time()
        if cache_key in self._cache:
            cached_time, cached_records, cached_meta = self._cache[cache_key]
            if (now - cached_time) < CACHE_TTL_SECONDS:
                return cached_records, cached_meta

        now_iso = datetime.now(timezone.utc).isoformat()
        records: List[Dict[str, Any]] = []

        # Clamp limit to BEE API maximum of 100
        safe_limit = min(max(1, limit), 100)

        # 1. Try radius search first (/v1/stations/near)
        near_params = urllib.parse.urlencode({
            "lat": f"{lat:.4f}",
            "lng": f"{lng:.4f}",
            "radius": str(int(radius_km)),
            "limit": str(safe_limit),
        })
        near_url = f"{self.base_url}/v1/stations/near?{near_params}"

        self._throttle()
        try:
            req = urllib.request.Request(
                near_url,
                headers={
                    "User-Agent": "EVverse/2.0 (EV-Infrastructure-Optimization)",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT_SECONDS) as resp:
                if resp.status == 200:
                    body = json.loads(resp.read().decode("utf-8"))
                    data = body.get("data", [])
                    if isinstance(data, list):
                        records = data
        except Exception as exc:
            log.warning("BEE /v1/stations/near failed: %s; trying city fallback", exc)

        # 2. If radius search returned nothing or failed, try city query (/v1/stations?city=...)
        if not records and city_name:
            city_params = urllib.parse.urlencode({
                "city": city_name,
                "limit": str(safe_limit),
            })
            city_url = f"{self.base_url}/v1/stations?{city_params}"
            self._throttle()
            try:
                req = urllib.request.Request(
                    city_url,
                    headers={
                        "User-Agent": "EVverse/2.0 (EV-Infrastructure-Optimization)",
                        "Accept": "application/json",
                    },
                )
                with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT_SECONDS) as resp:
                    if resp.status == 200:
                        body = json.loads(resp.read().decode("utf-8"))
                        data = body.get("data", [])
                        if isinstance(data, list):
                            records = data
            except Exception as exc:
                log.warning("BEE /v1/stations?city=%s failed: %s", city_name, exc)
                meta = BEESourceMetadata(
                    is_available=False,
                    status="error",
                    station_count=0,
                    last_updated=None,
                    error_message=f"BEE API request failed: {type(exc).__name__}: {str(exc)}",
                )
                self._cache[cache_key] = (now, [], meta)
                return [], meta

        if records:
            meta = BEESourceMetadata(
                is_available=True,
                status="connected",
                station_count=len(records),
                last_updated=now_iso,
                error_message=None,
            )
        else:
            meta = BEESourceMetadata(
                is_available=True,
                status="connected",
                station_count=0,
                last_updated=now_iso,
                error_message="No BEE stations found in this search radius",
            )

        self._cache[cache_key] = (now, records, meta)
        return records, meta


_DEFAULT_BEE_SERVICE: Optional[BEEService] = None


def get_bee_service() -> BEEService:
    global _DEFAULT_BEE_SERVICE
    if _DEFAULT_BEE_SERVICE is None:
        _DEFAULT_BEE_SERVICE = BEEService()
    return _DEFAULT_BEE_SERVICE
