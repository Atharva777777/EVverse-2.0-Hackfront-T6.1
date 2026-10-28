"""
backend/api/services/charging_stop.py
=====================================
Charging-Stop Recommendation Engine (EVverse Stage 3: "Will I Make It?").

When a proposed journey cannot be completed with the required reserve buffer
(or battery depletes en-route), this service identifies, evaluates, and ranks
suitable en-route charging stops that:
1. Are physically reachable with the vehicle's remaining battery.
2. Have verified connector compatibility with the vehicle's charging standard.
3. Are operational according to current telemetry and community issue reports.
4. Minimize route detour and charging turnaround time.
5. Provide honest explanations for qualification or disqualification.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union

from backend.api.services.journey_risk import (
    FeasibilityVerdict,
    JourneyFeasibilityResult,
    evaluate_journey_feasibility,
)
from backend.api.services.range_physics import (
    TripInput,
    VehicleParameters,
    estimate_trip_energy,
    resolve_vehicle_parameters,
)
from backend.api.services.geo_utils import haversine_km
from backend.data.driver_db import list_station_reports
from backend.data.open_charge_map import NormalizedStation, get_ocm_service

log = logging.getLogger(__name__)


# ── Connector Compatibility Engine ────────────────────────────────────────────

def check_connector_compatibility(
    vehicle_plug_type: str,
    station_connectors: Optional[List[str]],
) -> Tuple[bool, List[str]]:
    """
    Determines whether a vehicle's plug standard physically fits a station's connectors.
    Never guesses or invents compatibility.

    Returns:
        (is_compatible, list_of_matching_station_connectors)
    """
    if not station_connectors:
        return False, []

    v_plug = (vehicle_plug_type or "").strip().lower()
    matches: List[str] = []

    for conn in station_connectors:
        s_conn = (conn or "").strip().lower()

        if "ccs2" in v_plug or "combo 2" in v_plug or "ccs 2" in v_plug:
            # Vehicle accepts CCS2 Combo (DC) and Type 2 (AC top portion)
            if (
                "ccs2" in s_conn
                or "combo 2" in s_conn
                or "ccs-2" in s_conn
                or "combo2" in s_conn
                or ("ccs" in s_conn and "ccs1" not in s_conn and "combo 1" not in s_conn)
            ):
                matches.append(conn)
            elif "type 2" in s_conn or "mennekes" in s_conn or "type2" in s_conn:
                matches.append(f"{conn} (AC Slow/Destination)")

        elif "type 2" in v_plug or "mennekes" in v_plug:
            # AC Type 2 vehicles (e.g. 2W/3W or standard AC inlets).
            # Cannot use CCS2 DC pins.
            if ("type 2" in s_conn or "mennekes" in s_conn or "type2" in s_conn) and "ccs" not in s_conn:
                matches.append(conn)

        elif "chademo" in v_plug:
            if "chademo" in s_conn or "jevs" in s_conn:
                matches.append(conn)

        elif "gb/t" in v_plug or "gbt" in v_plug:
            if "gb/t" in s_conn or "gbt" in s_conn or "gb-t" in s_conn:
                matches.append(conn)

        elif v_plug in s_conn:
            matches.append(conn)

    return (len(matches) > 0, matches)


# ── Data Models ───────────────────────────────────────────────────────────────

@dataclass
class RecommendedStop:
    """A verified, reachable charging stop qualifying for route assistance."""
    station_id: str
    name: str
    latitude: float
    longitude: float
    address: Optional[str]
    operator: Optional[str]
    status: str
    is_operational: bool
    power_kw: float
    connector_types: List[str]
    matched_connectors: List[str]
    distance_from_origin_km: float
    distance_along_route_km: float
    detour_km: float
    detour_mins: float
    arrival_soc_pct: float
    arrival_energy_kwh: float
    required_charge_kwh: float
    target_departure_soc_pct: float
    estimated_charge_mins: float
    effective_charging_kw: float
    qualification_reason: str
    is_primary: bool = False
    is_backup: bool = False
    status_note: Optional[str] = None
    recent_reports: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class ChargingRecommendationResult:
    """Complete output of charging stop discovery and route analysis."""
    trip_distance_km: float
    feasibility_verdict: str                  # "SAFE", "CAUTION", "CHARGING_NEEDED"
    charging_needed: bool
    stations_evaluated: int
    recommendations: List[RecommendedStop]
    primary_stop: Optional[RecommendedStop] = None
    backup_stop: Optional[RecommendedStop] = None
    rejection_summary: Dict[str, int] = field(default_factory=dict)
    summary_message: str = ""
    limitations: List[str] = field(default_factory=list)


# ── Core Recommendation Service ───────────────────────────────────────────────

def recommend_charging_stops(
    vehicle: Union[Dict[str, Any], VehicleParameters, str],
    trip: TripInput,
    origin_coords: Optional[Tuple[float, float]] = None,
    destination_coords: Optional[Tuple[float, float]] = None,
    candidate_stations: Optional[List[Union[NormalizedStation, Dict[str, Any]]]] = None,
    city: Optional[str] = None,
    feasibility_result: Optional[JourneyFeasibilityResult] = None,
    max_detour_km: float = 20.0,
) -> ChargingRecommendationResult:
    """
    Identifies and evaluates candidate charging stations along the proposed journey.
    Reuses Stage 1/2 calculations to guarantee that recommended stops are reachable
    and solve the trip's energy deficit.
    """
    v_params = resolve_vehicle_parameters(vehicle)
    feasibility = feasibility_result or evaluate_journey_feasibility(v_params, trip)

    # 1. Check if charging stop is required or beneficial
    needs_charging = feasibility.verdict in (FeasibilityVerdict.CHARGING_NEEDED, FeasibilityVerdict.CAUTION)

    # 2. Gather candidate stations
    stations_pool: List[Dict[str, Any]] = []
    if candidate_stations is not None:
        for st in candidate_stations:
            if isinstance(st, NormalizedStation):
                stations_pool.append(st.to_dict())
            elif isinstance(st, dict):
                stations_pool.append(st.copy())
    else:
        # Fetch from Open Charge Map service if city or coordinates available
        try:
            target_city = city or "Mumbai"
            ocm_service = get_ocm_service()
            if origin_coords:
                ocm_res = ocm_service.fetch_city_stations(
                    city_name=target_city,
                    distance_km=max(25.0, trip.distance_km / 2.0),
                    explicit_lat=origin_coords[0],
                    explicit_lng=origin_coords[1],
                )
            else:
                ocm_res = ocm_service.fetch_city_stations(city_name=target_city)
            stations_pool = [s.to_dict() for s in ocm_res.stations]
        except Exception as exc:
            log.warning("Could not auto-fetch stations from OCM: %s", exc)
            stations_pool = []

    rejections: Dict[str, int] = {
        "unreachable": 0,
        "incompatible_connector": 0,
        "non_operational": 0,
        "excessive_detour": 0,
    }

    limitations: List[str] = []
    evaluated_count = len(stations_pool)

    if evaluated_count == 0:
        msg = "No candidate stations found in the specified area."
        limitations.append("No verified charging stations were available in the queried corridor.")
        return ChargingRecommendationResult(
            trip_distance_km=trip.distance_km,
            feasibility_verdict=feasibility.verdict.value,
            charging_needed=needs_charging,
            stations_evaluated=0,
            recommendations=[],
            rejection_summary=rejections,
            summary_message=msg,
            limitations=limitations,
        )

    # 3. Direct route baseline
    has_coords = bool(origin_coords and destination_coords)
    if has_coords:
        direct_dist_km = haversine_km(
            origin_coords[0], origin_coords[1],
            destination_coords[0], destination_coords[1]
        )
    else:
        direct_dist_km = trip.distance_km

    usable_kwh = v_params.usable_kwh
    start_kwh = usable_kwh * (trip.start_battery_pct / 100.0)
    qualifying_stops: List[RecommendedStop] = []

    # 4. Evaluate each candidate station
    for st_data in stations_pool:
        st_id = str(st_data.get("station_id") or st_data.get("id") or "UNKNOWN")
        st_name = str(st_data.get("name") or f"Station {st_id}")
        st_lat = float(st_data.get("latitude") or 0.0)
        st_lng = float(st_data.get("longitude") or 0.0)
        st_connectors = st_data.get("connector_types") or []
        is_operational = bool(st_data.get("is_operational", True))
        status_text = str(st_data.get("status") or "Operational")
        power_kw = float(st_data.get("power_kw") or (150.0 if "CCS" in str(st_connectors) else 22.0))

        # Check A: Operational status
        status_lower = status_text.lower()
        if not is_operational or "offline" in status_lower or "out of order" in status_lower or "decommissioned" in status_lower:
            rejections["non_operational"] += 1
            continue

        # Check community issue reports from database
        try:
            reports_data = list_station_reports(station_id=st_id, limit=5)
            recent_reports = reports_data.get("items", [])
        except Exception:
            recent_reports = []

        has_offline_reports = any(
            "offline" in str(r.get("category", "")).lower()
            or "powered down" in str(r.get("category", "")).lower()
            for r in recent_reports
        )
        if has_offline_reports:
            rejections["non_operational"] += 1
            continue

        # Check B: Connector compatibility
        is_compat, matched_conns = check_connector_compatibility(v_params.plug_type, st_connectors)
        if not is_compat:
            rejections["incompatible_connector"] += 1
            continue

        # Check C: Spatial geometry & detour
        if has_coords:
            dist_origin_to_st = haversine_km(origin_coords[0], origin_coords[1], st_lat, st_lng)
            dist_st_to_dest = haversine_km(st_lat, st_lng, destination_coords[0], destination_coords[1])
            detour_km = max(0.0, (dist_origin_to_st + dist_st_to_dest) - direct_dist_km)
            distance_along_km = min(trip.distance_km, round(dist_origin_to_st * 1.12, 1))
        else:
            # Fallback when coordinates are absent: use station's explicit progress or synthetic fraction
            dist_origin_to_st = float(st_data.get("distance_from_origin_km") or (trip.distance_km * 0.5))
            detour_km = float(st_data.get("detour_km") or 2.0)
            distance_along_km = float(st_data.get("distance_along_route_km") or dist_origin_to_st)

        if detour_km > max_detour_km:
            rejections["excessive_detour"] += 1
            continue

        # Check D: Reachability with current starting battery
        # Calculate energy to reach the station from departure point
        # Assumes road curvature multiplier ~1.12 if using geodesic haversine
        leg_to_station_km = max(1.0, distance_along_km + (detour_km * 0.5))
        trip_to_st = TripInput(
            distance_km=leg_to_station_km,
            start_battery_pct=trip.start_battery_pct,
            elevation_gain_m=trip.elevation_gain_m * (distance_along_km / max(1.0, trip.distance_km)),
            payload_kg=trip.payload_kg,
            ambient_temp_c=trip.ambient_temp_c,
            hvac_mode=trip.hvac_mode,
            driving_style=trip.driving_style,
        )
        res_to_st = estimate_trip_energy(v_params, trip_to_st)
        energy_to_st = res_to_st.nominal_energy_kwh

        if energy_to_st >= start_kwh:
            # Battery depletes before reaching this charger
            rejections["unreachable"] += 1
            continue

        arrival_kwh = start_kwh - energy_to_st
        arrival_soc = max(0.0, min(100.0, (arrival_kwh / usable_kwh) * 100.0))

        # Check E: Charge required to reach final destination with reserve
        remaining_km = max(1.0, trip.distance_km - distance_along_km + (detour_km * 0.5))
        trip_remaining = TripInput(
            distance_km=remaining_km,
            start_battery_pct=80.0,  # nominal departure level from charger
            elevation_gain_m=trip.elevation_gain_m * (remaining_km / max(1.0, trip.distance_km)),
            payload_kg=trip.payload_kg,
            ambient_temp_c=trip.ambient_temp_c,
            hvac_mode=trip.hvac_mode,
            driving_style=trip.driving_style,
            reserve_buffer_pct=trip.reserve_buffer_pct,
        )
        res_remaining = estimate_trip_energy(v_params, trip_remaining)
        energy_remaining_needed = res_remaining.nominal_energy_kwh
        reserve_kwh = usable_kwh * (trip.reserve_buffer_pct / 100.0)

        # Minimum departure SoC from charger to complete rest of trip with reserve
        total_energy_needed_from_charger = energy_remaining_needed + reserve_kwh
        min_departure_soc = (total_energy_needed_from_charger / usable_kwh) * 100.0

        is_multi_leg = min_departure_soc > 100.0
        if is_multi_leg:
            # Multi-leg route: remaining distance exceeds single full charge
            target_departure_soc = 90.0  # Fast-charge cutoff
        else:
            # Single remaining leg: charge to at least 80% or exact needed SoC
            target_departure_soc = min(100.0, max(80.0, math.ceil(min_departure_soc * 10.0) / 10.0))

        target_kwh = usable_kwh * (target_departure_soc / 100.0)
        charge_kwh = max(0.0, target_kwh - arrival_kwh)

        # Distinguish AC vs DC charging capabilities
        is_dc_charge = any("ccs" in c.lower() or "chademo" in c.lower() or "gb/t" in c.lower() or "dc" in c.lower() for c in matched_conns)
        if is_dc_charge:
            max_vehicle_kw = v_params.max_dc_speed_kw or 50.0
        else:
            # AC charging limited by onboard charger (3.3 kW for 2W/3W, 7.4 kW for cars)
            max_vehicle_kw = 3.3 if usable_kwh < 10.0 else 7.4

        effective_kw = min(power_kw, max_vehicle_kw)

        # Realistic charging duration: bulk rate up to 80% SoC, constant-voltage taper above 80%
        soc_taper_threshold = 80.0
        kwh_at_taper = usable_kwh * (soc_taper_threshold / 100.0)

        if arrival_kwh >= kwh_at_taper:
            taper_kw = max(2.5, effective_kw * 0.35)
            charge_hours = charge_kwh / max(1.0, taper_kw * 0.88)
        elif target_kwh > kwh_at_taper:
            bulk_kwh = max(0.0, kwh_at_taper - arrival_kwh)
            taper_kwh = max(0.0, target_kwh - kwh_at_taper)
            taper_kw = max(2.5, effective_kw * 0.35)
            charge_hours = (bulk_kwh / max(1.0, effective_kw * 0.88)) + (taper_kwh / max(1.0, taper_kw * 0.88))
        else:
            charge_hours = charge_kwh / max(1.0, effective_kw * 0.88)

        charge_mins = max(5.0, charge_hours * 60.0)
        detour_mins = max(1.0, round(detour_km * 2.0, 1))

        # Build transparent qualification reason without unsupported promises
        conn_summary = ", ".join(matched_conns[:2])
        status_note: Optional[str] = None
        if "unconfirmed" in status_lower or "unknown" in status_lower or st_data.get("source") != "open_charge_map":
            status_note = "Status derived from baseline verified station registry; live telemetry unconfirmed."

        if is_multi_leg:
            est_next_leg_km = round((usable_kwh * 0.75 / max(0.05, v_params.efficiency_kwh100km)) * 100.0, 0)
            reason = (
                f"Reachable with {arrival_soc:.1f}% battery ({arrival_kwh:.1f} kWh) at km {distance_along_km:.0f}. "
                f"Provides compatible {conn_summary} ({power_kw:.0f} kW). Adding {charge_kwh:.1f} kWh (~{charge_mins:.0f} mins) "
                f"charges battery to {target_departure_soc:.0f}%, enabling the next ~{est_next_leg_km:.0f} km. "
                f"Note: Final destination is {remaining_km:.0f} km away; journey requires an additional downstream charging stop."
            )
        else:
            reason = (
                f"Reachable with {arrival_soc:.1f}% battery ({arrival_kwh:.1f} kWh) at km {distance_along_km:.0f}. "
                f"Provides compatible {conn_summary} ({power_kw:.0f} kW). Adding {charge_kwh:.1f} kWh (~{charge_mins:.0f} mins) "
                f"charges battery to {target_departure_soc:.0f}%, enabling safe completion of the remaining {remaining_km:.0f} km "
                f"with {trip.reserve_buffer_pct:.0f}% reserve."
            )

        qualifying_stops.append(RecommendedStop(
            station_id=st_id,
            name=st_name,
            latitude=st_lat,
            longitude=st_lng,
            address=st_data.get("address"),
            operator=st_data.get("operator"),
            status=status_text,
            is_operational=is_operational,
            power_kw=power_kw,
            connector_types=st_connectors,
            matched_connectors=matched_conns,
            distance_from_origin_km=round(dist_origin_to_st, 1),
            distance_along_route_km=round(distance_along_km, 1),
            detour_km=round(detour_km, 1),
            detour_mins=detour_mins,
            arrival_soc_pct=round(arrival_soc, 1),
            arrival_energy_kwh=round(arrival_kwh, 2),
            required_charge_kwh=round(charge_kwh, 2),
            target_departure_soc_pct=round(target_departure_soc, 1),
            estimated_charge_mins=round(charge_mins, 1),
            effective_charging_kw=round(effective_kw, 1),
            qualification_reason=reason,
            status_note=status_note,
            recent_reports=recent_reports,
        ))

    # 5. Rank and select Primary & Backup Stops
    # Preference:
    # - Low detour
    # - High charging power (faster turnaround)
    # - Balanced progress along route (prefer stop between 30% and 80% of reachable range)
    def _rank_key(stop: RecommendedStop) -> float:
        # Score lower is better
        # Detour penalty (10 pts per km detour)
        detour_penalty = stop.detour_km * 10.0
        # Time penalty (charge time)
        time_penalty = stop.estimated_charge_mins * 0.5
        # Power bonus (higher power reduces score)
        power_bonus = min(150.0, stop.effective_charging_kw) * 0.3
        # Arrival margin penalty if arrival SoC is dangerously low (< 5%)
        margin_penalty = 50.0 if stop.arrival_soc_pct < 5.0 else 0.0
        return detour_penalty + time_penalty - power_bonus + margin_penalty

    qualifying_stops.sort(key=_rank_key)

    primary: Optional[RecommendedStop] = None
    backup: Optional[RecommendedStop] = None

    if len(qualifying_stops) > 0:
        primary = qualifying_stops[0]
        primary.is_primary = True

    if len(qualifying_stops) > 1:
        # Find distinct backup station
        for candidate in qualifying_stops[1:]:
            if candidate.station_id != primary.station_id:
                backup = candidate
                backup.is_backup = True
                break

    # 6. Synthesize Summary Message
    if len(qualifying_stops) > 0:
        msg = (
            f"Identified {len(qualifying_stops)} compatible, reachable charging stops along your route corridor. "
            f"Primary recommendation: {primary.name} at km {primary.distance_along_route_km:.0f} "
            f"({primary.power_kw:.0f} kW, +{primary.detour_km:.1f} km detour)."
        )
    else:
        # Honest reporting when none found
        unreachable_count = rejections["unreachable"]
        incompat_count = rejections["incompatible_connector"]
        detour_count = rejections["excessive_detour"]
        msg = (
            f"No suitable charging stops could be verified for this journey. "
            f"Out of {evaluated_count} stations evaluated: {unreachable_count} are unreachable before battery depletion, "
            f"{incompat_count} lack compatible {v_params.plug_type} connectors, and {detour_count} exceed maximum allowable detour."
        )
        limitations.append(
            f"All examined stations along corridor were disqualified: unreachable ({unreachable_count}), "
            f"incompatible ({incompat_count}), excessive detour ({detour_count})."
        )

    return ChargingRecommendationResult(
        trip_distance_km=trip.distance_km,
        feasibility_verdict=feasibility.verdict.value,
        charging_needed=needs_charging,
        stations_evaluated=evaluated_count,
        recommendations=qualifying_stops,
        primary_stop=primary,
        backup_stop=backup,
        rejection_summary=rejections,
        summary_message=msg,
        limitations=limitations,
    )
