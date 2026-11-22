import sys
import os
sys.path.insert(0, os.path.abspath("."))

import asyncio
import json
from backend.api.routers.trip import evaluate_will_i_make_it, WillIMakeItRequest

# Sample stations along the Pune -> Lonavala / Mumbai corridor
SAMPLE_STATIONS = [
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
]

INCOMPATIBLE_STATIONS = [
    {
        "station_id": "SLOW-GBT-01",
        "name": "GB/T Fleet Charger",
        "latitude": 18.7300,
        "longitude": 73.6800,
        "power_kw": 15.0,
        "connector_types": ["GB/T"],
        "is_operational": True,
        "status": "Operational",
        "address": "Talegaon Industrial Area",
        "operator": "Private",
        "source": "OSM",
    }
]

async def run_all():
    print("=" * 80)
    print("BACKEND SCENARIO VALIDATION: POST /api/v1/trip/will-i-make-it")
    print("=" * 80)

    # 1. SCENARIO 1: SAFE JOURNEY
    p1 = WillIMakeItRequest(
        vehicle="tata-nexon-ev",
        distance_km=64.0,
        start_battery_pct=80.0,
        reserve_buffer_pct=15.0,
        elevation_gain_m=75.0,
        origin_coords=(18.5204, 73.8567),
        destination_coords=(18.7557, 73.4091),
        candidate_stations=SAMPLE_STATIONS,
        city="Pune"
    )
    r1 = await evaluate_will_i_make_it(p1)
    print("\n--- SCENARIO 1: SAFE JOURNEY ---")
    print(f"Inputs: Vehicle={p1.vehicle}, Distance={p1.distance_km}km, StartSOC={p1.start_battery_pct}%, ReserveThreshold={p1.reserve_buffer_pct}%")
    print(f"Verdict: {r1.feasibility.verdict}")
    print(f"Arrival Battery: {r1.feasibility.nominal_arrival_soc_pct:.1f}% (Range: [{r1.feasibility.arrival_soc_range_pct[0]:.1f}%, {r1.feasibility.arrival_soc_range_pct[1]:.1f}%])")
    print(f"Reserve Threshold: {r1.feasibility.reserve_buffer_pct}% (Margin: +{r1.feasibility.nominal_arrival_soc_pct - r1.feasibility.reserve_buffer_pct:.1f}% above reserve)")
    print(f"Total Energy Demand: {r1.energy.nominal_energy_kwh:.2f} kWh (Usable Capacity: {r1.feasibility.usable_capacity_kwh:.1f} kWh)")
    print(f"Factor Breakdown: Traction={r1.energy.factor_breakdown.base_traction_kwh:.2f} kWh, Elevation={r1.energy.factor_breakdown.elevation_kwh:.2f} kWh, Payload={r1.energy.factor_breakdown.payload_kwh:.2f} kWh, HVAC={r1.energy.factor_breakdown.hvac_kwh:.2f} kWh")
    print(f"Charging Needed: {r1.charging.charging_needed}")
    print(f"Reasons: {r1.feasibility.reasons}")

    # 2. SCENARIO 2: CAUTION JOURNEY
    # 46% start -> arrival 18.0% nominal, but worst-case drops to 13.3% (< 15.0% buffer)
    p2 = WillIMakeItRequest(
        vehicle="tata-nexon-ev",
        distance_km=64.0,
        start_battery_pct=46.0,
        reserve_buffer_pct=15.0,
        elevation_gain_m=75.0,
        origin_coords=(18.5204, 73.8567),
        destination_coords=(18.7557, 73.4091),
        candidate_stations=SAMPLE_STATIONS,
        city="Pune"
    )
    r2 = await evaluate_will_i_make_it(p2)
    print("\n--- SCENARIO 2: CAUTION JOURNEY ---")
    print(f"Inputs: Vehicle={p2.vehicle}, Distance={p2.distance_km}km, StartSOC={p2.start_battery_pct}%, ReserveThreshold={p2.reserve_buffer_pct}%")
    print(f"Verdict: {r2.feasibility.verdict}")
    print(f"Arrival Battery: {r2.feasibility.nominal_arrival_soc_pct:.1f}% (Range: [{r2.feasibility.arrival_soc_range_pct[0]:.1f}%, {r2.feasibility.arrival_soc_range_pct[1]:.1f}%])")
    print(f"Reserve Threshold: {r2.feasibility.reserve_buffer_pct}% (Nominal Margin: +{r2.feasibility.nominal_arrival_soc_pct - r2.feasibility.reserve_buffer_pct:.1f}%, Worst-case deficit: -{r2.feasibility.reserve_buffer_pct - r2.feasibility.arrival_soc_range_pct[0]:.1f}%)")
    print(f"Total Energy Demand: {r2.energy.nominal_energy_kwh:.2f} kWh")
    print(f"Charging Needed: {r2.charging.charging_needed}")
    print(f"Reasons: {r2.feasibility.reasons}")
    print(f"Risk Factors: {[rf.description for rf in r2.feasibility.risk_factors]}")

    # 3. SCENARIO 3: CHARGING NEEDED JOURNEY
    p3 = WillIMakeItRequest(
        vehicle="tata-nexon-ev",
        distance_km=132.0,
        start_battery_pct=25.0,
        reserve_buffer_pct=15.0,
        elevation_gain_m=40.0,
        origin_coords=(18.5204, 73.8567),
        destination_coords=(19.0657, 72.9984),
        candidate_stations=SAMPLE_STATIONS,
        city="Pune"
    )
    r3 = await evaluate_will_i_make_it(p3)
    print("\n--- SCENARIO 3: CHARGING NEEDED JOURNEY ---")
    print(f"Inputs: Vehicle={p3.vehicle}, Distance={p3.distance_km}km, StartSOC={p3.start_battery_pct}%, ReserveThreshold={p3.reserve_buffer_pct}%")
    print(f"Verdict: {r3.feasibility.verdict}")
    print(f"Nominal Arrival SOC: {r3.feasibility.nominal_arrival_soc_pct:.1f}%")
    print(f"Battery Depletion Distance: km {r3.feasibility.depletion_distance_km:.1f} of {p3.distance_km} km")
    print(f"Energy Deficit: -{r3.feasibility.energy_deficit_kwh:.2f} kWh")
    print(f"Min Departure SOC Needed to Complete Direct: {r3.feasibility.recommended_min_departure_soc_pct:.1f}%")
    print(f"Reasons: {r3.feasibility.reasons}")

    # 4. SCENARIO 4: COMPATIBLE CHARGING STATION AVAILABLE
    print("\n--- SCENARIO 4: COMPATIBLE CHARGING STATION AVAILABLE ---")
    print(f"Charging Needed: {r3.charging.charging_needed}")
    print(f"Stations Evaluated: {r3.charging.stations_evaluated}")
    print(f"Recommendations Count: {len(r3.charging.recommendations)}")
    primary = r3.charging.primary_stop
    if primary:
        print(f"Primary Recommended Stop: {primary.name}")
        print(f"Operator: {primary.operator} | Status: {primary.status} (Operational: {primary.is_operational})")
        print(f"Power: {primary.power_kw} kW | Matched Connectors: {primary.matched_connectors}")
        print(f"Location: ({primary.latitude}, {primary.longitude}) at km {primary.distance_along_route_km:.1f} along route")
        print(f"Detour: +{primary.detour_km:.1f} km (+{primary.detour_mins:.1f} mins driving)")
        print(f"Arrival at Charger: {primary.arrival_soc_pct:.1f}% SOC ({primary.arrival_energy_kwh:.2f} kWh remaining)")
        print(f"Required Charge: {primary.required_charge_kwh:.2f} kWh (~{primary.estimated_charge_mins:.1f} mins to {primary.target_departure_soc_pct:.0f}% SOC)")
        print(f"Effective Charging Speed: {primary.effective_charging_kw:.1f} kW")
        print(f"Qualification Reason: {primary.qualification_reason}")

    # 5. SCENARIO 5: NO COMPATIBLE CHARGING STATION AVAILABLE
    p5 = WillIMakeItRequest(
        vehicle="tata-nexon-ev", # Requires CCS2 or Type 2 AC
        distance_km=132.0,
        start_battery_pct=25.0,
        reserve_buffer_pct=15.0,
        elevation_gain_m=40.0,
        origin_coords=(18.5204, 73.8567),
        destination_coords=(19.0657, 72.9984),
        candidate_stations=INCOMPATIBLE_STATIONS, # Only GB/T
        city="Pune"
    )
    r5 = await evaluate_will_i_make_it(p5)
    print("\n--- SCENARIO 5: NO COMPATIBLE CHARGING STATION AVAILABLE ---")
    print(f"Verdict: {r5.feasibility.verdict}")
    print(f"Stations Evaluated: {r5.charging.stations_evaluated}")
    print(f"Recommendations List: {r5.charging.recommendations}")
    print(f"Primary Stop: {r5.charging.primary_stop}")
    print(f"Rejection Summary: {r5.charging.rejection_summary}")
    print(f"Summary Message: {r5.charging.summary_message}")
    print(f"Limitations: {r5.charging.limitations}")

    print("\n" + "=" * 80)
    print("BACKEND VERIFICATION COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(run_all())
