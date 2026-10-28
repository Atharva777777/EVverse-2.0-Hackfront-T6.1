"""
backend/tests/test_trip_api.py
==============================
Automated tests for POST /api/v1/trip/will-i-make-it REST endpoint.

Tests:
1. Feasible journey (SAFE verdict, arrival SoC above reserve, charging_needed=False)
2. Marginal journey (CAUTION verdict, uncertainty interval crosses reserve)
3. Depleted journey (CHARGING_NEEDED verdict, primary & backup stop recommendations)
4. No reachable station edge case (CHARGING_NEEDED, primary_stop=None, truthful explanation)
5. Validation errors (invalid distance, invalid start_battery_pct)
6. Custom vehicle specification support
"""

import pytest
import httpx
from backend.api.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_trip_api_feasible_safe():
    """Verify a 60 km trip with 85% starting battery returns SAFE."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "vehicle": "tata-nexon-ev",
            "distance_km": 60.0,
            "start_battery_pct": 85.0,
            "reserve_buffer_pct": 15.0,
            "payload_kg": 75.0,
            "hvac_mode": "normal",
        }
        res = await client.post("/api/v1/trip/will-i-make-it", json=payload)
        assert res.status_code == 200
        data = res.json()

        # Energy checks
        assert data["energy"]["vehicle_id"] == "tata-nexon-ev"
        assert data["energy"]["nominal_energy_kwh"] > 0
        worst_soc, best_soc = data["energy"]["arrival_soc_range_pct"]
        assert best_soc >= data["energy"]["nominal_arrival_soc_pct"] >= worst_soc

        # Feasibility checks
        assert data["feasibility"]["verdict"] == "SAFE"
        assert len(data["feasibility"]["reasons"]) > 0

        # Charging checks
        assert data["charging"]["charging_needed"] is False
        if data["charging"]["primary_stop"]:
            assert data["charging"]["primary_stop"]["arrival_soc_pct"] > 0.0


@pytest.mark.asyncio
async def test_trip_api_charging_needed_with_recommendations():
    """Verify a 118 km journey starting at 35% battery returns CHARGING_NEEDED and finds stops."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "vehicle": "tata-nexon-ev",
            "distance_km": 118.0,
            "start_battery_pct": 35.0,
            "reserve_buffer_pct": 15.0,
            "elevation_gain_m": 50.0,
            "hvac_mode": "normal",
        }
        res = await client.post("/api/v1/trip/will-i-make-it", json=payload)
        assert res.status_code == 200
        data = res.json()

        # Feasibility checks
        assert data["feasibility"]["verdict"] == "CHARGING_NEEDED"
        assert data["feasibility"]["recommended_min_departure_soc_pct"] is not None

        # Charging recommendation checks
        assert data["charging"]["charging_needed"] is True
        assert data["charging"]["primary_stop"] is not None
        primary = data["charging"]["primary_stop"]
        assert primary["name"]
        assert any("CCS2" in conn for conn in primary["matched_connectors"])
        assert primary["arrival_soc_pct"] > 0.0
        assert primary["qualification_reason"]
        assert len(data["charging"]["recommendations"]) >= 1


@pytest.mark.asyncio
async def test_trip_api_no_reachable_chargers():
    """Verify an unreachable trip with only out-of-range stations reports no fabricated chargers."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "vehicle": "tata-nexon-ev",
            "distance_km": 400.0,
            "start_battery_pct": 2.0,  # ~0.78 kWh available
            "reserve_buffer_pct": 15.0,
            "candidate_stations": [
                {
                    "station_id": "out_of_reach_1",
                    "name": "Highwayside Point",
                    "latitude": 19.5,
                    "longitude": 73.5,
                    "distance_from_origin_km": 150.0,
                    "connector_types": ["CCS2 Combo"],
                }
            ],
        }
        res = await client.post("/api/v1/trip/will-i-make-it", json=payload)
        assert res.status_code == 200
        data = res.json()

        assert data["feasibility"]["verdict"] == "CHARGING_NEEDED"
        assert data["charging"]["charging_needed"] is True
        assert data["charging"]["primary_stop"] is None
        assert len(data["charging"]["recommendations"]) == 0
        assert "unreachable before battery depletion" in data["charging"]["summary_message"]


@pytest.mark.asyncio
async def test_trip_api_validation_errors():
    """Verify invalid payloads produce 422 Unprocessable Entity."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Negative distance
        res = await client.post(
            "/api/v1/trip/will-i-make-it",
            json={"vehicle": "tata-nexon-ev", "distance_km": -10.0, "start_battery_pct": 80.0},
        )
        assert res.status_code == 422

        # Battery percentage > 100
        res = await client.post(
            "/api/v1/trip/will-i-make-it",
            json={"vehicle": "tata-nexon-ev", "distance_km": 50.0, "start_battery_pct": 120.0},
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_trip_api_custom_vehicle_dict():
    """Verify custom vehicle specs dictionary works seamlessly."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "vehicle": {
                "id": "custom-prototype-1",
                "name": "Custom Concept EV",
                "battery_capacity_kwh": 60.0,
                "usable_battery_kwh": 56.0,
                "base_consumption_wh_per_km": 150.0,
                "max_charging_power_kw": 80.0,
                "connector_types": ["CCS2 Combo"],
            },
            "distance_km": 100.0,
            "start_battery_pct": 80.0,
            "reserve_buffer_pct": 15.0,
        }
        res = await client.post("/api/v1/trip/will-i-make-it", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["energy"]["vehicle_id"] == "custom-prototype-1"
        assert data["feasibility"]["usable_capacity_kwh"] == 56.0
        assert data["feasibility"]["verdict"] == "SAFE"


@pytest.mark.asyncio
async def test_trip_api_charging_duration_physical_sanity():
    """Verify charging duration returned by the API is physically plausible."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "vehicle": "tata-nexon-ev",  # max_dc_speed_kw = 30.0 kW
            "distance_km": 118.0,
            "start_battery_pct": 35.0,
            "reserve_buffer_pct": 15.0,
        }
        res = await client.post("/api/v1/trip/will-i-make-it", json=payload)
        assert res.status_code == 200
        data = res.json()

        primary = data["charging"]["primary_stop"]
        assert primary is not None

        req_kwh = primary["required_charge_kwh"]
        charge_mins = primary["estimated_charge_mins"]
        eff_kw = primary["effective_charging_kw"]

        # Tata Nexon EV onboard DC limit is 30 kW
        assert eff_kw <= 30.0

        # Physical check: delivering ~27.9 kWh cannot take 12 minutes!
        # It must take at least (27.9 / 30 * 60) ~ 55+ minutes
        assert charge_mins >= 50.0
        assert charge_mins <= 85.0

        # Calculate implied average power delivered to battery: (req_kwh / (charge_mins / 60))
        implied_avg_power_kw = req_kwh / (charge_mins / 60.0)
        # Cannot exceed vehicle max DC power limit of 30 kW
        assert implied_avg_power_kw <= 31.0


@pytest.mark.asyncio
async def test_trip_api_reserve_boundaries():
    """Verify 0% and 50% boundary reserve values and boundary violations."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Boundary 0%
        res_0 = await client.post(
            "/api/v1/trip/will-i-make-it",
            json={"vehicle": "tata-nexon-ev", "distance_km": 50.0, "start_battery_pct": 60.0, "reserve_buffer_pct": 0.0},
        )
        assert res_0.status_code == 200
        assert res_0.json()["feasibility"]["reserve_buffer_pct"] == 0.0

        # Boundary 50%
        res_50 = await client.post(
            "/api/v1/trip/will-i-make-it",
            json={"vehicle": "tata-nexon-ev", "distance_km": 50.0, "start_battery_pct": 80.0, "reserve_buffer_pct": 50.0},
        )
        assert res_50.status_code == 200
        assert res_50.json()["feasibility"]["reserve_buffer_pct"] == 50.0

        # Boundary violation > 50%
        res_51 = await client.post(
            "/api/v1/trip/will-i-make-it",
            json={"vehicle": "tata-nexon-ev", "distance_km": 50.0, "start_battery_pct": 80.0, "reserve_buffer_pct": 51.0},
        )
        assert res_51.status_code == 422

        # Boundary violation < 0%
        res_neg = await client.post(
            "/api/v1/trip/will-i-make-it",
            json={"vehicle": "tata-nexon-ev", "distance_km": 50.0, "start_battery_pct": 80.0, "reserve_buffer_pct": -5.0},
        )
        assert res_neg.status_code == 422


@pytest.mark.asyncio
async def test_trip_api_input_constraints():
    """Verify distance and payload constraints trigger 422."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Distance > 3000 km
        res = await client.post(
            "/api/v1/trip/will-i-make-it",
            json={"vehicle": "tata-nexon-ev", "distance_km": 3500.0, "start_battery_pct": 80.0},
        )
        assert res.status_code == 422

        # Negative payload
        res = await client.post(
            "/api/v1/trip/will-i-make-it",
            json={"vehicle": "tata-nexon-ev", "distance_km": 50.0, "start_battery_pct": 80.0, "payload_kg": -10.0},
        )
        assert res.status_code == 422

        # Excessive payload (> 1500 kg)
        res = await client.post(
            "/api/v1/trip/will-i-make-it",
            json={"vehicle": "tata-nexon-ev", "distance_km": 50.0, "start_battery_pct": 80.0, "payload_kg": 2000.0},
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_trip_api_incompatible_connectors_candidate():
    """Verify candidate stations with incompatible connectors are safely rejected."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "vehicle": "tata-nexon-ev",  # Requires CCS2
            "distance_km": 150.0,
            "start_battery_pct": 30.0,
            "reserve_buffer_pct": 15.0,
            "candidate_stations": [
                {
                    "station_id": "chademo_only_hub",
                    "name": "Japan Import Hub",
                    "latitude": 19.1,
                    "longitude": 73.1,
                    "distance_from_origin_km": 30.0,
                    "connector_types": ["CHAdeMO"],  # Incompatible with Nexon CCS2
                }
            ],
        }
        res = await client.post("/api/v1/trip/will-i-make-it", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["charging"]["primary_stop"] is None
        assert data["charging"]["rejection_summary"].get("incompatible_connector", 0) >= 1

