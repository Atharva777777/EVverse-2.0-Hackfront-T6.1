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
  CheckCircle2,
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

  // Execute Will-I-Make-It calculation via Backend Orchestration API
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

  // Convert recommended stop to LiveStation format for navigation callback
  const navStation = useMemo<LiveStation | undefined>(() => {
    if (!effectivePrimaryStop) return undefined;
    return {
      station_id: effectivePrimaryStop.station_id,
      name: effectivePrimaryStop.name,
      latitude: effectivePrimaryStop.latitude,
      longitude: effectivePrimaryStop.longitude,
      address: effectivePrimaryStop.address ?? null,
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
  }, [effectivePrimaryStop]);

  // Verdict config helper
  const verdict = planResponse?.feasibility.verdict;
  const isSafe = verdict === "SAFE";
  const isCaution = verdict === "CAUTION";
  const isChargingNeeded = verdict === "CHARGING_NEEDED";

  const verdictMeta = useMemo(() => {
    if (isSafe) {
      return {
        title: "SAFE TO PROCEED",
        subtitle: "Direct journey feasible with desired reserve",
        badgeBg: "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]",
        bannerBg: "bg-[#F0FDF4] border-[#BBF7D0]",
        icon: <ShieldCheck size={18} className="text-[#16A34A] shrink-0" />,
        progressColor: "bg-[#16A34A]",
      };
    }
    if (isCaution) {
      return {
        title: "CAUTION: TIGHT RESERVE",
        subtitle: "Adverse conditions may breach reserve buffer",
        badgeBg: "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]",
        bannerBg: "bg-[#FFFBEB] border-[#FDE68A]",
        icon: <AlertTriangle size={18} className="text-[#D97706] shrink-0" />,
        progressColor: "bg-[#D97706]",
      };
    }
    return {
      title: "CHARGING REQUIRED",
      subtitle: "En-route charging needed to reach destination safely",
      badgeBg: "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]",
      bannerBg: "bg-[#FEF2F2] border-[#FECACA]",
      icon: <AlertCircle size={18} className="text-[#DC2626] shrink-0" />,
      progressColor: "bg-[#DC2626]",
    };
  }, [isSafe, isCaution]);

  return (
    <div className="w-full flex-1 flex flex-col justify-between gap-3 max-w-lg mx-auto h-full text-[#111312]">
      {/* ── Top Header & Destination Selector ────────────────────── */}
      <div className="space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#111312] leading-none">
              Will I Make It?
            </h2>
            <p className="text-[11px] text-[#525854] mt-0.5">
              Longitudinal physics &amp; corridor feasibility
            </p>
          </div>
          <span className="text-[11px] font-mono font-semibold bg-[#FAF9F6] border border-black/[0.08] px-2.5 py-1 rounded-xl text-[#111312]">
            {activeVehicle.make} {activeVehicle.model.split(" ")[0]} • {startBatteryPct}%
          </span>
        </div>

        {/* Corridor Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
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
                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-left shrink-0 transition-all cursor-pointer flex items-center gap-2 ${
                  isSelected
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
                    className={`text-[9.5px] font-mono ${
                      isSelected ? "text-[#C8F369]" : "text-[#767D78]"
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

      {/* ── Scrollable Body Section ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
        {/* ── Journey Condition Inputs Card ──────────────────────── */}
        <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-black/[0.08] shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal size={13} className="text-[#525854]" />
              <span className="text-xs font-bold text-[#111312]">
                Starting Battery &amp; Conditions
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={executeCalculation}
                disabled={isComputing}
                className="px-2 py-0.5 rounded-lg text-[10.5px] font-semibold bg-[#111312] text-white hover:bg-[#252826] active:scale-95 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="Re-run physics calculation"
              >
                <RefreshCw size={10} className={isComputing ? "animate-spin" : ""} />
                <span>{isComputing ? "Calculating..." : "Evaluate"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowConditions((v) => !v)}
                className="text-[11px] font-medium text-[#525854] hover:text-[#111312] flex items-center gap-1 cursor-pointer"
              >
                <span>{showConditions ? "Hide" : "Adjust"}</span>
                {showConditions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>

          {/* Quick Battery Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#767D78] text-[11px]">Departure Battery</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#111312] text-sm">{startBatteryPct}%</span>
                {startBatteryPct !== currentBatteryPct && (
                  <button
                    type="button"
                    onClick={() => setStartBatteryPct(currentBatteryPct)}
                    className="text-[9.5px] text-[#525854] underline hover:text-[#111312] cursor-pointer"
                    title="Reset to current vehicle battery"
                  >
                    Reset ({currentBatteryPct}%)
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

          {/* Collapsible Advanced Parameters */}
          {showConditions && (
            <div className="pt-2 border-t border-black/[0.06] space-y-2.5 text-xs animate-in fade-in duration-200">
              {/* Reserve Buffer % */}
              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-[#767D78]">Desired Safe Reserve Buffer</span>
                  <span className="font-bold text-[#111312]">{reserveBufferPct}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={5}
                  value={reserveBufferPct}
                  onChange={(e) => setReserveBufferPct(Number(e.target.value))}
                  className="w-full accent-[#111312] cursor-pointer h-1 bg-black/[0.08] rounded-lg"
                />
              </div>

              {/* HVAC Mode Selection */}
              <div>
                <span className="text-[10.5px] text-[#767D78] block mb-1">
                  Climate / HVAC Mode
                </span>
                <div className="grid grid-cols-4 gap-1">
                  {(["off", "eco", "normal", "max"] as HvacMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setHvacMode(mode)}
                      className={`py-1 text-[11px] font-medium rounded-lg border capitalize cursor-pointer transition-colors ${
                        hvacMode === mode
                          ? "bg-[#111312] text-white border-[#111312]"
                          : "bg-[#FAF9F6] text-[#525854] border-black/[0.06] hover:bg-[#F4F3EE]"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Driving Style Selection */}
              <div>
                <span className="text-[10.5px] text-[#767D78] block mb-1">
                  Driving Style
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {(["eco", "normal", "sport"] as DrivingStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setDrivingStyle(style)}
                      className={`py-1 text-[11px] font-medium rounded-lg border capitalize cursor-pointer transition-colors ${
                        drivingStyle === style
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

              {/* Payload Weight */}
              <div>
                <span className="text-[10.5px] text-[#767D78] block mb-1">
                  Occupants &amp; Cargo Load
                </span>
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
                      className={`py-1 text-[10.5px] font-medium rounded-lg border cursor-pointer transition-colors ${
                        payloadKg === p.kg
                          ? "bg-[#111312] text-white border-[#111312]"
                          : "bg-[#FAF9F6] text-[#525854] border-black/[0.06] hover:bg-[#F4F3EE]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Validation Error State ──────────────────────────────── */}
        {validationError && (
          <div className="bg-[#FFFBEB] rounded-2xl p-3.5 border border-[#FDE68A] space-y-1.5 text-xs">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-[#D97706] shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[#92400E]">Input Validation Notice</div>
                <div className="text-[11px] text-[#B45309] mt-0.5">{validationError}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Loading Spinner State ───────────────────────────────── */}
        {isComputing && !planResponse && !validationError && (
          <div className="bg-white rounded-2xl p-6 border border-black/[0.08] shadow-xs text-center space-y-2">
            <RefreshCw
              size={20}
              className="text-[#16A34A] animate-spin mx-auto"
            />
            <div className="text-xs font-bold text-[#111312]">
              Computing Stage 1 Energy &amp; Stage 2 Feasibility...
            </div>
            <p className="text-[11px] text-[#525854]">
              Analyzing longitudinal traction, aero drag, and reachable charging stops.
            </p>
          </div>
        )}

        {/* ── Error Banner State ──────────────────────────────────── */}
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

        {/* ── Stage 2 Feasibility Verdict Banner ──────────────────── */}
        {planResponse && (
          <div
            className={`rounded-2xl p-3.5 sm:p-4 border shadow-xs space-y-2.5 transition-all ${verdictMeta.bannerBg}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                {verdictMeta.icon}
                <div>
                  <div className="text-xs font-black tracking-wide uppercase text-[#111312]">
                    {verdictMeta.title}
                  </div>
                  <div className="text-[11px] text-[#525854] mt-0.5">
                    {verdictMeta.subtitle}
                  </div>
                </div>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wider shrink-0 ${verdictMeta.badgeBg}`}
              >
                {verdict}
              </span>
            </div>

            {/* Verdict Explanation Reasons */}
            <div className="space-y-1 pt-1 text-[11px] text-[#111312]/80 leading-relaxed">
              {planResponse.feasibility.reasons.map((reason, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="text-[#767D78] leading-none mt-1">•</span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>

            {/* Depletion Alert if battery runs out before destination */}
            {typeof planResponse.feasibility.depletion_distance_km === "number" &&
              planResponse.feasibility.depletion_distance_km <
                selectedDestination.distanceKm && (
                <div className="bg-white/80 p-2 rounded-xl border border-red-200 text-[11px] text-[#991B1B] flex items-center gap-2">
                  <AlertCircle size={14} className="text-[#DC2626] shrink-0" />
                  <span>
                    <strong>Depletion Warning:</strong> Battery exhausted at ~
                    {planResponse.feasibility.depletion_distance_km} km of the{" "}
                    {selectedDestination.distanceKm} km trip.
                  </span>
                </div>
              )}

            {/* Minimum Recommended Departure SoC */}
            {typeof planResponse.feasibility.recommended_min_departure_soc_pct === "number" &&
              planResponse.feasibility.recommended_min_departure_soc_pct >
                startBatteryPct && (
                <div className="bg-white/80 p-2 rounded-xl border border-amber-200 text-[11px] text-[#92400E] flex items-center gap-2">
                  <Info size={14} className="text-[#D97706] shrink-0" />
                  <span>
                    To arrive without charging with {reserveBufferPct}% reserve, charge to at least{" "}
                    <strong>
                      {planResponse.feasibility.recommended_min_departure_soc_pct}%
                    </strong>{" "}
                    before departure.
                  </span>
                </div>
              )}

            {/* Mitigation Advice (Eco driving, speed reduction) */}
            {planResponse.feasibility.mitigation_advice.length > 0 && (
              <div className="pt-1.5 border-t border-black/[0.06] text-[10.5px] text-[#525854] space-y-0.5">
                <span className="font-semibold text-[#111312]">Recommendations:</span>
                {planResponse.feasibility.mitigation_advice.map((adv, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-[#16A34A] shrink-0" />
                    <span>{adv}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Stage 1 Battery & Scenario Uncertainty Overview ────── */}
        {planResponse && (
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-black/[0.08] shadow-xs space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[9.5px] font-mono uppercase tracking-wider text-[#767D78]">
                  Energy Estimation (Stage 1 Physics)
                </div>
                <div className="text-sm font-bold text-[#111312] mt-0.5">
                  {selectedDestination.name} ({selectedDestination.distanceKm} km)
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-[#111312] font-mono">
                  ~{planResponse.energy.nominal_energy_kwh} kWh
                </div>
                <div className="text-[10px] font-mono text-[#767D78]">
                  [{planResponse.energy.energy_range_kwh[0]} –{" "}
                  {planResponse.energy.energy_range_kwh[1]} kWh]
                </div>
              </div>
            </div>

            {/* Battery Prediction & Uncertainty Scenario Bar */}
            <div className="bg-[#FAF9F6] p-3 rounded-xl border border-black/[0.05] space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#525854] text-[11px] font-sans font-medium flex items-center gap-1">
                  <Zap size={13} className="text-[#16A34A]" />
                  Arrival Battery
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[#111312]">{startBatteryPct}%</span>
                  <ArrowRight size={12} className="text-[#767D78]" />
                  <span
                    className={`font-bold text-sm ${
                      planResponse.energy.nominal_arrival_soc_pct < reserveBufferPct
                        ? "text-[#DC2626]"
                        : "text-[#16A34A]"
                    }`}
                  >
                    ~{planResponse.energy.nominal_arrival_soc_pct}%
                  </span>
                </div>
              </div>

              {/* Arrival Battery Progress Bar */}
              <div className="w-full h-2 bg-black/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    planResponse.energy.nominal_arrival_soc_pct < reserveBufferPct
                      ? "bg-[#DC2626]"
                      : isCaution
                      ? "bg-[#D97706]"
                      : "bg-[#16A34A]"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(4, planResponse.energy.nominal_arrival_soc_pct)
                    )}%`,
                  }}
                />
              </div>

              {/* Scenario Range Bounds (Worst - Nominal - Best) */}
              <div className="flex items-center justify-between text-[10px] font-mono pt-1 text-[#767D78]">
                <span>
                  Worst:{" "}
                  <strong className="text-[#DC2626]">
                    {planResponse.energy.arrival_soc_range_pct[0]}%
                  </strong>
                </span>
                <span>
                  Nominal:{" "}
                  <strong className="text-[#111312]">
                    {planResponse.energy.nominal_arrival_soc_pct}%
                  </strong>
                </span>
                <span>
                  Best:{" "}
                  <strong className="text-[#15803D]">
                    {planResponse.energy.arrival_soc_range_pct[1]}%
                  </strong>
                </span>
              </div>
            </div>

            {/* Factor Breakdown Toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowFactorBreakdown((v) => !v)}
                className="w-full flex items-center justify-between text-[11px] font-semibold text-[#525854] hover:text-[#111312] py-1 cursor-pointer"
              >
                <span>Factor Breakdown (Longitudinal Physics)</span>
                {showFactorBreakdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {showFactorBreakdown && (
                <div className="grid grid-cols-2 gap-1.5 pt-2 text-[10.5px] font-mono">
                  <div className="p-2 rounded-lg bg-[#FAF9F6] border border-black/[0.04]">
                    <span className="text-[#767D78] block text-[9.5px]">Traction Drag</span>
                    <strong className="text-[#111312]">
                      {planResponse.energy.factor_breakdown.base_traction_kwh} kWh
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-[#FAF9F6] border border-black/[0.04]">
                    <span className="text-[#767D78] block text-[9.5px]">Elevation / Regen</span>
                    <strong className="text-[#111312]">
                      {planResponse.energy.factor_breakdown.elevation_kwh >= 0 ? "+" : ""}
                      {planResponse.energy.factor_breakdown.elevation_kwh} kWh
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-[#FAF9F6] border border-black/[0.04]">
                    <span className="text-[#767D78] block text-[9.5px]">Cabin HVAC</span>
                    <strong className="text-[#111312]">
                      {planResponse.energy.factor_breakdown.hvac_kwh} kWh
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-[#FAF9F6] border border-black/[0.04]">
                    <span className="text-[#767D78] block text-[9.5px]">Payload Delta</span>
                    <strong className="text-[#111312]">
                      {planResponse.energy.factor_breakdown.payload_kwh >= 0 ? "+" : ""}
                      {planResponse.energy.factor_breakdown.payload_kwh} kWh
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Transparent Model Disclaimer */}
            <p className="text-[10px] text-[#767D78] leading-tight">
              {planResponse.energy.uncertainty_note}
            </p>
          </div>
        )}

        {/* ── Stage 3 Recommended Charging Stops Section ──────────── */}
        {planResponse && (
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-black/[0.08] shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-[#111312] flex items-center gap-1.5">
                <Zap size={13} className="text-[#16A34A]" />
                <span>En-Route Charging Recommendations</span>
              </div>
              <span className="text-[10px] text-[#767D78] font-mono">
                {planResponse.charging.stations_evaluated} evaluated
              </span>
            </div>

            {/* Case A: Charging is needed, and a verified stop is available */}
            {effectivePrimaryStop ? (
              <div className="space-y-2">
                <div
                  className={`p-3 rounded-xl border transition-all ${
                    isChargingNeeded
                      ? "bg-[#FEF2F2]/60 border-[#FECACA]"
                      : "bg-[#F0FDF4] border-[#BBF7D0]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#111312] truncate">
                          {effectivePrimaryStop.name}
                        </span>
                        {effectivePrimaryStop.is_primary && (
                          <span className="text-[9px] font-mono font-bold bg-[#111312] text-white px-1.5 py-0.5 rounded">
                            PRIMARY
                          </span>
                        )}
                        {effectivePrimaryStop.is_backup && (
                          <span className="text-[9px] font-mono font-bold bg-[#767D78] text-white px-1.5 py-0.5 rounded">
                            BACKUP
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#525854] truncate mt-0.5">
                        {effectivePrimaryStop.address || effectivePrimaryStop.operator}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-[#15803D] font-mono">
                        {effectivePrimaryStop.effective_charging_kw} kW {effectivePrimaryStop.effective_charging_kw > 22 ? "DC" : "AC"}
                      </div>
                      <div className="text-[9.5px] text-[#767D78]">
                        ~{effectivePrimaryStop.estimated_charge_mins} min charge ({effectivePrimaryStop.power_kw} kW hub)
                      </div>
                    </div>
                  </div>

                  {/* Connectors & Detour Metrics */}
                  <div className="flex items-center justify-between pt-2 mt-2 border-t border-black/[0.06] text-[10px] font-mono">
                    <span className="text-[#15803D] font-medium">
                      Matched: {effectivePrimaryStop.matched_connectors.join(", ")}
                    </span>
                    <span className="text-[#767D78]">
                      +{effectivePrimaryStop.detour_km} km detour (~
                      {effectivePrimaryStop.detour_mins}m)
                    </span>
                  </div>

                  {/* Arrival & Target SoC */}
                  <div className="flex items-center justify-between pt-1 text-[10.5px]">
                    <span className="text-[#525854]">
                      Arrive charger at:{" "}
                      <strong className="text-[#111312]">
                        {effectivePrimaryStop.arrival_soc_pct}%
                      </strong>
                    </span>
                    <span className="text-[#15803D]">
                      Top-up +{effectivePrimaryStop.required_charge_kwh} kWh &rarr;{" "}
                      <strong>{effectivePrimaryStop.target_departure_soc_pct}%</strong>
                    </span>
                  </div>

                  {/* Stage 3 Qualification Explanation */}
                  <p className="text-[10px] text-[#525854] mt-2 pt-1.5 border-t border-black/[0.04] leading-relaxed">
                    {effectivePrimaryStop.qualification_reason}
                  </p>

                  {/* Registry Telemetry Caveat */}
                  {effectivePrimaryStop.status_note && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-[#767D78]">
                      <Info size={11} className="shrink-0" />
                      <span>{effectivePrimaryStop.status_note}</span>
                    </div>
                  )}
                </div>

                {/* Option to toggle between Primary and Backup stops if available */}
                {planResponse.charging.backup_stop && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedStopId(planResponse.charging.primary_stop?.station_id || null)
                      }
                      className={`flex-1 py-1.5 px-2 rounded-lg border text-[10.5px] font-medium cursor-pointer transition-all ${
                        effectivePrimaryStop.station_id ===
                        planResponse.charging.primary_stop?.station_id
                          ? "bg-[#111312] text-white border-[#111312]"
                          : "bg-[#FAF9F6] text-[#525854] border-black/[0.06] hover:bg-[#F4F3EE]"
                      }`}
                    >
                      Primary: {planResponse.charging.primary_stop?.name.split(" ")[0]}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedStopId(planResponse.charging.backup_stop?.station_id || null)
                      }
                      className={`flex-1 py-1.5 px-2 rounded-lg border text-[10.5px] font-medium cursor-pointer transition-all ${
                        effectivePrimaryStop.station_id ===
                        planResponse.charging.backup_stop?.station_id
                          ? "bg-[#111312] text-white border-[#111312]"
                          : "bg-[#FAF9F6] text-[#525854] border-black/[0.06] hover:bg-[#F4F3EE]"
                      }`}
                    >
                      Backup: {planResponse.charging.backup_stop?.name.split(" ")[0]}
                    </button>
                  </div>
                )}
              </div>
            ) : isChargingNeeded ? (
              /* Case B: Charging is needed, but NO verified station is reachable */
              <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-[#DC2626] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-[#991B1B]">
                      No Reachable Charging Stop Verified
                    </div>
                    <div className="text-[11px] text-[#B91C1C] mt-1 leading-relaxed">
                      {planResponse.charging.summary_message}
                    </div>
                  </div>
                </div>

                {/* Honest rejection breakdown */}
                {Object.keys(planResponse.charging.rejection_summary || {}).length > 0 && (
                  <div className="pt-2 border-t border-red-200 grid grid-cols-2 gap-1 text-[10px] font-mono text-[#7F1D1D]">
                    {Object.entries(planResponse.charging.rejection_summary).map(([k, v]) => (
                      <span key={k}>
                        {k.replace(/_/g, " ")}: <strong>{v}</strong>
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-[#7F1D1D] pt-1">
                  EVverse does not synthesize unverified chargers. Pre-charge your vehicle to
                  the recommended minimum before departure.
                </p>
              </div>
            ) : (
              /* Case C: Direct Drive — No stop needed */
              <div className="p-3 rounded-xl bg-[#FAF9F6] border border-black/[0.05] text-center space-y-1">
                <div className="text-xs font-semibold text-[#111312] flex items-center justify-center gap-1.5">
                  <CheckCircle2 size={13} className="text-[#16A34A]" />
                  <span>Direct Route Feasible</span>
                </div>
                <p className="text-[10.5px] text-[#525854]">
                  {planResponse.charging.summary_message ||
                    `No charging required to complete ${selectedDestination.name} with requested reserve.`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Start Navigation Button ──────────────────────────────── */}
      <div className="pt-1 shrink-0">
        <button
          type="button"
          onClick={() =>
            onStartTripNavigation({
              name: selectedDestination.name,
              latitude: selectedDestination.lat,
              longitude: selectedDestination.lng,
              primaryStation: navStation,
            })
          }
          className="w-full min-h-[46px] py-3 bg-[#111312] text-white text-xs sm:text-sm font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-[#252826] active:scale-[0.99] transition-all shadow-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
        >
          <Navigation size={15} className="text-[#C8F369]" />
          <span>
            {effectivePrimaryStop && isChargingNeeded
              ? `Navigate via ${effectivePrimaryStop.name.split(" ")[0]}`
              : `Start Navigation to ${selectedDestination.name}`}
          </span>
          <ArrowRight size={15} className="text-[#C8F369]" />
        </button>
      </div>
    </div>
  );
}
