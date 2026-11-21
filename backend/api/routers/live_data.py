"""
backend/api/routers/live_data.py
================================
Router for live EV charging station multi-source data enrichment.

Combines:
- Open Charge Map (OCM) live API
- Bureau of Energy Efficiency (BEE) National EV Registry
- Local processed OpenStreetMap (OSM) Western Zone extract (ODbL 1.0)
- Kaggle baseline fallback (static & unverified)

Endpoints
---------
GET /api/v1/live-stations   Fetch deduplicated stations across all sources for a city.
GET /api/v1/live-sources    Fetch per-source status and station counts for a city.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from backend.data.multi_source_service import get_multi_source_service

log = logging.getLogger(__name__)
router = APIRouter()


class LiveStation(BaseModel):
    station_id: str = Field(description="Unique station identifier")
    name: str = Field(description="Display name or location title")
    latitude: float = Field(description="Station latitude")
    longitude: float = Field(description="Station longitude")
    address: Optional[str] = Field(default=None, description="Full street address")
    operator: Optional[str] = Field(default=None, description="Charging network operator")
    status: str = Field(default="Operational", description="Operational status title")
    is_operational: bool = Field(default=True, description="Whether the station is currently operational")
    power_kw: Optional[float] = Field(default=None, description="Maximum charging capacity in kW")
    bays: int = Field(default=1, description="Number of charging points or parking bays")
    connector_types: List[str] = Field(default_factory=list, description="Available connector plug types")
    usage_cost: Optional[str] = Field(default=None, description="Tariff or usage cost description")
    source: str = Field(default="open_charge_map", description="Primary data source key (e.g. 'multi_source', 'merged', 'open_charge_map', 'bee', 'osm', 'kaggle_baseline')")
    sources: List[str] = Field(default_factory=list, description="All contributing source keys")
    source_ids: Dict[str, str] = Field(default_factory=dict, description="IDs across provider registries")
    attribution: Optional[str] = Field(default=None, description="Licensing and source attribution")
    last_status_update: Optional[str] = Field(default=None, description="ISO timestamp of last known status update")

    @field_validator("address", mode="before")
    @classmethod
    def normalize_address(cls, v):
        if isinstance(v, dict):
            parts = [str(val) for val in v.values() if val]
            return ", ".join(parts) if parts else None
        return v


class SourceStatus(BaseModel):
    name: str = Field(description="Display source name (e.g. Open Charge Map, BEE, OpenStreetMap, Kaggle Baseline)")
    source_key: str = Field(description="Source identifier key")
    status: str = Field(description="Operational status ('connected', 'loaded', 'active_fallback', 'standby', 'offline', 'error')")
    is_available: bool = Field(description="Whether the source successfully provided records")
    station_count: int = Field(default=0, description="Number of stations provided by this source")
    last_updated: Optional[str] = Field(default=None, description="Actual ISO timestamp or dataset extraction timestamp")
    attribution: Optional[str] = Field(default=None, description="Licensing and legal attribution")
    error_message: Optional[str] = Field(default=None, description="Error details if connection or loading failed")


class LiveDataResponse(BaseModel):
    city: str = Field(description="Target city name")
    is_live: bool = Field(description="True if live/verified multi-source data was retrieved; False if fallback")
    source: str = Field(description="Primary source identifier ('multi_source' or 'kaggle_baseline')")
    status_message: str = Field(description="Human-readable status description")
    live_station_count: int = Field(description="Total number of deduplicated stations returned")
    raw_station_count: int = Field(default=0, description="Total stations gathered across all sources before deduplication")
    deduplicated_count: int = Field(default=0, description="Number of overlapping physical stations merged")
    last_updated: str = Field(description="ISO timestamp of last update")
    stations: List[LiveStation] = Field(default_factory=list, description="List of normalized station objects")
    sources: Dict[str, SourceStatus] = Field(default_factory=dict, description="Detailed per-source status breakdown")
    fallback_reason: Optional[str] = Field(default=None, description="Reason for fallback if API was unavailable")


class LiveSourcesResponse(BaseModel):
    city: str = Field(description="Target city name")
    is_live: bool = Field(description="True if live/verified sources are operational")
    live_station_count: int = Field(description="Total deduplicated stations")
    raw_station_count: int = Field(description="Total raw stations across all sources")
    deduplicated_count: int = Field(description="Duplicates merged")
    sources: Dict[str, SourceStatus] = Field(description="Per-source status mapping")


@router.get(
    "/live-stations",
    response_model=LiveDataResponse,
    summary="Get multi-source EV charging stations for a city",
    description=(
        "Combines Open Charge Map, Bureau of Energy Efficiency (BEE), and local OpenStreetMap "
        "records into a normalized, spatially deduplicated charging infrastructure dataset. "
        "Gracefully falls back to baseline Kaggle dataset if external APIs are unreachable."
    ),
)
async def get_live_stations(
    city: str = Query(default="Mumbai", description="City name (e.g. Pune, Mumbai, Delhi, Bengaluru)"),
    distance_km: float = Query(default=25.0, ge=1.0, le=100.0, description="Search radius in kilometers"),
    max_results: int = Query(default=50, ge=5, le=200, description="Maximum number of stations to return"),
    lat: Optional[float] = Query(default=None, ge=-90.0, le=90.0, description="Explicit latitude override"),
    lng: Optional[float] = Query(default=None, ge=-180.0, le=180.0, description="Explicit longitude override"),
) -> LiveDataResponse:
    try:
        service = get_multi_source_service()
        result = service.fetch_city_stations(
            city_name=city,
            distance_km=distance_km,
            max_results=max_results,
            explicit_lat=lat,
            explicit_lng=lng,
        )
        return LiveDataResponse(**result.to_dict())
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))


@router.get(
    "/live-sources",
    response_model=LiveSourcesResponse,
    summary="Get operational status and station counts for all charging data sources",
    description="Returns real-time connection status, station counts, and timestamps for OCM, BEE, OSM, and Kaggle baseline.",
)
async def get_live_sources(
    city: str = Query(default="Pune", description="City name (e.g. Pune, Mumbai)"),
    distance_km: float = Query(default=25.0, ge=1.0, le=100.0, description="Search radius in kilometers"),
) -> LiveSourcesResponse:
    try:
        service = get_multi_source_service()
        result = service.fetch_city_stations(
            city_name=city,
            distance_km=distance_km,
            max_results=50,
        )
        return LiveSourcesResponse(
            city=result.city,
            is_live=result.is_live,
            live_station_count=result.live_station_count,
            raw_station_count=result.raw_station_count,
            deduplicated_count=result.deduplicated_count,
            sources={k: SourceStatus(**v.to_dict()) for k, v in result.sources.items()},
        )
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
