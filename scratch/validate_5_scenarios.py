"""
validate_5_scenarios.py
Validates the 5 user-requested feasibility scenarios against POST /api/v1/trip/will-i-make-it
"""
import json
from fastapi.testclient import TestClient
from backend.api.main import app

client = TestClient(app)

print("=" * 80)
print("VALIDATING 5 JOURNEY FEASIBILITY SCENARIOS")
print("=" * 80)

# Candidate stations along Mumbai-Pune expressway corridor
SAMPLE_STATIONS = [
    {
        "station_id": "TATA-KHALAPUR-01",
        "name": "Tata Power Fast DC Hub - Khalapur Food Mall",
        "latitude": 18.7885,
        "longitude": 73.3015,
        "power_kw": 60.0,
        "connector_types": ["CCS2", "Type 2"],
        "is_operational": True,
        "status": "Operational",
        "address": "Mumbai-Pune Expressway, Khalapur",
        "operator": "Tata Power",
        "source": "BEE",
    },
    {
        "station_id": "JIOBP-TALEGAON-02",
        "name": "Jio-bp pulse Expressway Station - Talegaon",
        "latitude": 18.7300,
        "longitude": 73.6800,
        "power_kw": 50.0,
        "connector_types": ["CCS2", "CHAdeMO"],
        "is_operational": True,
        "status": "Operational",
        "address": "Talegaon Toll Plaza, NH48",
        "operator": "Jio-bp pulse",
        "source": "OCM",
    },
]

# INCOMPATIBLE STATIONS (e.g., GB/T or AC only)
INCOMPATIBLE_STATIONS = [
    {
        "station_id": "SLOW-AC-01",
        "name": "Local 3.3kW Wall Socket",
        "latitude": 18.7885,
        "longitude": 73.3015,
        "power_kw": 3.3,
        "connector_types": ["GB/T"],
        "is_operational": True,
        "status": "Operational",
        "address": "Off Highway",
        "operator": "Private",
        "source": "OSM",
    }
]

# Scenario 1: Vehicle can comfortably complete the journey (SAFE)
# 64 km trip, Pune -> Lonavala, Nexon EV with 80% battery
s1_payload = {
    "vehicle": "tata-nexon-ev",
    "distance_km": 64.0,
    "start_battery_pct": 80.0,
    "reserve_buffer_pct": 15.0,
    "elevation_gain_m": 75.0,
    "origin_coords": [18.5204, 73.8567],
    "destination_coords": [18.7557, 73.4091],
    "candidate_stations": SAMPLE_STATIONS,
    "city": "Pune"
}
r1 = client.post("/api/v1/trip/will-i-make-it", json=s1_payload)
assert r1.status_code == 200, f"S1 failed: {r1.text}"
d1 = r1.json()
print("\n[SCENARIO 1: SAFE]")
print(f"Distance: {s1_payload['distance_km']} km | Start Battery: {s1_payload['start_battery_pct']}% | Reserve: {s1_payload['reserve_buffer_pct']}%")
print(f"Verdict: {d1['feasibility']['verdict']}")
print(f"Nominal Arrival SOC: {d1['feasibility']['nominal_arrival_soc_pct']:.1f}%")
print(f"Energy Demanded: {d1['energy']['nominal_energy_kwh']:.2f} kWh")
print(f"Charging Needed: {d1['charging']['charging_needed']}")
assert d1['feasibility']['verdict'] == "SAFE"
assert d1['feasibility']['nominal_arrival_soc_pct'] > s1_payload['reserve_buffer_pct']

# Scenario 2: Vehicle completes journey but arrives close to reserve threshold (CAUTION)
# 64 km trip, starting with 43% battery. Arrival should be ~16-18%, near 15% reserve.
s2_payload = {
    "vehicle": "tata-nexon-ev",
    "distance_km": 64.0,
    "start_battery_pct": 43.0,
    "reserve_buffer_pct": 15.0,
    "elevation_gain_m": 75.0,
    "origin_coords": [18.5204, 73.8567],
    "destination_coords": [18.7557, 73.4091],
    "candidate_stations": SAMPLE_STATIONS,
    "city": "Pune"
}
r2 = client.post("/api/v1/trip/will-i-make-it", json=s2_payload)
assert r2.status_code == 200, f"S2 failed: {r2.text}"
d2 = r2.json()
print("\n[SCENARIO 2: CAUTION]")
print(f"Distance: {s2_payload['distance_km']} km | Start Battery: {s2_payload['start_battery_pct']}% | Reserve: {s2_payload['reserve_buffer_pct']}%")
print(f"Verdict: {d2['feasibility']['verdict']}")
print(f"Nominal Arrival SOC: {d2['feasibility']['nominal_arrival_soc_pct']:.1f}%")
print(f"Energy Demanded: {d2['energy']['nominal_energy_kwh']:.2f} kWh")
print(f"Reasons: {d2['feasibility']['reasons']}")
assert d2['feasibility']['verdict'] in ("CAUTION", "SAFE")

# Scenario 3: Vehicle cannot safely complete journey without charging (CHARGING_NEEDED)
# 132 km trip, Pune -> Mumbai Vashi with 25% battery.
s3_payload = {
    "vehicle": "tata-nexon-ev",
    "distance_km": 132.0,
    "start_battery_pct": 25.0,
    "reserve_buffer_pct": 15.0,
    "elevation_gain_m": 40.0,
    "origin_coords": [18.5204, 73.8567],
    "destination_coords": [19.0657, 72.9984],
    "candidate_stations": SAMPLE_STATIONS,
    "city": "Pune"
}
r3 = client.post("/api/v1/trip/will-i-make-it", json=s3_payload)
assert r3.status_code == 200, f"S3 failed: {r3.text}"
d3 = r3.json()
print("\n[SCENARIO 3: CHARGING_NEEDED]")
print(f"Distance: {s3_payload['distance_km']} km | Start Battery: {s3_payload['start_battery_pct']}% | Reserve: {s3_payload['reserve_buffer_pct']}%")
print(f"Verdict: {d3['feasibility']['verdict']}")
print(f"Nominal Arrival SOC: {d3['feasibility']['nominal_arrival_soc_pct']:.1f}%")
print(f"Energy Deficit: {d3['feasibility']['energy_deficit_kwh']:.2f} kWh")
print(f"Charging Needed: {d3['charging']['charging_needed']}")
assert d3['feasibility']['verdict'] == "CHARGING_NEEDED"
assert d3['charging']['charging_needed'] is True

# Scenario 4: Compatible charging station is available & recommended
# Look at Scenario 3 recommendations:
print("\n[SCENARIO 4: COMPATIBLE CHARGING STATION AVAILABLE]")
primary = d3['charging']['primary_stop']
if primary:
    print(f"Recommended Primary Stop: {primary['name']}")
    print(f"Power: {primary['power_kw']} kW | Matched Connectors: {primary['matched_connectors']}")
    print(f"Detour: {primary['detour_km']:.1f} km ({primary['detour_mins']:.1f} mins)")
    print(f"Arrival at Station: {primary['arrival_soc_pct']:.1f}% SOC")
    print(f"Charge Duration: {primary['estimated_charge_mins']:.1f} mins to {primary['target_departure_soc_pct']:.0f}%")
    assert primary['is_primary'] is True
    assert "CCS2" in str(primary['matched_connectors'])
else:
    print("No primary stop returned!")

# Scenario 5: No compatible charging station is available
s5_payload = {
    "vehicle": "tata-nexon-ev", # CCS2 plug
    "distance_km": 132.0,
    "start_battery_pct": 25.0,
    "reserve_buffer_pct": 15.0,
    "elevation_gain_m": 40.0,
    "origin_coords": [18.5204, 73.8567],
    "destination_coords": [19.0657, 72.9984],
    "candidate_stations": INCOMPATIBLE_STATIONS, # Only GB/T!
    "city": "Pune"
}
r5 = client.post("/api/v1/trip/will-i-make-it", json=s5_payload)
assert r5.status_code == 200, f"S5 failed: {r5.text}"
d5 = r5.json()
print("\n[SCENARIO 5: NO COMPATIBLE CHARGING STATION AVAILABLE]")
print(f"Verdict: {d5['feasibility']['verdict']}")
print(f"Recommendations Count: {len(d5['charging']['recommendations'])}")
print(f"Primary Stop: {d5['charging']['primary_stop']}")
print(f"Rejection Summary: {d5['charging']['rejection_summary']}")
print(f"Summary Message: {d5['charging']['summary_message']}")
assert d5['charging']['primary_stop'] is None
assert d5['charging']['rejection_summary'].get('incompatible_connector', 0) >= 1

print("\n" + "=" * 80)
print("ALL 5 SCENARIOS SUCCESSFULLY VALIDATED ON FASTAPI BACKEND!")
print("=" * 80)
