"""
backend/tests/test_graph_live.py
================================
Tests against a REAL Neo4j instance. They are skipped unless NEO4J_URI is set,
so the normal test run never needs a database.

Run with Neo4j configured in backend/.env:
    python -m pytest backend/tests/test_graph_live.py -v
"""

import os

import pytest
from fastapi.testclient import TestClient

from backend.graph import queries
from backend.graph.import_cli import main as import_main
from backend.graph.neo4j_client import get_graph_client
from backend.graph.osm_import import import_osm
from backend.graph.schema import ensure_schema

pytestmark = pytest.mark.skipif(
    not os.environ.get("NEO4J_URI"),
    reason="Neo4j not configured (set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD)",
)


@pytest.fixture(scope="module")
def client():
    neo = get_graph_client()
    status = neo.status()
    if not status["connected"]:
        pytest.fail(f"Neo4j is configured but not reachable: {status['error']}")
    ensure_schema(neo)
    return neo


@pytest.fixture(scope="module")
def imported(client):
    stats = import_osm(client)
    queries.sync_vehicles(client, _seed_vehicles())
    queries.ensure_demo_owner(client)
    return stats


def _seed_vehicles():
    from backend.data.driver_db import DEFAULT_SEED_VEHICLES
    return DEFAULT_SEED_VEHICLES


def test_import_creates_97_unique_stations(client, imported):
    assert imported["stations_imported"] == 97
    rows = client.read("MATCH (s:ChargingStation) RETURN count(s) AS n, count(DISTINCT s.id) AS unique_ids")[0]
    assert rows["n"] == rows["unique_ids"] == 97


def test_import_is_idempotent_on_repeat(client, imported):
    before = client.read("MATCH (s:ChargingStation) RETURN count(s) AS n")[0]["n"]
    import_osm(client)
    after = client.read("MATCH (s:ChargingStation) RETURN count(s) AS n")[0]["n"]
    assert before == after == 97


def test_every_station_has_provenance(client, imported):
    rows = client.read("""
        MATCH (s:ChargingStation)
        WHERE s.source_url IS NULL OR s.license IS NULL OR s.attribution IS NULL OR s.source_ref IS NULL
        RETURN count(s) AS missing
    """)
    assert rows[0]["missing"] == 0


def test_every_station_belongs_to_exactly_one_city(client, imported):
    rows = client.read("""
        MATCH (s:ChargingStation)
        OPTIONAL MATCH (c:City)-[:CONTAINS]->(s)
        WITH s, count(c) AS cities
        RETURN count(s) AS stations, sum(CASE WHEN cities = 1 THEN 1 ELSE 0 END) AS single_city
    """)[0]
    assert rows["stations"] == rows["single_city"] == 97


def test_bbox_query_returns_pune_stations(client, imported):
    rows = queries.stations_in_bbox(client, 18.3, 73.6, 18.8, 74.1, limit=500)
    assert len(rows) > 0
    assert all(18.3 <= r["latitude"] <= 18.8 and 73.6 <= r["longitude"] <= 74.1 for r in rows)


def test_compatible_stations_for_a_seeded_vehicle(client, imported):
    result = queries.compatible_stations(client, "tata-nexon-ev")
    assert result["vehicle_found"] is True
    for station in result["stations"]:
        assert "CCS2" in station["matching_connector_types"]


def test_unknown_vehicle_is_reported_not_found(client, imported):
    assert queries.compatible_stations(client, "no-such-vehicle")["vehicle_found"] is False


def test_distribution_totals_match_import(client, imported):
    dist = queries.distribution(client)
    assert dist["total_stations"] == 97
    assert sum(r["stations"] for r in dist["by_city"]) == 97


def test_gap_and_opportunity_pipeline(client, imported):
    gaps = queries.coverage_gaps(client)
    assert gaps["median_station_count_named_cities"] is not None
    created = queries.generate_opportunities(client)
    listed = queries.list_opportunities(client)
    assert len(listed) >= len(created)
    for opp in listed:
        assert opp["method"] and opp["generated_at"]


def test_owner_demo_is_simulated_and_linked_to_real_station(client, imported):
    station = queries.owner_station(client)
    assert station is not None
    assert station["is_simulated"] is True
    assert station["station_id"].startswith("osm:")


def test_api_endpoints_serve_graph_data(client, imported):
    from backend.api.main import app
    with TestClient(app) as http:
        assert http.get("/api/v1/graph/status").json()["connected"] is True
        dist = http.get("/api/v1/graph/analytics/distribution").json()
        assert dist["total_stations"] == 97 and dist["source"] == "neo4j"
        owner = http.get("/api/v1/graph/owner/demo").json()
        assert owner["operations"]["is_simulated"] is True


def test_cli_runs_end_to_end(client):
    assert import_main([]) == 0
