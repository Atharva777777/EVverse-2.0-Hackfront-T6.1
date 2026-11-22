"""
backend/tests/test_graph_offline.py
===================================
Tests that run WITHOUT a Neo4j server:
- OSM import transform rules (duplicates, cities, operators, connectors, power)
- Real OSM extract integrity
- Vehicle plug -> connector mapping
- Owner simulation is deterministic and clearly labelled
- Graph API degrades to HTTP 503 when Neo4j is not configured
- Credentials never appear in status output
"""

import pytest
from fastapi.testclient import TestClient

from backend.api.routers import graph as graph_router
from backend.graph import queries
from backend.graph.neo4j_client import GraphUnavailable, Neo4jClient
from backend.graph.osm_import import (
    DEFAULT_OSM_PATH,
    UNASSIGNED_CITY,
    build_import,
    load_payload,
    operator_key,
    parse_count,
    parse_kw,
)
from backend.graph.simulation import DEMO_TARIFF_PER_KWH_INR, simulate_owner_month


def _record(**overrides):
    base = {
        "id": "node/1",
        "latitude": 18.5,
        "longitude": 73.8,
        "name": None,
        "operator": None,
        "brand": None,
        "max_power": None,
        "sockets": None,
        "socket_outputs": None,
        "region_tags": [],
        "is_physical_duplicate": False,
        "osm_url": "https://www.openstreetmap.org/node/1",
        "license": "ODbL-1.0",
        "attribution": "© OpenStreetMap contributors",
    }
    base.update(overrides)
    return base


# ── parsing helpers ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [("15 kW", 15.0), ("60kW", 60.0), ("7.4 kw", 7.4), (None, None), ("fast", None)])
def test_parse_kw(raw, expected):
    assert parse_kw(raw) == expected


def test_parse_count():
    assert parse_count("2") == 2
    assert parse_count("0") is None
    assert parse_count(None) is None
    assert parse_count("many") is None


def test_operator_key_merges_case_and_spacing():
    assert operator_key("Tata Power") == operator_key("Tata power")
    assert operator_key("  Tata   Power ") == operator_key("Tata Power")


# ── import transform rules ───────────────────────────────────────────────────

def test_duplicates_and_missing_coordinates_are_skipped_and_counted():
    payload = {"metadata": {"extraction_timestamp": "2026-11-16T10:55:49Z"}, "stations": [
        _record(id="node/1"),
        _record(id="node/2", is_physical_duplicate=True),
        _record(id="node/3", latitude=None),
    ]}
    built = build_import(payload, imported_at="2026-11-22T00:00:00+00:00")
    assert [s["id"] for s in built["stations"]] == ["osm:node/1"]
    assert built["stats"]["physical_duplicates_skipped"] == 1
    assert built["stats"]["missing_coordinates_skipped"] == 1


def test_city_comes_only_from_region_tags_otherwise_unassigned():
    payload = {"stations": [
        _record(id="node/1", region_tags=["pune_metro"]),
        _record(id="node/2", region_tags=["mumbai_metro"]),
        _record(id="node/3", region_tags=["mumbai_pune_corridor"]),
        _record(id="node/4", region_tags=[]),
    ]}
    cities = {s["id"]: s["city"] for s in build_import(payload, "t")["stations"]}
    assert cities == {
        "osm:node/1": "Pune",
        "osm:node/2": "Mumbai",
        "osm:node/3": UNASSIGNED_CITY,  # corridor is not a city, so it is not guessed
        "osm:node/4": UNASSIGNED_CITY,
    }


def test_operator_falls_back_to_brand_and_missing_stays_missing():
    payload = {"stations": [
        _record(id="node/1", operator="Tata Power", brand="Tata Power"),
        _record(id="node/2", operator=None, brand="Bolt"),
        _record(id="node/3", operator=None, brand=None),
    ]}
    by_id = {s["id"]: s for s in build_import(payload, "t")["stations"]}
    assert by_id["osm:node/1"]["operator_source"] == "operator"
    assert by_id["osm:node/2"]["operator"] == "Bolt" and by_id["osm:node/2"]["operator_source"] == "brand"
    assert by_id["osm:node/3"]["operator"] is None and by_id["osm:node/3"]["operator_key"] is None


def test_connectors_come_only_from_osm_socket_tags_and_map_to_product_names():
    payload = {"stations": [
        _record(id="node/1", sockets={"type2_combo": "2", "chademo": "1"},
                socket_outputs={"type2_combo": "15 kW"}),
        _record(id="node/2", sockets=None, max_power="30 kW"),
    ]}
    built = build_import(payload, "t")
    connectors = {(c["station_id"], c["type"]): c for c in built["connectors"]}
    ccs = connectors[("osm:node/1", "CCS2")]
    assert ccs["points"] == 2 and ccs["power_kw"] == 15.0
    assert connectors[("osm:node/1", "CHAdeMO")]["power_kw"] is None  # not stated, not invented
    assert not any(c["station_id"] == "osm:node/2" for c in built["connectors"])  # no sockets, no connector node
    assert built["stations"][1]["max_power_kw"] == 30.0


def test_every_station_keeps_source_identity_and_licence():
    built = build_import({"stations": [_record(id="node/9", name="Test Hub")]}, "t")
    station = built["stations"][0]
    assert station["source"] == "OpenStreetMap"
    assert station["source_ref"] == "node/9"
    assert station["license"] == "ODbL-1.0"
    assert station["attribution"].startswith("©")
    assert station["verification_status"] == "osm_extract_unverified"


# ── the real extract ─────────────────────────────────────────────────────────

def test_real_osm_extract_builds_97_unique_stations_with_unique_ids():
    built = build_import(load_payload(DEFAULT_OSM_PATH), "t")
    ids = [s["id"] for s in built["stations"]]
    assert DEFAULT_OSM_PATH.exists()
    assert len(ids) == len(set(ids)) == 97
    assert built["stats"]["physical_duplicates_skipped"] == 6
    assert all(s["source_url"] and s["license"] for s in built["stations"])


def test_real_extract_city_counts_match_region_tags():
    built = build_import(load_payload(DEFAULT_OSM_PATH), "t")
    counts = built["stats"]["stations_by_city"]
    # Deduplicated counts. The extractor's summary reports Pune as 42 because it
    # includes one physical duplicate; the graph stores the unique station only.
    assert counts.get("Pune") == 41
    assert counts.get("Mumbai") == 10
    assert counts.get(UNASSIGNED_CITY) == 46
    assert sum(counts.values()) == 97


# ── vehicles ─────────────────────────────────────────────────────────────────

def test_vehicle_rows_map_only_known_plug_types():
    rows = queries.vehicle_rows([
        {"id": "a", "make": "X", "model": "A", "plug_type": "CCS2 Combo", "battery_kwh": 40},
        {"id": "b", "make": "Y", "model": "B", "plug_type": "Mystery Plug", "battery_kwh": 3},
    ])
    by_id = {r["id"]: r for r in rows}
    assert by_id["a"]["connector_types"] == ["CCS2"]
    assert by_id["b"]["connector_types"] == []  # unknown plug creates no SUPPORTS edges


# ── owner simulation ─────────────────────────────────────────────────────────

def test_simulation_is_deterministic_and_labelled():
    a = simulate_owner_month("osm:node/1", 30.0, 2)
    b = simulate_owner_month("osm:node/1", 30.0, 2)
    assert a == b
    assert a["is_simulated"] is True
    assert "Assumed demo tariff" in a["tariff_note"]


def test_simulation_figures_are_internally_consistent():
    sim = simulate_owner_month("osm:node/1", 30.0, 2)
    summary = sim["summary"]
    assert summary["revenue_inr"] == pytest.approx(summary["energy_kwh"] * DEMO_TARIFF_PER_KWH_INR, rel=1e-3)
    assert 0 <= summary["utilisation_pct"] <= 100
    assert 0 <= summary["availability_pct"] <= 100
    assert summary["sessions"] == sum(d["sessions"] for d in sim["daily"])
    assert len(sim["daily"]) == sim["days"] == 30


# ── graph API without Neo4j ──────────────────────────────────────────────────

@pytest.fixture
def unconfigured_client(monkeypatch):
    client = Neo4jClient(uri="", username="", password="")
    monkeypatch.setattr(graph_router, "get_graph_client", lambda: client)
    return client


def test_unconfigured_client_reports_missing_settings_and_never_connects():
    client = Neo4jClient(uri="", username="", password="")
    assert not client.configured
    assert "NEO4J_URI" in client.missing_settings()
    status = client.status()
    assert status["connected"] is False and status["error"]
    with pytest.raises(GraphUnavailable):
        client.read("RETURN 1")


def test_status_never_contains_the_password():
    client = Neo4jClient(uri="bolt://127.0.0.1:1", username="neo4j", password="s3cret-test-pw")
    status = client.status()
    assert "s3cret-test-pw" not in str(status)


def test_graph_endpoints_return_503_when_not_configured(unconfigured_client):
    from backend.api.main import app
    with TestClient(app) as http:
        response = http.get("/api/v1/graph/analytics/distribution")
        assert response.status_code == 503
        assert response.json()["detail"]["error"] == "graph_unavailable"

        bbox = http.get("/api/v1/graph/stations", params={
            "min_lat": 18, "min_lng": 73, "max_lat": 19, "max_lng": 74})
        assert bbox.status_code == 503


def test_graph_status_endpoint_reports_not_configured(unconfigured_client):
    from backend.api.main import app
    with TestClient(app) as http:
        body = http.get("/api/v1/graph/status").json()
        assert body["configured"] is False
        assert body["connected"] is False


def test_bbox_validation_rejects_inverted_bounds(unconfigured_client):
    from backend.api.main import app
    with TestClient(app) as http:
        response = http.get("/api/v1/graph/stations", params={
            "min_lat": 19, "min_lng": 73, "max_lat": 18, "max_lng": 74})
        assert response.status_code == 422
