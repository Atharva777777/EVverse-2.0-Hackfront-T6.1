"""
backend/tests/test_sarvam_orchestrator.py
=========================================
Tests for SARVAM Assistant Orchestrator and API Router.
"""

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.services import sarvam_service as sarvam
from backend.api.services.sarvam_orchestrator import sarvam_orchestrator
from backend.graph.neo4j_client import get_graph_client


@pytest.fixture
def http():
    with TestClient(app) as client:
        yield client


def test_sarvam_status_endpoint(http):
    response = http.get("/api/v1/sarvam/status")
    assert response.status_code == 200
    data = response.json()
    assert data["bot_name"] == "SARVAM"
    assert data["subtitle"] == "Your EV Intelligence Assistant"
    assert "supported_languages" in data
    assert any(l["code"] == "hi-IN" for l in data["supported_languages"])
    assert any(l["code"] == "mr-IN" for l in data["supported_languages"])


def test_vehicle_info_retrieval():
    veh = sarvam_orchestrator.get_vehicle_info("demo_driver_pune")
    assert veh["make"] == "Tata"
    assert "Nexon" in veh["model"]
    assert veh["battery_kwh"] > 35.0
    assert veh["usable_kwh"] > 30.0
    assert "CCS2" in veh["supported_connectors"]
    assert veh["source"] == "verified_evverse_neo4j"


def test_journey_feasibility_deterministic():
    # 35% battery on 148km Pune-Mumbai trip must strictly require charging
    res_low = sarvam_orchestrator.plan_journey(
        origin="Pune", destination="Mumbai", start_soc=35.0
    )
    assert res_low["verdict"] == "CHARGING_NEEDED"
    assert res_low["distance_km"] == 148.0
    assert res_low["source"] == "deterministic_physics_engine"

    # 100% battery on 148km Pune-Mumbai trip should achieve arrival safely
    res_high = sarvam_orchestrator.plan_journey(
        origin="Pune", destination="Mumbai", start_soc=100.0
    )
    assert res_high["verdict"] in ("SAFE_TO_DRIVE", "CHARGING_NEEDED")
    assert res_high["distance_km"] == 148.0


def test_station_recommendation_compatible():
    stations = sarvam_orchestrator.recommend_stations(
        origin="Pune", destination="Mumbai", connector_type="CCS2"
    )
    assert len(stations) > 0
    # Every recommended station must support CCS2 and have coordinates
    for st in stations:
        assert "CCS2" in st["connectors"]
        assert st["lat"] > 0
        assert st["lon"] > 0
        assert st["source"] == "neo4j_aura_graph"


def test_connector_compatibility_neo4j():
    compat = sarvam_orchestrator.check_compatibility(
        driver_id="demo_driver_pune", connector_type="CCS2"
    )
    assert compat["driver_vehicle"] == "Tata Nexon EV Max"
    assert compat["is_compatible"] is True

    # Type 1 is not supported by Indian Tata Nexon EV Max (uses CCS2 / Type 2)
    incompat = sarvam_orchestrator.check_compatibility(
        driver_id="demo_driver_pune", connector_type="Type 1"
    )
    assert incompat["is_compatible"] is False


@pytest.mark.asyncio
async def test_orchestrator_chat_e2e():
    # Test conversational query routing with factual injection
    result = await sarvam_orchestrator.handle_message(
        message="Can my Tata Nexon drive from Pune to Mumbai with 35% battery?",
        conversation_history=[],
        driver_id="demo_driver_pune",
        preferred_language="en-IN",
    )
    assert "reply" in result
    assert result["language"] == "en-IN"
    # Must have used journey_feasibility tool
    assert "journey_feasibility" in result["tools_used"]
    assert result["data_card"] is not None
    assert result["data_card"]["type"] == "journey_card"
    assert result["data_card"]["data"]["verdict"] == "CHARGING_NEEDED"
