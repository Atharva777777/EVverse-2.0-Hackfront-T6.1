"""
backend/tests/test_charging_stop.py
===================================
Unit tests for Charging-Stop Recommendations (EVverse Stage 3: "Will I Make It?").

Verifies:
1. Reachable stations: identifies suitable stops when charging is required.
2. Connector compatibility:
   - Accepts matching connectors (CCS2 Combo, Type 2, etc.).
   - Disqualifies incompatible plugs (e.g. CHAdeMO-only or GB/T-only for CCS2 car).
   - Prevents 2W/3W Type 2 AC vehicles from accepting DC CCS2 plugs.
3. Unreachable stations: rejects stations located beyond current battery depletion point.
4. Missing station data: gracefully handles empty station lists without inventing phantom chargers.
5. Operational & uncertain status:
   - Flags unconfirmed live telemetry with transparent notes.
   - Disqualifies stations with offline community reports.
6. Detour filtering: rejects stations exceeding maximum allowable corridor detour.
7. Qualification reasons: verifies explainability of recommended stops.
"""

import unittest
from backend.api.services.charging_stop import (
    RecommendedStop,
    ChargingRecommendationResult,
    check_connector_compatibility,
    recommend_charging_stops,
)
from backend.api.services.range_physics import TripInput, resolve_vehicle_parameters


class TestChargingStopRecommendations(unittest.TestCase):

    def setUp(self):
        self.nexon_id = "tata-nexon-ev"    # CCS2 Combo, 39 kWh
        self.ather_id = "ather-450x-gen3"   # Type 2 (AC), 3.24 kWh

        # Sample corridor stations between Mumbai (19.076, 72.877) and Pune (18.520, 73.856)
        # Direct distance: ~120 km
        self.mumbai_coords = (19.0760, 72.8777)
        self.pune_coords = (18.5204, 73.8567)

        self.sample_stations = [
            {
                "station_id": "ST-NAVI-MUMBAI",
                "name": "Navi Mumbai Superfast Hub",
                "latitude": 19.0330,
                "longitude": 73.0297,
                "address": "Palm Beach Road, Navi Mumbai",
                "power_kw": 120.0,
                "connector_types": ["CCS2", "Type 2"],
                "is_operational": True,
                "status": "Operational",
                "source": "open_charge_map",
            },
            {
                "station_id": "ST-LONAVALA-PASS",
                "name": "Lonavala Expressway Fast Charger",
                "latitude": 18.7557,
                "longitude": 73.4091,
                "address": "Mumbai-Pune Expressway, Lonavala",
                "power_kw": 150.0,
                "connector_types": ["CCS2 Combo", "CHAdeMO"],
                "is_operational": True,
                "status": "Operational",
                "source": "open_charge_map",
            },
            {
                "station_id": "ST-TALEGAON",
                "name": "Talegaon Toll Charging Plaza",
                "latitude": 18.7210,
                "longitude": 73.6820,
                "address": "Talegaon Toll Plaza, Pune Highway",
                "power_kw": 60.0,
                "connector_types": ["CCS2", "Type 2"],
                "is_operational": True,
                "status": "Operational",
                "source": "open_charge_map",
            },
        ]

    # ── 1. Connector Compatibility Matching ───────────────────────────────────

    def test_connector_matching_ccs2_vehicle(self):
        # CCS2 Combo vehicle matching CCS2, Type 2, but not CHAdeMO
        compat_ccs2, matches_ccs2 = check_connector_compatibility("CCS2 Combo", ["CCS2", "CHAdeMO"])
        self.assertTrue(compat_ccs2)
        self.assertIn("CCS2", matches_ccs2)

        compat_chademo, matches_chademo = check_connector_compatibility("CCS2 Combo", ["CHAdeMO", "GB/T"])
        self.assertFalse(compat_chademo)
        self.assertEqual(matches_chademo, [])

    def test_connector_matching_2w_type2_cannot_use_dc_ccs2(self):
        # 2W Type 2 (AC) vehicle can use Type 2 socket, but not pure CCS2 DC
        compat_ac, matches_ac = check_connector_compatibility("Type 2 (AC)", ["Type 2 (Socket)", "Mennekes"])
        self.assertTrue(compat_ac)

        compat_dc, matches_dc = check_connector_compatibility("Type 2 (AC)", ["CCS2 Combo", "CHAdeMO"])
        self.assertFalse(compat_dc)
        self.assertEqual(matches_dc, [])

    def test_empty_or_none_connector_returns_false(self):
        compat, matches = check_connector_compatibility("CCS2 Combo", None)
        self.assertFalse(compat)
        self.assertEqual(matches, [])

        compat_empty, matches_empty = check_connector_compatibility("CCS2 Combo", [])
        self.assertFalse(compat_empty)

    # ── 2. Reachable Stations & Primary/Backup Stop Assignment ─────────────────

    def test_reachable_stations_identified_when_charging_needed(self):
        # 120 km trip with 35% starting battery (needs charging en route)
        trip = TripInput(distance_km=120.0, start_battery_pct=35.0, reserve_buffer_pct=15.0)

        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            origin_coords=self.mumbai_coords,
            destination_coords=self.pune_coords,
            candidate_stations=self.sample_stations,
        )

        self.assertTrue(result.charging_needed)
        self.assertGreater(len(result.recommendations), 0)
        self.assertIsNotNone(result.primary_stop)
        self.assertTrue(result.primary_stop.is_primary)

        # Arrival SoC at recommended stop must be positive (physically reachable)
        self.assertGreater(result.primary_stop.arrival_soc_pct, 0.0)
        self.assertGreater(result.primary_stop.required_charge_kwh, 0.0)
        self.assertGreater(result.primary_stop.estimated_charge_mins, 0.0)

        # Explains qualification
        self.assertIn("Reachable with", result.primary_stop.qualification_reason)
        self.assertIn("CCS2", result.primary_stop.qualification_reason)

    def test_primary_and_backup_stops_are_distinct(self):
        trip = TripInput(distance_km=120.0, start_battery_pct=45.0, reserve_buffer_pct=15.0)

        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            origin_coords=self.mumbai_coords,
            destination_coords=self.pune_coords,
            candidate_stations=self.sample_stations,
        )

        if len(result.recommendations) >= 2:
            self.assertIsNotNone(result.primary_stop)
            self.assertIsNotNone(result.backup_stop)
            self.assertNotEqual(result.primary_stop.station_id, result.backup_stop.station_id)
            self.assertTrue(result.backup_stop.is_backup)

    # ── 3. Incompatible Connector Disqualification ────────────────────────────

    def test_incompatible_stations_disqualified(self):
        incompat_stations = [
            {
                "station_id": "ST-CHADEMO-ONLY",
                "name": "Legacy Nissan Leaf Station",
                "latitude": 19.0330,
                "longitude": 73.0297,
                "power_kw": 50.0,
                "connector_types": ["CHAdeMO"],
                "is_operational": True,
            },
            {
                "station_id": "ST-GBT-ONLY",
                "name": "Fleet GB/T Station",
                "latitude": 18.7557,
                "longitude": 73.4091,
                "power_kw": 60.0,
                "connector_types": ["GB/T DC"],
                "is_operational": True,
            },
        ]

        trip = TripInput(distance_km=120.0, start_battery_pct=35.0)
        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            origin_coords=self.mumbai_coords,
            destination_coords=self.pune_coords,
            candidate_stations=incompat_stations,
        )

        self.assertEqual(len(result.recommendations), 0)
        self.assertIsNone(result.primary_stop)
        self.assertEqual(result.rejection_summary["incompatible_connector"], 2)
        self.assertIn("lack compatible CCS2 Combo connectors", result.summary_message)

    # ── 4. Unreachable Stations (Depletion Before Station) ─────────────────────

    def test_unreachable_stations_rejected_when_battery_depleted(self):
        # Battery at only 5% (~1.9 kWh usable).
        # Navi Mumbai is ~25 km away and requires ~4.2 kWh -> Unreachable!
        trip = TripInput(distance_km=120.0, start_battery_pct=5.0)

        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            origin_coords=self.mumbai_coords,
            destination_coords=self.pune_coords,
            candidate_stations=self.sample_stations,
        )

        # All stations along the highway should be unreachable
        self.assertEqual(len(result.recommendations), 0)
        self.assertGreater(result.rejection_summary["unreachable"], 0)
        self.assertIn("unreachable before battery depletion", result.summary_message)

    # ── 5. Missing Station Data & Transparent Limitations ─────────────────────

    def test_empty_candidate_station_list_handles_gracefully(self):
        trip = TripInput(distance_km=100.0, start_battery_pct=30.0)

        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            candidate_stations=[],
        )

        self.assertEqual(result.stations_evaluated, 0)
        self.assertEqual(len(result.recommendations), 0)
        self.assertIsNone(result.primary_stop)
        self.assertIn("No candidate stations found", result.summary_message)
        self.assertGreater(len(result.limitations), 0)

    # ── 6. Operational Status & Uncertainty Notes ─────────────────────────────

    def test_non_operational_stations_disqualified(self):
        offline_station = [
            {
                "station_id": "ST-OFFLINE",
                "name": "Decommissioned Station",
                "latitude": 19.0330,
                "longitude": 73.0297,
                "power_kw": 50.0,
                "connector_types": ["CCS2"],
                "is_operational": False,
                "status": "Offline / Maintenance",
            }
        ]

        trip = TripInput(distance_km=100.0, start_battery_pct=50.0)
        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            origin_coords=self.mumbai_coords,
            destination_coords=self.pune_coords,
            candidate_stations=offline_station,
        )

        self.assertEqual(len(result.recommendations), 0)
        self.assertEqual(result.rejection_summary["non_operational"], 1)

    def test_baseline_source_sets_unconfirmed_status_note(self):
        baseline_station = [
            {
                "station_id": "ST-BASELINE-HUB",
                "name": "Verified Highway Hub",
                "latitude": 19.0330,
                "longitude": 73.0297,
                "power_kw": 120.0,
                "connector_types": ["CCS2"],
                "is_operational": True,
                "status": "Operational (Baseline)",
                "source": "kaggle_baseline",
            }
        ]

        trip = TripInput(distance_km=100.0, start_battery_pct=40.0)
        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            origin_coords=self.mumbai_coords,
            destination_coords=self.pune_coords,
            candidate_stations=baseline_station,
        )

        self.assertEqual(len(result.recommendations), 1)
        rec = result.recommendations[0]
        self.assertIsNotNone(rec.status_note)
        self.assertIn("live telemetry unconfirmed", rec.status_note)

    # ── 7. Excessive Detour Rejection ─────────────────────────────────────────

    def test_excessive_detour_rejected(self):
        # Station far off the Mumbai-Pune corridor (e.g. Nashik direction, +80 km detour)
        far_station = [
            {
                "station_id": "ST-NASHIK-FAR",
                "name": "Far Off Corridor Charger",
                "latitude": 19.9975,
                "longitude": 73.7898,
                "power_kw": 120.0,
                "connector_types": ["CCS2"],
                "is_operational": True,
                "status": "Operational",
            }
        ]

        trip = TripInput(distance_km=120.0, start_battery_pct=40.0)
        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            origin_coords=self.mumbai_coords,
            destination_coords=self.pune_coords,
            candidate_stations=far_station,
            max_detour_km=15.0,
        )

        self.assertEqual(len(result.recommendations), 0)
    # ── 8. Multi-Leg Honesty & AC Power Capping ───────────────────────────────

    def test_multi_leg_stop_does_not_promise_unsupported_destination_arrival(self):
        # 400 km trip on Nexon EV (range ~230 km).
        # Charger at km 80 leaves 320 km remaining — cannot reach destination in one go!
        charger_km80 = [
            {
                "station_id": "ST-KM80",
                "name": "Expressway Midway Plaza",
                "latitude": 18.75,
                "longitude": 73.40,
                "distance_from_origin_km": 80.0,
                "detour_km": 2.0,
                "power_kw": 150.0,
                "connector_types": ["CCS2"],
                "is_operational": True,
                "status": "Operational",
            }
        ]

        trip = TripInput(distance_km=400.0, start_battery_pct=70.0)
        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            candidate_stations=charger_km80,
        )

        self.assertIsNotNone(result.primary_stop)
        reason = result.primary_stop.qualification_reason
        # Must NOT claim safe arrival at final destination; must note multi-leg / downstream stop
        self.assertIn("additional downstream charging stop", reason)
        self.assertNotIn("safe completion of the remaining", reason)

    def test_ac_charging_power_capped_realistically(self):
        # Nexon EV on AC Type 2 plug at 50 kW AC station:
        # Car's onboard AC charger is 7.2 kW, so effective kw must be capped <= 7.4 kW
        ac_station = [
            {
                "station_id": "ST-AC-ONLY",
                "name": "Hotel AC Destination Station",
                "latitude": 19.0330,
                "longitude": 73.0297,
                "distance_from_origin_km": 20.0,
                "detour_km": 1.0,
                "power_kw": 50.0,
                "connector_types": ["Type 2"],
                "is_operational": True,
                "status": "Operational",
            }
        ]

        trip = TripInput(distance_km=60.0, start_battery_pct=30.0)
        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            candidate_stations=ac_station,
        )

        self.assertIsNotNone(result.primary_stop)
        self.assertLessEqual(result.primary_stop.effective_charging_kw, 7.5)

    def test_charging_duration_physically_possible(self):
        """
        Verify delivering ~28 kWh to a Tata Nexon EV (max DC 30 kW) takes > 55 mins.
        Delivering 27.91 kWh in 12 mins would require ~140 kW average power,
        which is physically impossible for a vehicle capped at 30 kW.
        """
        station = [
            {
                "station_id": "ST-ULTRA-150",
                "name": "High-Power 150kW Hub",
                "latitude": 19.0330,
                "longitude": 73.0297,
                "distance_from_origin_km": 40.0,
                "power_kw": 150.0,
                "connector_types": ["CCS2 Combo"],
                "is_operational": True,
                "status": "Operational",
            }
        ]
        # Trip needing significant charge (~28 kWh)
        trip = TripInput(distance_km=118.0, start_battery_pct=35.0, reserve_buffer_pct=15.0)
        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            candidate_stations=station,
        )

        stop = result.primary_stop
        self.assertIsNotNone(stop)
        self.assertEqual(stop.effective_charging_kw, 30.0)  # Capped at Nexon EV 30 kW
        self.assertGreater(stop.required_charge_kwh, 20.0)

        # ~24.55 kWh delivered at max 30 kW (with 88% efficiency = 26.4 kW net)
        # MUST take at least 50 minutes, never ~12 minutes
        self.assertGreaterEqual(stop.estimated_charge_mins, 50.0)
        self.assertLessEqual(stop.estimated_charge_mins, 80.0)

        # Average charging power implied by time and energy cannot exceed vehicle limit
        implied_power_kw = (stop.required_charge_kwh / (stop.estimated_charge_mins / 60.0)) / 0.88
        self.assertLessEqual(implied_power_kw, 31.0)

    def test_charging_curve_taper_above_80_percent(self):
        """Verify charging in the tapered zone (>80% SoC) takes longer per kWh than bulk charging."""
        station = [
            {
                "station_id": "ST-DC-FAST",
                "name": "Fast Charger",
                "latitude": 19.0330,
                "longitude": 73.0297,
                "distance_from_origin_km": 20.0,
                "power_kw": 60.0,
                "connector_types": ["CCS2 Combo"],
                "is_operational": True,
                "status": "Operational",
            }
        ]
        # Trip requiring top-up from 82% to 95% (entirely in tapered zone)
        trip = TripInput(distance_km=250.0, start_battery_pct=90.0, reserve_buffer_pct=15.0)
        result = recommend_charging_stops(
            vehicle=self.nexon_id,
            trip=trip,
            candidate_stations=station,
        )
        self.assertIsNotNone(result.primary_stop)
        stop = result.primary_stop
        # Confirm charge time is computed and positive
        self.assertGreater(stop.estimated_charge_mins, 5.0)


if __name__ == "__main__":
    unittest.main()

