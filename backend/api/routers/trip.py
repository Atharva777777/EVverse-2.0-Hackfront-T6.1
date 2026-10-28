"""
backend/api/routers/trip.py
===========================
REST Router for EVverse "Will I Make It?" Journey Feasibility & Charging Stops.

Orchestrates:
- Stage 1: Physics-based longitudinal energy consumption & scenario bounds (range_physics.py)
- Stage 2: Journey feasibility & risk verdict: SAFE | CAUTION | CHARGING_NEEDED (journey_risk.py)
- Stage 3: Reachable, compatible en-route charging-stop recommendations (charging_stop.py)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple, Union

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.api.services.charging_stop import (
    ChargingRecommendationResult,
    RecommendedStop,
    recommend_charging_stops,
)
from backend.api.services.journey_risk import (
    FeasibilityVerdict,
    JourneyFeasibilityResult,
    RiskFactor,
    evaluate_journey_feasibility,
)
from backend.api.services.range_physics import (
    EnergyEstimationResult,
    FactorBreakdown,
    TripInput,
    VehicleParameters,
    estimate_trip_energy,
    resolve_vehicle_parameters,
)

log = logging.getLogger(__name__)
router = APIRouter()


# ── Request & Response Schemas ────────────────────────────────────────────────

class WillIMakeItRequest(BaseModel):
    vehicle: Union[Dict[str, Any], str] = Field(
        description="Vehicle ID from verified catalogue (e.g. 'tata-nexon-ev') or custom vehicle dictionary"
    )
    distance_km: float = Field(gt=0, le=3000, description="Trip distance in km")
    start_battery_pct: float = Field(ge=0, le=100, default=70.0, description="Starting battery percentage")
    reserve_buffer_pct: float = Field(ge=0, le=50, default=15.0, description="Desired safe arrival reserve buffer %")
    elevation_gain_m: float = Field(default=0.0, description="Net elevation gain in meters")
    payload_kg: float = Field(default=75.0, ge=0, le=1500, description="Passenger and cargo weight in kg")
    ambient_temp_c: float = Field(default=25.0, ge=-20, le=60, description="Ambient temperature in °C")
    hvac_mode: str = Field(default="normal", description="HVAC mode: off, eco, normal, max")
    driving_style: str = Field(default="normal", description="Driving style: eco, normal, sport")
    duration_mins: Optional[float] = Field(default=None, gt=0, description="Estimated duration in minutes")
    origin_coords: Optional[Tuple[float, float]] = Field(default=None, description="(lat, lng) of origin")
    destination_coords: Optional[Tuple[float, float]] = Field(default=None, description="(lat, lng) of destination")
    candidate_stations: Optional[List[Dict[str, Any]]] = Field(default=None, description="Optional candidate stations list")
    city: Optional[str] = Field(default="Mumbai", description="City metropolitan area for corridor lookup")


class FactorBreakdownSchema(BaseModel):
    base_traction_kwh: float
    elevation_kwh: float
    payload_kwh: float
    hvac_kwh: float
    total_trip_kwh: float


class EnergyEstimationSchema(BaseModel):
    vehicle_id: str
    nominal_energy_kwh: float
    energy_range_kwh: Tuple[float, float]
    nominal_arrival_soc_pct: float
    arrival_soc_range_pct: Tuple[float, float]
    reserve_buffer_pct: float
    factor_breakdown: FactorBreakdownSchema
    assumptions: Dict[str, Any]
    uncertainty_note: str


class RiskFactorSchema(BaseModel):
    category: str
    severity: str
    impact_kwh: float
    description: str


class FeasibilitySchema(BaseModel):
    verdict: str  # SAFE, CAUTION, CHARGING_NEEDED
    nominal_arrival_soc_pct: float
    arrival_soc_range_pct: Tuple[float, float]
    nominal_energy_kwh: float
    energy_range_kwh: Tuple[float, float]
    usable_capacity_kwh: float
    starting_soc_pct: float
    reserve_buffer_pct: float
    reasons: List[str]
    risk_factors: List[RiskFactorSchema]
    depletion_distance_km: Optional[float] = None
    recommended_min_departure_soc_pct: Optional[float] = None
    energy_deficit_kwh: float = 0.0
    mitigation_advice: List[str] = Field(default_factory=list)


class RecommendedStopSchema(BaseModel):
    station_id: str
    name: str
    latitude: float
    longitude: float
    address: Optional[str] = None
    operator: Optional[str] = None
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
    is_primary: bool
    is_backup: bool
    status_note: Optional[str] = None
    recent_reports: List[Dict[str, Any]] = Field(default_factory=list)


class ChargingRecommendationSchema(BaseModel):
    charging_needed: bool
    stations_evaluated: int
    recommendations: List[RecommendedStopSchema]
    primary_stop: Optional[RecommendedStopSchema] = None
    backup_stop: Optional[RecommendedStopSchema] = None
    rejection_summary: Dict[str, int]
    summary_message: str
    limitations: List[str]


class WillIMakeItResponse(BaseModel):
    energy: EnergyEstimationSchema
    feasibility: FeasibilitySchema
    charging: ChargingRecommendationSchema


# ── Endpoint Implementation ───────────────────────────────────────────────────

@router.post(
    "/will-i-make-it",
    response_model=WillIMakeItResponse,
    summary="Evaluate EV trip feasibility, energy demand, and charging stops",
    description=(
        "Orchestrates EVverse Stage 1 (range physics), Stage 2 (journey feasibility and risk), "
        "and Stage 3 (reachable, connector-compatible charging stop recommendations)."
    ),
)
async def evaluate_will_i_make_it(payload: WillIMakeItRequest) -> WillIMakeItResponse:
    try:
        v_params = resolve_vehicle_parameters(payload.vehicle)
    except (ValueError, TypeError) as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Vehicle specification error: {str(err)}",
        )

    trip_input = TripInput(
        distance_km=payload.distance_km,
        start_battery_pct=payload.start_battery_pct,
        duration_mins=payload.duration_mins,
        elevation_gain_m=payload.elevation_gain_m,
        payload_kg=payload.payload_kg,
        ambient_temp_c=payload.ambient_temp_c,
        hvac_mode=payload.hvac_mode,
        driving_style=payload.driving_style,
        reserve_buffer_pct=payload.reserve_buffer_pct,
    )

    try:
        # Stage 1: Physics Energy Estimation
        energy_res = estimate_trip_energy(v_params, trip_input)

        # Stage 2: Feasibility & Risk Assessment
        feasibility_res = evaluate_journey_feasibility(v_params, trip_input, energy_result=energy_res)

        # Stage 3: Charging-Stop Recommendations
        charging_res = recommend_charging_stops(
            vehicle=v_params,
            trip=trip_input,
            origin_coords=payload.origin_coords,
            destination_coords=payload.destination_coords,
            candidate_stations=payload.candidate_stations,
            city=payload.city,
            feasibility_result=feasibility_res,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )
    except Exception as exc:
        log.exception("Unexpected error in will-i-make-it orchestration: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Trip planning computation failed. Check server logs.",
        )

    # Transform Stage 1 Energy
    energy_schema = EnergyEstimationSchema(
        vehicle_id=energy_res.vehicle_id,
        nominal_energy_kwh=energy_res.nominal_energy_kwh,
        energy_range_kwh=energy_res.energy_range_kwh,
        nominal_arrival_soc_pct=energy_res.nominal_arrival_soc_pct,
        arrival_soc_range_pct=energy_res.arrival_soc_range_pct,
        reserve_buffer_pct=energy_res.reserve_buffer_pct,
        factor_breakdown=FactorBreakdownSchema(
            base_traction_kwh=energy_res.factor_breakdown.base_traction_kwh,
            elevation_kwh=energy_res.factor_breakdown.elevation_kwh,
            payload_kwh=energy_res.factor_breakdown.payload_kwh,
            hvac_kwh=energy_res.factor_breakdown.hvac_kwh,
            total_trip_kwh=energy_res.factor_breakdown.total_trip_kwh,
        ),
        assumptions=energy_res.assumptions,
        uncertainty_note=energy_res.uncertainty_note,
    )

    # Transform Stage 2 Feasibility
    feasibility_schema = FeasibilitySchema(
        verdict=feasibility_res.verdict.value,
        nominal_arrival_soc_pct=feasibility_res.nominal_arrival_soc_pct,
        arrival_soc_range_pct=feasibility_res.arrival_soc_range_pct,
        nominal_energy_kwh=feasibility_res.nominal_energy_kwh,
        energy_range_kwh=feasibility_res.energy_range_kwh,
        usable_capacity_kwh=feasibility_res.usable_capacity_kwh,
        starting_soc_pct=feasibility_res.starting_soc_pct,
        reserve_buffer_pct=feasibility_res.reserve_buffer_pct,
        reasons=feasibility_res.reasons,
        risk_factors=[
            RiskFactorSchema(
                category=rf.category,
                severity=rf.severity,
                impact_kwh=rf.impact_kwh,
                description=rf.description,
            )
            for rf in feasibility_res.risk_factors
        ],
        depletion_distance_km=feasibility_res.depletion_distance_km,
        recommended_min_departure_soc_pct=feasibility_res.recommended_min_departure_soc_pct,
        energy_deficit_kwh=feasibility_res.energy_deficit_kwh,
        mitigation_advice=feasibility_res.mitigation_advice,
    )

    # Transform Stage 3 Charging Stops
    def _map_stop(stop: Optional[RecommendedStop]) -> Optional[RecommendedStopSchema]:
        if stop is None:
            return None
        return RecommendedStopSchema(
            station_id=stop.station_id,
            name=stop.name,
            latitude=stop.latitude,
            longitude=stop.longitude,
            address=stop.address,
            operator=stop.operator,
            status=stop.status,
            is_operational=stop.is_operational,
            power_kw=stop.power_kw,
            connector_types=stop.connector_types,
            matched_connectors=stop.matched_connectors,
            distance_from_origin_km=stop.distance_from_origin_km,
            distance_along_route_km=stop.distance_along_route_km,
            detour_km=stop.detour_km,
            detour_mins=stop.detour_mins,
            arrival_soc_pct=stop.arrival_soc_pct,
            arrival_energy_kwh=stop.arrival_energy_kwh,
            required_charge_kwh=stop.required_charge_kwh,
            target_departure_soc_pct=stop.target_departure_soc_pct,
            estimated_charge_mins=stop.estimated_charge_mins,
            effective_charging_kw=stop.effective_charging_kw,
            qualification_reason=stop.qualification_reason,
            is_primary=stop.is_primary,
            is_backup=stop.is_backup,
            status_note=stop.status_note,
            recent_reports=stop.recent_reports,
        )

    recommendations_list = [_map_stop(s) for s in charging_res.recommendations if s is not None]

    charging_schema = ChargingRecommendationSchema(
        charging_needed=charging_res.charging_needed,
        stations_evaluated=charging_res.stations_evaluated,
        recommendations=recommendations_list,
        primary_stop=_map_stop(charging_res.primary_stop),
        backup_stop=_map_stop(charging_res.backup_stop),
        rejection_summary=charging_res.rejection_summary,
        summary_message=charging_res.summary_message,
        limitations=charging_res.limitations,
    )

    return WillIMakeItResponse(
        energy=energy_schema,
        feasibility=feasibility_schema,
        charging=charging_schema,
    )
