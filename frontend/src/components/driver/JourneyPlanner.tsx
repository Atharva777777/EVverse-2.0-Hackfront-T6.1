"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  MapPin,
  Navigation,
  ArrowRight,
  Zap,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Info,
} from "lucide-react";
import type { EVVehicle } from "./VehicleCockpit";
import type {
  LiveStation,
  WillIMakeItRequest,
  WillIMakeItResponse,
  RecommendedStop,
  HvacMode,
  DrivingStyle,
} from "@/types/api";
import { fetchWillIMakeItPlan } from "@/lib/api";
import {
  REGIONAL_CORRIDOR_DESTINATIONS,
  type JourneyDestination,
} from "@/lib/journeyRouting";
import { fetchRoadRoute } from "@/lib/routeService";

interface JourneyPlannerProps {
  activeVehicle: EVVehicle;
  currentBatteryPct: number;
  candidateStations: LiveStation[];
  userLocation: [number, number];
  selectedCity?: string;
  onStartTripNavigation: (dest: {
    name: string;
    latitude: number;
    longitude: number;
    primaryStation?: LiveStation;
  }) => void;
}

export function JourneyPlanner({
  activeVehicle,
  currentBatteryPct,
  candidateStations,
  userLocation,
  selectedCity = "Mumbai",
  onStartTripNavigation,
}: JourneyPlannerProps) {
  // Destination options for current city
  const cityCorridors = useMemo(() => {
    return (
      REGIONAL_CORRIDOR_DESTINATIONS[selectedCity] ||
      REGIONAL_CORRIDOR_DESTINATIONS["Mumbai"]
    );
  }, [selectedCity]);

  const [customDestination, setCustomDestination] = useState<JourneyDestination | null>(null);
  const selectedDestination =
    customDestination && cityCorridors.some((c) => c.id === customDestination.id)
      ? customDestination
      : cityCorridors[0];

  // User Journey Condition Inputs
  const [startBatteryPct, setStartBatteryPct] = useState<number>(currentBatteryPct);
  const [reserveBufferPct, setReserveBufferPct] = useState<number>(15);
  const [hvacMode, setHvacMode] = useState<HvacMode>("normal");
  const [drivingStyle, setDrivingStyle] = useState<DrivingStyle>("normal");
  const [payloadKg, setPayloadKg] = useState<number>(75);
  const [showConditions, setShowConditions] = useState<boolean>(false);
  const [showFactorBreakdown, setShowFactorBreakdown] = useState<boolean>(false);

  // Selected stop (primary or backup)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  // API State
  const [isComputing, setIsComputing] = useState<boolean>(true);
  const [planResponse, setPlanResponse] = useState<WillIMakeItResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync starting battery when vehicle or battery prop changes
  const [prevVehicleState, setPrevVehicleState] = useState({ id: activeVehicle.id, battery: currentBatteryPct });
  if (prevVehicleState.id !== activeVehicle.id || prevVehicleState.battery !== currentBatteryPct) {
    setPrevVehicleState({ id: activeVehicle.id, battery: currentBatteryPct });
    setStartBatteryPct(currentBatteryPct);
  }

  // Execute Will-I-Make-It calculation via Backend API
  const executeCalculation = useCallback(() => {
    let isCancelled = false;
    setApiError(null);
    setValidationError(null);

    // Client-side validation: ensure physical validity
    if (isNaN(startBatteryPct) || startBatteryPct < 0 || startBatteryPct > 100) {
      setValidationError("Departure battery percentage must be between 0% and 100%.");
      setIsComputing(false);
      return () => {
        isCancelled = true;
      };
    }

    if (!selectedDestination || selectedDestination.distanceKm <= 0) {
      setValidationError("Destination corridor distance must be greater than 0 km.");
      setIsComputing(false);
      return () => {
        isCancelled = true;
      };
    }

    if (reserveBufferPct < 0 || reserveBufferPct > 50) {
      setValidationError("Reserve buffer must be between 0% and 50%.");
      setIsComputing(false);
      return () => {
        isCancelled = true;
      };
    }

    setIsComputing(true);

    const payload: WillIMakeItRequest = {
      vehicle: {
        id: activeVehicle.id,
        make: activeVehicle.make,
        model: activeVehicle.model,
        batteryKwh: activeVehicle.batteryKwh,
        usableKwh: activeVehicle.usableKwh,
        efficiencyKwh100km: activeVehicle.efficiencyKwh100km,
        maxDcSpeedKw: activeVehicle.maxDcSpeedKw,
        plugType: activeVehicle.plugType,
      },
      distance_km: selectedDestination.distanceKm,
      start_battery_pct: startBatteryPct,
      reserve_buffer_pct: reserveBufferPct,
      elevation_gain_m: selectedDestination.elevationGainM || 0,
      payload_kg: payloadKg,
      ambient_temp_c: 28,
      hvac_mode: hvacMode,
      driving_style: drivingStyle,
      origin_coords: userLocation,
      destination_coords: [selectedDestination.lat, selectedDestination.lng],
      city: selectedCity,
      candidate_stations: (candidateStations || []).slice(0, 35).map((st) => ({
        station_id: st.station_id,
        name: st.name,
        latitude: st.latitude,
        longitude: st.longitude,
        power_kw: st.power_kw ?? 50,
        connector_types: st.connector_types,
        status: st.status,
        is_operational: st.is_operational,
        operator: st.operator ?? undefined,
        address: st.address ?? undefined,
      })),
    };

    fetchWillIMakeItPlan(payload)
      .then((res) => {
        if (!isCancelled) {
          setPlanResponse(res);
          setIsComputing(false);
          // Default selection to primary stop if available
          if (res.charging.primary_stop) {
            setSelectedStopId(res.charging.primary_stop.station_id);
          } else {
            setSelectedStopId(null);
          }
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setIsComputing(false);
          const msg =
            err instanceof Error
              ? err.message
              : "Failed to connect to backend journey prediction engine.";
          setApiError(msg);
          console.warn("[EVverse] Trip evaluation failed:", err);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    activeVehicle,
    selectedDestination,
    startBatteryPct,
    reserveBufferPct,
    payloadKg,
    hvacMode,
    drivingStyle,
    userLocation,
    selectedCity,
    candidateStations,
  ]);

  // Debounced API trigger on parameter changes
  useEffect(() => {
    const timer = setTimeout(() => {
      executeCalculation();
    }, 280);

    return () => {
      clearTimeout(timer);
    };
  }, [executeCalculation]);

  // Active chosen charging stop
  const effectivePrimaryStop = useMemo<RecommendedStop | null>(() => {
    if (!planResponse?.charging) return null;
    const { primary_stop, backup_stop, recommendations } = planResponse.charging;
    if (selectedStopId) {
      if (primary_stop?.station_id === selectedStopId) return primary_stop;
      if (backup_stop?.station_id === selectedStopId) return backup_stop;
      const found = recommendations.find((s) => s.station_id === selectedStopId);
      if (found) return found;
    }
    return primary_stop || recommendations[0] || null;
  }, [planResponse, selectedStopId]);

  // Convert recommended stop to LiveStation format for navigation callback, preserving final destination
  const navStation = useMemo<LiveStation | undefined>(() => {
    if (!effectivePrimaryStop) return undefined;
    const baseAddress =
      effectivePrimaryStop.address || `${effectivePrimaryStop.name}, ${selectedCity}`;
    return {
      station_id: effectivePrimaryStop.station_id,
      name: effectivePrimaryStop.name,
      latitude: effectivePrimaryStop.latitude,
      longitude: effectivePrimaryStop.longitude,
      address: `${baseAddress} • Waypoint to ${selectedDestination.name}`,
      operator: effectivePrimaryStop.operator ?? "EVverse Verified",
      status: effectivePrimaryStop.status,
      is_operational: effectivePrimaryStop.is_operational,
      power_kw: effectivePrimaryStop.power_kw,
      bays: 4,
      connector_types:
        effectivePrimaryStop.matched_connectors.length > 0
          ? effectivePrimaryStop.matched_connectors
          : effectivePrimaryStop.connector_types,
      source: "kaggle_baseline",
    };
  }, [effectivePrimaryStop, selectedDestination.name, selectedCity]);

  // Verdict config helper
  const verdict = planResponse?.feasibility.verdict;
  const isSafe = verdict === "SAFE";
  const isCaution = verdict === "CAUTION";
  const isChargingNeeded = verdict === "CHARGING_NEEDED";

  const isDepleted = useMemo(() => {
    return (
      typeof planResponse?.feasibility.depletion_distance_km === "number" &&
      planResponse.feasibility.depletion_distance_km < selectedDestination.distanceKm
    );
  }, [planResponse, selectedDestination.distanceKm]);

  const recommendedMinSoc = planResponse?.feasibility.recommended_min_departure_soc_pct;

  const verdictMeta = useMemo(() => {
    if (isSafe) {
      return {
        title: "SAFE TO PROCEED",
        subtitle: "Direct route feasible with safe reserve",
        description: `You have sufficient battery to reach ${selectedDestination.name} with your desired ${reserveBufferPct}% safety reserve.`,
        badgeTextColor: "text-[#15803D]",
        cardBg: "bg-[#F0FDF4]",
        borderColor: "border-[#BBF7D0]",
        pillStyle: "bg-white border-[#BBF7D0] text-[#15803D]",
        textColor: "text-[#15803D]",
        progressColor: "bg-[#16A34A]",
        icon: <ShieldCheck size={18} className="text-[#16A34A] shrink-0" />,
      };
    }
    if (isCaution) {
      return {
        title: "CAUTION: TIGHT RESERVE",
        subtitle: "Arrival battery will be near safety threshold",
        description: `You will reach ${selectedDestination.name}, but arrival battery will be near or below your ${reserveBufferPct}% buffer. Consider driving in Eco mode or a quick top-up.`,
        badgeTextColor: "text-[#B45309]",
        cardBg: "bg-[#FFFBEB]",
        borderColor: "border-[#FDE68A]",
        pillStyle: "bg-white border-[#FDE68A] text-[#B45309]",
        textColor: "text-[#B45309]",
        progressColor: "bg-[#D97706]",
        icon: <AlertTriangle size={18} className="text-[#D97706] shrink-0" />,
      };
    }
    return {
      title: "CHARGING REQUIRED",
      subtitle: "En-route charging stop needed",
      description: `Your current battery is insufficient to reach ${selectedDestination.name} directly. En-route charging is required.`,
      badgeTextColor: "text-[#B91C1C]",
      cardBg: "bg-[#FEF2F2]",
      borderColor: "border-[#FECACA]",
      pillStyle: "bg-white border-[#FECACA] text-[#B91C1C]",
      textColor: "text-[#DC2626]",
      progressColor: "bg-[#DC2626]",
      icon: <AlertCircle size={18} className="text-[#DC2626] shrink-0" />,
    };
  }, [isSafe, isCaution, selectedDestination.name, reserveBufferPct]);

  return (
    <div className="w-full flex-1 flex flex-col justify-between gap-2.5 max-w-lg mx-auto h-full text-[#111312]">
      {/* ── 1. COMPACT DESTINATION CORRIDOR SELECTOR ── */}
      <div className="space-y-1.5 shrink-0">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-[#111312]">Select Destination</span>
          <span className="text-[11px] font-mono text-[#767D78]">
            {activeVehicle.make} {activeVehicle.model.split(" ")[0]}
          </span>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {cityCorridors.map((dest) => {
            const isSelected = selectedDestination.id === dest.id;
            return (
              <button
                key={dest.id}
                type="button"
                onClick={() => {
                  setCustomDestination(dest);
                  setSelectedStopId(null);
                }}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-left shrink-0 transition-all cursor-pointer flex items-center gap-2 ${isSelected
                  ? "bg-[#111312] text-white border-[#111312] shadow-xs"
                  : "bg-white text-[#111312] border-black/[0.08] hover:bg-[#F4F3EE]"
                  }`}
              >
                <MapPin
                  size={13}
                  className={isSelected ? "text-[#C8F369]" : "text-[#767D78]"}
                />
                <div>
                  <div className="text-xs font-bold leading-tight">{dest.name}</div>
                  <div
                    className={`text-[9.5px] font-mono ${isSelected ? "text-[#C8F369]" : "text-[#767D78]"
                      }`}
                  >
                    {dest.distanceKm} km
                    {dest.elevationGainM ? ` • +${dest.elevationGainM}m` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable Body Section ── */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5 pb-2">
        {/* ── 2. COMPACT DEPARTURE BATTERY CONTROL ── */}
        <div className="bg-white rounded-2xl p-3 border border-black/[0.08] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-[#525854]">
              <Zap size={13} className="text-[#16A34A]" />
              <span className="font-semibold text-[#111312]">Departure Battery</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-[#111312]">
                {startBatteryPct}%
              </span>
              {startBatteryPct !== currentBatteryPct && (
                <button
                  type="button"
                  onClick={() => setStartBatteryPct(currentBatteryPct)}
                  className="text-[10px] font-semibold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.5 rounded-lg hover:bg-[#DCFCE7] transition-colors cursor-pointer"
                  title="Reset to current vehicle battery"
                >
                  Sync ({currentBatteryPct}%)
                </button>
              )}
            </div>
          </div>

          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={startBatteryPct}
            onChange={(e) => setStartBatteryPct(Number(e.target.value))}
            className="w-full accent-[#111312] cursor-pointer h-1.5 bg-black/[0.08] rounded-lg"
          />
        </div>

        {/* ── Validation Notice ── */}
        {validationError && (
          <div className="bg-[#FFFBEB] rounded-2xl p-3 border border-[#FDE68A] text-xs flex items-center gap-2">
            <AlertTriangle size={15} className="text-[#D97706] shrink-0" />
            <span className="text-[#92400E]">{validationError}</span>
          </div>
        )}

        {/* ── Loading State ── */}
        {isComputing && !planResponse && !validationError && (
          <div className="bg-white rounded-2xl p-6 border border-black/[0.08] shadow-xs text-center space-y-2">
            <RefreshCw size={20} className="text-[#16A34A] animate-spin mx-auto" />
            <div className="text-xs font-bold text-[#111312]">Evaluating route feasibility...</div>
            <p className="text-[11px] text-[#525854]">
              Calculating battery consumption and checking reachable chargers.
            </p>
          </div>
        )}

        {/* ── Error Banner ── */}
        {apiError && (
          <div className="bg-[#FEF2F2] rounded-2xl p-3.5 border border-[#FECACA] space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-[#DC2626] shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[#991B1B]">Prediction Engine Notice</div>
                <div className="text-[11px] text-[#B91C1C] mt-0.5">{apiError}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={executeCalculation}
              className="px-3 py-1 bg-white border border-[#FECACA] rounded-lg text-[11px] font-medium text-[#991B1B] hover:bg-[#FEE2E2] cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw size={11} />
              <span>Retry Calculation</span>
            </button>
          </div>
        )}

        {/* ── 3. UNIFIED FEASIBILITY & PROMINENT ARRIVAL BATTERY HERO CARD ── */}
        {planResponse && (
          <div
            className={`rounded-2xl p-4 sm:p-4.5 border shadow-xs space-y-3.5 transition-all ${verdictMeta.cardBg} ${verdictMeta.borderColor}`}
          >
            {/* Status Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {verdictMeta.icon}
                <span
                  className={`text-xs font-black tracking-wider uppercase ${verdictMeta.badgeTextColor}`}
                >
                  {verdictMeta.title}
                </span>
              </div>
              <span
                className={`text-[10.5px] font-mono font-bold px-2 py-0.5 rounded-full border ${verdictMeta.pillStyle}`}
              >
                {verdict}
              </span>
            </div>

            {/* VISUALLY PROMINENT: Departure-to-Arrival Comparison */}
            <div className="flex items-baseline justify-between pt-0.5">
              <div>
                <span className="text-[11px] font-medium text-[#525854] block">
                  Estimated Arrival Battery
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span
                    className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${verdictMeta.textColor}`}
                  >
                    {isDepleted ? "0%" : `~${planResponse.energy.nominal_arrival_soc_pct}%`}
                  </span>
                  <span className="text-xs text-[#767D78] font-mono">
                    (from {startBatteryPct}%)
                  </span>
                </div>
              </div>

              {/* Range Bounds */}
              <div className="text-right">
                <span className="text-[10px] text-[#767D78] block">Range Estimate</span>
                <span className="text-xs font-mono font-semibold text-[#111312]">
                  {planResponse.energy.arrival_soc_range_pct[0]}% –{" "}
                  {planResponse.energy.arrival_soc_range_pct[1]}%
                </span>
              </div>
            </div>

            {/* Visual Battery Level Bar */}
            <div className="space-y-1">
              <div className="w-full h-2.5 bg-black/[0.08] rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${verdictMeta.progressColor}`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        4,
                        isDepleted ? 0 : planResponse.energy.nominal_arrival_soc_pct
                      )
                    )}%`,
                  }}
                />
              </div>
              <div className="flex justify-between items-center text-[9.5px] font-mono text-[#767D78]">
                <span>0% Empty</span>
                <span className="text-[#B45309]">Reserve target: {reserveBufferPct}%</span>
                <span>100% Full</span>
              </div>
            </div>

            {/* Clear Driver Explanation */}
            <p className="text-xs text-[#2A2F2B] font-medium leading-relaxed">
              {verdictMeta.description}
            </p>

            {/* Depletion Alert if battery runs out before destination */}
            {isDepleted && (
              <div className="p-2.5 rounded-xl bg-red-100/90 border border-red-300 text-xs text-[#991B1B] flex items-center gap-2">
                <AlertCircle size={15} className="text-[#DC2626] shrink-0" />
                <span>
                  <strong>Depletion Warning:</strong> Battery will be exhausted at approximately
                  km {planResponse.feasibility.depletion_distance_km} of the{" "}
                  {selectedDestination.distanceKm} km trip.
                </span>
              </div>
            )}

            {/* Minimum Recommended Departure SoC */}
            {typeof recommendedMinSoc === "number" && recommendedMinSoc > startBatteryPct && (
              <div className="p-2.5 rounded-xl bg-amber-100/80 border border-amber-300 text-xs text-[#92400E] flex items-center gap-2">
                <Info size={15} className="text-[#D97706] shrink-0" />
                <span>
                  To arrive directly without stopping, charge to at least{" "}
                  <strong>{recommendedMinSoc}%</strong> before departure.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── 4. CONDITIONAL CHARGING RECOMMENDATIONS (Only for CAUTION or CHARGING REQUIRED) ── */}
        {planResponse && !isSafe && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs font-bold text-[#111312] flex items-center gap-1.5">
                <Zap size={13} className="text-[#16A34A]" />
                {isChargingNeeded ? "Required Charging Stop" : "Suggested En-Route Stop"}
              </span>

              {planResponse.charging.backup_stop && (
                <div className="flex gap-1 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedStopId(planResponse.charging.primary_stop?.station_id || null)
                    }
                    className={`px-2 py-0.5 rounded-md border cursor-pointer font-bold transition-all ${effectivePrimaryStop?.station_id ===
                      planResponse.charging.primary_stop?.station_id
                      ? "bg-[#111312] text-white border-[#111312]"
                      : "bg-white text-[#767D78] border-black/[0.08] hover:bg-[#F4F3EE]"
                      }`}
                  >
                    Primary
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedStopId(planResponse.charging.backup_stop?.station_id || null)
                    }
                    className={`px-2 py-0.5 rounded-md border cursor-pointer font-bold transition-all ${effectivePrimaryStop?.station_id ===
                      planResponse.charging.backup_stop?.station_id
                      ? "bg-[#111312] text-white border-[#111312]"
                      : "bg-white text-[#767D78] border-black/[0.08] hover:bg-[#F4F3EE]"
                      }`}
                  >
                    Backup
                  </button>
                </div>
              )}
            </div>

            {effectivePrimaryStop ? (
              <div
                className={`p-3.5 rounded-2xl border shadow-xs space-y-2.5 ${isChargingNeeded
                  ? "bg-[#FEF2F2]/60 border-[#FECACA]"
                  : "bg-[#FFFBEB]/70 border-[#FDE68A]"
                  }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#111312] truncate">
                        {effectivePrimaryStop.name}
                      </span>
                      <span className="text-[9px] font-mono font-bold bg-[#111312] text-white px-1.5 py-0.5 rounded shrink-0">
                        {effectivePrimaryStop.is_backup ? "BACKUP" : "PRIMARY"}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-[#525854] truncate mt-0.5">
                      {effectivePrimaryStop.address || effectivePrimaryStop.operator}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-[#15803D] font-mono">
                      {effectivePrimaryStop.effective_charging_kw} kW{" "}
                      {effectivePrimaryStop.effective_charging_kw > 22 ? "DC" : "AC"}
                    </div>
                    <div className="text-[10px] text-[#767D78]">
                      ~{effectivePrimaryStop.estimated_charge_mins} min charge
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-black/[0.06] text-[10.5px]">
                  <div className="bg-white/80 p-2 rounded-xl border border-black/[0.04]">
                    <span className="text-[#767D78] text-[9.5px] block font-medium">Detour</span>
                    <span className="font-semibold text-[#111312]">
                      +{effectivePrimaryStop.detour_km} km (~{effectivePrimaryStop.detour_mins} min)
                    </span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-black/[0.04]">
                    <span className="text-[#767D78] text-[9.5px] block font-medium">
                      Charging Target
                    </span>
                    <span className="font-semibold text-[#15803D]">
                      {effectivePrimaryStop.arrival_soc_pct}% ➔{" "}
                      {effectivePrimaryStop.target_departure_soc_pct}% (+
                      {effectivePrimaryStop.required_charge_kwh} kWh)
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-[#767D78] flex items-center justify-between">
                  <span>
                    Compatible:{" "}
                    {effectivePrimaryStop.matched_connectors.join(", ") || activeVehicle.plugType}
                  </span>
                  <span>Verified Network Hub</span>
                </div>
              </div>
            ) : isChargingNeeded ? (
              <div className="p-3.5 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] space-y-1.5 text-xs">
                <div className="flex items-start gap-2">
                  <AlertCircle size={15} className="text-[#DC2626] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-[#991B1B]">No Verified Charger Reachable</div>
                    <div className="text-[11px] text-[#B91C1C] mt-1 leading-relaxed">
                      No compatible fast charging stations were found along this corridor within safe
                      reach. Charge your vehicle to at least{" "}
                      <strong>
                        {planResponse.feasibility.recommended_min_departure_soc_pct || 80}%
                      </strong>{" "}
                      before departure.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ── 5. COLLAPSIBLE TRIP CONDITIONS & DETAILED ENERGY ANALYSIS ── */}
        <div className="bg-white rounded-2xl border border-black/[0.08] shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setShowConditions((v) => !v)}
            className="w-full p-3 sm:p-3.5 flex items-center justify-between text-xs font-bold text-[#111312] hover:bg-[#FAF9F6] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-[#525854]">
              <SlidersHorizontal size={13} />
              <span>Trip Conditions &amp; Energy Analysis</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#767D78] text-[11px]">
              <span>{showConditions ? "Hide" : "Customize"}</span>
              {showConditions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </button>

          {showConditions && (
            <div className="p-3.5 pt-0 space-y-3 border-t border-black/[0.06] text-xs">
              {/* Safe Reserve Buffer */}
              <div className="space-y-1 pt-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#525854]">Target Safety Reserve Buffer</span>
                  <span className="font-mono font-bold text-[#111312]">{reserveBufferPct}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={5}
                  value={reserveBufferPct}
                  onChange={(e) => setReserveBufferPct(Number(e.target.value))}
                  className="w-full accent-[#111312] cursor-pointer h-1.5 bg-black/[0.08] rounded-lg"
                />
              </div>

              {/* Cabin Climate */}
              <div className="space-y-1">
                <span className="text-[10.5px] text-[#767D78] block">Cabin Climate / AC</span>
                <div className="grid grid-cols-4 gap-1">
                  {(["off", "eco", "normal", "max"] as HvacMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setHvacMode(mode)}
                      className={`py-1 text-[11px] font-medium rounded-lg border capitalize cursor-pointer transition-colors ${hvacMode === mode
                        ? "bg-[#111312] text-white border-[#111312]"
                        : "bg-[#FAF9F6] text-[#525854] border-black/[0.06] hover:bg-[#F4F3EE]"
                        }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Driving Style */}
              <div className="space-y-1">
                <span className="text-[10.5px] text-[#767D78] block">Driving Dynamics</span>
                <div className="grid grid-cols-3 gap-1">
                  {(["eco", "normal", "sport"] as DrivingStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setDrivingStyle(style)}
                      className={`py-1 text-[11px] font-medium rounded-lg border capitalize cursor-pointer transition-colors ${drivingStyle === style
                        ? "bg-[#111312] text-white border-[#111312]"
                        : "bg-[#FAF9F6] text-[#525854] border-black/[0.06] hover:bg-[#F4F3EE]"
                        }`}
                    >
                      {style === "eco"
                        ? "Eco (-8%)"
                        : style === "sport"
                          ? "Sport (+15%)"
                          : "Normal"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payload */}
              <div className="space-y-1">
                <span className="text-[10.5px] text-[#767D78] block">Occupants &amp; Cargo</span>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { kg: 75, label: "Solo (75kg)" },
                    { kg: 150, label: "2 Pax (150kg)" },
                    { kg: 250, label: "Full (250kg)" },
                  ].map((p) => (
                    <button
                      key={p.kg}
                      type="button"
                      onClick={() => setPayloadKg(p.kg)}
                      className={`py-1 text-[10.5px] font-medium rounded-lg border cursor-pointer transition-colors ${payloadKg === p.kg
                        ? "bg-[#111312] text-white border-[#111312]"
                        : "bg-[#FAF9F6] text-[#525854] border-black/[0.06] hover:bg-[#F4F3EE]"
                        }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detailed Factor Breakdown */}
              {planResponse?.energy?.factor_breakdown && (
                <div className="pt-2 border-t border-black/[0.06] space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setShowFactorBreakdown((v) => !v)}
                    className="w-full flex items-center justify-between text-[11px] font-semibold text-[#525854] hover:text-[#111312] py-0.5 cursor-pointer"
                  >
                    <span>
                      Energy Factors (~{planResponse.energy.nominal_energy_kwh} kWh estimated)
                    </span>
                    {showFactorBreakdown ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {showFactorBreakdown && (
                    <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px] font-mono">
                      <div className="p-2 rounded-lg bg-[#FAF9F6] border border-black/[0.04]">
                        <span className="text-[#767D78] block text-[9px]">Road Traction</span>
                        <strong className="text-[#111312]">
                          {planResponse.energy.factor_breakdown.base_traction_kwh} kWh
                        </strong>
                      </div>
                      <div className="p-2 rounded-lg bg-[#FAF9F6] border border-black/[0.04]">
                        <span className="text-[#767D78] block text-[9px]">Elevation Change</span>
                        <strong className="text-[#111312]">
                          {planResponse.energy.factor_breakdown.elevation_kwh >= 0 ? "+" : ""}
                          {planResponse.energy.factor_breakdown.elevation_kwh} kWh
                        </strong>
                      </div>
                      <div className="p-2 rounded-lg bg-[#FAF9F6] border border-black/[0.04]">
                        <span className="text-[#767D78] block text-[9px]">Cabin Climate</span>
                        <strong className="text-[#111312]">
                          {planResponse.energy.factor_breakdown.hvac_kwh} kWh
                        </strong>
                      </div>
                      <div className="p-2 rounded-lg bg-[#FAF9F6] border border-black/[0.04]">
                        <span className="text-[#767D78] block text-[9px]">Payload Added</span>
                        <strong className="text-[#111312]">
                          {planResponse.energy.factor_breakdown.payload_kwh >= 0 ? "+" : ""}
                          {planResponse.energy.factor_breakdown.payload_kwh} kWh
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 6. CONTEXTUAL NAVIGATION ACTION ── */}
      <div className="sticky bottom-0 z-20 bg-gradient-to-t from-[#FAF9F6] via-[#FAF9F6] to-transparent pt-2.5 pb-safe pb-2 shrink-0">
        <button
          type="button"
          onClick={() =>
            onStartTripNavigation({
              name: selectedDestination.name,
              latitude: selectedDestination.lat,
              longitude: selectedDestination.lng,
              primaryStation: isChargingNeeded ? navStation : undefined,
            })
          }
          className="w-full min-h-[48px] py-3.5 px-4 bg-[#111312] text-white text-xs sm:text-sm font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-[#252826] active:scale-[0.99] transition-all shadow-md cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
        >
          <Navigation size={16} className="text-[#C8F369]" />
          <span>
            {isChargingNeeded && effectivePrimaryStop
              ? `Navigate to Charging Stop (${effectivePrimaryStop.name.split(" ")[0]})`
              : `Start Journey to ${selectedDestination.name}`}
          </span>
          <ArrowRight size={16} className="text-[#C8F369]" />
        </button>
      </div>
    </div>
  );
}
