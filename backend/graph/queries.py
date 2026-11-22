"""
backend/graph/queries.py
========================
Graph-powered queries over EV charging infrastructure.

Every function runs Cypher against Neo4j. Nothing here returns hard-coded
results. Analytics that are computed in Python from graph rows say so in their
`method` field.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from statistics import median
from typing import Any, Dict, List, Optional

from backend.graph.neo4j_client import GraphUnavailable, Neo4jClient
from backend.graph.osm_import import UNASSIGNED_CITY

# Vehicle plug_type (from driver_db seed data) -> connector types it can use.
# Only plug types listed here create SUPPORTS edges. Unknown plugs create none.
PLUG_TO_CONNECTORS: Dict[str, List[str]] = {
    "CCS2 Combo": ["CCS2"],
    "Type 2 (AC)": ["Type 2"],
    "Type 2": ["Type 2"],
    "CHAdeMO": ["CHAdeMO"],
}

# Demo owner station: the first Pune station with a known operator, by stable id.
DEMO_OWNER_ID = "demo-owner-pune"
DEMO_OWNER_NAME = "Demo station owner (simulated)"


# ── vehicles ──────────────────────────────────────────────────────────────────

CYPHER_UPSERT_VEHICLES = """
UNWIND $vehicles AS v
MERGE (vh:Vehicle {id: v.id})
SET vh.make = v.make,
    vh.model = v.model,
    vh.plug_type = v.plug_type,
    vh.max_dc_speed_kw = v.max_dc_speed_kw,
    vh.battery_kwh = v.battery_kwh
WITH vh, v
UNWIND v.connector_types AS connector_type
MATCH (k:Connector {type: connector_type})
MERGE (vh)-[:SUPPORTS]->(k)
"""

CYPHER_VEHICLE_EXISTS = "MATCH (v:Vehicle {id: $vehicle_id}) RETURN v.model AS model, v.make AS make"


def vehicle_rows(seed_vehicles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows = []
    for v in seed_vehicles:
        plug = v.get("plug_type") or ""
        rows.append(
            {
                "id": v["id"],
                "make": v.get("make"),
                "model": v.get("model"),
                "plug_type": plug,
                "max_dc_speed_kw": v.get("max_dc_speed_kw"),
                "battery_kwh": v.get("battery_kwh"),
                "connector_types": PLUG_TO_CONNECTORS.get(plug, []),
            }
        )
    return rows


def sync_vehicles(client: Neo4jClient, seed_vehicles: List[Dict[str, Any]]) -> int:
    rows = vehicle_rows(seed_vehicles)
    client.write(CYPHER_UPSERT_VEHICLES, {"vehicles": rows})
    return len(rows)


# ── 1. stations within a geographic area ─────────────────────────────────────

CYPHER_STATIONS_IN_BBOX = """
MATCH (s:ChargingStation)
WHERE point.withinBBox(
        s.location,
        point({latitude: $min_lat, longitude: $min_lng}),
        point({latitude: $max_lat, longitude: $max_lng}))
OPTIONAL MATCH (s)-[:HAS_CONNECTOR]->(k:Connector)
WITH s, collect(DISTINCT k.type) AS connector_types
RETURN s.id AS id, s.name AS name, s.latitude AS latitude, s.longitude AS longitude,
       s.city AS city, s.operator_name AS operator, s.max_power_kw AS max_power_kw,
       connector_types, s.source_url AS source_url, s.attribution AS attribution
ORDER BY s.id
LIMIT $limit
"""


def stations_in_bbox(client: Neo4jClient, min_lat: float, min_lng: float,
                     max_lat: float, max_lng: float, limit: int = 200) -> List[Dict[str, Any]]:
    return client.read(CYPHER_STATIONS_IN_BBOX, {
        "min_lat": min_lat, "min_lng": min_lng, "max_lat": max_lat, "max_lng": max_lng,
        "limit": limit,
    })


# ── 2. compatible stations for a selected vehicle ────────────────────────────

CYPHER_COMPATIBLE_STATIONS = """
MATCH (v:Vehicle {id: $vehicle_id})-[:SUPPORTS]->(k:Connector)<-[:HAS_CONNECTOR]-(s:ChargingStation)
WITH v, s, collect(DISTINCT k.type) AS matching_connector_types, max(k.power_kw) AS best_connector_kw
RETURN s.id AS id, s.name AS name, s.latitude AS latitude, s.longitude AS longitude,
       s.city AS city, s.operator_name AS operator, matching_connector_types,
       best_connector_kw, v.model AS vehicle_model
ORDER BY s.id
LIMIT $limit
"""


def compatible_stations(client: Neo4jClient, vehicle_id: str, limit: int = 200) -> Dict[str, Any]:
    vehicle = client.read(CYPHER_VEHICLE_EXISTS, {"vehicle_id": vehicle_id})
    if not vehicle:
        return {"vehicle_found": False, "stations": []}
    stations = client.read(CYPHER_COMPATIBLE_STATIONS, {"vehicle_id": vehicle_id, "limit": limit})
    return {"vehicle_found": True, "vehicle_model": vehicle[0].get("model"), "stations": stations}


# ── 3. nearby stations and clusters ──────────────────────────────────────────

CYPHER_NEARBY = """
MATCH (s:ChargingStation {id: $station_id}), (n:ChargingStation)
WHERE n <> s AND point.distance(s.location, n.location) <= $radius_m
RETURN n.id AS id, n.name AS name, n.latitude AS latitude, n.longitude AS longitude,
       n.city AS city, n.operator_name AS operator,
       point.distance(s.location, n.location) AS distance_m
ORDER BY distance_m
LIMIT $limit
"""

CYPHER_STATION_EXISTS = "MATCH (s:ChargingStation {id: $station_id}) RETURN s.name AS name"


def nearby_stations(client: Neo4jClient, station_id: str, radius_m: float = 2000.0,
                    limit: int = 50) -> Dict[str, Any]:
    if not client.read(CYPHER_STATION_EXISTS, {"station_id": station_id}):
        return {"station_found": False, "neighbours": []}
    rows = client.read(CYPHER_NEARBY, {"station_id": station_id, "radius_m": radius_m, "limit": limit})
    return {"station_found": True, "neighbours": rows}


CYPHER_CLUSTER_CELLS = """
MATCH (s:ChargingStation)
WITH floor(s.latitude / $cell_deg) AS lat_cell, floor(s.longitude / $cell_deg) AS lng_cell,
     collect(s) AS stations
WHERE size(stations) >= $min_stations
RETURN lat_cell, lng_cell, size(stations) AS station_count,
       [s IN stations | s.id] AS station_ids,
       [s IN stations | s.city] AS cities
ORDER BY station_count DESC
"""


def station_clusters(client: Neo4jClient, cell_deg: float = 0.02, min_stations: int = 2) -> Dict[str, Any]:
    rows = client.read(CYPHER_CLUSTER_CELLS, {"cell_deg": cell_deg, "min_stations": min_stations})
    clusters = []
    for row in rows:
        city_counts: Dict[str, int] = {}
        for city in row["cities"]:
            city_counts[city] = city_counts.get(city, 0) + 1
        dominant = max(city_counts.items(), key=lambda kv: kv[1])[0]
        clusters.append({
            "cell_lat": round(row["lat_cell"] * cell_deg, 4),
            "cell_lng": round(row["lng_cell"] * cell_deg, 4),
            "station_count": row["station_count"],
            "dominant_city": dominant,
            "station_ids": row["station_ids"],
        })
    return {
        "method": f"Stations grouped into {cell_deg}-degree grid cells (about 2 km); cells with at least {min_stations} stations are clusters.",
        "cluster_count": len(clusters),
        "clusters": clusters,
    }


# ── 4. distribution by city, operator and connector ──────────────────────────

CYPHER_BY_CITY = """
MATCH (c:City)-[:CONTAINS]->(s:ChargingStation)
RETURN c.name AS city, count(s) AS stations
ORDER BY stations DESC
"""

CYPHER_BY_OPERATOR = """
MATCH (o:Operator)-[:OPERATES]->(s:ChargingStation)
RETURN o.name AS operator, count(s) AS stations
ORDER BY stations DESC
"""

CYPHER_UNKNOWN_OPERATOR = """
MATCH (s:ChargingStation)
WHERE NOT (s)<-[:OPERATES]-(:Operator)
RETURN count(s) AS stations
"""

CYPHER_BY_CONNECTOR = """
MATCH (s:ChargingStation)-[:HAS_CONNECTOR]->(k:Connector)
RETURN k.type AS connector_type, count(DISTINCT s) AS stations,
       sum(coalesce(k.points, 0)) AS points_with_known_count,
       max(k.power_kw) AS max_connector_kw
ORDER BY stations DESC
"""

CYPHER_POWER_BANDS = """
MATCH (s:ChargingStation)
WHERE s.max_power_kw IS NOT NULL
RETURN CASE
         WHEN s.max_power_kw <= 22 THEN 'up to 22 kW (AC-class)'
         WHEN s.max_power_kw < 100 THEN '23 to 99 kW'
         ELSE '100 kW and above (DC fast)'
       END AS band,
       count(s) AS stations
ORDER BY stations DESC
"""

CYPHER_TOTAL_STATIONS = "MATCH (s:ChargingStation) RETURN count(s) AS stations"


def distribution(client: Neo4jClient) -> Dict[str, Any]:
    total = client.read(CYPHER_TOTAL_STATIONS)[0]["stations"]
    by_city = client.read(CYPHER_BY_CITY)
    by_operator = client.read(CYPHER_BY_OPERATOR)
    unknown_operator = client.read(CYPHER_UNKNOWN_OPERATOR)[0]["stations"]
    return {
        "total_stations": total,
        "by_city": by_city,
        "by_operator": by_operator,
        "stations_with_unknown_operator": unknown_operator,
        "by_connector_type": client.read(CYPHER_BY_CONNECTOR),
        "by_power_band": client.read(CYPHER_POWER_BANDS),
        "note": (
            "Counts reflect what OpenStreetMap currently tags. Mapping completeness differs by city, "
            "so a higher count can mean better mapping rather than more chargers."
        ),
    }


# ── 5. infrastructure gaps ───────────────────────────────────────────────────

CYPHER_ISOLATED = """
MATCH (s:ChargingStation)
WHERE NOT (s)-[:NEAR]-(:ChargingStation)
RETURN s.id AS id, s.name AS name, s.city AS city, s.latitude AS latitude, s.longitude AS longitude
ORDER BY s.id
"""


def coverage_gaps(client: Neo4jClient) -> Dict[str, Any]:
    city_rows = client.read(CYPHER_BY_CITY)
    isolated = client.read(CYPHER_ISOLATED)

    named = [r for r in city_rows if r["city"] != UNASSIGNED_CITY]
    named_counts = [r["stations"] for r in named]
    threshold = median(named_counts) if named_counts else 0

    below_median = [
        {"city": r["city"], "stations": r["stations"]}
        for r in named if r["stations"] < threshold
    ]
    return {
        "method": (
            "Cities below the median station count of named cities are coverage gaps. "
            "Stations with no other station within the NEAR radius are isolated. "
            "No EV registration or population data is used, so gaps are about station count only."
        ),
        "median_station_count_named_cities": threshold,
        "cities_below_median": below_median,
        "isolated_station_count": len(isolated),
        "isolated_stations": isolated,
    }


# ── 6. investment opportunity insights (written as InvestorOpportunity nodes) ─

CYPHER_UPSERT_OPPORTUNITY = """
MERGE (p:InvestorOpportunity {id: $opp_id})
SET p.kind = 'low_station_coverage',
    p.city = $city,
    p.stations = $stations,
    p.median_station_count = $median,
    p.generated_at = $generated_at,
    p.method = $method
WITH p
MATCH (c:City {name: $city})
MERGE (p)-[:TARGETS]->(c)
"""

OPPORTUNITY_METHOD = (
    "Generated from graph counts: city station count is below the median of named cities. "
    "Station count is the only signal; EV registrations and population are not available in this dataset."
)


def generate_opportunities(client: Neo4jClient) -> List[Dict[str, Any]]:
    gaps = coverage_gaps(client)
    generated_at = datetime.now(timezone.utc).isoformat()
    created = []
    for row in gaps["cities_below_median"]:
        slug = re.sub(r"[^a-z0-9]+", "-", row["city"].lower()).strip("-")
        opp_id = f"opp:low-coverage:{slug}"
        params = {
            "opp_id": opp_id,
            "city": row["city"],
            "stations": row["stations"],
            "median": gaps["median_station_count_named_cities"],
            "generated_at": generated_at,
            "method": OPPORTUNITY_METHOD,
        }
        client.write(CYPHER_UPSERT_OPPORTUNITY, params)
        created.append({"id": opp_id, **params})
    return created


CYPHER_LIST_OPPORTUNITIES = """
MATCH (p:InvestorOpportunity)-[:TARGETS]->(c:City)
RETURN p.id AS id, p.kind AS kind, c.name AS city, p.stations AS stations,
       p.median_station_count AS median_station_count, p.generated_at AS generated_at, p.method AS method
ORDER BY p.id
"""


def list_opportunities(client: Neo4jClient) -> List[Dict[str, Any]]:
    return client.read(CYPHER_LIST_OPPORTUNITIES)


# ── station owner (demo) ─────────────────────────────────────────────────────

CYPHER_PICK_DEMO_STATION = """
MATCH (s:ChargingStation)
WHERE s.city = 'Pune' AND s.operator_name IS NOT NULL
RETURN s.id AS id, s.name AS name, s.operator_name AS operator, s.max_power_kw AS max_power_kw
ORDER BY s.id
LIMIT 1
"""

CYPHER_LINK_DEMO_OWNER = """
MERGE (o:StationOwner {id: $owner_id})
SET o.name = $owner_name, o.is_simulated = true
WITH o
MATCH (s:ChargingStation {id: $station_id})
MERGE (o)-[:OWNS]->(s)
"""

CYPHER_OWNER_STATION = """
MATCH (o:StationOwner {id: $owner_id})-[:OWNS]->(s:ChargingStation)
OPTIONAL MATCH (s)-[:HAS_CONNECTOR]->(k:Connector)
WITH o, s, collect({type: k.type, points: k.points, power_kw: k.power_kw}) AS connectors
RETURN o.name AS owner_name, o.is_simulated AS is_simulated,
       s.id AS station_id, s.name AS station_name, s.city AS city,
       s.operator_name AS operator, s.max_power_kw AS max_power_kw,
       s.source_url AS source_url, s.attribution AS attribution, connectors
"""


def ensure_demo_owner(client: Neo4jClient) -> Optional[Dict[str, Any]]:
    picked = client.read(CYPHER_PICK_DEMO_STATION)
    if not picked:
        return None
    station_id = picked[0]["id"]
    client.write(CYPHER_LINK_DEMO_OWNER, {
        "owner_id": DEMO_OWNER_ID, "owner_name": DEMO_OWNER_NAME, "station_id": station_id,
    })
    return {"owner_id": DEMO_OWNER_ID, "station_id": station_id}


def owner_station(client: Neo4jClient, owner_id: str = DEMO_OWNER_ID) -> Optional[Dict[str, Any]]:
    rows = client.read(CYPHER_OWNER_STATION, {"owner_id": owner_id})
    if not rows:
        return None
    row = rows[0]
    row["connectors"] = [c for c in row["connectors"] if c.get("type")]
    return row
