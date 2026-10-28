"""
backend/api/services/range_physics.py
======================================
Isolated, physics-informed trip energy estimation engine for EVverse ("Will I Make It?").

Calculates longitudinal vehicle energy consumption, expected arrival State of Charge (SoC),
scenario-based uncertainty bounds (best-case, nominal, worst-case), and an explainable
factor breakdown.

Physical formulation:
- Base traction energy: distance × (efficiency / 100) × speed/drive-style factor
- Gravitational grade energy: (m_total × g × Δh) / (3.6e6 × η_climb) with regenerative braking recovery on descents
- Payload energy delta: incremental mass scaling over nominal test payload
- Auxiliary HVAC: cabin thermal load based on ambient temperature delta from 22°C (omitted for open 2W/3W vehicles)
- Scenario uncertainty: physical parameter variations (headwind/speed +15%, thermal soak +25%, rolling resistance +10%)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union

log = logging.getLogger(__name__)

# Standard gravitational acceleration (m/s^2)
GRAVITY = 9.80665

# Reference standard driver mass included in homologated test weight (kg)
REFERENCE_DRIVER_KG = 75.0

# Mechanical-to-electrical efficiencies
DRIVETRAIN_EFFICIENCY = 0.88
REGEN_BRAKING_EFFICIENCY = 0.60

# Homologated curb weights (kg) for verified fleet vehicles
# Used for gravitational and payload calculations when mass is not in raw vehicle DB
OEM_CURB_WEIGHT_MAP: Dict[str, float] = {
    "tata-nexon-ev": 1400.0,      # Tata Nexon EV Long Range
    "ather-450x-gen3": 108.0,     # Ather 450X Gen 3 electric scooter
    "mahindra-treo-auto": 350.0,  # Mahindra Treo 3W Auto
    "tata-tiago-ev": 1150.0,      # Tata Tiago EV TechLux
    "porsche-taycan-gts": 2295.0, # Porsche Taycan GTS
}

# Vehicles with open cabins / no enclosed HVAC systems
NO_HVAC_VEHICLE_IDS = {"ather-450x-gen3", "mahindra-treo-auto"}


@dataclass
class VehicleParameters:
    """Core parameters needed for physics-based trip energy calculation."""
    vehicle_id: str
    make: str
    model: str
    battery_kwh: float
    usable_kwh: float
    efficiency_kwh100km: float
    curb_weight_kg: float
    has_cabin_hvac: bool = True
    max_dc_speed_kw: Optional[float] = None
    plug_type: str = "CCS2 Combo"


@dataclass
class TripInput:
    """Input parameters for a proposed journey."""
    distance_km: float
    start_battery_pct: float
    duration_mins: Optional[float] = None
    elevation_gain_m: float = 0.0
    payload_kg: float = REFERENCE_DRIVER_KG
    ambient_temp_c: float = 25.0
    hvac_mode: str = "normal"        # "off", "eco", "normal", "max"
    driving_style: str = "normal"    # "eco", "normal", "sport"
    reserve_buffer_pct: float = 15.0 # Desired safe reserve on arrival


@dataclass
class FactorBreakdown:
    """Explainable decomposition of energy consumption factors (in kWh)."""
    base_traction_kwh: float
    elevation_kwh: float
    payload_kwh: float
    hvac_kwh: float
    total_trip_kwh: float


@dataclass
class EnergyEstimationResult:
    """Complete, transparent output of the energy estimation engine."""
    vehicle_id: str
    nominal_energy_kwh: float
    energy_range_kwh: Tuple[float, float]     # (best_case, worst_case)
    nominal_arrival_soc_pct: float
    arrival_soc_range_pct: Tuple[float, float] # (worst_case_soc, best_case_soc)
    feasibility: str                          # "safe", "caution", "unreachable"
    feasibility_reason: str
    reserve_buffer_pct: float
    factor_breakdown: FactorBreakdown
    assumptions: Dict[str, Any]
    uncertainty_note: str


def resolve_vehicle_parameters(
    vehicle: Union[Dict[str, Any], VehicleParameters, str],
) -> VehicleParameters:
    """
    Resolves input into a validated VehicleParameters instance.
    Accepts:
    1. VehicleParameters instance directly.
    2. Dictionary matching driver_db vehicle format.
    3. Vehicle ID string matching verified seed fleet.
    """
    if isinstance(vehicle, VehicleParameters):
        return vehicle

    v_data: Dict[str, Any] = {}
    if isinstance(vehicle, str):
        # Look up from seed defaults in driver_db if available
        try:
            from backend.data.driver_db import DEFAULT_SEED_VEHICLES
            matched = next((v for v in DEFAULT_SEED_VEHICLES if v.get("id") == vehicle), None)
            if matched:
                v_data = matched.copy()
            else:
                raise ValueError(f"Vehicle ID '{vehicle}' not found in registered seed catalogue.")
        except ImportError:
            # Fallback direct lookup if driver_db is not directly importable
            if vehicle in OEM_CURB_WEIGHT_MAP:
                v_data = {
                    "id": vehicle,
                    "make": "Verified",
                    "model": vehicle,
                    "usable_kwh": 39.0 if "nexon" in vehicle else (3.24 if "ather" in vehicle else 7.0),
                    "battery_kwh": 40.5 if "nexon" in vehicle else (3.7 if "ather" in vehicle else 7.37),
                    "efficiency_kwh100km": 14.5 if "nexon" in vehicle else (2.8 if "ather" in vehicle else 5.4),
                    "max_dc_speed_kw": 30.0 if "nexon" in vehicle else (None if "ather" in vehicle else None),
                    "plug_type": "CCS2 Combo" if "nexon" in vehicle else ("Type 2" if "ather" in vehicle else "IEC 60309"),
                }
            else:
                raise ValueError(f"Unknown vehicle ID '{vehicle}'.")
    elif isinstance(vehicle, dict):
        v_data = vehicle.copy()
    else:
        raise TypeError(f"Invalid vehicle parameter type: {type(vehicle)}")

    def _get_first(data: Dict[str, Any], keys: List[str], default: float) -> float:
        for k in keys:
            if k in data and data[k] is not None:
                try:
                    return float(data[k])
                except (ValueError, TypeError):
                    pass
        return default

    v_id = str(v_data.get("id") or "custom-vehicle")
    usable = _get_first(
        v_data,
        ["usable_kwh", "usableKwh", "usable_battery_kwh", "usableBatteryKwh", "battery_kwh", "batteryKwh", "battery_capacity_kwh"],
        39.0,
    )
    total_b = _get_first(
        v_data,
        ["battery_kwh", "batteryKwh", "battery_capacity_kwh", "batteryCapacityKwh", "usable_kwh", "usableKwh"],
        usable,
    )
    eff_val = None
    for k in ["efficiency_kwh100km", "efficiencyKwh100km"]:
        if k in v_data and v_data[k] is not None:
            eff_val = float(v_data[k])
            break

    if eff_val is not None:
        eff = eff_val
    else:
        wh_km = None
        for k in ["base_consumption_wh_per_km", "baseConsumptionWhPerKm"]:
            if k in v_data and v_data[k] is not None:
                wh_km = float(v_data[k])
                break
        if wh_km is not None:
            eff = wh_km / 10.0
        else:
            eff = 15.0

    # Validate physical limits
    if usable <= 0 or usable > 250:
        raise ValueError(f"Invalid usable battery capacity: {usable} kWh. Must be between 0 and 250 kWh.")
    if eff <= 0 or eff > 60:
        raise ValueError(f"Invalid vehicle efficiency: {eff} kWh/100km. Must be between 0 and 60 kWh/100km.")

    curb_weight = float(
        v_data.get("curb_weight_kg")
        or OEM_CURB_WEIGHT_MAP.get(v_id)
        or (1400.0 if usable > 20 else (120.0 if usable < 5 else 380.0))
    )

    has_hvac = bool(v_id not in NO_HVAC_VEHICLE_IDS and v_data.get("has_cabin_hvac", True))

    return VehicleParameters(
        vehicle_id=v_id,
        make=str(v_data.get("make") or "Generic"),
        model=str(v_data.get("model") or "EV"),
        battery_kwh=total_b,
        usable_kwh=usable,
        efficiency_kwh100km=eff,
        curb_weight_kg=curb_weight,
        has_cabin_hvac=has_hvac,
        max_dc_speed_kw=v_data.get("max_dc_speed_kw") or v_data.get("maxDcSpeedKw"),
        plug_type=str(v_data.get("plug_type") or v_data.get("plugType") or "CCS2 Combo"),
    )


def estimate_trip_energy(
    vehicle: Union[Dict[str, Any], VehicleParameters, str],
    trip: TripInput,
) -> EnergyEstimationResult:
    """
    Computes a physically informed trip energy estimate and uncertainty bounds.
    """
    # ── 1. Input Validation ───────────────────────────────────────────────────
    v_params = resolve_vehicle_parameters(vehicle)

    if trip.distance_km <= 0:
        raise ValueError(f"Trip distance must be positive, got {trip.distance_km} km.")
    if trip.distance_km > 3000:
        raise ValueError(f"Trip distance {trip.distance_km} km exceeds reasonable single-trip planning limit (3000 km).")

    if trip.start_battery_pct < 0.0 or trip.start_battery_pct > 100.0:
        raise ValueError(f"Start battery percentage must be between 0 and 100%, got {trip.start_battery_pct}%.")

    if trip.payload_kg < 0 or trip.payload_kg > 1500:
        raise ValueError(f"Payload {trip.payload_kg} kg is invalid. Must be between 0 and 1500 kg.")

    if trip.reserve_buffer_pct < 0 or trip.reserve_buffer_pct > 50:
        raise ValueError(f"Reserve buffer must be between 0% and 50%, got {trip.reserve_buffer_pct}%.")

    # Estimate duration if omitted: assumes average 60 km/h mixed road speed
    duration_mins = trip.duration_mins
    if duration_mins is None or duration_mins <= 0:
        duration_mins = (trip.distance_km / 60.0) * 60.0

    # ── 2. Driving Style Multiplier ───────────────────────────────────────────
    style_mult = 1.0
    style_clean = (trip.driving_style or "normal").strip().lower()
    if style_clean == "eco":
        style_mult = 0.92
    elif style_clean == "sport":
        style_mult = 1.15

    # ── 3. Base Traction Energy ───────────────────────────────────────────────
    # Nominal certified consumption scaled by driving style
    base_kwh = trip.distance_km * (v_params.efficiency_kwh100km / 100.0) * style_mult

    # ── 4. Gravitational / Elevation Energy ────────────────────────────────────
    # Net elevation gain Δh in meters
    total_mass_kg = v_params.curb_weight_kg + trip.payload_kg
    delta_h = float(trip.elevation_gain_m or 0.0)
    elevation_kwh = 0.0

    if delta_h > 0:
        # Gravitational potential required for uphill climb (kWh)
        # E = (m * g * h) / (3.6e6 J/kWh) / η_drive
        elevation_kwh = (total_mass_kg * GRAVITY * delta_h) / (3.6e6 * DRIVETRAIN_EFFICIENCY)
    elif delta_h < 0:
        # Downhill descent: regenerative recovery (kWh recovered, negative demand)
        descent_potential = (total_mass_kg * GRAVITY * abs(delta_h)) / 3.6e6
        recovered_kwh = descent_potential * REGEN_BRAKING_EFFICIENCY
        # Limit regen benefit so it does not reduce base traction below 30% of flat baseline
        elevation_kwh = -min(recovered_kwh, base_kwh * 0.70)

    # ── 5. Payload Energy Delta ───────────────────────────────────────────────
    # Incremental rolling and inertial load relative to 75 kg reference driver
    # Rolling/inertial resistance constitutes ~35% of total highway energy
    mass_diff_kg = trip.payload_kg - REFERENCE_DRIVER_KG
    reference_total_mass = v_params.curb_weight_kg + REFERENCE_DRIVER_KG
    payload_ratio = mass_diff_kg / max(1.0, reference_total_mass)
    payload_kwh = base_kwh * 0.35 * payload_ratio
    # Do not allow massive negative payload savings if payload < 75kg
    if payload_kwh < 0:
        payload_kwh = max(payload_kwh, -base_kwh * 0.08)

    # ── 6. Auxiliary HVAC Energy ──────────────────────────────────────────────
    hvac_kwh = 0.0
    hvac_clean = (trip.hvac_mode or "normal").strip().lower()

    if v_params.has_cabin_hvac and hvac_clean != "off":
        temp_delta = abs(trip.ambient_temp_c - 22.0)
        base_hvac_kw = 1.4
        temp_slope = 0.05

        if hvac_clean == "eco":
            base_hvac_kw = 0.8
            temp_slope = 0.03
        elif hvac_clean == "max":
            base_hvac_kw = 2.2
            temp_slope = 0.08

        avg_hvac_kw = base_hvac_kw + (temp_slope * temp_delta)
        hvac_kwh = avg_hvac_kw * (duration_mins / 60.0)

    # ── 7. Total Nominal Trip Energy ──────────────────────────────────────────
    nominal_energy_kwh = max(0.05, base_kwh + elevation_kwh + payload_kwh + hvac_kwh)

    # ── 8. Scenario Uncertainty Bounds ────────────────────────────────────────
    # Best-case scenario:
    # - Smooth driving / mild tailwind (-10% traction)
    # - Mild cabin conditions (-20% HVAC)
    # - Optimal regeneration
    best_traction = base_kwh * 0.90
    best_elevation = elevation_kwh * (0.95 if elevation_kwh > 0 else 1.15)
    best_payload = payload_kwh * 0.90
    best_hvac = hvac_kwh * 0.80
    best_case_kwh = max(0.05, best_traction + best_elevation + best_payload + best_hvac)

    # Worst-case scenario:
    # - Headwind / highway overtaking (+15% traction)
    # - Extreme heat / thermal soak (+25% HVAC)
    # - Road congestion / frequent stop-and-go (+10% rolling & climbing)
    worst_traction = base_kwh * 1.15
    worst_elevation = elevation_kwh * (1.12 if elevation_kwh > 0 else 0.85)
    worst_payload = payload_kwh * 1.12
    worst_hvac = hvac_kwh * 1.25
    worst_case_kwh = max(best_case_kwh, worst_traction + worst_elevation + worst_payload + worst_hvac)

    # ── 9. Arrival Battery State of Charge (SoC) ──────────────────────────────
    start_kwh = v_params.usable_kwh * (trip.start_battery_pct / 100.0)

    nominal_arrival_kwh = start_kwh - nominal_energy_kwh
    worst_arrival_kwh = start_kwh - worst_case_kwh
    best_arrival_kwh = start_kwh - best_case_kwh

    nominal_soc_pct = max(0.0, min(100.0, (nominal_arrival_kwh / v_params.usable_kwh) * 100.0))
    worst_soc_pct = max(0.0, min(100.0, (worst_arrival_kwh / v_params.usable_kwh) * 100.0))
    best_soc_pct = max(0.0, min(100.0, (best_arrival_kwh / v_params.usable_kwh) * 100.0))

    # ── 10. Feasibility Classification ────────────────────────────────────────
    reserve = trip.reserve_buffer_pct

    if worst_soc_pct >= reserve:
        feasibility = "safe"
        feasibility_reason = (
            f"Expected arrival SoC is {nominal_soc_pct:.1f}% (range {worst_soc_pct:.1f}%–{best_soc_pct:.1f}%), "
            f"safely exceeding your {reserve:.0f}% buffer even under adverse driving conditions."
        )
    elif nominal_soc_pct >= reserve:
        feasibility = "caution"
        feasibility_reason = (
            f"Expected arrival SoC is {nominal_soc_pct:.1f}%, but adverse traffic or high HVAC loads could "
            f"deplete battery to {worst_soc_pct:.1f}%, below your {reserve:.0f}% safety buffer. A short charging stop is recommended."
        )
    else:
        feasibility = "unreachable"
        feasibility_reason = (
            f"Expected arrival SoC is {nominal_soc_pct:.1f}% (depleted below {reserve:.0f}% buffer). "
            f"This journey requires an intermediate charging stop to reach safely."
        )

    breakdown = FactorBreakdown(
        base_traction_kwh=round(base_kwh, 2),
        elevation_kwh=round(elevation_kwh, 2),
        payload_kwh=round(payload_kwh, 2),
        hvac_kwh=round(hvac_kwh, 2),
        total_trip_kwh=round(nominal_energy_kwh, 2),
    )

    assumptions = {
        "vehicle_curb_weight_kg": v_params.curb_weight_kg,
        "total_test_mass_kg": total_mass_kg,
        "drivetrain_efficiency": DRIVETRAIN_EFFICIENCY,
        "regen_efficiency": REGEN_BRAKING_EFFICIENCY,
        "ambient_temp_c": trip.ambient_temp_c,
        "hvac_mode": hvac_clean,
        "driving_style": style_clean,
        "has_cabin_hvac": v_params.has_cabin_hvac,
    }

    uncertainty_note = (
        "Scenario-based bounds derived from vehicle longitudinal dynamics. "
        "Range accounts for ±15% traction variation, ±25% thermal soak, and payload mass scaling. "
        "Not an empirical statistical probability."
    )

    return EnergyEstimationResult(
        vehicle_id=v_params.vehicle_id,
        nominal_energy_kwh=round(nominal_energy_kwh, 2),
        energy_range_kwh=(round(best_case_kwh, 2), round(worst_case_kwh, 2)),
        nominal_arrival_soc_pct=round(nominal_soc_pct, 1),
        arrival_soc_range_pct=(round(worst_soc_pct, 1), round(best_soc_pct, 1)),
        feasibility=feasibility,
        feasibility_reason=feasibility_reason,
        reserve_buffer_pct=reserve,
        factor_breakdown=breakdown,
        assumptions=assumptions,
        uncertainty_note=uncertainty_note,
    )
