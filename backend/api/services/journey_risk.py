"""
backend/api/services/journey_risk.py
====================================
Journey Feasibility & Risk Evaluation Engine (EVverse Stage 2: "Will I Make It?").

Evaluates whether an electric vehicle can complete a proposed journey given:
- Starting State of Charge (SoC %)
- Predicted physical energy consumption range (from range_physics.py)
- Required arrival reserve buffer (SoC %)

Verdict States:
- SAFE: Vehicle arrives with at least the full reserve buffer even under worst-case adverse conditions.
- CAUTION: Vehicle arrives with reserve buffer under nominal conditions, but adverse conditions
  (traffic, headwinds, extreme temperatures, aggressive driving) cross below the reserve threshold.
- CHARGING_NEEDED: Vehicle cannot reach destination with the required reserve buffer under nominal
  conditions, or battery depletes before arrival.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union

from backend.api.services.range_physics import (
    EnergyEstimationResult,
    TripInput,
    VehicleParameters,
    estimate_trip_energy,
    resolve_vehicle_parameters,
)

log = logging.getLogger(__name__)


class FeasibilityVerdict(str, Enum):
    SAFE = "SAFE"
    CAUTION = "CAUTION"
    CHARGING_NEEDED = "CHARGING_NEEDED"


@dataclass
class RiskFactor:
    """Individual risk factor contributing to trip energy consumption or uncertainty."""
    category: str        # "elevation", "hvac", "payload", "driving_style", "battery_headroom", "uncertainty_spread"
    severity: str        # "low", "medium", "high"
    impact_kwh: float
    description: str


@dataclass
class JourneyFeasibilityResult:
    """Comprehensive evaluation of trip feasibility, uncertainty, and risk."""
    verdict: FeasibilityVerdict
    nominal_arrival_soc_pct: float
    arrival_soc_range_pct: Tuple[float, float]   # (worst_case_soc, best_case_soc)
    nominal_energy_kwh: float
    energy_range_kwh: Tuple[float, float]        # (best_case_kwh, worst_case_kwh)
    usable_capacity_kwh: float
    starting_soc_pct: float
    reserve_buffer_pct: float
    reasons: List[str]
    risk_factors: List[RiskFactor]
    depletion_distance_km: Optional[float] = None
    recommended_min_departure_soc_pct: Optional[float] = None
    energy_deficit_kwh: float = 0.0
    mitigation_advice: List[str] = field(default_factory=list)
    energy_result: Optional[EnergyEstimationResult] = None


def evaluate_journey_feasibility(
    vehicle: Union[Dict[str, Any], VehicleParameters, str],
    trip: TripInput,
    energy_result: Optional[EnergyEstimationResult] = None,
) -> JourneyFeasibilityResult:
    """
    Evaluates trip feasibility, identifies risk factors, and assigns a SAFE,
    CAUTION, or CHARGING_NEEDED verdict with transparent reasoning.
    """
    v_params = resolve_vehicle_parameters(vehicle)
    e_res = energy_result or estimate_trip_energy(v_params, trip)

    usable_kwh = v_params.usable_kwh
    start_soc = trip.start_battery_pct
    start_kwh = usable_kwh * (start_soc / 100.0)
    reserve_pct = trip.reserve_buffer_pct
    reserve_kwh = usable_kwh * (reserve_pct / 100.0)

    nominal_energy = e_res.nominal_energy_kwh
    best_energy, worst_energy = e_res.energy_range_kwh

    nominal_arrival_kwh = start_kwh - nominal_energy
    worst_arrival_kwh = start_kwh - worst_energy
    best_arrival_kwh = start_kwh - best_energy

    nominal_soc = max(0.0, min(100.0, (nominal_arrival_kwh / usable_kwh) * 100.0))
    worst_soc = max(0.0, min(100.0, (worst_arrival_kwh / usable_kwh) * 100.0))
    best_soc = max(0.0, min(100.0, (best_arrival_kwh / usable_kwh) * 100.0))

    reasons: List[str] = []
    risk_factors: List[RiskFactor] = []
    mitigations: List[str] = []

    depletion_km: Optional[float] = None
    energy_deficit = 0.0

    # ── 1. Identify Physical Risk Factors ─────────────────────────────────────
    breakdown = e_res.factor_breakdown

    # Elevation risk
    if breakdown.elevation_kwh > 0.8 or trip.elevation_gain_m >= 200.0:
        pct_of_total = (breakdown.elevation_kwh / max(0.01, nominal_energy)) * 100.0
        severity = "high" if pct_of_total > 20.0 else "medium"
        risk_factors.append(RiskFactor(
            category="elevation",
            severity=severity,
            impact_kwh=breakdown.elevation_kwh,
            description=f"Climbing {trip.elevation_gain_m:.0f} m requires {breakdown.elevation_kwh:.2f} kWh ({pct_of_total:.1f}% of trip energy).",
        ))

    # HVAC thermal risk
    if breakdown.hvac_kwh > 1.8 or trip.ambient_temp_c >= 35.0 or trip.ambient_temp_c <= 10.0:
        pct_of_total = (breakdown.hvac_kwh / max(0.01, nominal_energy)) * 100.0
        severity = "high" if pct_of_total > 20.0 else "medium"
        risk_factors.append(RiskFactor(
            category="hvac",
            severity=severity,
            impact_kwh=breakdown.hvac_kwh,
            description=f"Cabin climate control under {trip.ambient_temp_c:.0f}°C ambient draws {breakdown.hvac_kwh:.2f} kWh ({pct_of_total:.1f}% of trip energy).",
        ))
        mitigations.append("Setting cabin climate to Eco or adjusting setpoint closer to ambient reduces auxiliary draw.")

    # Payload risk
    if breakdown.payload_kwh > 0.5 or trip.payload_kg >= 250.0:
        severity = "high" if trip.payload_kg >= 400.0 else "medium"
        risk_factors.append(RiskFactor(
            category="payload",
            severity=severity,
            impact_kwh=breakdown.payload_kwh,
            description=f"Vehicle payload of {trip.payload_kg:.0f} kg adds {breakdown.payload_kwh:.2f} kWh rolling/inertial demand.",
        ))

    # Driving style risk
    clean_style = (trip.driving_style or "normal").strip().lower()
    if clean_style == "sport":
        style_extra = breakdown.base_traction_kwh * (0.15 / 1.15)
        risk_factors.append(RiskFactor(
            category="driving_style",
            severity="medium",
            impact_kwh=round(style_extra, 2),
            description="Sport driving style increases aerodynamic and acceleration energy by approximately 15%.",
        ))
        mitigations.append("Switching driving style from Sport to Eco can save up to 15% traction energy.")

    # High energy demand relative to battery capacity
    demand_ratio = nominal_energy / max(0.01, usable_kwh)
    if demand_ratio >= 0.70:
        severity = "high" if demand_ratio >= 0.90 else "medium"
        risk_factors.append(RiskFactor(
            category="battery_headroom",
            severity=severity,
            impact_kwh=nominal_energy,
            description=f"Trip demands {nominal_energy:.1f} kWh ({demand_ratio * 100.0:.0f}% of total usable battery capacity {usable_kwh:.1f} kWh).",
        ))

    import math

    # Floating-point tolerance threshold (0.1 Wh) to prevent precision jitter at exact boundaries
    EPSILON = 1e-4

    # ── 2. Verdict Determination ──────────────────────────────────────────────
    if nominal_arrival_kwh < reserve_kwh - EPSILON:
        # CHARGING_NEEDED: Cannot arrive with requested buffer under nominal conditions
        verdict = FeasibilityVerdict.CHARGING_NEEDED

        if nominal_arrival_kwh <= 0.0:
            # Complete battery exhaustion before arrival (strictly clamped to [0.0, distance_km])
            raw_depletion = (start_kwh / max(0.01, nominal_energy)) * trip.distance_km
            depletion_km = max(0.0, min(trip.distance_km, round(raw_depletion, 1)))
            energy_deficit = round(nominal_energy + reserve_kwh - start_kwh, 2)
            reasons.append(
                f"Battery will be fully depleted before reaching the destination (projected exhaustion at km {depletion_km} of {trip.distance_km:.0f} km)."
            )
            reasons.append(
                f"Trip requires {nominal_energy:.2f} kWh, but current {start_soc:.1f}% charge provides only {start_kwh:.2f} kWh."
            )
        else:
            # Arrives, but below required safety reserve buffer
            energy_deficit = round(reserve_kwh - nominal_arrival_kwh, 2)
            reasons.append(
                f"Expected arrival SoC is {nominal_soc:.1f}%, which falls below your required {reserve_pct:.0f}% safety buffer ({reserve_kwh:.1f} kWh)."
            )
            reasons.append(
                f"Energy deficit to safely meet reserve buffer is {energy_deficit:.2f} kWh."
            )

        mitigations.append("An intermediate charging stop is required to complete this journey safely.")

    elif worst_arrival_kwh < reserve_kwh - EPSILON:
        # CAUTION: Nominal arrives above buffer, but worst-case drops into or below buffer
        verdict = FeasibilityVerdict.CAUTION

        if worst_arrival_kwh <= 0.0:
            raw_worst_depletion = (start_kwh / max(0.01, worst_energy)) * trip.distance_km
            worst_depletion_km = max(0.0, min(trip.distance_km, round(raw_worst_depletion, 1)))
            reasons.append(
                f"Expected arrival SoC is {nominal_soc:.1f}%, but adverse conditions (headwind, traffic, severe thermal soak) could exhaust the battery around km {worst_depletion_km}."
            )
            energy_deficit = round(reserve_kwh - worst_arrival_kwh, 2)
        else:
            buffer_drop_pct = round(reserve_pct - worst_soc, 1)
            if buffer_drop_pct > 0.0:
                reasons.append(
                    f"Expected arrival SoC is {nominal_soc:.1f}%, but adverse driving conditions can deplete the battery to {worst_soc:.1f}%, crossing {buffer_drop_pct:.1f}% below your {reserve_pct:.0f}% buffer."
                )
            else:
                reasons.append(
                    f"Expected arrival SoC is {nominal_soc:.1f}%, but adverse driving conditions can deplete the battery to {worst_soc:.1f}%, reaching your {reserve_pct:.0f}% reserve safety margin."
                )
            energy_deficit = round(reserve_kwh - worst_arrival_kwh, 2)

        risk_factors.append(RiskFactor(
            category="uncertainty_spread",
            severity="medium",
            impact_kwh=round(worst_energy - nominal_energy, 2),
            description=f"Environmental and traffic uncertainty spans {worst_energy - best_energy:.2f} kWh (arrival SoC {worst_soc:.1f}% to {best_soc:.1f}%).",
        ))

        mitigations.append("A brief charging top-up is recommended to guard against adverse driving conditions.")

    else:
        # SAFE: Even worst-case arrival SoC remains at or above the reserve buffer
        verdict = FeasibilityVerdict.SAFE
        reasons.append(
            f"Trip is feasible with safe margin. Expected arrival SoC is {nominal_soc:.1f}% (range {worst_soc:.1f}%–{best_soc:.1f}%)."
        )
        reasons.append(
            f"Arrival battery remains at or above your {reserve_pct:.0f}% safety buffer even under adverse weather and traffic conditions."
        )

    # ── 3. Recommended Departure SoC ──────────────────────────────────────────
    # Minimum starting SoC needed to complete trip with reserve buffer under nominal and worst cases.
    # Uses ceiling to 1 decimal place so that departing with recommended SoC strictly guarantees
    # meeting or exceeding the required reserve buffer.
    nominal_needed_kwh = nominal_energy + reserve_kwh
    worst_needed_kwh = worst_energy + reserve_kwh

    def _ceil_soc(val_pct: float) -> float:
        return math.ceil(val_pct * 10.0) / 10.0

    recommended_departure_soc: Optional[float] = None
    if worst_needed_kwh <= usable_kwh:
        recommended_departure_soc = _ceil_soc((worst_needed_kwh / max(0.01, usable_kwh)) * 100.0)
    elif nominal_needed_kwh <= usable_kwh:
        recommended_departure_soc = _ceil_soc((nominal_needed_kwh / max(0.01, usable_kwh)) * 100.0)
    else:
        # Trip exceeds single-charge vehicle capacity regardless of starting battery
        recommended_departure_soc = None
        reasons.append(
            f"Trip demand ({nominal_needed_kwh:.1f} kWh with buffer) exceeds vehicle full usable battery capacity ({usable_kwh:.1f} kWh). Journey requires multi-leg charging."
        )

    return JourneyFeasibilityResult(
        verdict=verdict,
        nominal_arrival_soc_pct=round(nominal_soc, 1),
        arrival_soc_range_pct=(round(worst_soc, 1), round(best_soc, 1)),
        nominal_energy_kwh=round(nominal_energy, 2),
        energy_range_kwh=(round(best_energy, 2), round(worst_energy, 2)),
        usable_capacity_kwh=usable_kwh,
        starting_soc_pct=start_soc,
        reserve_buffer_pct=reserve_pct,
        reasons=reasons,
        risk_factors=risk_factors,
        depletion_distance_km=depletion_km,
        recommended_min_departure_soc_pct=recommended_departure_soc,
        energy_deficit_kwh=round(energy_deficit, 2),
        mitigation_advice=mitigations,
        energy_result=e_res,
    )
