"""
backend/tests/test_journey_risk.py
==================================
Unit tests for the Journey Feasibility & Risk Engine (EVverse Stage 2: "Will I Make It?").

Verifies:
1. SAFE journeys (sufficient starting battery, worst-case stays above reserve buffer).
2. CAUTION journeys (nominal arrives above buffer, but worst-case drops below buffer).
3. CHARGING_NEEDED journeys:
   - Outright battery exhaustion before destination (depletion distance & deficit).
   - Arrival SoC is positive but below required reserve buffer.
   - Excessive trip distance / high energy demand exceeding full battery capacity.
4. Risk factor identification (elevation, HVAC thermal, payload, driving style, headroom).
5. Minimum departure SoC recommendations.
6. Reuse of pre-computed EnergyEstimationResult from range_physics.py.
"""

import unittest
from backend.api.services.journey_risk import (
    FeasibilityVerdict,
    RiskFactor,
    JourneyFeasibilityResult,
    evaluate_journey_feasibility,
)
from backend.api.services.range_physics import (
    TripInput,
    estimate_trip_energy,
    resolve_vehicle_parameters,
)


class TestJourneyRiskService(unittest.TestCase):

    def setUp(self):
        # Tata Nexon EV (39 kWh usable, 14.5 kWh/100km, 1400 kg curb weight)
        self.nexon_id = "tata-nexon-ev"

    # ── 1. SAFE Journeys ──────────────────────────────────────────────────────

    def test_safe_journey_with_ample_margin(self):
        # 40 km trip with 85% battery, 15% buffer
        trip = TripInput(distance_km=40.0, start_battery_pct=85.0, reserve_buffer_pct=15.0)
        res = evaluate_journey_feasibility(self.nexon_id, trip)

        self.assertEqual(res.verdict, FeasibilityVerdict.SAFE)
        self.assertGreater(res.nominal_arrival_soc_pct, 60.0)
        self.assertGreaterEqual(res.arrival_soc_range_pct[0], res.reserve_buffer_pct)
        self.assertEqual(res.energy_deficit_kwh, 0.0)
        self.assertIsNone(res.depletion_distance_km)
        self.assertTrue(any("safe margin" in r.lower() for r in res.reasons))

    # ── 2. CAUTION Journeys (Threshold Crossing) ──────────────────────────────

    def test_caution_when_worst_case_crosses_reserve_buffer(self):
        # Nexon EV 39 kWh: 130 km trip uses ~20-21 kWh nominal (~54% SoC).
        # Starting at 72% SoC:
        # Nominal arrival: 72% - 54% = 18% (>= 15% buffer).
        # Worst-case energy (~24 kWh, 62% SoC):
        # Worst-case arrival: 72% - 62% = 10% (< 15% buffer).
        trip = TripInput(distance_km=130.0, start_battery_pct=72.0, reserve_buffer_pct=15.0)
        res = evaluate_journey_feasibility(self.nexon_id, trip)

        self.assertEqual(res.verdict, FeasibilityVerdict.CAUTION)
        self.assertGreaterEqual(res.nominal_arrival_soc_pct, 15.0)
        self.assertLess(res.arrival_soc_range_pct[0], 15.0)
        self.assertGreater(res.energy_deficit_kwh, 0.0)  # Deficit to keep worst-case above buffer
        self.assertTrue(any("adverse driving conditions" in r.lower() for r in res.reasons))
        self.assertTrue(any("brief charging top-up" in m.lower() for m in res.mitigation_advice))

    # ── 3. CHARGING_NEEDED Journeys ───────────────────────────────────────────

    def test_charging_needed_outright_battery_depletion(self):
        # 118 km trip with starting SoC at only 25% (9.75 kWh available vs ~20 kWh needed)
        trip = TripInput(distance_km=118.0, start_battery_pct=25.0, reserve_buffer_pct=15.0)
        res = evaluate_journey_feasibility(self.nexon_id, trip)

        self.assertEqual(res.verdict, FeasibilityVerdict.CHARGING_NEEDED)
        self.assertEqual(res.nominal_arrival_soc_pct, 0.0)
        self.assertIsNotNone(res.depletion_distance_km)
        # 9.75 kWh / ~20 kWh * 118 km ≈ 57 km
        self.assertGreater(res.depletion_distance_km, 40.0)
        self.assertLess(res.depletion_distance_km, 80.0)
        self.assertGreater(res.energy_deficit_kwh, 10.0)
        self.assertTrue(any("depleted before reaching" in r.lower() for r in res.reasons))
        self.assertTrue(any("charging stop is required" in m.lower() for m in res.mitigation_advice))

    def test_charging_needed_arrival_below_safety_buffer(self):
        # Vehicle arrives, but with less than required reserve buffer
        # 100 km trip uses ~17 kWh (~44% SoC). Start at 50% SoC, required buffer 15%.
        # Nominal arrival is ~6% SoC (< 15% buffer).
        trip = TripInput(distance_km=100.0, start_battery_pct=50.0, reserve_buffer_pct=15.0)
        res = evaluate_journey_feasibility(self.nexon_id, trip)

        self.assertEqual(res.verdict, FeasibilityVerdict.CHARGING_NEEDED)
        self.assertGreater(res.nominal_arrival_soc_pct, 0.0)
        self.assertLess(res.nominal_arrival_soc_pct, 15.0)
        self.assertIsNone(res.depletion_distance_km)  # Did not deplete before arrival
        self.assertGreater(res.energy_deficit_kwh, 0.0)
        self.assertTrue(any("falls below your required" in r.lower() for r in res.reasons))

    def test_charging_needed_trip_exceeds_total_battery_capacity(self):
        # 450 km trip far exceeds 39 kWh battery (range ~230 km)
        trip = TripInput(distance_km=450.0, start_battery_pct=100.0, reserve_buffer_pct=15.0)
        res = evaluate_journey_feasibility(self.nexon_id, trip)

        self.assertEqual(res.verdict, FeasibilityVerdict.CHARGING_NEEDED)
        self.assertEqual(res.nominal_arrival_soc_pct, 0.0)
        self.assertIsNone(res.recommended_min_departure_soc_pct)  # Cannot be completed on 1 full charge
        self.assertTrue(any("multi-leg" in r.lower() for r in res.reasons))

    # ── 4. Risk Factor Decomposition ──────────────────────────────────────────

    def test_risk_factors_populated_correctly(self):
        # Trip with high elevation (+500m), extreme heat (42°C), heavy payload (350kg), sport mode
        trip = TripInput(
            distance_km=90.0,
            start_battery_pct=90.0,
            elevation_gain_m=500.0,
            payload_kg=350.0,
            ambient_temp_c=42.0,
            hvac_mode="max",
            driving_style="sport",
            reserve_buffer_pct=15.0,
        )
        res = evaluate_journey_feasibility(self.nexon_id, trip)

        categories = {rf.category for rf in res.risk_factors}
        self.assertIn("elevation", categories)
        self.assertIn("hvac", categories)
        self.assertIn("payload", categories)
        self.assertIn("driving_style", categories)

        # Verify mitigation advice addresses identified risks
        advice_str = " ".join(res.mitigation_advice).lower()
        self.assertIn("eco", advice_str)

    # ── 5. Recommended Departure SoC ──────────────────────────────────────────

    def test_recommended_departure_soc_calculated_when_feasible(self):
        # 100 km trip starting at 40% (low charge, triggers CHARGING_NEEDED)
        # Should recommend a departure SoC between 60% and 85%
        trip = TripInput(distance_km=100.0, start_battery_pct=40.0, reserve_buffer_pct=15.0)
        res = evaluate_journey_feasibility(self.nexon_id, trip)

        self.assertIsNotNone(res.recommended_min_departure_soc_pct)
        self.assertGreater(res.recommended_min_departure_soc_pct, 50.0)
        self.assertLessEqual(res.recommended_min_departure_soc_pct, 100.0)

    # ── 6. Reusing Pre-Computed Energy Result ──────────────────────────────────

    def test_reuse_precomputed_energy_result(self):
        trip = TripInput(distance_km=50.0, start_battery_pct=80.0)
        precomputed = estimate_trip_energy(self.nexon_id, trip)

        # Call with precomputed result
        res = evaluate_journey_feasibility(self.nexon_id, trip, energy_result=precomputed)
        self.assertIs(res.energy_result, precomputed)
        self.assertEqual(res.nominal_energy_kwh, precomputed.nominal_energy_kwh)

    # ── 7. Focused Safety & Boundary Tests ────────────────────────────────────

    def test_zero_starting_battery_depletion_at_km_zero(self):
        # When starting with 0% battery, depletion distance must be 0.0 km
        trip = TripInput(distance_km=75.0, start_battery_pct=0.0, reserve_buffer_pct=15.0)
        res = evaluate_journey_feasibility(self.nexon_id, trip)

        self.assertEqual(res.verdict, FeasibilityVerdict.CHARGING_NEEDED)
        self.assertEqual(res.depletion_distance_km, 0.0)
        self.assertEqual(res.nominal_arrival_soc_pct, 0.0)
        self.assertGreater(res.energy_deficit_kwh, 0.0)

    def test_depletion_distance_clamped_to_trip_distance(self):
        # Battery sized near depletion right before destination must never exceed trip distance
        v = resolve_vehicle_parameters(self.nexon_id)
        e_res = estimate_trip_energy(v, TripInput(distance_km=100.0, start_battery_pct=50.0))
        # Start battery with slightly less than nominal energy (e.g. 43.7% vs 43.79% needed)
        exact_start_soc = int((e_res.nominal_energy_kwh / v.usable_kwh) * 1000) / 10.0

        trip = TripInput(distance_km=100.0, start_battery_pct=exact_start_soc, reserve_buffer_pct=15.0)
        res = evaluate_journey_feasibility(v, trip)

        self.assertIsNotNone(res.depletion_distance_km)
        self.assertLessEqual(res.depletion_distance_km, 100.0)
        self.assertGreaterEqual(res.depletion_distance_km, 95.0)

    def test_zero_reserve_buffer_boundary(self):
        # When reserve buffer is 0%, any positive arrival SoC is SAFE if worst-case is positive
        trip = TripInput(distance_km=30.0, start_battery_pct=50.0, reserve_buffer_pct=0.0)
        res = evaluate_journey_feasibility(self.nexon_id, trip)

        self.assertEqual(res.verdict, FeasibilityVerdict.SAFE)
        self.assertGreater(res.nominal_arrival_soc_pct, 0.0)
        self.assertEqual(res.energy_deficit_kwh, 0.0)

    def test_recommended_departure_soc_guarantees_reserve_at_arrival(self):
        # Departing with recommended_min_departure_soc_pct must strictly satisfy arrival reserve
        trip_initial = TripInput(distance_km=110.0, start_battery_pct=40.0, reserve_buffer_pct=15.0)
        res_initial = evaluate_journey_feasibility(self.nexon_id, trip_initial)

        rec_soc = res_initial.recommended_min_departure_soc_pct
        self.assertIsNotNone(rec_soc)

        # Now simulate trip departing with exactly the recommended SoC
        trip_with_rec = TripInput(distance_km=110.0, start_battery_pct=rec_soc, reserve_buffer_pct=15.0)
        res_with_rec = evaluate_journey_feasibility(self.nexon_id, trip_with_rec)

        # Must arrive with at least the 15% reserve buffer even in the worst case
        worst_arrival_soc, best_arrival_soc = res_with_rec.arrival_soc_range_pct
        self.assertGreaterEqual(worst_arrival_soc, 15.0)
        self.assertEqual(res_with_rec.verdict, FeasibilityVerdict.SAFE)


if __name__ == "__main__":
    unittest.main()

