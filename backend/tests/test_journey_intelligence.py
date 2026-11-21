"""
backend/tests/test_journey_intelligence.py
==========================================
Journey Intelligence: orchestration over the existing deterministic engines,
station provenance, preferences, recovery, personalization store and REST API.
"""

from datetime import datetime, timedelta, timezone

import httpx
import pytest

from backend.api.main import app
from backend.api.services.journey_intelligence import (
    JourneyInput,
    Preferences,
    VehicleDataMissing,
    analyze_journey,
    parse_journey_text,
    resolve_vehicle,
)
from backend.api.services.range_physics import TripInput, estimate_trip_energy
from backend.data import driver_db, journey_store

NOW = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)
ORIGIN = (19.0760, 72.8777)
DEST = (18.5204, 73.8567)


def _iso(days_ago: float) -> str:
    return (NOW - timedelta(days=days_ago)).isoformat()


def station(sid, lat, lng, power=60.0, source="open_charge_map", updated=1.0,
            connectors=("CCS2",), status="Operational", **kw):
    return {
        "station_id": sid, "name": f"Station {sid}", "latitude": lat, "longitude": lng,
        "power_kw": power, "connector_types": list(connectors), "status": status,
        "is_operational": True, "source": source,
        "last_status_update": _iso(updated) if updated is not None else None, **kw,
    }


STATIONS = [
    station("A", 18.95, 73.05, power=60.0, updated=1),
    station("B", 18.80, 73.30, power=None, source="kaggle_baseline", updated=None),
    station("C", 18.70, 73.55, power=120.0, updated=90),
]


def make(**over):
    base = dict(
        vehicle="tata-nexon-ev", distance_km=150.0, start_battery_pct=40.0, reserve_buffer_pct=15.0,
        duration_mins=180.0, origin_coords=ORIGIN, destination_coords=DEST,
        candidate_stations=STATIONS, city="Mumbai", route_source="osrm",
    )
    base.update(over)
    return JourneyInput(**base)


# ── Engine fidelity ───────────────────────────────────────────────────────────

def test_energy_numbers_are_the_existing_engine_numbers():
    res = analyze_journey(make(start_battery_pct=90.0, distance_km=60.0), now=NOW)
    veh, _ = resolve_vehicle("tata-nexon-ev")
    expected = estimate_trip_energy(veh, TripInput(distance_km=60.0, start_battery_pct=90.0, duration_mins=180.0, ambient_temp_c=25.0))
    bal = next(o for o in res["options"] if o["kind"] == "balanced")
    assert bal["energy_kwh"] == pytest.approx(expected.nominal_energy_kwh)
    assert bal["arrival_soc_pct"] == pytest.approx(expected.nominal_arrival_soc_pct)


def test_safe_journey_is_plain_and_needs_no_stop():
    res = analyze_journey(make(start_battery_pct=90.0, distance_km=60.0), now=NOW)
    assert res["verdict"] == "SAFE"
    assert res["headline"] == "Your journey looks achievable."
    assert res["recommended_kind"] == "balanced"
    rec = next(o for o in res["options"] if o["recommended"])
    assert rec["charging_stops"] == []
    assert res["recovery"] == []


def test_assumptions_are_disclosed_not_hidden():
    res = analyze_journey(make(start_battery_pct=90.0, distance_km=60.0), now=NOW)
    text = " ".join(res["assumptions"])
    assert "Temperature assumed 25" in text      # no weather feed -> says so
    assert "Traffic is not included" in text


# ── Charging intelligence & provenance ────────────────────────────────────────

def test_charging_stop_carries_provenance():
    res = analyze_journey(make(), now=NOW)
    assert res["verdict"] == "CHARGING_NEEDED"
    rec = next(o for o in res["options"] if o["recommended"])
    stops = rec["charging_stops"]
    assert stops and stops[0]["role"] == "primary"
    p = stops[0]
    assert p["data_source"] and p["freshness_label"] and p["why"].startswith("Recommended because")
    assert p["connectors_matched"]
    assert "operational" not in p["status_label"].lower().replace("listed as operational", "")  # only ever "listed as"
    assert p["status_label"].startswith("Listed as") or p["status_label"] == "Status not confirmed"
    assert "not live" in p["status_label"] or "out of date" in p["status_label"] or p["status_label"] == "Status not confirmed"


def test_unlisted_power_is_never_presented_as_fact():
    res = analyze_journey(make(candidate_stations=[STATIONS[1]]), now=NOW)
    rec = next(o for o in res["options"] if o["recommended"])
    for s in rec["charging_stops"]:
        assert s["power_kw_listed"] is None
        assert s["assumed_power_kw"] is not None
        assert s["charge_time_is_estimate"] is True


def test_listed_power_and_stale_listing_are_labelled():
    res = analyze_journey(make(candidate_stations=[STATIONS[0], STATIONS[2]]), now=NOW)
    stops = {s["station_id"]: s for o in res["options"] for s in o["charging_stops"]}
    assert stops["A"]["power_kw_listed"] == 60.0
    assert stops["A"]["status_basis"] == "directory_recent"
    if "C" in stops:
        assert stops["C"]["status_basis"] == "directory_stale"
        assert "may be out of date" in stops["C"]["status_label"]


def test_incompatible_connector_never_recommended():
    chademo = station("X", 18.95, 73.05, connectors=("CHAdeMO",))
    res = analyze_journey(make(candidate_stations=[chademo]), now=NOW)
    assert all(not o["charging_stops"] for o in res["options"])


# ── Preferences are transparent and affect ranking ────────────────────────────

def test_faster_charger_preference_reorders_stops():
    slow_close = station("S", 18.93, 73.07, power=22.0, updated=1)
    fast_far = station("F", 18.85, 73.20, power=150.0, updated=1)
    plain = analyze_journey(make(candidate_stations=[slow_close, fast_far]), Preferences(), now=NOW)
    pref = analyze_journey(make(candidate_stations=[slow_close, fast_far]), Preferences(prefer_faster_chargers=True), now=NOW)
    p_plain = next(o for o in plain["options"] if o["recommended"])["charging_stops"]
    p_pref = next(o for o in pref["options"] if o["recommended"])["charging_stops"]
    if p_plain and p_pref:
        assert p_pref[0]["station_id"] == "F"
    assert "prefer_faster_chargers" in pref["applied_preferences"]
    assert plain["applied_preferences"] == []


def test_reliable_preference_favours_recent_listing():
    undated = station("U", 18.93, 73.07, updated=None)
    recent = station("R", 18.90, 73.12, updated=2)
    res = analyze_journey(make(candidate_stations=[undated, recent]), Preferences(prefer_reliable_charging=True), now=NOW)
    stops = next(o for o in res["options"] if o["recommended"])["charging_stops"]
    assert stops and stops[0]["station_id"] == "R"


# ── Options must be supported by data ─────────────────────────────────────────

def test_faster_option_requires_real_alternative_route_data():
    none = analyze_journey(make(start_battery_pct=90.0, distance_km=100.0, duration_mins=120.0), now=NOW)
    assert all(o["kind"] != "faster" for o in none["options"])
    alts = [{"label": "Expressway", "distance_km": 105.0, "duration_mins": 90.0, "elevation_gain_m": 0.0}]
    some = analyze_journey(make(start_battery_pct=90.0, distance_km=100.0, duration_mins=120.0, route_alternatives=alts), now=NOW)
    faster = [o for o in some["options"] if o["kind"] == "faster"]
    assert faster and faster[0]["total_mins"] < 120.0


def test_options_are_deduplicated_when_identical():
    res = analyze_journey(make(start_battery_pct=95.0, distance_km=40.0), now=NOW)
    kinds = [o["kind"] for o in res["options"]]
    assert kinds.count("balanced") == 1
    assert "safer" not in kinds  # same outcome as balanced, so not offered


def test_lowest_charging_dependency_only_when_it_actually_helps():
    # Marginal trip: eco driving should lift the verdict tier or cut the charge
    res = analyze_journey(make(distance_km=165.0, start_battery_pct=100.0, candidate_stations=STATIONS), now=NOW)
    for o in res["options"]:
        if o["kind"] == "fewer_charging":
            bal = next(x for x in res["options"] if x["kind"] == "balanced")
            assert o["arrival_soc_pct"] > bal["arrival_soc_pct"]
            assert o["assumption_changes"]


# ── Recovery when infeasible ──────────────────────────────────────────────────

def test_stranded_journey_gives_honest_recovery_with_actions():
    res = analyze_journey(make(candidate_stations=[], start_battery_pct=20.0), now=NOW)
    assert res["verdict"] == "CHARGING_NEEDED"
    assert res["headline"] == "This journey is not achievable on your current battery."
    actions = [r["action"] for r in res["recovery"] if r["action"]]
    assert any(a["kind"] == "set_battery" and a["value"] > 20 for a in actions)
    assert any(w["level"] == "alert" for w in res["warnings"])


def test_recovery_battery_target_actually_works():
    res = analyze_journey(make(candidate_stations=[], start_battery_pct=20.0), now=NOW)
    target = next(r["action"]["value"] for r in res["recovery"] if r["action"] and r["action"]["kind"] == "set_battery")
    again = analyze_journey(make(candidate_stations=[], start_battery_pct=target), now=NOW)
    assert again["verdict"] in ("SAFE", "CAUTION")


# ── Vehicle honesty ───────────────────────────────────────────────────────────

def test_custom_vehicle_missing_core_fields_is_refused_not_guessed():
    with pytest.raises(VehicleDataMissing) as e:
        resolve_vehicle({"id": "mystery", "make": "X", "model": "Y"})
    assert set(e.value.missing) == {"battery capacity", "energy efficiency", "charging connector type"}


def test_estimated_weight_is_disclosed():
    v = {"id": "my-ev", "make": "A", "model": "B", "usableKwh": 50, "efficiencyKwh100km": 16, "plugType": "CCS2 Combo"}
    res = analyze_journey(make(vehicle=v, start_battery_pct=90, distance_km=50), now=NOW)
    assert "vehicle weight" in res["vehicle"]["estimated_fields"]
    assert any("weight" in a and "estimated" in a for a in res["assumptions"])


# ── Natural language is a form-filler only ────────────────────────────────────

def test_parse_fills_only_what_it_sees():
    r = parse_journey_text("Take me to Pune with 45% battery, keep 20% reserve", ["Pune", "Nashik"])
    assert r["destination"] == "Pune" and r["battery_pct"] == 45 and r["reserve_pct"] == 20
    only = parse_journey_text("somewhere nice", ["Pune"])
    assert "battery_pct" not in only and "destination" not in only


def test_parse_unknown_destination_is_reported_not_invented():
    r = parse_journey_text("to Atlantis with 60%", ["Pune"])
    assert "destination" not in r and r.get("destination_unmatched") == "Atlantis"


# ── Personalization store ─────────────────────────────────────────────────────

@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(driver_db, "DB_PATH", tmp_path / "test.db")
    driver_db.init_driver_db()
    d = driver_db.get_or_create_driver_session()
    return d


def _event(**o):
    e = dict(destination_name="Pune", distance_km=150, option_kind="balanced", reserve_pct=25,
             start_battery_pct=70, stops_count=1, station_id="A", station_name="Station A", station_power_kw=60)
    e.update(o)
    return e


def test_nothing_is_learned_without_opt_in(db):
    did = db["driver_id"]
    assert journey_store.record_journey_event(did, _event()) is False
    assert journey_store.list_journey_events(did) == []
    assert journey_store.derive_suggestions(did) == []


def test_suggestions_need_evidence_and_acceptance(db):
    did = db["driver_id"]
    journey_store.set_preference(did, "personalization_enabled", True)
    for _ in range(2):
        journey_store.record_journey_event(did, _event())
    assert journey_store.derive_suggestions(did) == []          # not enough evidence
    journey_store.record_journey_event(did, _event())
    sugg = {s["key"]: s for s in journey_store.derive_suggestions(did)}
    assert sugg["default_reserve_pct"]["value"] == 25 and "3 journeys" in sugg["default_reserve_pct"]["evidence"]
    assert journey_store.get_preferences(did)["default_reserve_pct"]["is_set"] is False   # not applied yet


def test_explicit_choice_is_never_overridden_by_a_suggestion(db):
    did = db["driver_id"]
    journey_store.set_preference(did, "personalization_enabled", True)
    journey_store.set_preference(did, "default_reserve_pct", 10)
    for _ in range(3):
        journey_store.record_journey_event(did, _event())
    assert all(s["key"] != "default_reserve_pct" for s in journey_store.derive_suggestions(did))


def test_reset_forgets_everything(db):
    did = db["driver_id"]
    journey_store.set_preference(did, "personalization_enabled", True)
    journey_store.set_preference(did, "prefer_faster_chargers", True)
    journey_store.record_journey_event(did, _event())
    out = journey_store.reset_personalization(did)
    assert out == {"preferences_removed": 2, "journeys_removed": 1}
    assert journey_store.get_preferences(did)["prefer_faster_chargers"]["is_set"] is False


def test_invalid_preferences_are_rejected(db):
    with pytest.raises(ValueError):
        journey_store.set_preference(db["driver_id"], "default_reserve_pct", 90)
    with pytest.raises(ValueError):
        journey_store.set_preference(db["driver_id"], "favourite_colour", True)


# ── REST API ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_api_analyze_and_preferences_roundtrip(db):
    transport = httpx.ASGITransport(app=app)
    h = {"X-Driver-Token": db["token"]}
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        body = {
            "vehicle": "tata-nexon-ev", "distance_km": 150, "start_battery_pct": 40, "duration_mins": 180,
            "origin_coords": list(ORIGIN), "destination_coords": list(DEST), "city": "Mumbai",
            "candidate_stations": [
                {"station_id": "A", "name": "Station A", "latitude": 18.95, "longitude": 73.05,
                 "power_kw": None, "connector_types": ["CCS2"], "status": "Operational",
                 "is_operational": True, "source": "open_charge_map"},
            ],
        }
        r = await c.post("/api/v1/journey/analyze", json=body, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["options"] and data["headline"]
        stop = data["options"][0]["charging_stops"][0]
        assert stop["power_kw_listed"] is None and stop["freshness_label"] == "Update time unknown"

        r = await c.put("/api/v1/journey/preferences", json={"key": "prefer_faster_chargers", "value": True}, headers=h)
        assert r.status_code == 200
        prefs = {p["key"]: p for p in r.json()["preferences"]}
        assert prefs["prefer_faster_chargers"]["value"] is True and prefs["prefer_faster_chargers"]["source"] == "explicit"

        r = await c.put("/api/v1/journey/preferences", json={"key": "default_reserve_pct", "value": 99}, headers=h)
        assert r.status_code == 422

        r = await c.post("/api/v1/journey/events", json=_event(), headers=h)
        assert r.json() == {"recorded": False}                      # not opted in

        r = await c.delete("/api/v1/journey/preferences", headers=h)
        assert r.json()["preferences_removed"] == 1


@pytest.mark.asyncio
async def test_api_refuses_to_guess_missing_vehicle_data(db):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post("/api/v1/journey/analyze", headers={"X-Driver-Token": db["token"]},
                         json={"vehicle": {"id": "x", "make": "A", "model": "B"}, "distance_km": 50, "start_battery_pct": 80})
        assert r.status_code == 422
        assert "battery capacity" in r.json()["detail"]


@pytest.mark.asyncio
async def test_api_parse():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post("/api/v1/journey/parse", json={"text": "to Pune with 50% battery", "known_destinations": ["Pune"]})
        assert r.json()["destination"] == "Pune" and r.json()["battery_pct"] == 50


def test_bundled_registry_data_is_not_presented_as_fresh_or_verified():
    # The baseline registry stamps "now" on every row - that is load time, not a check.
    st = station("Z", 18.95, 73.05, power=150.0, source="kaggle_baseline", updated=0)
    res = analyze_journey(make(candidate_stations=[st]), now=NOW)
    stops = [s for o in res["options"] for s in o["charging_stops"]]
    assert stops
    for s in stops:
        assert s["power_kw_listed"] is None and s["power_basis"] == "registry_unverified"
        assert s["status_basis"] == "unknown" and "not been checked live" in s["status_label"]
        assert "today" not in s["freshness_label"].lower()
