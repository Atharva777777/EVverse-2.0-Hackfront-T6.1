declare global {
  interface Window {
    ethereum?: any;
  }
}

/**
 * TypeScript types mirroring the FastAPI OptimizeResponse schema exactly.
 * Field names match the backend Pydantic models 1:1.
 * Zone labels (Z0–Z7) are never hardcoded — they come from the API.
 */

// ── Request ─────────────────────────────────────────────────────────────────

export type PlanningScenario =
  | "all_hours"
  | "morning_peak"
  | "afternoon"
  | "overnight"
  | "weekday"
  | "weekend";

export interface OptimizeRequest {
  city?: string;
  station_count?: number; // 1-8
  scenario?: PlanningScenario;
  reps?: number;   // 1–5, default 1
  shots?: number;  // 128–16384, default 2048
  seed?: number;   // ≥ 0, default 42
}

// ── Sub-models ───────────────────────────────────────────────────────────────

export interface ZoneDetail {
  label: string;
  tazid: number;
  name_primary?: string;
  name_secondary?: string;
  longitude: number;
  latitude: number;
  predicted_demand_kwh_h: number;
  qubo_c_value: number;
  selected: boolean;
  self_demand_score: number;
  proximity_spillover_score: number;
  coverage_neighbors_count: number;
  infrastructure_gap_score?: number;
  predicted_cost_usd?: number;
  predicted_roi_years?: number;
  annual_revenue_usd?: number;
  key_reason?: string;
  has_existing_station?: boolean;
  existing_station_count?: number;
  existing_station_desc?: string;
}

export interface RecommendedLocation extends ZoneDetail {
  rank: number;
}

export interface RecommendationResponse {
  selected_zones: string[];
  recommended_locations?: RecommendedLocation[];
  city?: string;
  country?: string;
  scenario?: string;
  method: string;
  qubo_energy: number;
  feasible: boolean;
  n_stations: number;
  matches_qubo_optimum: boolean;
  predicted_demand: Record<string, number>;
  total_candidate_demand_kwh_h: number;
  total_predicted_cost_usd?: number;
  total_annual_revenue_usd?: number;
  average_roi_years?: number;
  zone_details: ZoneDetail[];
}

export interface AIDemandResponse {
  model: string;
  scenario?: string;
  test_r2: number | null;
  test_mae: number | null;
  test_split_start: string;
  test_split_end: string;
  prediction_time_ms: number;
  predicted_demand: Record<string, number>;
}

export interface QUBOResponse {
  n_qubits: number;
  budget_k: number;
  lambda: number;
  c_values: Record<string, number>;
  global_minimum_energy: number;
}

export interface SampleEntry {
  bitstring: string;
  probability: number;
  qubo_energy: number;
  n_stations: number;
  feasible: boolean;
  zones: string[];
}

export interface ClassicalResult {
  method: string;
  selected_zones: string[];
  objective_value: number;
  qubo_energy: number;
  feasible: boolean;
  n_stations: number;
  covered_demand_kwh_h: number;
  coverage_pct: number;
  runtime_s: number;
}

export interface QAOAResult {
  method: string;
  reps: number;
  seed: number;
  shots: number;
  selected_zones: string[];
  best_bitstring: string;
  qubo_energy: number;
  objective_value: number;
  feasible: boolean;
  n_stations: number;
  success_probability: number;
  circuit_depth: number;
  n_qubits: number;
  runtime_s: number;
  eigenvalue: number | null;
  optimal_parameters: number[];
  top10_samples: SampleEntry[];
  matches_qubo_optimum: boolean;
  energy_gap: number;
}

// ── Top-level response ───────────────────────────────────────────────────────

export interface OptimizeResponse {
  pipeline_runtime_s: number;
  demand_prediction: AIDemandResponse;
  qubo: QUBOResponse;
  classical: ClassicalResult;
  qaoa?: QAOAResult;
  qaoa_status?: string;
  recommendation: RecommendationResponse;
}

// ── API error shape ──────────────────────────────────────────────────────────

export interface ApiError {
  detail: string;
}

// ── UI state ─────────────────────────────────────────────────────────────────

export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

// ── Live Data Enrichment ─────────────────────────────────────────────────────

export interface LiveStation {
  station_id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  operator?: string | null;
  status: string;
  is_operational: boolean;
  power_kw?: number | null;
  bays: number;
  connector_types: string[];
  usage_cost?: string | null;
  source: "open_charge_map" | "kaggle_baseline";
  last_status_update?: string | null;
}

export interface LiveDataResponse {
  city: string;
  is_live: boolean;
  source: "open_charge_map" | "kaggle_baseline";
  status_message: string;
  live_station_count: number;
  last_updated: string;
  stations: LiveStation[];
  fallback_reason?: string | null;
}

// ── Driver Backend Types ─────────────────────────────────────────────────────

export interface DriverSession {
  driver_id: string;
  token: string;
  name: string;
  created_at: string;
}

export interface DriverVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  image?: string;
  battery_kwh: number;
  usable_kwh: number;
  current_battery_pct: number;
  wltp_range_km: number;
  efficiency_kwh100km: number;
  max_dc_speed_kw: number;
  max_ac_speed_kw: number;
  plug_type: string;
  plug_image?: string;
  vin?: string;
  soh_pct: number;
  is_active: boolean;
}

export interface DriverPreferences {
  driver_id: string;
  active_vehicle_id: string;
  auto_compatibility: boolean;
  default_city: string;
}

export interface DriverFavouritesResponse {
  station_ids: string[];
  total: number;
  page: number;
  limit: number;
}

export interface StationReportInput {
  station_id: string;
  category: string;
  connector_type?: string;
  notes?: string;
}

export interface StationReportItem {
  id: string;
  driver_id: string;
  station_id: string;
  category: string;
  connector_type?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface ChargingSessionInput {
  station_id: string;
  station_name: string;
  kwh_delivered: number;
  duration_seconds: number;
  cost: number;
  max_power_kw: number;
}

export interface ChargingSessionItem {
  id: string;
  driver_id: string;
  station_id: string;
  station_name: string;
  kwh_delivered: number;
  duration_seconds: number;
  cost: number;
  max_power_kw: number;
  created_at: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ── "Will I Make It?" Trip Feasibility & Charging Stop Types ─────────────────

export type DrivingStyle = "eco" | "normal" | "sport";
export type HvacMode = "off" | "eco" | "normal" | "max";
export type FeasibilityVerdict = "SAFE" | "CAUTION" | "CHARGING_NEEDED";

export interface CandidateStationInput {
  station_id: string;
  name: string;
  latitude: number;
  longitude: number;
  power_kw?: number;
  connector_types?: string[];
  status?: string;
  is_operational?: boolean;
  operator?: string;
  address?: string;
  distance_from_origin_km?: number;
}

export interface WillIMakeItRequest {
  vehicle:
    | string
    | {
        id?: string;
        make?: string;
        model?: string;
        usable_kwh?: number;
        usableKwh?: number;
        battery_kwh?: number;
        batteryKwh?: number;
        battery_capacity_kwh?: number;
        efficiency_kwh100km?: number;
        efficiencyKwh100km?: number;
        base_consumption_wh_per_km?: number;
        max_dc_speed_kw?: number;
        maxDcSpeedKw?: number;
        plug_type?: string;
        plugType?: string;
        connector_types?: string[];
        curb_weight_kg?: number;
        has_cabin_hvac?: boolean;
      };
  distance_km: number;
  start_battery_pct: number;
  reserve_buffer_pct?: number;
  elevation_gain_m?: number;
  payload_kg?: number;
  ambient_temp_c?: number;
  hvac_mode?: HvacMode | string;
  driving_style?: DrivingStyle | string;
  duration_mins?: number;
  origin_coords?: [number, number];
  destination_coords?: [number, number];
  candidate_stations?: CandidateStationInput[];
  city?: string;
}

export interface FactorBreakdown {
  base_traction_kwh: number;
  elevation_kwh: number;
  payload_kwh: number;
  hvac_kwh: number;
  total_trip_kwh: number;
}

export interface EnergyEstimation {
  vehicle_id: string;
  nominal_energy_kwh: number;
  energy_range_kwh: [number, number];
  nominal_arrival_soc_pct: number;
  arrival_soc_range_pct: [number, number]; // [worst_soc, best_soc]
  reserve_buffer_pct: number;
  factor_breakdown: FactorBreakdown;
  assumptions: Record<string, unknown>;
  uncertainty_note: string;
}

export interface RiskFactor {
  category: string;
  severity: "low" | "medium" | "high" | "critical" | string;
  impact_kwh: number;
  description: string;
}

export interface JourneyFeasibility {
  verdict: FeasibilityVerdict;
  nominal_arrival_soc_pct: number;
  arrival_soc_range_pct: [number, number];
  nominal_energy_kwh: number;
  energy_range_kwh: [number, number];
  usable_capacity_kwh: number;
  starting_soc_pct: number;
  reserve_buffer_pct: number;
  reasons: string[];
  risk_factors: RiskFactor[];
  depletion_distance_km?: number | null;
  recommended_min_departure_soc_pct?: number | null;
  energy_deficit_kwh: number;
  mitigation_advice: string[];
}

export interface RecommendedStop {
  station_id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  operator?: string | null;
  status: string;
  is_operational: boolean;
  power_kw: number;
  connector_types: string[];
  matched_connectors: string[];
  distance_from_origin_km: number;
  distance_along_route_km: number;
  detour_km: number;
  detour_mins: number;
  arrival_soc_pct: number;
  arrival_energy_kwh: number;
  required_charge_kwh: number;
  target_departure_soc_pct: number;
  estimated_charge_mins: number;
  effective_charging_kw: number;
  qualification_reason: string;
  is_primary: boolean;
  is_backup: boolean;
  status_note?: string | null;
  recent_reports?: Array<{
    category: string;
    connector_type?: string | null;
    notes?: string | null;
    created_at: string;
  }> | null;
}

export interface ChargingRecommendation {
  charging_needed: boolean;
  stations_evaluated: number;
  recommendations: RecommendedStop[];
  primary_stop?: RecommendedStop | null;
  backup_stop?: RecommendedStop | null;
  rejection_summary: Record<string, number>;
  summary_message: string;
  limitations: string[];
}

export interface WillIMakeItResponse {
  energy: EnergyEstimation;
  feasibility: JourneyFeasibility;
  charging: ChargingRecommendation;
}

