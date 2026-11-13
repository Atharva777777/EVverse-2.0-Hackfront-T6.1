"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Zap,
  Lock,
  Unlock,
  Thermometer,
  ChevronRight,
  ChevronDown,
  Navigation,
  Minus,
  Plus,
  Car,
  Shield,
  Gauge,
  SlidersHorizontal,
} from "lucide-react";

export interface EVVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  image: string;
  batteryKwh: number;
  usableKwh: number;
  currentBatteryPct: number;
  wltpRangeKm: number;
  efficiencyKwh100km: number;
  maxDcSpeedKw: number;
  maxAcSpeedKw: number;
  plugType: string;
  plugImage: string;
  vin: string;
  sohPct: number;
}

interface VehicleCockpitProps {
  vehicle: EVVehicle;
  currentBatteryPct: number;
  calibratedRangeKm: number;
  driveMode: "normal" | "eco" | "sport";
  setDriveMode: (mode: "normal" | "eco" | "sport") => void;
  hvacActive: boolean;
  setHvacActive: (active: boolean) => void;
  doorsLocked: boolean;
  setDoorsLocked: (locked: boolean) => void;
  isPreconditioning: boolean;
  setIsPreconditioning: (pre: boolean) => void;
  nearestUltraStation?: { name: string; distanceKm: number; powerKw: number } | null;
  onNavigateToNearest?: () => void;
  onOpenGarage?: () => void;
  onOpenJourneyPlanner?: () => void;
}

export function VehicleCockpit({
  vehicle,
  currentBatteryPct,
  calibratedRangeKm,
  driveMode,
  setDriveMode,
  hvacActive,
  setHvacActive,
  doorsLocked,
  setDoorsLocked,
  isPreconditioning,
  setIsPreconditioning,
  nearestUltraStation,
  onNavigateToNearest,
  onOpenGarage,
  onOpenJourneyPlanner,
}: VehicleCockpitProps) {
  // Cabin Temperature Control state
  const [targetCabinTemp, setTargetCabinTemp] = useState<number>(21.5);
  // Secondary Telemetry & Diagnostics accordion expansion (collapsed by default)
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);

  return (
    <div className="space-y-3 pb-24">
      {/* ── Main Vehicle Cockpit Hero Card ─────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-black/[0.07] shadow-2xs relative">
        {/* Top Header Row: Vehicle Identity & Subtle Switcher */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#525854]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#767D78] font-semibold">
                Simulated Profile • Active
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#111312] leading-snug line-clamp-2 break-words">
              {vehicle.make} {vehicle.model}
            </h2>
            <div className="text-[11px] font-mono text-[#525854] mt-0.5">
              {vehicle.year} • {vehicle.plugType}
            </div>
          </div>

          {/* Subtle Vehicle Switcher Icon/Button */}
          <button
            type="button"
            onClick={onOpenGarage}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#111312] bg-[#F4F3EE] hover:bg-[#EAE8E2] border border-black/[0.06] shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0 self-start mt-0.5 focus-visible:outline-2 focus-visible:outline-[#111312]"
            title="Open vehicle management and switch vehicle"
            aria-label="Switch or manage vehicles"
          >
            <Car size={14} className="text-[#111312]" />
            <span>Switch</span>
          </button>
        </div>

        {/* Central Vehicle Image Presentation */}
        <div className="relative w-full h-36 sm:h-40 my-2 flex flex-col items-center justify-center">
          <div className="relative w-full h-32 sm:h-36">
            <Image
              src={vehicle.image}
              alt={`${vehicle.make} ${vehicle.model}`}
              fill
              className="object-contain select-none transition-transform duration-300 hover:scale-[1.01]"
              priority
            />
          </div>

          {/* Natural Ground Shadow */}
          <div className="w-3/5 h-2 rounded-full opacity-40 bg-black/30 blur-[2px] -mt-1 pointer-events-none" />
        </div>

        {/* Primary Telemetry: Estimated Range & Battery SoC */}
        <div className="pt-3 border-t border-black/[0.06] grid grid-cols-2 gap-3 items-end">
          {/* Estimated Driving Range */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#767D78] font-semibold">
              Estimated Range
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111312] font-mono">
                {calibratedRangeKm}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-[#525854]">km</span>
            </div>
            <div className="text-[10px] text-[#525854] mt-0.5 flex items-center gap-1 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
              <span>
                {driveMode.toUpperCase()} {hvacActive ? "• A/C On" : "• A/C Off"}
              </span>
            </div>
          </div>

          {/* Battery Percentage & Visual Bar */}
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#767D78] font-semibold">
              Battery Level
            </div>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111312] font-mono">
                {currentBatteryPct}%
              </span>
              <div
                className={`w-2.5 h-2.5 rounded-full border border-black/[0.1] ${
                  currentBatteryPct > 20 ? "bg-[#16A34A]" : "bg-[#EF4444]"
                }`}
              />
            </div>

            {/* State of Charge Horizontal Bar */}
            <div className="w-full bg-[#EFECE6] h-2 rounded-full mt-2 p-0.5 border border-black/[0.05] flex items-center">
              <div
                className="h-full bg-[#111312] transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(5, currentBatteryPct)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Essential Vehicle Controls ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-black/[0.07] shadow-2xs space-y-3">
        {/* Drive Mode Segmented Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#111312]">Drive Dynamics</span>
            <span className="text-[10px] font-mono text-[#767D78]">
              {driveMode === "eco"
                ? "+12% range efficiency"
                : driveMode === "sport"
                ? "-14% range penalty"
                : "Standard baseline calibration"}
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Drive Dynamics Modes"
            className="grid grid-cols-3 gap-1 p-1 bg-[#F5F4EF] rounded-xl border border-black/[0.05]"
          >
            {(
              [
                { id: "eco", label: "Eco", desc: "+12% Range" },
                { id: "normal", label: "Normal", desc: "Balanced" },
                { id: "sport", label: "Sport", desc: "Performance" },
              ] as const
            ).map((m) => {
              const isSelected = driveMode === m.id;
              return (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setDriveMode(m.id)}
                  className={`py-1.5 px-1 rounded-lg text-center transition-all duration-150 cursor-pointer active:scale-95 focus-visible:outline-2 focus-visible:outline-[#111312] ${
                    isSelected
                      ? "bg-[#111312] text-white shadow-2xs"
                      : "text-[#525854] hover:text-[#111312]"
                  }`}
                >
                  <div className="text-xs font-bold">{m.label}</div>
                  <div
                    className={`text-[9px] font-mono mt-0.5 ${
                      isSelected ? "text-[#C8F369]" : "text-[#767D78]"
                    }`}
                  >
                    {m.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Responsive Hardware Settings */}
        <div
          className="grid grid-cols-3 gap-2 pt-1 border-t border-black/[0.05]"
          role="group"
          aria-label="Tactile Vehicle Settings"
        >
          {/* Climate A/C */}
          <div
            className={`p-2.5 rounded-xl border transition-all flex flex-col justify-between min-h-[96px] ${
              hvacActive
                ? "bg-[#FAF9F6] border-black/[0.12] text-[#111312]"
                : "bg-[#F7F6F1] border-black/[0.05] text-[#767D78]"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => setHvacActive(!hvacActive)}
                className="p-1 -m-1 hover:opacity-80 transition-opacity rounded cursor-pointer"
                aria-label={hvacActive ? "Turn off Climate" : "Turn on Climate"}
                aria-pressed={hvacActive}
              >
                <Thermometer
                  size={15}
                  className={hvacActive ? "text-[#111312]" : "text-[#767D78]"}
                />
              </button>
              <span
                className={`w-2 h-2 rounded-full ${
                  hvacActive ? "bg-[#16A34A]" : "bg-[#D1D5DB]"
                }`}
                aria-hidden="true"
              />
            </div>

            <div className="mt-1">
              <div className="text-[10.5px] font-semibold truncate">Climate A/C</div>
              <div className="text-[9.5px] font-mono text-[#525854] mt-0.5 truncate">
                {hvacActive ? `${targetCabinTemp.toFixed(1)}°C` : "Standby (+8%)"}
              </div>

              {hvacActive && (
                <div className="flex items-center justify-between gap-1 mt-1 pt-1 border-t border-black/[0.06]">
                  <button
                    type="button"
                    onClick={() =>
                      setTargetCabinTemp((t) => Math.max(16, +(t - 0.5).toFixed(1)))
                    }
                    className="w-5 h-5 rounded bg-white hover:bg-[#EAE8E2] border border-black/[0.06] flex items-center justify-center text-[#111312] active:scale-90 transition-colors cursor-pointer"
                    aria-label="Lower temperature"
                  >
                    <Minus size={10} />
                  </button>
                  <span className="text-[10px] font-mono font-bold text-[#111312]">
                    {targetCabinTemp.toFixed(1)}°
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setTargetCabinTemp((t) => Math.min(28, +(t + 0.5).toFixed(1)))
                    }
                    className="w-5 h-5 rounded bg-white hover:bg-[#EAE8E2] border border-black/[0.06] flex items-center justify-center text-[#111312] active:scale-90 transition-colors cursor-pointer"
                    aria-label="Increase temperature"
                  >
                    <Plus size={10} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Door Locks */}
          <button
            type="button"
            onClick={() => setDoorsLocked(!doorsLocked)}
            className={`p-2.5 rounded-xl border transition-all text-left flex flex-col justify-between min-h-[96px] cursor-pointer active:scale-95 ${
              doorsLocked
                ? "bg-[#FAF9F6] border-black/[0.12] text-[#111312]"
                : "bg-[#F7F6F1] border-black/[0.05] text-[#767D78]"
            }`}
            aria-label={doorsLocked ? "Doors locked. Tap to unlock." : "Doors unlocked. Tap to lock."}
            aria-pressed={doorsLocked}
          >
            <div className="flex items-center justify-between w-full">
              {doorsLocked ? (
                <Lock size={15} className="text-[#111312]" />
              ) : (
                <Unlock size={15} className="text-[#DC2626]" />
              )}
              <span
                className={`w-2 h-2 rounded-full ${
                  doorsLocked ? "bg-[#111312]" : "bg-[#DC2626]"
                }`}
                aria-hidden="true"
              />
            </div>
            <div className="mt-1">
              <div className="text-[10.5px] font-semibold truncate">Security</div>
              <div className="text-[9.5px] font-mono text-[#525854] mt-0.5 truncate">
                {doorsLocked ? "All Locked" : "Unlocked"}
              </div>
              <div className="text-[8.5px] font-mono text-[#767D78] mt-1 pt-1 border-t border-black/[0.05] truncate">
                Central lock
              </div>
            </div>
          </button>

          {/* Battery Preconditioning */}
          <button
            type="button"
            onClick={() => setIsPreconditioning(!isPreconditioning)}
            className={`p-2.5 rounded-xl border transition-all text-left flex flex-col justify-between min-h-[96px] cursor-pointer active:scale-95 ${
              isPreconditioning
                ? "bg-[#111312] text-white border-[#111312] shadow-2xs"
                : "bg-[#FAF9F6] border-black/[0.08] text-[#111312]"
            }`}
            aria-label={
              isPreconditioning
                ? "Battery thermal preconditioning active. Tap to cancel."
                : "Battery thermal preconditioning standby."
            }
            aria-pressed={isPreconditioning}
          >
            <div className="flex items-center justify-between w-full">
              <Zap
                size={15}
                className={isPreconditioning ? "text-[#C8F369]" : "text-[#111312]"}
              />
              <span
                className={`w-2 h-2 rounded-full ${
                  isPreconditioning ? "bg-[#C8F369] animate-pulse" : "bg-[#D1D5DB]"
                }`}
                aria-hidden="true"
              />
            </div>
            <div className="mt-1">
              <div className="text-[10.5px] font-semibold truncate">Battery Prep</div>
              <div
                className={`text-[9.5px] font-mono mt-0.5 truncate ${
                  isPreconditioning ? "text-[#C8F369]" : "text-[#525854]"
                }`}
              >
                {isPreconditioning ? "Warming Up" : "Standby"}
              </div>
              <div
                className={`text-[8.5px] font-mono mt-1 pt-1 border-t truncate ${
                  isPreconditioning
                    ? "border-white/10 text-white/70"
                    : "border-black/[0.05] text-[#767D78]"
                }`}
              >
                Fast DC ready
              </div>
            </div>
          </button>
        </div>

        {/* Transparent Simulated Notice */}
        <div className="text-[9.5px] font-mono text-[#767D78] text-center pt-0.5">
          Simulated vehicle controls • Range dynamically estimated from physics model
        </div>
      </div>

      {/* ── Journey Entry Point ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-black/[0.07] shadow-2xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#111312] flex items-center justify-center text-[#C8F369] shrink-0">
            <Gauge size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#111312] leading-tight truncate">
              &quot;Will I Make It?&quot; Journey Planner
            </div>
            <div className="text-[11px] text-[#525854] truncate mt-0.5">
              Corridor energy, elevation &amp; en-route chargers
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenJourneyPlanner}
          className="px-3 py-2 bg-[#111312] text-white text-[11px] font-semibold rounded-xl flex items-center gap-1.5 hover:bg-[#252826] active:scale-95 transition-all shadow-2xs shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
        >
          <span>Plan Trip</span>
          <ChevronRight size={13} className="text-[#C8F369]" />
        </button>
      </div>

      {/* ── Nearest Ultra Fast Charger Shortcut (if available) ─────────── */}
      {nearestUltraStation && (
        <div className="bg-white rounded-2xl p-3 border border-black/[0.06] shadow-2xs flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#FAF9F6] border border-black/[0.06] flex items-center justify-center text-[#16A34A] shrink-0">
              <Zap size={14} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono text-[#767D78]">
                Nearest Fast Charger • {nearestUltraStation.powerKw} kW
              </div>
              <div className="text-xs font-bold text-[#111312] truncate">
                {nearestUltraStation.name}
              </div>
              <div className="text-[10px] text-[#525854] font-mono">
                {nearestUltraStation.distanceKm.toFixed(1)} km away
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateToNearest}
            className="px-2.5 py-1.5 bg-[#FAF9F6] hover:bg-[#EAE8E2] border border-black/[0.08] text-[#111312] text-[11px] font-semibold rounded-lg flex items-center gap-1 active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <Navigation size={11} className="text-[#16A34A]" />
            <span>Route</span>
          </button>
        </div>
      )}

      {/* ── Secondary Vehicle Information & Health (Collapsible) ────────── */}
      <div className="bg-[#FAF9F6] rounded-2xl border border-black/[0.06] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[#111312] hover:bg-[#F2EFE9] transition-colors cursor-pointer"
          aria-expanded={showDiagnostics}
        >
          <div className="flex items-center gap-1.5">
            <Shield size={13} className="text-[#16A34A]" />
            <span>Chassis Specifications &amp; Baseline Telemetry</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#525854]">
            <span>{showDiagnostics ? "Hide" : "View"}</span>
            <ChevronDown
              size={13}
              className={`transition-transform duration-200 ${
                showDiagnostics ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>

        {showDiagnostics && (
          <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 border-t border-black/[0.05] animate-in fade-in-50 duration-150">
            {/* Core Homologation Specs Grid */}
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-white p-2 rounded-xl border border-black/[0.05]">
                <div className="text-[9px] font-mono uppercase text-[#767D78]">
                  Battery SOH
                </div>
                <div className="text-xs font-mono font-bold text-[#111312] mt-0.5">
                  {vehicle.sohPct}%
                </div>
                <div className="text-[9px] text-[#16A34A] font-semibold">Good</div>
              </div>

              <div className="bg-white p-2 rounded-xl border border-black/[0.05]">
                <div className="text-[9px] font-mono uppercase text-[#767D78]">
                  Max DC Power
                </div>
                <div className="text-xs font-mono font-bold text-[#111312] mt-0.5">
                  {vehicle.maxDcSpeedKw} kW
                </div>
                <div className="text-[9px] text-[#525854]">Fast Charging</div>
              </div>

              <div className="bg-white p-2 rounded-xl border border-black/[0.05]">
                <div className="text-[9px] font-mono uppercase text-[#767D78]">
                  Efficiency
                </div>
                <div className="text-xs font-mono font-bold text-[#111312] mt-0.5">
                  {vehicle.efficiencyKwh100km}
                </div>
                <div className="text-[9px] text-[#525854]">kWh/100km</div>
              </div>
            </div>

            {/* Detailed Metadata */}
            <div className="bg-white p-2.5 rounded-xl border border-black/[0.05] text-[11px] space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-[#525854]">Usable / Total Capacity:</span>
                <span className="font-bold text-[#111312]">
                  {vehicle.usableKwh} / {vehicle.batteryKwh} kWh
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Homologation Range:</span>
                <span className="font-bold text-[#111312]">{vehicle.wltpRangeKm} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Plug Hardware Standard:</span>
                <span className="font-bold text-[#111312]">{vehicle.plugType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Chassis VIN:</span>
                <span className="font-bold text-[#111312] truncate max-w-[170px]">
                  {vehicle.vin || "Standard OEM"}
                </span>
              </div>
            </div>

            {/* Tire Pressure & Thermal Telemetry */}
            <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono">
              <div className="bg-white p-2 rounded-xl border border-black/[0.05] flex justify-between">
                <span className="text-[#525854]">Tires (F/R)</span>
                <span className="font-bold text-[#111312]">2.4 / 2.6 bar</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-black/[0.05] flex justify-between">
                <span className="text-[#525854]">Pack Temp</span>
                <span className="font-bold text-[#16A34A]">24°C (Normal)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
