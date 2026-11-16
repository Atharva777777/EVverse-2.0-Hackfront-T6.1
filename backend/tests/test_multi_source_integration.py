"""
backend/tests/test_multi_source_integration.py
==============================================
Targeted automated tests for multi-source charging station integration:
- Open Charge Map (OCM)
- Bureau of Energy Efficiency (BEE) National Registry
- Local OpenStreetMap (OSM) Western Zone extract
- Cross-source spatial deduplication
- Attribution and source ID preservation
- Non-fabrication of unknown power/connector attributes
- REST API endpoints: GET /api/v1/live-stations, GET /api/v1/live-sources
"""

import pytest
import httpx
from backend.api.main import app
from backend.data.multi_source_service import (
    MultiSourceStationService,
    get_multi_source_service,
)
from backend.data.open_charge_map import NormalizedStation
from backend.data.osm_service import get_osm_service


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_osm_service_loading_and_non_fabrication():
    """Verify local OSM dataset loads correctly and unknown attributes are not fabricated."""
    osm = get_osm_service()
    assert osm.is_loaded
    assert osm.total_count >= 83

    # Query Pune metro
    stations, meta = osm.fetch_raw_stations(
        lat=18.5204,
        lng=73.8567,
        city_name="Pune",
        radius_km=25.0,
    )
    assert meta.is_available is True
    assert meta.status == "loaded"
    assert len(stations) >= 40
    assert "ODbL" in meta.attribution

    # Verify no fabricated power or connector values
    for st in stations:
        raw_tags = st.get("raw_tags") or {}
        # If OSM tag lacks max_power, power should be None
        if "max_power" not in raw_tags and "socket_outputs" not in raw_tags:
            assert st.get("max_power") is None


def test_bee_normalization_and_attribution():
    """Verify BEE raw records normalize properly into NormalizedStation without fabricating data."""
    service = get_multi_source_service()
    raw_bee_sample = {
        "id": "evs_test_123",
        "operator": "Tata Power EZ Charge",
        "ownership": "public",
        "state": "Maharashtra",
        "city": "Pune",
        "address": "Koregaon Park, Pune",
        "latitude": 18.5362,
        "longitude": 73.8941,
        "total_chargers": 2,
        "total_connectors": 4,
        "max_power_kw": 60.0,
        "standards": ["CCS_2", "Type-2"],
    }
    norm = service._normalize_bee_station(raw_bee_sample, "Pune")
    assert norm is not None
    assert norm.station_id == "BEE-evs_test_123"
    assert norm.operator == "Tata Power EZ Charge"
    assert norm.power_kw == 60.0
    assert "CCS2" in norm.connector_types
    assert "Type 2" in norm.connector_types
    assert norm.source == "bee"
    assert norm.sources == ["bee"]
    assert norm.source_ids["bee"] == "evs_test_123"
    assert "Bureau of Energy Efficiency" in norm.attribution

    # Test BEE with zero or missing max power (should not fabricate)
    raw_bee_zero_power = dict(raw_bee_sample)
    raw_bee_zero_power["max_power_kw"] = 0.0
    norm_zero = service._normalize_bee_station(raw_bee_zero_power, "Pune")
    assert norm_zero is not None
    assert norm_zero.power_kw is None  # Preserved as None, not invented


def test_spatial_deduplication_and_provenance_preservation():
    """Verify co-located stations within 75m merge while preserving all IDs and attributions."""
    service = get_multi_source_service()

    # Station 1: OCM record
    st1 = NormalizedStation(
        station_id="OCM-101",
        name="MG Motor Charging Station",
        latitude=18.52040,
        longitude=73.85670,
        address="FC Road, Pune",
        operator="MG Motor",
        status="Operational",
        is_operational=True,
        power_kw=50.0,
        bays=2,
        connector_types=["CCS2"],
        source="open_charge_map",
        sources=["open_charge_map"],
        source_ids={"open_charge_map": "OCM-101"},
        attribution="Open Charge Map (CC-BY 4.0)",
    )

    # Station 2: OSM record located 15 meters away
    st2 = NormalizedStation(
        station_id="OSM-N9999",
        name="EV Charging Point (9999)",
        latitude=18.52050,  # ~12 meters away
        longitude=73.85675,
        address="FC Road",
        operator="MG Motor",
        status="Mapped (Community Verified)",
        is_operational=True,
        power_kw=None,  # Unknown in OSM
        bays=1,
        connector_types=["Type 2"],
        source="osm",
        sources=["osm"],
        source_ids={"osm": "node/9999"},
        attribution="© OpenStreetMap contributors (ODbL 1.0)",
    )

    # Station 3: Completely distinct station 5 km away
    st3 = NormalizedStation(
        station_id="BEE-202",
        name="Kothrud Fast Hub",
        latitude=18.5074,
        longitude=73.8077,
        address="Kothrud, Pune",
        operator="Tata Power",
        status="Registered (BEE Registry)",
        is_operational=True,
        power_kw=30.0,
        bays=1,
        connector_types=["CCS2"],
        source="bee",
        sources=["bee"],
        source_ids={"bee": "202"},
        attribution="Bureau of Energy Efficiency (BEE)",
    )

    deduped, dupes_count = service._deduplicate_stations([st1, st2, st3], threshold_km=0.075)

    assert dupes_count == 1
    assert len(deduped) == 2

    # Verify merged station has both sources and preserved IDs
    merged = next(s for s in deduped if "open_charge_map" in s.sources)
    assert "osm" in merged.sources
    assert merged.source == "merged"
    assert merged.source_ids["open_charge_map"] == "OCM-101"
    assert merged.source_ids["osm"] == "node/9999"
    # Connectors should be merged
    assert "CCS2" in merged.connector_types
    assert "Type 2" in merged.connector_types
    # Verified power from OCM is kept
    assert merged.power_kw == 50.0
    # Descriptive name is kept
    assert merged.name == "MG Motor Charging Station"
    # Combined attribution
    assert "Open Charge Map" in merged.attribution
    assert "OpenStreetMap" in merged.attribution


@pytest.mark.asyncio
async def test_live_stations_api_endpoint():
    """Verify GET /api/v1/live-stations returns valid multi-source response."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/live-stations?city=Pune&max_results=20")
        assert res.status_code == 200
        data = res.json()

        assert data["city"] == "Pune"
        assert "is_live" in data
        assert "live_station_count" in data
        assert "sources" in data
        assert len(data["stations"]) > 0

        # Check sources structure
        sources = data["sources"]
        assert "open_charge_map" in sources
        assert "bee" in sources
        assert "osm" in sources
        assert "kaggle_baseline" in sources

        # Validate station fields
        first_st = data["stations"][0]
        assert "station_id" in first_st
        assert "name" in first_st
        assert "latitude" in first_st
        assert "longitude" in first_st
        assert "sources" in first_st
        assert "source_ids" in first_st


@pytest.mark.asyncio
async def test_live_sources_api_endpoint():
    """Verify GET /api/v1/live-sources returns clean operational status breakdown."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/live-sources?city=Pune")
        assert res.status_code == 200
        data = res.json()

        assert data["city"] == "Pune"
        assert "is_live" in data
        assert "live_station_count" in data
        assert "sources" in data

        osm_source = data["sources"]["osm"]
        assert osm_source["name"] == "OpenStreetMap"
        assert osm_source["is_available"] is True
        assert osm_source["status"] == "loaded"
        assert osm_source["station_count"] >= 40
        assert "ODbL" in osm_source["attribution"]
