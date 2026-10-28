"""
backend/tests/test_range_physics.py
====================================
Unit tests for the isolated physics-based trip energy prediction engine
(EVverse Stage 1: "Will I Make It?").

Tests verify:
1. Normal inputs & standard trip energy estimation with verified seed fleet.
2. Input validation & error handling (invalid distance, SoC, payload, buffer).
3. Missing optional data handling (duration inference, default assumptions).
4. Battery boundary conditions (0%, 100%, depleted arrival).
5. Physical sensitivity:
   - Elevation (uphill work vs. downhill regen).
   - Payload mass scaling (reference vs. heavy payload).
   - HVAC auxiliary draw (eco/normal/max, ambient temperature sensitivity, open 2W/3W vehicles).
   - Driving style multiplier (eco vs. sport).
6. Uncertainty bounds ordering: E_best <= E_nominal <= E_worst and SoC_worst <= SoC_nominal <= SoC_best.
7. Feasibility categorization (safe, caution, unreachable).
"""

import unittest
from backend.api.services.range_physics import (
    VehicleParameters,
    TripInput,
    FactorBreakdown,
    EnergyEstimationResult,
    resolve_vehicle_parameters,
    estimate_trip_energy,
)


class TestRangePhysicsService(unittest.TestCase):

    def setUp(self):
        # Standard test vehicle (Tata Nexon EV: 39.0 kWh usable, 14.5 kWh/100km, 1400 kg curb weight)
        self.nexon_id = "tata-nexon-ev"
        self.ather_id = "ather-450x-gen3"

    # ── 1. Vehicle Parameter Resolution ───────────────────────────────────────

    def test_resolve_seed_vehicle_string(self):
        v = resolve_vehicle_parameters(self.nexon_id)
        self.assertEqual(v.vehicle_id, "tata-nexon-ev")
        self.assertEqual(v.usable_kwh, 39.0)
        self.assertEqual(v.curb_weight_kg, 1400.0)
        self.assertTrue(v.has_cabin_hvac)

    def test_resolve_2w_vehicle_no_hvac(self):
        v = resolve_vehicle_parameters(self.ather_id)
        self.assertEqual(v.vehicle_id, "ather-450x-gen3")
        self.assertEqual(v.curb_weight_kg, 108.0)
        self.assertFalse(v.has_cabin_hvac)

    def test_resolve_custom_dict(self):
        custom = {
            "id": "custom-ev",
            "make": "TestAuto",
            "model": "Volt",
            "usable_kwh": 50.0,
            "battery_kwh": 55.0,
            "efficiency_kwh100km": 16.0,
            "curb_weight_kg": 1600.0,
        }
        v = resolve_vehicle_parameters(custom)
        self.assertEqual(v.usable_kwh, 50.0)
        self.assertEqual(v.curb_weight_kg, 1600.0)

    def test_resolve_unknown_vehicle_raises(self):
        with self.assertRaises(ValueError):
            resolve_vehicle_parameters("unknown-flying-car")

    def test_resolve_invalid_battery_raises(self):
        with self.assertRaises(ValueError):
            resolve_vehicle_parameters({
                "id": "bad-bat",
                "usable_kwh": -5.0,
                "efficiency_kwh100km": 15.0,
            })
        with self.assertRaises(ValueError):
            resolve_vehicle_parameters({
                "id": "bad-bat-high",
                "usable_kwh": 500.0,
                "efficiency_kwh100km": 15.0,
            })

    def test_resolve_invalid_efficiency_raises(self):
        with self.assertRaises(ValueError):
            resolve_vehicle_parameters({
                "id": "bad-eff",
                "usable_kwh": 40.0,
                "efficiency_kwh100km": 0.0,
            })

    # ── 2. Input Validation ───────────────────────────────────────────────────

    def test_invalid_distance_negative_or_zero(self):
        trip_zero = TripInput(distance_km=0.0, start_battery_pct=80.0)
        with self.assertRaises(ValueError):
            estimate_trip_energy(self.nexon_id, trip_zero)

        trip_neg = TripInput(distance_km=-10.0, start_battery_pct=80.0)
        with self.assertRaises(ValueError):
            estimate_trip_energy(self.nexon_id, trip_neg)

    def test_excessive_distance_raises(self):
        trip_huge = TripInput(distance_km=4000.0, start_battery_pct=80.0)
        with self.assertRaises(ValueError):
            estimate_trip_energy(self.nexon_id, trip_huge)

    def test_invalid_start_battery_pct(self):
        trip_neg = TripInput(distance_km=50.0, start_battery_pct=-5.0)
        with self.assertRaises(ValueError):
            estimate_trip_energy(self.nexon_id, trip_neg)

        trip_over = TripInput(distance_km=50.0, start_battery_pct=105.0)
        with self.assertRaises(ValueError):
            estimate_trip_energy(self.nexon_id, trip_over)

    def test_invalid_payload(self):
        trip_neg_pay = TripInput(distance_km=50.0, start_battery_pct=80.0, payload_kg=-10.0)
        with self.assertRaises(ValueError):
            estimate_trip_energy(self.nexon_id, trip_neg_pay)

        trip_huge_pay = TripInput(distance_km=50.0, start_battery_pct=80.0, payload_kg=2500.0)
        with self.assertRaises(ValueError):
            estimate_trip_energy(self.nexon_id, trip_huge_pay)

    def test_invalid_reserve_buffer(self):
        trip_bad_buf = TripInput(distance_km=50.0, start_battery_pct=80.0, reserve_buffer_pct=60.0)
        with self.assertRaises(ValueError):
            estimate_trip_energy(self.nexon_id, trip_bad_buf)

    # ── 3. Normal Inputs & Missing Optional Data ──────────────────────────────

    def test_normal_trip_standard_output(self):
        trip = TripInput(
            distance_km=100.0,
            start_battery_pct=90.0,
            elevation_gain_m=0.0,
            payload_kg=75.0,
            ambient_temp_c=25.0,
            hvac_mode="normal",
            reserve_buffer_pct=15.0,
        )
        res = estimate_trip_energy(self.nexon_id, trip)

        self.assertIsInstance(res, EnergyEstimationResult)
        self.assertEqual(res.vehicle_id, "tata-nexon-ev")
        self.assertGreater(res.nominal_energy_kwh, 14.0)  # ~14.5 base + HVAC
        self.assertLess(res.nominal_energy_kwh, 25.0)
        self.assertGreater(res.nominal_arrival_soc_pct, 40.0)
        self.assertLessEqual(res.nominal_arrival_soc_pct, 90.0)
        self.assertEqual(res.feasibility, "safe")

        # Verify breakdown
        self.assertGreater(res.factor_breakdown.base_traction_kwh, 0.0)
        self.assertEqual(res.factor_breakdown.elevation_kwh, 0.0)
        self.assertEqual(res.factor_breakdown.payload_kwh, 0.0)  # 75 kg is reference
        self.assertGreater(res.factor_breakdown.hvac_kwh, 0.0)

    def test_missing_duration_auto_inferred(self):
        trip_no_dur = TripInput(distance_km=60.0, start_battery_pct=80.0, duration_mins=None)
        res = estimate_trip_energy(self.nexon_id, trip_no_dur)
        # 60 km at 60 km/h is 1 hour -> HVAC for 1 hr at 25°C should be ~1.55 kWh
        self.assertAlmostEqual(res.factor_breakdown.hvac_kwh, 1.55, delta=0.2)

    # ── 4. Battery Boundary Conditions ────────────────────────────────────────

    def test_battery_at_100_percent(self):
        trip = TripInput(distance_km=20.0, start_battery_pct=100.0)
        res = estimate_trip_energy(self.nexon_id, trip)
        self.assertLess(res.nominal_arrival_soc_pct, 100.0)
        self.assertGreater(res.nominal_arrival_soc_pct, 85.0)
        self.assertEqual(res.feasibility, "safe")

    def test_battery_at_zero_percent(self):
        trip = TripInput(distance_km=10.0, start_battery_pct=0.0)
        res = estimate_trip_energy(self.nexon_id, trip)
        self.assertEqual(res.nominal_arrival_soc_pct, 0.0)
        self.assertEqual(res.arrival_soc_range_pct[0], 0.0)
        self.assertEqual(res.arrival_soc_range_pct[1], 0.0)
        self.assertEqual(res.feasibility, "unreachable")

    def test_trip_exceeds_available_battery(self):
        # 400 km trip on 39 kWh battery (range ~260 km) with 50% start battery (~19.5 kWh)
        trip = TripInput(distance_km=400.0, start_battery_pct=50.0)
        res = estimate_trip_energy(self.nexon_id, trip)
        self.assertEqual(res.nominal_arrival_soc_pct, 0.0)
        self.assertEqual(res.feasibility, "unreachable")

    # ── 5. Physical Sensitivities ─────────────────────────────────────────────

    def test_elevation_uphill_increases_consumption(self):
        flat_trip = TripInput(distance_km=50.0, start_battery_pct=80.0, elevation_gain_m=0.0)
        uphill_trip = TripInput(distance_km=50.0, start_battery_pct=80.0, elevation_gain_m=600.0)

        res_flat = estimate_trip_energy(self.nexon_id, flat_trip)
        res_uphill = estimate_trip_energy(self.nexon_id, uphill_trip)

        self.assertGreater(res_uphill.nominal_energy_kwh, res_flat.nominal_energy_kwh)
        self.assertGreater(res_uphill.factor_breakdown.elevation_kwh, 0.0)

        # Plausibility check: m * g * h / (3.6e6 * 0.88)
        # m = 1400 + 75 = 1475 kg; g = 9.80665; h = 600 m
        # Work = (1475 * 9.80665 * 600) / (3.6e6 * 0.88) = ~2.74 kWh
        self.assertAlmostEqual(res_uphill.factor_breakdown.elevation_kwh, 2.74, delta=0.2)

    def test_elevation_downhill_recovers_energy_via_regen(self):
        flat_trip = TripInput(distance_km=50.0, start_battery_pct=80.0, elevation_gain_m=0.0)
        downhill_trip = TripInput(distance_km=50.0, start_battery_pct=80.0, elevation_gain_m=-600.0)

        res_flat = estimate_trip_energy(self.nexon_id, flat_trip)
        res_downhill = estimate_trip_energy(self.nexon_id, downhill_trip)

        self.assertLess(res_downhill.nominal_energy_kwh, res_flat.nominal_energy_kwh)
        self.assertLess(res_downhill.factor_breakdown.elevation_kwh, 0.0)

    def test_payload_mass_sensitivity(self):
        ref_trip = TripInput(distance_km=80.0, start_battery_pct=80.0, payload_kg=75.0)
        heavy_trip = TripInput(distance_km=80.0, start_battery_pct=80.0, payload_kg=350.0)

        res_ref = estimate_trip_energy(self.nexon_id, ref_trip)
        res_heavy = estimate_trip_energy(self.nexon_id, heavy_trip)

        self.assertEqual(res_ref.factor_breakdown.payload_kwh, 0.0)
        self.assertGreater(res_heavy.factor_breakdown.payload_kwh, 0.0)
        self.assertGreater(res_heavy.nominal_energy_kwh, res_ref.nominal_energy_kwh)

    def test_hvac_modes_and_cabinless_vehicle(self):
        # Nexon EV with HVAC off, eco, normal, max
        base_trip = TripInput(distance_km=50.0, start_battery_pct=80.0, duration_mins=60.0)

        off_res = estimate_trip_energy(self.nexon_id, TripInput(
            distance_km=50.0, start_battery_pct=80.0, duration_mins=60.0, hvac_mode="off"
        ))
        eco_res = estimate_trip_energy(self.nexon_id, TripInput(
            distance_km=50.0, start_battery_pct=80.0, duration_mins=60.0, hvac_mode="eco"
        ))
        norm_res = estimate_trip_energy(self.nexon_id, TripInput(
            distance_km=50.0, start_battery_pct=80.0, duration_mins=60.0, hvac_mode="normal"
        ))
        max_res = estimate_trip_energy(self.nexon_id, TripInput(
            distance_km=50.0, start_battery_pct=80.0, duration_mins=60.0, hvac_mode="max"
        ))

        self.assertEqual(off_res.factor_breakdown.hvac_kwh, 0.0)
        self.assertLess(eco_res.factor_breakdown.hvac_kwh, norm_res.factor_breakdown.hvac_kwh)
        self.assertLess(norm_res.factor_breakdown.hvac_kwh, max_res.factor_breakdown.hvac_kwh)

        # Ather 450X (electric 2W) has no enclosed HVAC
        ather_res = estimate_trip_energy(self.ather_id, TripInput(
            distance_km=20.0, start_battery_pct=80.0, duration_mins=30.0, hvac_mode="max"
        ))
        self.assertEqual(ather_res.factor_breakdown.hvac_kwh, 0.0)

    def test_driving_style_sensitivity(self):
        eco_trip = TripInput(distance_km=60.0, start_battery_pct=80.0, driving_style="eco")
        normal_trip = TripInput(distance_km=60.0, start_battery_pct=80.0, driving_style="normal")
        sport_trip = TripInput(distance_km=60.0, start_battery_pct=80.0, driving_style="sport")

        res_eco = estimate_trip_energy(self.nexon_id, eco_trip)
        res_norm = estimate_trip_energy(self.nexon_id, normal_trip)
        res_sport = estimate_trip_energy(self.nexon_id, sport_trip)

        self.assertLess(res_eco.factor_breakdown.base_traction_kwh, res_norm.factor_breakdown.base_traction_kwh)
        self.assertLess(res_norm.factor_breakdown.base_traction_kwh, res_sport.factor_breakdown.base_traction_kwh)

    # ── 6. Scenario Uncertainty Bounds Ordering ───────────────────────────────

    def test_scenario_uncertainty_bounds_ordering(self):
        trip = TripInput(
            distance_km=120.0,
            start_battery_pct=85.0,
            elevation_gain_m=200.0,
            payload_kg=150.0,
            ambient_temp_c=35.0,
            hvac_mode="normal",
        )
        res = estimate_trip_energy(self.nexon_id, trip)

        best_e, worst_e = res.energy_range_kwh
        worst_soc, best_soc = res.arrival_soc_range_pct

        # Energy consumption: best <= nominal <= worst
        self.assertLessEqual(best_e, res.nominal_energy_kwh)
        self.assertLessEqual(res.nominal_energy_kwh, worst_e)

        # Arrival SoC: worst_soc <= nominal_soc <= best_soc
        self.assertLessEqual(worst_soc, res.nominal_arrival_soc_pct)
        self.assertLessEqual(res.nominal_arrival_soc_pct, best_soc)

    # ── 7. Feasibility Categories ─────────────────────────────────────────────

    def test_feasibility_safe_caution_unreachable_transitions(self):
        # 1. Safe trip: short trip, high battery
        safe_res = estimate_trip_energy(self.nexon_id, TripInput(
            distance_km=30.0, start_battery_pct=90.0, reserve_buffer_pct=15.0
        ))
        self.assertEqual(safe_res.feasibility, "safe")

        # 2. Caution trip: moderate distance where nominal arrives above buffer,
        # but worst-case dips below buffer
        # Nexon has 39 kWh. Consumption for 130 km is ~21 kWh (~54% battery).
        # Start at 73%:
        # Nominal arrival: 73% - 54% = 19% (>= 15% buffer)
        # Worst case: +15-20% consumption -> ~25 kWh (~64%) -> 73% - 64% = 9% (< 15% buffer)
        caution_res = estimate_trip_energy(self.nexon_id, TripInput(
            distance_km=130.0, start_battery_pct=73.0, reserve_buffer_pct=15.0
        ))
        self.assertEqual(caution_res.feasibility, "caution")
        self.assertIn("A short charging stop is recommended", caution_res.feasibility_reason)

        # 3. Unreachable trip: distance clearly drains battery below reserve buffer
        unreach_res = estimate_trip_energy(self.nexon_id, TripInput(
            distance_km=250.0, start_battery_pct=50.0, reserve_buffer_pct=15.0
        ))
        self.assertEqual(unreach_res.feasibility, "unreachable")
        self.assertIn("requires an intermediate charging stop", unreach_res.feasibility_reason)


if __name__ == "__main__":
    unittest.main()
