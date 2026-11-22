"""
backend/graph/schema.py
=======================
Uniqueness constraints and indexes for the Neo4j graph.

Every statement is idempotent (IF NOT EXISTS), so ensure_schema() is safe to
call on every import and on application start.

Models core entities:
  - User
  - Vehicle
  - ChargingStation
  - Connector
  - Journey
  - ChargingSession
  - Location
  - City, Operator, StationOwner, InvestorOpportunity
"""

from __future__ import annotations

import logging
from typing import List

from backend.graph.neo4j_client import Neo4jClient

log = logging.getLogger(__name__)

SCHEMA_STATEMENTS: List[str] = [
    # ── Constraints ───────────────────────────────────────────────────────────
    "CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE",
    "CREATE CONSTRAINT user_email IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE",
    "CREATE CONSTRAINT vehicle_id IF NOT EXISTS FOR (v:Vehicle) REQUIRE v.id IS UNIQUE",
    "CREATE CONSTRAINT charging_station_id IF NOT EXISTS FOR (s:ChargingStation) REQUIRE s.id IS UNIQUE",
    "CREATE CONSTRAINT connector_id IF NOT EXISTS FOR (k:Connector) REQUIRE k.id IS UNIQUE",
    "CREATE CONSTRAINT location_id IF NOT EXISTS FOR (l:Location) REQUIRE l.id IS UNIQUE",
    "CREATE CONSTRAINT journey_id IF NOT EXISTS FOR (j:Journey) REQUIRE j.id IS UNIQUE",
    "CREATE CONSTRAINT charging_session_id IF NOT EXISTS FOR (cs:ChargingSession) REQUIRE cs.id IS UNIQUE",
    "CREATE CONSTRAINT city_name IF NOT EXISTS FOR (c:City) REQUIRE c.name IS UNIQUE",
    "CREATE CONSTRAINT operator_key IF NOT EXISTS FOR (o:Operator) REQUIRE o.key IS UNIQUE",
    "CREATE CONSTRAINT station_owner_id IF NOT EXISTS FOR (o:StationOwner) REQUIRE o.id IS UNIQUE",
    "CREATE CONSTRAINT investor_opportunity_id IF NOT EXISTS FOR (p:InvestorOpportunity) REQUIRE p.id IS UNIQUE",

    # ── Indexes ───────────────────────────────────────────────────────────────
    "CREATE POINT INDEX charging_station_location IF NOT EXISTS FOR (s:ChargingStation) ON (s.location)",
    "CREATE INDEX charging_station_city IF NOT EXISTS FOR (s:ChargingStation) ON (s.city)",
    "CREATE INDEX location_city IF NOT EXISTS FOR (l:Location) ON (l.city)",
    "CREATE INDEX user_type IF NOT EXISTS FOR (u:User) ON (u.user_type)",
    "CREATE INDEX journey_created IF NOT EXISTS FOR (j:Journey) ON (j.created_at)",
]


def ensure_schema(client: Neo4jClient) -> List[str]:
    """Execute all schema constraints and index statements idempotently."""
    executed = []
    for statement in SCHEMA_STATEMENTS:
        try:
            client.run_auto(statement)
            executed.append(statement)
        except Exception as e:
            log.warning("Schema statement notice (%s): %s", statement[:40], e)
    return executed
