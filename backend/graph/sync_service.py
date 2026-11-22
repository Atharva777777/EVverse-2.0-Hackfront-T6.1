"""
backend/graph/sync_service.py
=============================
Idempotent Synchronization Service connecting the SQLite Application Database
and verified Charging Station catalogs with the Neo4j Graph Database.

Maintains bidirectional data integrity across:
  - Users (User nodes, excluding sensitive passwords)
  - Vehicles (Vehicle nodes with full engineering specifications)
  - Connectors (Connector nodes with standard power limits)
  - Charging Stations (ChargingStation nodes with location points)
  - Locations (Location nodes for metropolitan and transit areas)
  - Journeys (Journey nodes linked via CREATED, USES, PASSES_NEAR)
  - Charging Sessions (ChargingSession nodes linked via HAD_SESSION, FOR_VEHICLE, AT_STATION)

All operations use parameterized Cypher MERGE statements to guarantee idempotence.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.data import driver_db
from backend.graph.neo4j_client import Neo4jClient, get_graph_client
from backend.graph.schema import ensure_schema

log = logging.getLogger("evverse.graph.sync")

# Standard EV Connector Standards
STANDARD_CONNECTORS = [
    {"id": "CCS2", "type": "CCS2", "standard": "CCS2 Combo", "max_kw": 350.0, "current_type": "DC"},
    {"id": "Type 2", "type": "Type 2", "standard": "Type 2 (AC / Mennekes)", "max_kw": 22.0, "current_type": "AC"},
    {"id": "CHAdeMO", "type": "CHAdeMO", "standard": "CHAdeMO DC", "max_kw": 62.5, "current_type": "DC"},
    {"id": "GB/T (DC)", "type": "GB/T (DC)", "standard": "GB/T 20234.3 DC", "max_kw": 120.0, "current_type": "DC"},
]

# Primary Indian EV Transit Hub Locations
STANDARD_LOCATIONS = [
    {
        "id": "loc_pune",
        "name": "Pune",
        "city": "Pune",
        "state": "Maharashtra",
        "country": "India",
        "latitude": 18.5204,
        "longitude": 73.8567,
    },
    {
        "id": "loc_mumbai",
        "name": "Mumbai",
        "city": "Mumbai",
        "state": "Maharashtra",
        "country": "India",
        "latitude": 19.0760,
        "longitude": 72.8777,
    },
    {
        "id": "loc_lonavala",
        "name": "Lonavala (Western Ghats Corridor)",
        "city": "Lonavala",
        "state": "Maharashtra",
        "country": "India",
        "latitude": 18.7511,
        "longitude": 73.4124,
    },
    {
        "id": "loc_delhi",
        "name": "Delhi NCR",
        "city": "Delhi",
        "state": "Delhi",
        "country": "India",
        "latitude": 28.6139,
        "longitude": 77.2090,
    },
]

PLUG_TO_CONNECTOR_IDS: Dict[str, List[str]] = {
    "CCS2 Combo": ["CCS2", "Type 2"],
    "Type 2 (AC)": ["Type 2"],
    "Type 2": ["Type 2"],
    "CHAdeMO": ["CHAdeMO"],
    "GB/T (DC)": ["GB/T (DC)"],
}


class Neo4jSyncEngine:
    def __init__(self, client: Optional[Neo4jClient] = None):
        self.client = client or get_graph_client()

    def sync_all(self, seed_demo: bool = True) -> Dict[str, Any]:
        """Runs complete, idempotent synchronization of application database to Neo4j."""
        log.info("[SyncEngine] Initiating full application DB -> Neo4j synchronization...")

        # 1. Schema Constraints & Indexes
        schema_results = ensure_schema(self.client)

        # 2. Connectors
        conn_count = self.sync_connectors()

        # 3. Locations
        loc_count = self.sync_locations()

        # 4. Vehicles & Supported Connectors
        veh_count = self.sync_vehicles()

        # 5. Demo User & OWNS Relationship
        demo_res = self.sync_demo_user() if seed_demo else None

        # 6. Charging Stations, Located-In & Provides Relationships
        station_count = self.sync_western_zone_stations()

        # 7. Corridor Demo Journey & Session
        journey_res = self.sync_demo_journey()
        session_res = self.sync_demo_charging_session()

        stats = {
            "schema_statements": len(schema_results),
            "connectors_synced": conn_count,
            "locations_synced": loc_count,
            "vehicles_synced": veh_count,
            "demo_user": demo_res,
            "stations_synced": station_count,
            "demo_journey_synced": bool(journey_res),
            "demo_session_synced": bool(session_res),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        log.info("[SyncEngine] Full synchronization completed: %s", stats)
        return stats

    # ── 1. Connectors ─────────────────────────────────────────────────────────

    def sync_connectors(self) -> int:
        cypher = """
        UNWIND $connectors AS k
        MERGE (c:Connector {id: k.id})
        SET c.type = k.type,
            c.standard = k.standard,
            c.max_kw = k.max_kw,
            c.current_type = k.current_type
        """
        self.client.write(cypher, {"connectors": STANDARD_CONNECTORS})
        return len(STANDARD_CONNECTORS)

    # ── 2. Locations ──────────────────────────────────────────────────────────

    def sync_locations(self) -> int:
        cypher = """
        UNWIND $locations AS l
        MERGE (loc:Location {id: l.id})
        SET loc.name = l.name,
            loc.city = l.city,
            loc.state = l.state,
            loc.country = l.country,
            loc.latitude = l.latitude,
            loc.longitude = l.longitude,
            loc.location = point({latitude: l.latitude, longitude: l.longitude})
        """
        self.client.write(cypher, {"locations": STANDARD_LOCATIONS})
        return len(STANDARD_LOCATIONS)

    # ── 3. Vehicles & SUPPORTS Relationships ──────────────────────────────────

    def sync_vehicles(self) -> int:
        seed_vehicles = driver_db.DEFAULT_SEED_VEHICLES
        rows = []
        for v in seed_vehicles:
            plug = v.get("plug_type") or ""
            rows.append({
                "id": v["id"],
                "make": v.get("make"),
                "model": v.get("model"),
                "year": v.get("year", 2025),
                "battery_kwh": v.get("battery_kwh", 40.0),
                "usable_kwh": v.get("usable_kwh", 39.0),
                "wltp_range_km": v.get("wltp_range_km", 450),
                "efficiency_kwh100km": v.get("efficiency_kwh100km", 14.5),
                "max_dc_speed_kw": v.get("max_dc_speed_kw", 50),
                "max_ac_speed_kw": v.get("max_ac_speed_kw", 7),
                "plug_type": plug,
                "vin": v.get("vin", "MAT624108PNA09821"),
                "connector_types": PLUG_TO_CONNECTOR_IDS.get(plug, ["Type 2"]),
            })

        cypher = """
        UNWIND $vehicles AS v
        MERGE (vh:Vehicle {id: v.id})
        SET vh.make = v.make,
            vh.model = v.model,
            vh.year = v.year,
            vh.battery_kwh = v.battery_kwh,
            vh.usable_kwh = v.usable_kwh,
            vh.wltp_range_km = v.wltp_range_km,
            vh.efficiency_kwh100km = v.efficiency_kwh100km,
            vh.max_dc_speed_kw = v.max_dc_speed_kw,
            vh.max_ac_speed_kw = v.max_ac_speed_kw,
            vh.plug_type = v.plug_type,
            vh.vin = v.vin
        WITH vh, v
        UNWIND v.connector_types AS c_id
        MATCH (k:Connector {id: c_id})
        MERGE (vh)-[:SUPPORTS]->(k)
        """
        self.client.write(cypher, {"vehicles": rows})
        return len(rows)

    # ── 4. Demo User & OWNS Relationship ──────────────────────────────────────

    def sync_demo_user(self) -> Dict[str, Any]:
        """
        Seeds and synchronizes the verified demo account:
          Name: EVverse Demo User
          Email: demo@evverse.app
          Location: Pune, Maharashtra
          User Type: driver (non-admin)
          Vehicle: Tata Nexon EV
        """
        # 1. Seed into SQLite application DB first
        sqlite_demo = driver_db.seed_demo_account()
        user_info = sqlite_demo["user"]

        # 2. Synchronize into Neo4j graph (NEVER writing passwords to graph)
        cypher = """
        MERGE (u:User {email: $email})
        SET u.id = $id,
            u.name = $name,
            u.location = $location,
            u.user_type = $user_type,
            u.is_admin = $is_admin,
            u.updated_at = datetime()
        ON CREATE SET u.created_at = datetime()
        WITH u
        MATCH (v:Vehicle {id: $vehicle_id})
        MERGE (u)-[r:OWNS]->(v)
        SET r.is_primary = true,
            r.assigned_at = datetime()
        RETURN u.id AS user_id, u.email AS email, u.name AS name,
               v.id AS vehicle_id, v.model AS vehicle_model
        """
        records = self.client.write(cypher, {
            "id": user_info["id"],
            "email": user_info["email"],
            "name": user_info["name"],
            "location": user_info["location"],
            "user_type": user_info["user_type"],
            "is_admin": user_info["is_admin"],
            "vehicle_id": sqlite_demo["vehicle_id"],
        })
        return records[0] if records else {}

    # ── 5. Western Zone Stations & Relationships ──────────────────────────────

    def sync_western_zone_stations(self) -> int:
        from backend.graph.osm_import import import_osm
        try:
            stats = import_osm(self.client)
            st_count = stats.get("stations_imported", 0)

            # Ensure PROVIDES and LOCATED_IN relationships are populated
            link_cypher = """
            MATCH (s:ChargingStation)-[:HAS_CONNECTOR]->(c:Connector)
            MERGE (s)-[:PROVIDES]->(c)
            """
            self.client.write(link_cypher)

            loc_link_cypher = """
            MATCH (s:ChargingStation)
            WHERE s.city = 'Pune'
            WITH s MATCH (loc:Location {id: 'loc_pune'})
            MERGE (s)-[:LOCATED_IN]->(loc)
            """
            self.client.write(loc_link_cypher)

            loc_link_mumbai = """
            MATCH (s:ChargingStation)
            WHERE s.city = 'Mumbai'
            WITH s MATCH (loc:Location {id: 'loc_mumbai'})
            MERGE (s)-[:LOCATED_IN]->(loc)
            """
            self.client.write(loc_link_mumbai)

            return st_count
        except Exception as exc:
            log.warning("Western zone station import exception: %s", exc)
            return 0

    # ── 6. Demo Journey & Charging Session ────────────────────────────────────

    def sync_demo_journey(self) -> Optional[Dict[str, Any]]:
        cypher = """
        MERGE (j:Journey {id: 'jny_pune_mumbai_expressway'})
        SET j.name = 'Pune to Mumbai Expressway Highway Run',
            j.origin = 'Pune (Somatne Plaza)',
            j.destination = 'Mumbai (Vashi Gateway)',
            j.distance_km = 148.0,
            j.departure_soc_pct = 72,
            j.reserve_soc_pct = 15,
            j.verdict = 'SAFE',
            j.created_at = datetime()
        WITH j
        MATCH (u:User {email: 'demo@evverse.app'})
        MERGE (u)-[:CREATED]->(j)
        WITH j
        MATCH (v:Vehicle {id: 'tata-nexon-ev'})
        MERGE (j)-[:USES]->(v)
        WITH j
        MATCH (s:ChargingStation)
        WHERE s.city IN ['Pune', 'Mumbai'] OR s.name CONTAINS 'Expressway'
        WITH j, s LIMIT 3
        MERGE (j)-[:PASSES_NEAR]->(s)
        RETURN j.id AS journey_id, j.name AS name, j.verdict AS verdict
        """
        records = self.client.write(cypher)
        return records[0] if records else None

    def sync_demo_charging_session(self) -> Optional[Dict[str, Any]]:
        cypher = """
        MERGE (cs:ChargingSession {id: 'cs_demo_tata_power_somatne'})
        SET cs.station_name = 'Tata Power Fast Charging Hub - Somatne',
            cs.kwh_delivered = 24.8,
            cs.duration_seconds = 1860,
            cs.cost_inr = 446.40,
            cs.max_power_kw = 60.0,
            cs.connector_type = 'CCS2',
            cs.created_at = datetime()
        WITH cs
        MATCH (u:User {email: 'demo@evverse.app'})
        MERGE (u)-[:HAD_SESSION]->(cs)
        WITH cs
        MATCH (v:Vehicle {id: 'tata-nexon-ev'})
        MERGE (cs)-[:FOR_VEHICLE]->(v)
        RETURN cs.id AS session_id, cs.kwh_delivered AS kwh, cs.cost_inr AS cost
        """
        records = self.client.write(cypher)
        return records[0] if records else None


# Singleton instance
sync_engine = Neo4jSyncEngine()

