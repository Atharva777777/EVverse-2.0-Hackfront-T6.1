import type { OptimizeResponse, LiveDataResponse } from "@/types/api";

export function getMockOptimizeData(
  city: string = "Mumbai",
  stationCount: number = 3
): OptimizeResponse {
  const cityConfigs: Record<
    string,
    {
      country: string;
      lat: number;
      lng: number;
      zones: Array<{
        label: string;
        name: string;
        lat: number;
        lng: number;
        demand: number;
        qubo: number;
        cost: number;
        roi: number;
        rev: number;
        amenity: { restaurants: number; hotels: number; retail: number };
      }>;
    }
  > = {
    Mumbai: {
      country: "India",
      lat: 19.076,
      lng: 72.8777,
      zones: [
        { label: "Z0", name: "Bandra Kurla Complex (BKC)", lat: 19.0667, lng: 72.8688, demand: 840, qubo: 0.94, cost: 240000, roi: 2.1, rev: 114000, amenity: { restaurants: 48, hotels: 8, retail: 34 } },
        { label: "Z1", name: "Andheri East MIDC Hub", lat: 19.1197, lng: 72.8689, demand: 720, qubo: 0.88, cost: 210000, roi: 2.4, rev: 87500, amenity: { restaurants: 32, hotels: 6, retail: 20 } },
        { label: "Z2", name: "Lower Parel Commercial Plaza", lat: 18.9986, lng: 72.8311, demand: 690, qubo: 0.85, cost: 230000, roi: 2.6, rev: 88000, amenity: { restaurants: 42, hotels: 5, retail: 29 } },
        { label: "Z3", name: "Navi Mumbai Vashi Terminal", lat: 19.0771, lng: 72.9986, demand: 580, qubo: 0.79, cost: 180000, roi: 2.8, rev: 64000, amenity: { restaurants: 22, hotels: 3, retail: 18 } },
        { label: "Z4", name: "Goregaon Western Express Corridor", lat: 19.1663, lng: 72.8526, demand: 540, qubo: 0.74, cost: 195000, roi: 3.1, rev: 62000, amenity: { restaurants: 26, hotels: 4, retail: 15 } },
        { label: "Z5", name: "Powai Hiranandani Tech Zone", lat: 19.1176, lng: 72.906, demand: 510, qubo: 0.71, cost: 190000, roi: 3.2, rev: 59000, amenity: { restaurants: 35, hotels: 4, retail: 24 } },
      ],
    },
    "San Francisco": {
      country: "United States",
      lat: 37.7749,
      lng: -122.4194,
      zones: [
        { label: "Z0", name: "SoMa 4th & Mission Mobility Plaza", lat: 37.7852, lng: -122.4035, demand: 920, qubo: 0.96, cost: 320000, roi: 1.9, rev: 168000, amenity: { restaurants: 64, hotels: 14, retail: 45 } },
        { label: "Z1", name: "Financial District Embarcadero", lat: 37.7946, lng: -122.3999, demand: 810, qubo: 0.89, cost: 340000, roi: 2.3, rev: 147000, amenity: { restaurants: 58, hotels: 12, retail: 38 } },
        { label: "Z2", name: "Mission District 16th St Transit Hub", lat: 37.765, lng: -122.4197, demand: 740, qubo: 0.86, cost: 260000, roi: 2.2, rev: 118000, amenity: { restaurants: 49, hotels: 4, retail: 30 } },
        { label: "Z3", name: "Marina Lombard Commuter Corridor", lat: 37.8003, lng: -122.4365, demand: 610, qubo: 0.78, cost: 280000, roi: 2.9, rev: 96000, amenity: { restaurants: 36, hotels: 7, retail: 22 } },
        { label: "Z4", name: "Civic Center Van Ness Rapid Plaza", lat: 37.7786, lng: -122.4208, demand: 570, qubo: 0.73, cost: 250000, roi: 3.0, rev: 83000, amenity: { restaurants: 28, hotels: 5, retail: 16 } },
      ],
    },
    Pune: {
      country: "India",
      lat: 18.5204,
      lng: 73.8567,
      zones: [
        { label: "Z0", name: "Hinjawadi Phase 1 IT Park", lat: 18.5913, lng: 73.7389, demand: 680, qubo: 0.93, cost: 170000, roi: 2.0, rev: 85000, amenity: { restaurants: 28, hotels: 4, retail: 15 } },
        { label: "Z1", name: "Kothrud Vanaz Metro Exchange", lat: 18.5074, lng: 73.8077, demand: 590, qubo: 0.87, cost: 150000, roi: 2.2, rev: 68000, amenity: { restaurants: 34, hotels: 2, retail: 22 } },
        { label: "Z2", name: "Viman Nagar Airport Road", lat: 18.5679, lng: 73.9143, demand: 560, qubo: 0.84, cost: 160000, roi: 2.4, rev: 66000, amenity: { restaurants: 40, hotels: 6, retail: 28 } },
        { label: "Z3", name: "Magarpatta Cybercity East", lat: 18.5158, lng: 73.9272, demand: 520, qubo: 0.81, cost: 155000, roi: 2.5, rev: 62000, amenity: { restaurants: 26, hotels: 3, retail: 18 } },
        { label: "Z4", name: "Swargate Multimodal Bus Junction", lat: 18.5018, lng: 73.8585, demand: 490, qubo: 0.77, cost: 140000, roi: 2.6, rev: 54000, amenity: { restaurants: 20, hotels: 2, retail: 14 } },
      ],
    },
  };

  const cfg = cityConfigs[city] || cityConfigs["Mumbai"];
  const nSelected = Math.min(stationCount, cfg.zones.length);
  const selectedLabels = cfg.zones.slice(0, nSelected).map((z) => z.label);

  const zoneDetails = cfg.zones.map((z, idx) => ({
    label: z.label,
    tazid: 1000 + idx,
    name_primary: z.name,
    name_secondary: `${city} Sector ${idx + 1}`,
    longitude: z.lng,
    latitude: z.lat,
    predicted_demand_kwh_h: z.demand,
    qubo_c_value: z.qubo,
    selected: idx < nSelected,
    self_demand_score: +(z.demand / 100).toFixed(2),
    proximity_spillover_score: 3.4,
    coverage_neighbors_count: 4,
    infrastructure_gap_score: 8.5 - idx * 0.4,
    predicted_cost_usd: z.cost,
    predicted_roi_years: z.roi,
    annual_revenue_usd: z.rev,
    key_reason: `High daily EV dwell time and rapid highway corridor connectivity.`,
    has_existing_station: idx === 1,
    existing_station_count: idx === 1 ? 2 : 0,
    amenity_profile: {
      score: 8.7,
      dwell_multiplier: 1.35,
      dwell_time_mins: 38,
      restaurants: z.amenity.restaurants,
      hotels: z.amenity.hotels,
      retail: z.amenity.retail,
      summary: `${z.amenity.restaurants} restaurants and ${z.amenity.hotels} hotels within 400m driving radius.`,
    },
    driver_demand: {
      signal_strength: "High",
      weekly_events: 1240,
      searches: 820,
      bookings: 340,
      low_battery_searches: 80,
      broken_charger_reports: 2,
      demand_boost_pct: 28,
      summary: "820 driver searches and 340 completed bookings tracked in this sector over 7 days.",
    },
  }));

  const recommendedLocations = zoneDetails.slice(0, nSelected).map((z, idx) => ({
    ...z,
    rank: idx + 1,
  }));

  const totalDemand = zoneDetails.reduce((acc, z) => acc + z.predicted_demand_kwh_h, 0);
  const totalCost = recommendedLocations.reduce((acc, z) => acc + (z.predicted_cost_usd || 0), 0);
  const totalRev = recommendedLocations.reduce((acc, z) => acc + (z.annual_revenue_usd || 0), 0);
  const avgRoi = +(recommendedLocations.reduce((acc, z) => acc + (z.predicted_roi_years || 0), 0) / Math.max(nSelected, 1)).toFixed(1);

  return {
    pipeline_runtime_s: 1.4,
    demand_prediction: {
      model: "Ensemble LightGBM + Spatial Graph Transformer",
      test_r2: 0.942,
      test_mae: 14.8,
      test_split_start: "2026-01-01",
      test_split_end: "2026-09-30",
      prediction_time_ms: 128,
      predicted_demand: Object.fromEntries(zoneDetails.map((z) => [z.label, z.predicted_demand_kwh_h])),
    },
    qubo: {
      n_qubits: zoneDetails.length,
      budget_k: nSelected,
      lambda: 2.5,
      c_values: Object.fromEntries(zoneDetails.map((z) => [z.label, z.qubo_c_value])),
      global_minimum_energy: -14.82,
    },
    classical: {
      method: "Greedy Marginal Coverage",
      selected_zones: selectedLabels,
      objective_value: 2840,
      qubo_energy: -14.65,
      feasible: true,
      n_stations: nSelected,
      covered_demand_kwh_h: 2150,
      coverage_pct: 88.4,
      runtime_s: 0.08,
    },
    genetic_algorithm: {
      method: "NSGA-II Spatial Optimizer",
      selected_zones: selectedLabels,
      station_idxs: selectedLabels.map((_, i) => i),
      best_fitness: 0.962,
      objective_value: 2980,
      qubo_energy: -14.82,
      feasible: true,
      n_stations: nSelected,
      covered_demand_kwh_h: 2340,
      coverage_pct: 92.1,
      generations_run: 50,
      converged_generation: 34,
      runtime_s: 0.85,
      matches_qubo_optimum: true,
      optimality_gap: 0.0,
    },
    recommendation: {
      selected_zones: selectedLabels,
      recommended_locations: recommendedLocations,
      city,
      country: cfg.country,
      method: "Genetic Algorithm (NSGA-II) + QUBO Verified",
      qubo_energy: -14.82,
      feasible: true,
      n_stations: nSelected,
      matches_qubo_optimum: true,
      predicted_demand: Object.fromEntries(zoneDetails.map((z) => [z.label, z.predicted_demand_kwh_h])),
      total_candidate_demand_kwh_h: totalDemand,
      total_predicted_cost_usd: totalCost,
      total_annual_revenue_usd: totalRev,
      average_roi_years: avgRoi,
      zone_details: zoneDetails,
      driver_demand_signals: {
        city,
        total_signals_tracked: 4280,
        hotspots: [
          { zone: "Z0", signal: "Peak Morning Surge", boost: "+34%" },
          { zone: "Z1", signal: "Fleet Delivery Night Shift", boost: "+22%" },
        ],
      },
    },
  };
}

export function getMockLiveData(city: string = "Pune"): LiveDataResponse {
  return {
    city,
    is_live: true,
    source: "open_charge_map",
    status_message: "Live telemetry synchronized",
    live_station_count: city === "Pune" ? 18 : city === "Mumbai" ? 34 : 26,
    last_updated: new Date().toISOString(),
    stations: [
      {
        station_id: "OCM-101",
        name: `${city} City Center Fast Charger`,
        latitude: city === "Pune" ? 18.5204 : 19.076,
        longitude: city === "Pune" ? 73.8567 : 72.8777,
        power_kw: 60,
        bays: 4,
        is_operational: true,
        connector_types: ["CCS2 Combo"],
        operator: "Tata Power EZ Charge",
        status: "Operational",
        source: "open_charge_map",
      },
      {
        station_id: "OCM-102",
        name: `${city} Highway Express Kiosk`,
        latitude: city === "Pune" ? 18.5074 : 19.1197,
        longitude: city === "Pune" ? 73.8077 : 72.8689,
        power_kw: 120,
        bays: 6,
        is_operational: true,
        connector_types: ["CCS2 Combo"],
        operator: "Jio-bp pulse",
        status: "Operational",
        source: "open_charge_map",
      },
    ],
  };
}

