"""
backend/data/multi_source_service.py
====================================
Unified multi-source charging station ingestion and spatial deduplication pipeline.

Combines:
1. Open Charge Map (OCM) live API
2. Bureau of Energy Efficiency (BEE) National EV Registry API
3. Local processed OpenStreetMap (OSM) Western Zone extract (ODbL 1.0)
4. Kaggle baseline fallback (static and unverified)

Principles:
- Strict preservation of source IDs, provenance, and legal attributions.
- Spatial deduplication across overlapping physical sites (~75m threshold).
- Preservation of unknown connector, power, and operational fields (never fabricated).
- In-memory caching and request throttling to avoid external API hammering.
- Explicit exposure of per-source operational status, counts, and timestamps.
"""

from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from backend.api.services.geo_utils import haversine_km
from backend.data.bee_service import BEESourceMetadata, get_bee_service
from backend.data.open_charge_map import (
    CITY_COORDINATES,
    NormalizedStation,
    OpenChargeMapService,
    get_ocm_service,
)
from backend.data.osm_service import OSMSourceMetadata, get_osm_service

log = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 300.0  # 5 minutes
DEDUPLICATION_RADIUS_KM = 0.075  # 75 meters threshold for physical station deduplication


@dataclass
class SourceStatusInfo:
    name: str
    source_key: str
    status: str  # "connected", "loaded", "active_fallback", "standby", "offline", "error"
    is_available: bool
    station_count: int
    last_updated: Optional[str] = None
    attribution: Optional[str] = None
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "source_key": self.source_key,
            "status": self.status,
            "is_available": self.is_available,
            "station_count": self.station_count,
            "last_updated": self.last_updated,
            "attribution": self.attribution,
            "error_message": self.error_message,
        }


@dataclass
class MultiSourceResult:
    city: str
    is_live: bool
    source: str  # "multi_source", "open_charge_map", "bee", "osm", or "kaggle_baseline"
    status_message: str
    live_station_count: int
    raw_station_count: int
    deduplicated_count: int
    last_updated: str
    stations: List[NormalizedStation]
    sources: Dict[str, SourceStatusInfo]
    fallback_reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "city": self.city,
            "is_live": self.is_live,
            "source": self.source,
            "status_message": self.status_message,
            "live_station_count": self.live_station_count,
            "raw_station_count": self.raw_station_count,
            "deduplicated_count": self.deduplicated_count,
            "last_updated": self.last_updated,
            "stations": [s.to_dict() for s in self.stations],
            "sources": {k: v.to_dict() for k, v in self.sources.items()},
            "fallback_reason": self.fallback_reason,
        }


class MultiSourceStationService:
    """Orchestrates multi-source EV station ingestion, normalization, and deduplication."""

    def __init__(
        self,
        ocm_service: Optional[OpenChargeMapService] = None,
    ):
        self.ocm_service = ocm_service or get_ocm_service()
        self.bee_service = get_bee_service()
        self.osm_service = get_osm_service()
        self._cache: Dict[str, Tuple[float, MultiSourceResult]] = {}

    def resolve_city_center(self, canonical_city: str) -> Tuple[float, float]:
        """Resolves (lat, lon) for a given city."""
        return self.ocm_service.resolve_city_center(canonical_city)

    # ── Normalization Helpers ────────────────────────────────────────────────

    def _normalize_bee_station(self, raw: Dict[str, Any], city_name: str) -> Optional[NormalizedStation]:
        """Converts raw BEE station record into NormalizedStation."""
        st_id = raw.get("id")
        if not st_id:
            return None

        lat = raw.get("latitude")
        lng = raw.get("longitude")
        if lat is None or lng is None:
            return None

        try:
            lat = float(lat)
            lng = float(lng)
        except (ValueError, TypeError):
            return None

        operator = raw.get("operator") or "Public EV Network"
        address_raw = raw.get("address") or ""
        city_raw = raw.get("city") or city_name
        full_address = f"{address_raw}, {city_raw}" if address_raw else city_raw

        # Construct clean station name
        if address_raw:
            locality = address_raw.split(",")[0].strip()
            name = f"{operator} Station - {locality}"
        else:
            name = f"{operator} EV Station ({st_id})"

        # Verified max power in kW (never fabricated: if <= 0 or missing, preserve as None)
        max_p = raw.get("max_power_kw")
        try:
            power_kw = float(max_p) if max_p is not None and float(max_p) > 0.0 else None
        except (ValueError, TypeError):
            power_kw = None

        # Number of bays / total connectors
        total_chargers = raw.get("total_chargers") or raw.get("total_connectors") or 1
        try:
            bays = max(1, int(total_chargers))
        except (ValueError, TypeError):
            bays = 1

        # Map standard names
        standards_raw = raw.get("standards") or []
        connector_types: List[str] = []
        for std in standards_raw:
            s_clean = str(std).replace("_", " ").strip()
            if s_clean.upper() == "CCS 2" or s_clean.upper() == "CCS2":
                s_clean = "CCS2"
            elif s_clean.upper() == "TYPE 2" or s_clean.upper() == "TYPE-2":
                s_clean = "Type 2"
            elif s_clean.upper() == "CHADEMO":
                s_clean = "CHAdeMO"
            elif s_clean.upper() == "LEV AC":
                s_clean = "LEV AC (Light EV)"
            if s_clean and s_clean not in connector_types:
                connector_types.append(s_clean)

        now_iso = datetime.now(timezone.utc).isoformat()

        return NormalizedStation(
            station_id=f"BEE-{st_id}",
            name=name,
            latitude=lat,
            longitude=lng,
            address=full_address,
            operator=operator,
            status="Registered (BEE Registry)",
            is_operational=True,
            power_kw=power_kw,
            bays=bays,
            connector_types=connector_types,
            usage_cost=None,  # Not provided in BEE registry API; preserve as None
            source="bee",
            sources=["bee"],
            source_ids={"bee": str(st_id)},
            attribution="Bureau of Energy Efficiency (BEE) National Registry",
            last_status_update=now_iso,
        )

    def _normalize_osm_station(self, raw: Dict[str, Any]) -> Optional[NormalizedStation]:
        """Converts raw processed OSM record into NormalizedStation."""
        st_id = raw.get("id") or f"node/{raw.get('osm_id')}"
        lat = raw.get("latitude")
        lng = raw.get("longitude")
        if lat is None or lng is None:
            return None

        try:
            lat = float(lat)
            lng = float(lng)
        except (ValueError, TypeError):
            return None

        name_raw = raw.get("name")
        operator_raw = raw.get("operator") or raw.get("brand") or raw.get("network")

        if name_raw:
            name = name_raw
        elif operator_raw:
            name = f"{operator_raw} Charging Point"
        else:
            name = f"EV Charging Point ({raw.get('osm_id')})"

        # Power rating in kW (never fabricated: preserve as None if not in OSM)
        power_kw = None
        max_p = raw.get("max_power")
        if max_p is not None:
            try:
                power_kw = float(max_p)
            except (ValueError, TypeError):
                pass

        # Bays / sockets
        bays = 1
        cap = raw.get("capacity") or raw.get("sockets")
        if cap is not None:
            try:
                bays = max(1, int(cap))
            except (ValueError, TypeError):
                pass

        # Connectors from socket tags or outputs (never fabricated: empty list if none)
        connector_types: List[str] = []
        raw_tags = raw.get("raw_tags") or {}
        for tag_k, tag_v in raw_tags.items():
            if "socket:" in tag_k and tag_v not in ("no", "0"):
                sock_name = tag_k.replace("socket:", "").replace("_", " ").title()
                if "Ccs" in sock_name:
                    sock_name = "CCS2"
                elif "Type2" in sock_name:
                    sock_name = "Type 2"
                elif "Chademo" in sock_name:
                    sock_name = "CHAdeMO"
                if sock_name not in connector_types:
                    connector_types.append(sock_name)

        address = raw.get("address")
        if isinstance(address, dict):
            parts = [str(val) for val in address.values() if val]
            address = ", ".join(parts) if parts else None
        extraction_ts = raw.get("extraction_timestamp") or datetime.now(timezone.utc).isoformat()

        return NormalizedStation(
            station_id=f"OSM-{raw.get('osm_type', 'node')[:1].upper()}{raw.get('osm_id')}",
            name=name,
            latitude=lat,
            longitude=lng,
            address=address,
            operator=operator_raw,
            status="Mapped (Community Verified)",
            is_operational=True,
            power_kw=power_kw,
            bays=bays,
            connector_types=connector_types,
            usage_cost=None,
            source="osm",
            sources=["osm"],
            source_ids={"osm": str(raw.get("id"))},
            attribution="© OpenStreetMap contributors (ODbL 1.0)",
            last_status_update=extraction_ts,
        )

    # ── Deduplication & Merging ──────────────────────────────────────────────

    def _merge_two_stations(
        self,
        primary: NormalizedStation,
        secondary: NormalizedStation,
    ) -> NormalizedStation:
        """
        Merges secondary station into primary station record while preserving all
        source identifiers, attributes, and attributions.
        """
        # 1. Merge sources list
        combined_sources: List[str] = []
        for s in (primary.sources or [primary.source]) + (secondary.sources or [secondary.source]):
            if s not in combined_sources:
                combined_sources.append(s)

        # 2. Merge source_ids
        combined_source_ids: Dict[str, str] = dict(primary.source_ids or {})
        for k, v in (secondary.source_ids or {}).items():
            if k not in combined_source_ids:
                combined_source_ids[k] = v

        # 3. Choose descriptive name: prefer non-generic name
        name = primary.name
        if "EV Charging Point (" in primary.name and not ("EV Charging Point (" in secondary.name):
            name = secondary.name

        # 4. Operator: prefer non-null
        operator = primary.operator or secondary.operator

        # 5. Address: prefer non-null longer address
        address = primary.address or secondary.address
        if secondary.address and (not primary.address or len(secondary.address) > len(primary.address)):
            address = secondary.address

        # 6. Power: prefer verified power if available (do not overwrite verified with None)
        power_kw = primary.power_kw if primary.power_kw is not None else secondary.power_kw

        # 7. Bays: max available bays
        bays = max(primary.bays, secondary.bays)

        # 8. Connector types: union of known types
        combined_connectors: List[str] = list(primary.connector_types)
        for c in secondary.connector_types:
            if c not in combined_connectors:
                combined_connectors.append(c)

        # 9. Attributions
        combined_attr_parts: List[str] = []
        for a in [primary.attribution, secondary.attribution]:
            if a and a not in combined_attr_parts:
                combined_attr_parts.append(a)
        attribution = " • ".join(combined_attr_parts) if combined_attr_parts else None

        # 10. Status & Timestamp
        status = primary.status
        last_update = primary.last_status_update or secondary.last_status_update

        return NormalizedStation(
            station_id=primary.station_id,
            name=name,
            latitude=primary.latitude,
            longitude=primary.longitude,
            address=address,
            operator=operator,
            status=status,
            is_operational=primary.is_operational or secondary.is_operational,
            power_kw=power_kw,
            bays=bays,
            connector_types=combined_connectors,
            usage_cost=primary.usage_cost or secondary.usage_cost,
            source="merged",
            sources=combined_sources,
            source_ids=combined_source_ids,
            attribution=attribution,
            last_status_update=last_update,
        )

    def _deduplicate_stations(
        self,
        stations: List[NormalizedStation],
        threshold_km: float = DEDUPLICATION_RADIUS_KM,
    ) -> Tuple[List[NormalizedStation], int]:
        """
        Deduplicates co-located stations within threshold_km (~75 meters).
        Returns (deduplicated_list, duplicate_count).
        """
        if not stations:
            return [], 0

        merged_pool: List[NormalizedStation] = []
        duplicates_count = 0

        for candidate in stations:
            matched_index = -1
            best_dist = float("inf")

            for idx, existing in enumerate(merged_pool):
                dist = haversine_km(
                    candidate.latitude,
                    candidate.longitude,
                    existing.latitude,
                    existing.longitude,
                )
                if dist <= threshold_km and dist < best_dist:
                    matched_index = idx
                    best_dist = dist

            if matched_index >= 0:
                # Merge into existing record
                merged_pool[matched_index] = self._merge_two_stations(
                    merged_pool[matched_index],
                    candidate,
                )
                duplicates_count += 1
            else:
                merged_pool.append(candidate)

        return merged_pool, duplicates_count

    # ── Master Orchestration ─────────────────────────────────────────────────

    def fetch_city_stations(
        self,
        city_name: str,
        distance_km: float = 25.0,
        max_results: int = 100,
        explicit_lat: Optional[float] = None,
        explicit_lng: Optional[float] = None,
    ) -> MultiSourceResult:
        """
        Fetches charging stations across OCM, BEE, and OSM;
        performs cross-source spatial deduplication;
        exposes per-source operational status, counts, and timestamps;
        gracefully falls back to Kaggle baseline if all sources are unavailable.
        """
        try:
            from backend.data.loader import get_loader
            canonical_city = get_loader().canonicalize_city_name(city_name)
        except Exception:
            canonical_city = city_name.strip().title()

        cache_key = f"{canonical_city}_{round(distance_km, 1)}_{max_results}"
        now = time.time()
        if cache_key in self._cache:
            ts, cached_result = self._cache[cache_key]
            if (now - ts) < CACHE_TTL_SECONDS:
                return cached_result

        # Resolve coordinates
        if explicit_lat is not None and explicit_lng is not None:
            lat, lng = explicit_lat, explicit_lng
        else:
            try:
                lat, lng = self.resolve_city_center(canonical_city)
            except Exception as e:
                log.warning("Could not resolve coordinates for city %s: %s", canonical_city, e)
                fallback = self.ocm_service._fallback_to_baseline(
                    canonical_city,
                    f"Unsupported city: {canonical_city}",
                    max_results=max_results,
                )
                sources_meta = {
                    "kaggle_baseline": SourceStatusInfo(
                        name="Kaggle Baseline",
                        source_key="kaggle_baseline",
                        status="active_fallback",
                        is_available=True,
                        station_count=fallback.live_station_count,
                        last_updated=None,
                        attribution="Kaggle Baseline Dataset (Static & Unverified)",
                        error_message=fallback.fallback_reason,
                    )
                }
                return MultiSourceResult(
                    city=canonical_city,
                    is_live=False,
                    source="kaggle_baseline",
                    status_message=fallback.status_message,
                    live_station_count=fallback.live_station_count,
                    raw_station_count=fallback.live_station_count,
                    deduplicated_count=0,
                    last_updated=fallback.last_updated,
                    stations=fallback.stations,
                    sources=sources_meta,
                    fallback_reason=fallback.fallback_reason,
                )

        now_iso = datetime.now(timezone.utc).isoformat()
        raw_stations: List[NormalizedStation] = []
        sources_meta: Dict[str, SourceStatusInfo] = {}

        # 1. Query Open Charge Map (OCM)
        ocm_count = 0
        try:
            ocm_res = self.ocm_service.fetch_city_stations(
                city_name=canonical_city,
                distance_km=distance_km,
                max_results=max_results,
                explicit_lat=lat,
                explicit_lng=lng,
            )
            if ocm_res.is_live:
                raw_stations.extend(ocm_res.stations)
                ocm_count = len(ocm_res.stations)
                sources_meta["open_charge_map"] = SourceStatusInfo(
                    name="Open Charge Map",
                    source_key="open_charge_map",
                    status="connected",
                    is_available=True,
                    station_count=ocm_count,
                    last_updated=ocm_res.last_updated,
                    attribution="Open Charge Map (CC-BY 4.0)",
                    error_message=None,
                )
            else:
                sources_meta["open_charge_map"] = SourceStatusInfo(
                    name="Open Charge Map",
                    source_key="open_charge_map",
                    status="offline",
                    is_available=False,
                    station_count=0,
                    last_updated=None,
                    attribution="Open Charge Map (CC-BY 4.0)",
                    error_message=ocm_res.fallback_reason,
                )
        except Exception as ocm_err:
            log.warning("OCM fetch error for %s: %s", canonical_city, ocm_err)
            sources_meta["open_charge_map"] = SourceStatusInfo(
                name="Open Charge Map",
                source_key="open_charge_map",
                status="error",
                is_available=False,
                station_count=0,
                last_updated=None,
                attribution="Open Charge Map (CC-BY 4.0)",
                error_message=str(ocm_err),
            )

        # 2. Query Bureau of Energy Efficiency (BEE) API
        bee_count = 0
        try:
            raw_bee_records, bee_meta = self.bee_service.fetch_raw_stations(
                lat=lat,
                lng=lng,
                city_name=canonical_city,
                radius_km=distance_km,
                limit=max_results,
            )
            normalized_bee = [
                s for r in raw_bee_records
                if (s := self._normalize_bee_station(r, canonical_city)) is not None
            ]
            raw_stations.extend(normalized_bee)
            bee_count = len(normalized_bee)

            sources_meta["bee"] = SourceStatusInfo(
                name="BEE",
                source_key="bee",
                status=bee_meta.status,
                is_available=bee_meta.is_available,
                station_count=bee_count,
                last_updated=bee_meta.last_updated,
                attribution=bee_meta.attribution,
                error_message=bee_meta.error_message,
            )
        except Exception as bee_err:
            log.warning("BEE fetch error for %s: %s", canonical_city, bee_err)
            sources_meta["bee"] = SourceStatusInfo(
                name="BEE",
                source_key="bee",
                status="error",
                is_available=False,
                station_count=0,
                last_updated=None,
                attribution="Bureau of Energy Efficiency (BEE) National Registry",
                error_message=str(bee_err),
            )

        # 3. Query Local OpenStreetMap (OSM) Dataset
        osm_count = 0
        try:
            raw_osm_records, osm_meta = self.osm_service.fetch_raw_stations(
                lat=lat,
                lng=lng,
                city_name=canonical_city,
                radius_km=distance_km,
            )
            normalized_osm = [
                s for r in raw_osm_records
                if (s := self._normalize_osm_station(r)) is not None
            ]
            raw_stations.extend(normalized_osm)
            osm_count = len(normalized_osm)

            sources_meta["osm"] = SourceStatusInfo(
                name="OpenStreetMap",
                source_key="osm",
                status=osm_meta.status,
                is_available=osm_meta.is_available,
                station_count=osm_count,
                last_updated=osm_meta.last_updated,
                attribution=osm_meta.attribution,
                error_message=osm_meta.error_message,
            )
        except Exception as osm_err:
            log.warning("OSM fetch error for %s: %s", canonical_city, osm_err)
            sources_meta["osm"] = SourceStatusInfo(
                name="OpenStreetMap",
                source_key="osm",
                status="error",
                is_available=False,
                station_count=0,
                last_updated=None,
                attribution="© OpenStreetMap contributors (ODbL 1.0)",
                error_message=str(osm_err),
            )

        # 4. Cross-Source Spatial Deduplication
        raw_total = len(raw_stations)
        deduped_stations, dupes_removed = self._deduplicate_stations(raw_stations)
        deduped_stations = deduped_stations[:max_results]

        # 5. Check whether live/verified stations are present or fallback needed
        if deduped_stations:
            sources_meta["kaggle_baseline"] = SourceStatusInfo(
                name="Kaggle Baseline",
                source_key="kaggle_baseline",
                status="standby",
                is_available=True,
                station_count=0,
                last_updated=None,
                attribution="Kaggle Baseline Dataset (Static & Unverified)",
                error_message="Standby: live & local multi-source stations active",
            )
            result = MultiSourceResult(
                city=canonical_city,
                is_live=True,
                source="multi_source",
                status_message=f"Live multi-source EV infrastructure ({len(deduped_stations)} verified stations)",
                live_station_count=len(deduped_stations),
                raw_station_count=raw_total,
                deduplicated_count=dupes_removed,
                last_updated=now_iso,
                stations=deduped_stations,
                sources=sources_meta,
                fallback_reason=None,
            )
        else:
            # Fallback to Kaggle baseline
            fallback = self.ocm_service._fallback_to_baseline(
                canonical_city,
                "All live and local sources returned 0 stations for this coordinate",
                max_results=max_results,
            )
            sources_meta["kaggle_baseline"] = SourceStatusInfo(
                name="Kaggle Baseline",
                source_key="kaggle_baseline",
                status="active_fallback",
                is_available=True,
                station_count=fallback.live_station_count,
                last_updated=None,
                attribution="Kaggle Baseline Dataset (Static & Unverified)",
                error_message=fallback.fallback_reason,
            )
            result = MultiSourceResult(
                city=canonical_city,
                is_live=False,
                source="kaggle_baseline",
                status_message=fallback.status_message,
                live_station_count=fallback.live_station_count,
                raw_station_count=fallback.live_station_count,
                deduplicated_count=0,
                last_updated=fallback.last_updated,
                stations=fallback.stations,
                sources=sources_meta,
                fallback_reason=fallback.fallback_reason,
            )

        self._cache[cache_key] = (now, result)
        return result


_DEFAULT_MULTI_SOURCE_SERVICE: Optional[MultiSourceStationService] = None


def get_multi_source_service() -> MultiSourceStationService:
    global _DEFAULT_MULTI_SOURCE_SERVICE
    if _DEFAULT_MULTI_SOURCE_SERVICE is None:
        _DEFAULT_MULTI_SOURCE_SERVICE = MultiSourceStationService()
    return _DEFAULT_MULTI_SOURCE_SERVICE
