"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Zap,
  Lock,
  Unlock,
  Thermometer,
  ChevronRight,
  Navigation,
  Minus,
  Plus,
  Gauge,
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
  // Telemetry drawer expansion
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);

  return (
    <div className="space-y-3.5 pb-20">
      {/* ── Main Vehicle Hero Card (Luxury Studio Presentation) ────── */}
      <div className="bg-white rounded-[28px] p-5 border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] relative overflow-hidden">
        {/* Subtle top studio lighting glow */}
        <div
          className="absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-36 rounded-full pointer-events-none opacity-40"
          style={{
            background: "radial-gradient(ellipse, rgba(200,243,105,0.3) 0%, rgba(255,255,255,0) 70%)",
          }}
        />

        {/* Top Header Row */}
        <div className="flex items-start justify-between relative z-10">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#767D78] font-medium">
                Connected
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[#111312] mt-0.5">
              {vehicle.make} {vehicle.model}
            </h2>
            <div className="text-[11px] text-[#525854] font-medium mt-0.5">
              {vehicle.year} • {vehicle.plugType}
            </div>
          </div>

          <button
            onClick={onOpenGarage}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#111312] bg-[#F4F3EE] hover:bg-[#EAE8E2] px-3 py-1.5 rounded-full transition-all active:scale-95 border border-black/[0.05]"
          >
            Change Car
            <ChevronRight size={13} />
          </button>
        </div>

        {/* Vehicle Rendering */}
        <div className="relative w-full h-44 my-1 flex flex-col items-center justify-center">
          <div className="relative w-full h-40">
            <Image
              src={vehicle.image}
              alt={`${vehicle.make} ${vehicle.model}`}
              fill
              className="object-contain select-none transition-transform duration-500 hover:scale-[1.02]"
              priority
            />
          </div>

          {/* Contact Shadow */}
          <div className="w-full flex justify-center -mt-2 pointer-events-none">
            <div
              className="w-3/5 h-2.5 rounded-full opacity-60"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(17,19,18,0.7) 0%, rgba(17,19,18,0.3) 50%, rgba(17,19,18,0) 80%)",
                filter: "blur(1.5px)",
              }}
            />
          </div>
          <div
            className="w-4/5 h-4 -mt-2 rounded-full pointer-events-none opacity-40"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(17,19,18,0.35) 0%, rgba(17,19,18,0.1) 45%, rgba(17,19,18,0) 75%)",
              filter: "blur(4px)",
            }}
          />
        </div>

        {/* Range & Battery */}
        <div className="pt-3 border-t border-black/[0.06] grid grid-cols-2 gap-4 items-end">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#767D78] font-medium">
              Estimated Range
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-3xl font-bold tracking-tight text-[#111312] font-mono">
                {calibratedRangeKm}
              </span>
              <span className="text-sm font-semibold text-[#525854]">km</span>
            </div>
            <div className="text-[10px] text-[#525854] mt-0.5 flex items-center gap-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#111312]" />
              <span>Based on driving & A/C</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#767D78] font-medium">
              Battery Level
            </div>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className="text-3xl font-bold tracking-tight text-[#111312] font-mono">
                {currentBatteryPct}%
              </span>
              <div className="w-2.5 h-2.5 rounded-full bg-[#C8F369] border border-[#111312] shadow-xs" />
            </div>

            <div className="w-full bg-[#F3F2ED] h-2 rounded-full mt-2 p-0.5 border border-black/[0.05] flex items-center">
              <div
                className="h-full bg-[#111312] transition-all duration-500 rounded-full"
                style={{ width: `${currentBatteryPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Drive Mode ───────────────────────── */}
      <div className="bg-white rounded-[24px] p-4 border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#525854]">
            Drive Mode
          </span>
          <span className="text-[10px] font-mono text-[#767D78]">
            {driveMode === "eco" ? "+12% range" : driveMode === "sport" ? "Uses more power" : "Standard"}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Drive Dynamics Modes"
          className="grid grid-cols-3 gap-1.5 p-1 bg-[#F5F4EF] rounded-2xl border border-black/[0.05]"
        >
          {(
            [
              { id: "eco", label: "Eco", desc: "Save Battery" },
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
                className={`py-2 px-1 min-h-[44px] rounded-xl text-center transition-all duration-200 active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312] ${
                  isSelected
                    ? "bg-[#111312] text-white shadow-xs"
                    : "text-[#525854] hover:text-[#111312]"
                }`}
              >
                <div className="text-xs font-semibold">{m.label}</div>
                <div className={`text-[9px] mt-0.5 ${isSelected ? "text-[#C8F369]" : "text-[#767D78]"}`}>
                  {m.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tactile Hardware Controls Grid ─────────────────────────── */}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tactile Vehicle Hardware Controls">
        {/* Climate HVAC with Tactile Stepper */}
        <div
          className={`p-2.5 sm:p-3 rounded-2xl border transition-all flex flex-col justify-between min-h-[114px] ${
            hvacActive
              ? "bg-white border-black/[0.12] text-[#111312] shadow-xs"
              : "bg-[#F7F6F1] border-black/[0.06] text-[#767D78]"
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <button
              onClick={() => setHvacActive(!hvacActive)}
              className="p-1.5 -m-1 hover:opacity-80 transition-opacity rounded-lg focus-visible:outline-2 focus-visible:outline-[#111312]"
              aria-label={hvacActive ? "Turn off Climate A/C" : "Turn on Climate A/C"}
              aria-pressed={hvacActive}
            >
              <Thermometer size={16} className={hvacActive ? "text-[#111312]" : "text-[#767D78]"} />
            </button>
            <span
              className={`w-2 h-2 rounded-full ${
                hvacActive ? "bg-[#C8F369] border border-[#111312]" : "bg-[#D1D5DB]"
              }`}
              aria-hidden="true"
            />
          </div>

          <div className="mt-1.5">
            <div className="text-[10.5px] sm:text-[11px] font-semibold truncate">A/C & Climate</div>
            <div className="text-[9.5px] sm:text-[10px] text-[#525854] font-mono mt-0.5 truncate">
              {hvacActive ? `${targetCabinTemp.toFixed(1)}°C` : "Off (+18km)"}
            </div>

            {/* Stepper Buttons */}
            {hvacActive && (
              <div className="flex items-center justify-between gap-1 mt-1.5 pt-1.5 border-t border-black/[0.06]">
                <button
                  onClick={() => setTargetCabinTemp((t) => Math.max(16, +(t - 0.5).toFixed(1)))}
                  className="w-7 h-7 rounded-lg bg-[#F4F3EE] hover:bg-[#EAE8E2] flex items-center justify-center text-[#111312] active:scale-90 transition-colors focus-visible:outline-2 focus-visible:outline-[#111312]"
                  aria-label="Decrease cabin temperature by 0.5 degrees"
                >
                  <Minus size={12} />
                </button>
                <span className="text-[10px] sm:text-[11px] font-mono font-bold text-[#111312] text-center" aria-live="polite">
                  {targetCabinTemp.toFixed(1)}°
                </span>
                <button
                  onClick={() => setTargetCabinTemp((t) => Math.min(28, +(t + 0.5).toFixed(1)))}
                  className="w-7 h-7 rounded-lg bg-[#F4F3EE] hover:bg-[#EAE8E2] flex items-center justify-center text-[#111312] active:scale-90 transition-colors focus-visible:outline-2 focus-visible:outline-[#111312]"
                  aria-label="Increase cabin temperature by 0.5 degrees"
                >
                  <Plus size={12} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Security Doors Lock */}
        <button
          onClick={() => setDoorsLocked(!doorsLocked)}
          className={`p-2.5 sm:p-3 rounded-2xl border transition-all text-left active:scale-95 flex flex-col justify-between min-h-[114px] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312] ${
            doorsLocked
              ? "bg-white border-black/[0.12] text-[#111312] shadow-xs"
              : "bg-[#F7F6F1] border-black/[0.06] text-[#767D78]"
          }`}
          aria-label={doorsLocked ? "Doors locked. Tap to unlock." : "Doors unlocked. Tap to lock."}
          aria-pressed={doorsLocked}
        >
          <div className="flex items-center justify-between w-full">
            {doorsLocked ? <Lock size={16} className="text-[#111312]" /> : <Unlock size={16} className="text-[#B91C1C]" />}
            <span
              className={`w-2 h-2 rounded-full ${
                doorsLocked ? "bg-[#111312]" : "bg-[#EF4444]"
              }`}
              aria-hidden="true"
            />
          </div>
          <div className="mt-1.5">
            <div className="text-[10.5px] sm:text-[11px] font-semibold truncate">Doors</div>
            <div className="text-[9.5px] sm:text-[10px] text-[#525854] font-mono mt-0.5 truncate">
              {doorsLocked ? "Locked" : "Unlocked"}
            </div>
            <div className="text-[8.5px] sm:text-[9px] text-[#767D78] mt-1.5 pt-1.5 border-t border-black/[0.06] truncate">
              {doorsLocked ? "All doors locked" : "Doors unlocked"}
            </div>
          </div>
        </button>

        {/* Battery Pre-Conditioning */}
        <button
          onClick={() => setIsPreconditioning(!isPreconditioning)}
          className={`p-2.5 sm:p-3 rounded-2xl border transition-all text-left active:scale-95 flex flex-col justify-between min-h-[114px] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312] ${
            isPreconditioning
              ? "bg-[#111312] text-white border-[#111312] shadow-xs"
              : "bg-white border-black/[0.07] text-[#111312]"
          }`}
          aria-label={isPreconditioning ? "Battery warm-up active. Tap to cancel." : "Battery warm-up standby."}
          aria-pressed={isPreconditioning}
        >
          <div className="flex items-center justify-between w-full">
            <Zap size={16} className={isPreconditioning ? "text-[#C8F369]" : "text-[#111312]"} />
            <span
              className={`w-2 h-2 rounded-full ${
                isPreconditioning ? "bg-[#C8F369] animate-pulse" : "bg-[#E5E7EB]"
              }`}
              aria-hidden="true"
            />
          </div>
          <div className="mt-1.5">
            <div className="text-[10.5px] sm:text-[11px] font-semibold truncate">Battery Prep</div>
            <div className={`text-[9.5px] sm:text-[10px] font-mono mt-0.5 truncate ${isPreconditioning ? "text-[#C8F369]" : "text-[#525854]"}`}>
              {isPreconditioning ? "Warming up" : "Off"}
            </div>
            <div className={`text-[8.5px] sm:text-[9px] mt-1.5 pt-1.5 border-t truncate ${isPreconditioning ? "border-white/10 text-white/70" : "border-black/[0.06] text-[#767D78]"}`}>
              {isPreconditioning ? "Prepares for DC" : "Ready for fast charge"}
            </div>
          </div>
        </button>
      </div>

      {/* ── "Will I Make It?" Corridor Feasibility Entry Point ────── */}
      <div className="bg-white rounded-[24px] p-3.5 border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#111312] flex items-center justify-center text-[#C8F369] shrink-0">
            <Gauge size={16} />
          </div>
          <div>
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-[#767D78] font-semibold flex items-center gap-1.5">
              <span>Trip Range Physics</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
            </div>
            <div className="text-xs font-bold text-[#111312] leading-tight">
              &quot;Will I Make It?&quot; Planner
            </div>
            <div className="text-[11px] text-[#525854]">
              Corridor energy, arrival battery &amp; charging stops
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenJourneyPlanner}
          className="px-3.5 py-2 bg-[#111312] text-white text-[11px] font-semibold rounded-xl flex items-center gap-1.5 hover:bg-[#252826] active:scale-95 transition-all shadow-xs shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
        >
          <span>Plan Trip</span>
          <ChevronRight size={13} className="text-[#C8F369]" />
        </button>
      </div>

      {/* ── Nearest Ultra Fast DC Charger Recommendation ─────────── */}
      {nearestUltraStation && (
        <div className="bg-white rounded-[24px] p-3.5 border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#111312] flex items-center justify-center text-[#C8F369] shrink-0">
              <Zap size={16} />
            </div>
            <div>
              <div className="text-[9.5px] font-mono uppercase tracking-wider text-[#767D78] font-semibold">
                Nearest Fast Charger • {nearestUltraStation.powerKw} kW
              </div>
              <div className="text-xs font-bold text-[#111312] leading-tight">
                {nearestUltraStation.name}
              </div>
              <div className="text-[11px] text-[#525854]">
                {nearestUltraStation.distanceKm.toFixed(1)} km away • ~{Math.round(nearestUltraStation.distanceKm * 2.2)} mins drive
              </div>
            </div>
          </div>

          <button
            onClick={onNavigateToNearest}
            className="px-3.5 py-2 bg-[#111312] text-white text-[11px] font-semibold rounded-xl flex items-center gap-1.5 hover:bg-[#252826] active:scale-95 transition-all shadow-xs shrink-0"
          >
            <Navigation size={12} className="text-[#C8F369]" />
            Route
          </button>
        </div>
      )}

      {/* ── Real OEM Telemetry & Diagnostics Sheet ─────────────────── */}
      <div className="bg-[#FAF9F6] rounded-[24px] p-4 border border-black/[0.06] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#767D78] font-semibold">
            Vehicle Health
          </span>
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            aria-expanded={showDiagnostics}
            aria-controls="cockpit-chassis-diagnostics"
            className="text-[10.5px] font-semibold text-[#111312] hover:underline py-1.5 px-2 rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
          >
            {showDiagnostics ? "Hide Details" : "View Tires & Battery"}
          </button>
        </div>

        {/* Core Specs Bar */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[9.5px] font-mono uppercase text-[#767D78]">Battery Health</div>
            <div className="text-sm font-bold text-[#111312] font-mono mt-0.5">{vehicle.sohPct}%</div>
            <div className="text-[9.5px] text-[#16A34A] font-semibold">Good condition</div>
          </div>

          <div className="border-x border-black/[0.06]">
            <div className="text-[9.5px] font-mono uppercase text-[#767D78]">Max Fast Charge</div>
            <div className="text-sm font-bold text-[#111312] font-mono mt-0.5">{vehicle.maxDcSpeedKw} kW</div>
            <div className="text-[9.5px] text-[#525854]">Fast charging</div>
          </div>

          <div>
            <div className="text-[9.5px] font-mono uppercase text-[#767D78]">Efficiency</div>
            <div className="text-sm font-bold text-[#111312] font-mono mt-0.5">{vehicle.efficiencyKwh100km}</div>
            <div className="text-[9.5px] text-[#525854]">kWh/100km</div>
          </div>
        </div>

        {/* Expanded Diagnostics */}
        {showDiagnostics && (
          <div className="pt-3 border-t border-black/[0.06] space-y-2.5">
            {/* TPMS Tire Pressures */}
            <div>
              <div className="text-[10px] font-mono text-[#767D78] uppercase mb-1.5">
                Tire Pressures
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-white p-2 rounded-xl border border-black/[0.05] flex justify-between">
                  <span className="text-[#525854]">Front (L/R)</span>
                  <span className="font-bold text-[#111312]">2.4 / 2.4 bar</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-black/[0.05] flex justify-between">
                  <span className="text-[#525854]">Rear (L/R)</span>
                  <span className="font-bold text-[#111312]">2.6 / 2.6 bar</span>
                </div>
              </div>
            </div>

            {/* Battery Thermals */}
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-white p-2 rounded-xl border border-black/[0.05] flex justify-between">
                <span className="text-[#525854]">Battery Temp</span>
                <span className="font-bold text-[#16A34A]">24°C (Normal)</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-black/[0.05] flex justify-between">
                <span className="text-[#525854]">12V Battery</span>
                <span className="font-bold text-[#111312]">13.8V (Good)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
