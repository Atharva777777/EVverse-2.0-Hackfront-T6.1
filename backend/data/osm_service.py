"""
backend/data/osm_service.py
===========================
Service for querying and filtering the local processed OpenStreetMap (OSM) dataset.
Source: data/processed/osm/western_zone_charging_stations.json
Licensing: Open Database License 1.0 (ODbL)
Attribution: © OpenStreetMap contributors
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.api.services.geo_utils import haversine_km

log = logging.getLogger(__name__)

_MODULE_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _MODULE_DIR.parents[1]
OSM_DATASET_PATH = _PROJECT_ROOT / "data" / "processed" / "osm" / "western_zone_charging_stations.json"
if not OSM_DATASET_PATH.exists():
    _local_osm = _MODULE_DIR / "processed" / "osm" / "western_zone_charging_stations.json"
    if _local_osm.exists():
        OSM_DATASET_PATH = _local_osm


@dataclass
class OSMSourceMetadata:
    is_available: bool
    status: str  # "loaded", "unavailable", "error"
    station_count: int
    total_dataset_records: int
    last_updated: Optional[str] = None
    attribution: str = "© OpenStreetMap contributors (ODbL 1.0)"
    license: str = "ODbL-1.0"
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_available": self.is_available,
            "status": self.status,
            "station_count": self.station_count,
            "total_dataset_records": self.total_dataset_records,
            "last_updated": self.last_updated,
            "attribution": self.attribution,
            "license": self.license,
            "error_message": self.error_message,
        }


class OSMService:
    """Service to load and query regional OpenStreetMap charging station extracts."""

    def __init__(self, dataset_path: Optional[Path] = None):
        self.dataset_path = dataset_path or OSM_DATASET_PATH
        self._raw_dataset: Optional[Dict[str, Any]] = None
        self._stations: List[Dict[str, Any]] = []
        self._metadata: Dict[str, Any] = {}
        self._load_dataset()

    def _load_dataset(self) -> None:
        if not self.dataset_path.exists():
            log.warning("OSM dataset file does not exist at %s", self.dataset_path)
            return

        try:
            with open(self.dataset_path, "r", encoding="utf-8") as f:
                self._raw_dataset = json.load(f)
            self._metadata = self._raw_dataset.get("metadata", {})
            self._stations = self._raw_dataset.get("stations", [])
            log.info(
                "Loaded %d OSM charging station records from %s",
                len(self._stations),
                self.dataset_path.name,
            )
        except Exception as exc:
            log.error("Failed to load OSM dataset from %s: %s", self.dataset_path, exc)

    @property
    def is_loaded(self) -> bool:
        return bool(self._stations)

    @property
    def total_count(self) -> int:
        return len(self._stations)

    def fetch_raw_stations(
        self,
        lat: float,
        lng: float,
        city_name: str,
        radius_km: float = 25.0,
    ) -> Tuple[List[Dict[str, Any]], OSMSourceMetadata]:
        """
        Filters OSM stations by radius around the coordinate or region tag.
        """
        if not self.is_loaded:
            self._load_dataset()

        if not self.is_loaded:
            meta = OSMSourceMetadata(
                is_available=False,
                status="unavailable",
                station_count=0,
                total_dataset_records=0,
                error_message="OSM dataset file not found on disk",
            )
            return [], meta

        extraction_timestamp = self._metadata.get("extraction_timestamp")
        license_str = self._metadata.get("license", "ODbL-1.0")
        attribution_str = self._metadata.get("attribution", "© OpenStreetMap contributors")

        matching_stations: List[Dict[str, Any]] = []
        city_key = city_name.lower().replace(" ", "_")
        region_tag_target = f"{city_key}_metro"

        for st in self._stations:
            st_lat = st.get("latitude")
            st_lng = st.get("longitude")
            if st_lat is None or st_lng is None:
                continue

            # Check geographic radius
            dist = haversine_km(lat, lng, float(st_lat), float(st_lng))
            is_within_radius = dist <= radius_km
            has_matching_region = region_tag_target in st.get("region_tags", [])

            if is_within_radius or has_matching_region:
                st_copy = dict(st)
                st_copy["distance_km"] = round(dist, 2)
                matching_stations.append(st_copy)

        meta = OSMSourceMetadata(
            is_available=True,
            status="loaded",
            station_count=len(matching_stations),
            total_dataset_records=len(self._stations),
            last_updated=extraction_timestamp,
            attribution=f"{attribution_str} ({license_str})",
            license=license_str,
            error_message=None,
        )
        return matching_stations, meta


_DEFAULT_OSM_SERVICE: Optional[OSMService] = None


def get_osm_service() -> OSMService:
    global _DEFAULT_OSM_SERVICE
    if _DEFAULT_OSM_SERVICE is None:
        _DEFAULT_OSM_SERVICE = OSMService()
    return _DEFAULT_OSM_SERVICE
