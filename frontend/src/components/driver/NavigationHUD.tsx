"use client";

import React, { useMemo } from "react";
import {
  Navigation,
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  RotateCw,
  Split,
  Flag,
  Zap,
  AlertTriangle,
  Compass,
  X,
  ChevronRight,
} from "lucide-react";
import type { RoadRoute, RouteManeuver } from "@/lib/routeService";
import { formatManeuverDistance, calculateDistanceMeters } from "@/lib/routeService";

interface NavigationHUDProps {
  route: RoadRoute;
  activeLegIndex: number;
  currentStepIndex: number;
  driverLocation: [number, number] | null;
  driverHeading: number | null;
  gpsStatus: "prompt" | "active" | "denied" | "unavailable";
  isOffRoute: boolean;
  activeVehicleSoc: number;
  onAdvanceToLeg?: (legIndex: number) => void;
  onExitNavigation: () => void;
}

export function NavigationHUD({
  route,
  activeLegIndex,
  currentStepIndex,
  driverLocation,
  driverHeading,
  gpsStatus,
  isOffRoute,
  activeVehicleSoc,
  onAdvanceToLeg,
  onExitNavigation,
}: NavigationHUDProps) {
  const currentLeg = route.legs[activeLegIndex] || route.legs[0];
  const isMultiLeg = route.legs.length > 1;
  const isLastLeg = activeLegIndex >= route.legs.length - 1;

  // Current and next step maneuvers
  const steps = currentLeg?.steps || [];
  const currentManeuver: RouteManeuver | undefined = steps[currentStepIndex] || steps[0];
  const nextManeuver: RouteManeuver | undefined = steps[currentStepIndex + 1];

  // Real-time distance to the upcoming maneuver
  const distanceToCurrentStep = useMemo(() => {
    if (!driverLocation || !currentManeuver) {
      return currentManeuver ? currentManeuver.distanceMeters : 0;
    }
    return calculateDistanceMeters(driverLocation, currentManeuver.location);
  }, [driverLocation, currentManeuver]);

  // Maneuver icon helper
  const renderManeuverIcon = (type: string, modifier?: string) => {
    const mod = (modifier || "").toLowerCase();
    if (type === "arrive") return <Flag size={20} className="text-[#C8F369]" />;
    if (type === "roundabout" || type === "rotary")
      return <RotateCw size={20} className="text-[#C8F369]" />;
    if (type === "fork" || type === "merge")
      return <Split size={20} className="text-[#C8F369]" />;
    if (mod.includes("left"))
      return <CornerUpLeft size={20} className="text-[#C8F369]" />;
    if (mod.includes("right"))
      return <CornerUpRight size={20} className="text-[#C8F369]" />;
    return <ArrowUp size={20} className="text-[#C8F369]" />;
  };

  return (
    <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none z-30 flex flex-col justify-between p-3 select-none">
      {/* ── TOP NAV HEADER HUD ─────────────────────────────────────────── */}
      <div className="space-y-2 pointer-events-auto max-w-lg mx-auto w-full">
        {/* Main Turn-by-Turn Card */}
        <div className="bg-[#111312] text-white rounded-2xl p-3.5 shadow-2xl border border-white/10 space-y-2.5">
          {/* Top Status Strip */}
          <div className="flex items-center justify-between text-[10px] font-mono border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              {/* GPS Live vs Preview Status */}
              {gpsStatus === "active" ? (
                <span className="flex items-center gap-1.5 text-[#C8F369] font-bold">
                  <span className="w-2 h-2 rounded-full bg-[#C8F369] animate-ping" />
                  GPS ACTIVE
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[#9CA3AF]">
                  <Compass size={11} />
                  PREVIEW (GPS {gpsStatus.toUpperCase()})
                </span>
              )}

              {/* Multi-Leg Indicator */}
              {isMultiLeg && (
                <span className="bg-white/10 px-2 py-0.5 rounded text-[9.5px] font-bold text-[#E2E5DF]">
                  {currentLeg.isChargingWaypoint ? (
                    <span className="text-[#C8F369]">LEG 1: CHARGING STOP</span>
                  ) : (
                    <span>LEG 2: FINAL DESTINATION</span>
                  )}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onExitNavigation}
              className="p-1 text-[#9CA3AF] hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Exit Navigation"
            >
              <X size={15} />
            </button>
          </div>

          {/* Maneuver Instruction Row */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
              {currentManeuver
                ? renderManeuverIcon(currentManeuver.type, currentManeuver.modifier)
                : <Navigation size={20} className="text-[#C8F369]" />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-mono font-bold text-[#C8F369] uppercase tracking-wider">
                {distanceToCurrentStep > 35
                  ? `In ${formatManeuverDistance(distanceToCurrentStep)}`
                  : "Now"}
              </div>
              <div className="text-sm font-bold text-white truncate leading-snug">
                {currentManeuver ? currentManeuver.instruction : `Proceed to ${currentLeg.targetName}`}
              </div>

              {nextManeuver && (
                <div className="text-[10px] text-[#9CA3AF] truncate mt-0.5 flex items-center gap-1">
                  <span>Then:</span>
                  <span className="text-white/80">{nextManeuver.instruction}</span>
                </div>
              )}
            </div>
          </div>

          {/* Off Route Warning */}
          {isOffRoute && (
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span>Off planned corridor. Rejoin route or recalculate.</span>
            </div>
          )}
        </div>

        {/* Multi-Leg Waypoint Transition Card (Only if at or near waypoint) */}
        {isMultiLeg && currentLeg.isChargingWaypoint && onAdvanceToLeg && (
          <div className="bg-[#FAF9F6] text-[#111312] rounded-xl p-2.5 shadow-lg border border-black/10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Zap size={15} className="text-[#16A34A] shrink-0" />
              <div className="truncate">
                <div className="font-bold text-[11px] truncate">
                  Stop: {currentLeg.targetName}
                </div>
                <div className="text-[10px] text-[#525854]">
                  Original destination: {route.destinationName}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onAdvanceToLeg(activeLegIndex + 1)}
              className="px-2.5 py-1 bg-[#111312] text-white font-semibold rounded-lg text-[10.5px] flex items-center gap-1 hover:bg-[#252826] active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <span>Continue Leg 2</span>
              <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV TRIP METRICS DOCK ───────────────────────────────── */}
      <div className="pointer-events-auto max-w-lg mx-auto w-full pb-safe mb-1">
        <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3 sm:p-3.5 shadow-xl border border-black/10 flex items-center justify-between text-[#111312] gap-2">
          {/* Remaining Distance & ETA */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-lg font-black font-mono text-[#111312]">
                {currentLeg.distanceKm} km
              </span>
              <span className="text-xs font-mono text-[#767D78]">
                (~{currentLeg.durationMins} min)
              </span>
            </div>
            <div className="text-[11px] text-[#525854] font-medium flex items-center gap-1 mt-0.5 truncate">
              <span>Arrival:</span>
              <strong className="text-[#111312] font-mono">{route.formattedEta}</strong>
            </div>
          </div>

          {/* Vehicle Battery SOC */}
          <div className="text-right shrink-0 px-2 border-x border-black/[0.06]">
            <div className="flex items-center justify-end gap-1 text-[10.5px] font-semibold text-[#16A34A]">
              <Zap size={12} aria-hidden="true" />
              <span>EV SoC</span>
            </div>
            <div className="text-base font-black font-mono text-[#111312]">
              {activeVehicleSoc}%
            </div>
          </div>

          {/* Exit Button (Min 44px Touch Target) */}
          <button
            type="button"
            onClick={onExitNavigation}
            className="min-h-[44px] px-3.5 py-2 bg-[#FAF9F6] hover:bg-[#F0EFEA] border border-black/10 rounded-xl text-xs font-bold text-[#111312] active:scale-95 transition-all cursor-pointer shrink-0"
          >
            End
          </button>
        </div>
      </div>
    </div>
  );
}

