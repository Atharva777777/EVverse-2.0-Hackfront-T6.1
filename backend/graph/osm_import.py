"""
backend/graph/osm_import.py
===========================
Imports the processed OpenStreetMap Western Zone charging-station extract into
Neo4j.

Data rules (never fabricate):
- Only records with coordinates are imported.
- Records flagged by the extractor as physical duplicates are skipped and counted.
- City comes only from the extractor's region tags. Stations without one are
  placed in an explicit "Unassigned" city, not guessed.
- Operator comes from the OSM `operator` tag, else `brand`. Missing stays missing.
- Connector types come only from OSM socket tags. Power is stored only where
  OSM states it.
- Every station keeps its OSM id, URL, licence and attribution.

Re-running the import is idempotent: stations, cities, operators and connectors
are MERGEd by stable ids, and stations that have disappeared from the extract
are removed so the graph matches the file.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.graph.neo4j_client import Neo4jClient
from backend.graph.schema import ensure_schema

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OSM_PATH = PROJECT_ROOT / "data" / "processed" / "osm" / "western_zone_charging_stations.json"

SOURCE_NAME = "OpenStreetMap"
UNASSIGNED_CITY = "Unassigned (western zone)"
NEAR_RADIUS_M = 1000.0  # ChargingStation NEAR ChargingStation threshold

REGION_TO_CITY = {
    "pune_metro": "Pune",
    "mumbai_metro": "Mumbai",
}

# OSM socket tag -> connector type shown in the product
SOCKET_TO_CONNECTOR = {
    "type2_combo": "CCS2",
    "type2": "Type 2",
    "chademo": "CHAdeMO",
}

_KW_RE = re.compile(r"(\d+(?:\.\d+)?)\s*kw", re.IGNORECASE)


def _clean(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text or None


def operator_key(name: str) -> str:
    """Case- and whitespace-insensitive key so 'Tata Power' and 'Tata power' merge."""
    return " ".join(name.split()).casefold()


def parse_kw(value: Any) -> Optional[float]:
    if value is None:
        return None
    match = _KW_RE.search(str(value))
    return float(match.group(1)) if match else None


def parse_count(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        count = int(str(value).strip())
        return count if count > 0 else None
    except ValueError:
        return None


def build_import(payload: Dict[str, Any], imported_at: str) -> Dict[str, Any]:
    """Turn the OSM extract into Neo4j-ready rows. Pure function, no database access."""
    metadata = payload.get("metadata", {}) or {}
    source_generated_at = metadata.get("extraction_timestamp")
    raw_stations = payload.get("stations", []) or []

    stations: List[Dict[str, Any]] = []
    connectors: List[Dict[str, Any]] = []
    city_counts: Counter = Counter()
    duplicates = 0
    missing_coordinates = 0

    for record in raw_stations:
        if record.get("is_physical_duplicate"):
            duplicates += 1
            continue
        lat, lng = record.get("latitude"), record.get("longitude")
        if lat is None or lng is None:
            missing_coordinates += 1
            continue

        region_tags = record.get("region_tags") or []
        region = region_tags[0] if region_tags else None
        city = REGION_TO_CITY.get(region, UNASSIGNED_CITY) if region else UNASSIGNED_CITY

        operator_name = _clean(record.get("operator"))
        operator_source = "operator" if operator_name else None
        if operator_name is None:
            operator_name = _clean(record.get("brand"))
            operator_source = "brand" if operator_name else None

        station_id = f"osm:{record['id']}"
        max_power_kw = parse_kw(record.get("max_power"))

        stations.append(
            {
                "id": station_id,
                "name": _clean(record.get("name")),
                "lat": float(lat),
                "lng": float(lng),
                "city": city,
                "region": region,
                "operator": operator_name,
                "operator_key": operator_key(operator_name) if operator_name else None,
                "operator_source": operator_source,
                "max_power_kw": max_power_kw,
                "source": SOURCE_NAME,
                "source_ref": record.get("id"),
                "source_url": record.get("osm_url"),
                "license": record.get("license") or "ODbL-1.0",
                "attribution": record.get("attribution") or "© OpenStreetMap contributors",
                "source_generated_at": source_generated_at,
                "verification_status": "osm_extract_unverified",
                "imported_at": imported_at,
            }
        )
        city_counts[city] += 1

        sockets = record.get("sockets") or {}
        outputs = record.get("socket_outputs") or {}
        for socket_key, raw_count in sockets.items():
            connector_type = SOCKET_TO_CONNECTOR.get(socket_key, socket_key)
            connectors.append(
                {
                    "id": f"{station_id}|{connector_type}",
                    "station_id": station_id,
                    "type": connector_type,
                    "points": parse_count(raw_count),
                    "power_kw": parse_kw(outputs.get(socket_key)),
                    "osm_socket_key": socket_key,
                }
            )

    operators_known = sum(1 for s in stations if s["operator"])
    stats = {
        "raw_records": len(raw_stations),
        "stations_imported": len(stations),
        "physical_duplicates_skipped": duplicates,
        "missing_coordinates_skipped": missing_coordinates,
        "stations_with_operator": operators_known,
        "stations_without_operator": len(stations) - operators_known,
        "stations_with_max_power": sum(1 for s in stations if s["max_power_kw"] is not None),
        "connector_nodes": len(connectors),
        "stations_by_city": dict(city_counts),
    }
    return {"stations": stations, "connectors": connectors, "stats": stats}


def load_payload(path: Optional[Path] = None) -> Dict[str, Any]:
    source = Path(path) if path else DEFAULT_OSM_PATH
    with source.open("r", encoding="utf-8") as handle:
        return json.load(handle)


# ── Cypher (all MERGE: safe to re-run) ───────────────────────────────────────

CYPHER_UPSERT_STATIONS = """
UNWIND $stations AS r
MERGE (s:ChargingStation {id: r.id})
SET s.name = r.name,
    s.latitude = r.lat,
    s.longitude = r.lng,
    s.location = point({latitude: r.lat, longitude: r.lng}),
    s.city = r.city,
    s.region = r.region,
    s.operator_name = r.operator,
    s.operator_source = r.operator_source,
    s.max_power_kw = r.max_power_kw,
    s.source = r.source,
    s.source_ref = r.source_ref,
    s.source_url = r.source_url,
    s.license = r.license,
    s.attribution = r.attribution,
    s.source_generated_at = r.source_generated_at,
    s.verification_status = r.verification_status,
    s.imported_at = r.imported_at
"""

CYPHER_LINK_CITIES = """
UNWIND $stations AS r
MATCH (s:ChargingStation {id: r.id})
MERGE (c:City {name: r.city})
MERGE (c)-[:CONTAINS]->(s)
"""

CYPHER_LINK_OPERATORS = """
UNWIND $stations AS r
WITH r WHERE r.operator_key IS NOT NULL
MATCH (s:ChargingStation {id: r.id})
MERGE (o:Operator {key: r.operator_key})
SET o.name = r.operator
MERGE (o)-[:OPERATES]->(s)
"""

CYPHER_UPSERT_CONNECTORS = """
UNWIND $connectors AS k
MATCH (s:ChargingStation {id: k.station_id})
MERGE (c:Connector {id: k.id})
SET c.type = k.type,
    c.points = k.points,
    c.power_kw = k.power_kw,
    c.osm_socket_key = k.osm_socket_key
MERGE (s)-[:HAS_CONNECTOR]->(c)
"""

CYPHER_REMOVE_STALE_OSM = """
MATCH (s:ChargingStation {source: $source})
WHERE NOT s.id IN $keep_ids
DETACH DELETE s
"""

CYPHER_REBUILD_NEAR = """
MATCH (a:ChargingStation), (b:ChargingStation)
WHERE elementId(a) < elementId(b)
  AND point.distance(a.location, b.location) <= $radius_m
MERGE (a)-[r:NEAR]->(b)
SET r.distance_m = point.distance(a.location, b.location)
"""

CYPHER_DROP_OLD_NEAR = """
MATCH ()-[r:NEAR]->()
WHERE r.distance_m > $radius_m
DELETE r
"""

CYPHER_COUNT_NEAR = "MATCH ()-[r:NEAR]->() RETURN count(r) AS near_relationships"


def import_osm(client: Neo4jClient, path: Optional[Path] = None) -> Dict[str, Any]:
    imported_at = datetime.now(timezone.utc).isoformat()
    payload = load_payload(path)
    built = build_import(payload, imported_at=imported_at)
    stations = built["stations"]
    connectors = built["connectors"]

    ensure_schema(client)
    client.write(CYPHER_UPSERT_STATIONS, {"stations": stations})
    client.write(CYPHER_LINK_CITIES, {"stations": stations})
    client.write(CYPHER_LINK_OPERATORS, {"stations": stations})
    client.write(CYPHER_UPSERT_CONNECTORS, {"connectors": connectors})
    client.write(CYPHER_REMOVE_STALE_OSM, {"source": SOURCE_NAME, "keep_ids": [s["id"] for s in stations]})
    client.write(CYPHER_DROP_OLD_NEAR, {"radius_m": NEAR_RADIUS_M})
    client.write(CYPHER_REBUILD_NEAR, {"radius_m": NEAR_RADIUS_M})
    near = client.read(CYPHER_COUNT_NEAR)

    stats = dict(built["stats"])
    stats["near_relationships"] = near[0]["near_relationships"] if near else 0
    stats["near_radius_m"] = NEAR_RADIUS_M
    stats["imported_at"] = imported_at
    stats["source_file"] = str(Path(path) if path else DEFAULT_OSM_PATH)
    return stats
