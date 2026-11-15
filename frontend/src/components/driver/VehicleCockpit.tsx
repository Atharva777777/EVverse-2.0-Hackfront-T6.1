"use client";

import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import {
  Car,
  ChevronRight,
  ChevronDown,
  Navigation,
  Zap,
  Gauge,
  MapPin,
  Check,
} from "lucide-react";
import { CITY_CONFIGS } from "@/components/CountryCitySelector";

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
  plugImage?: string;
  vin?: string;
  sohPct?: number;
}

export interface VehicleCockpitProps {
  vehicle: EVVehicle;
  currentBatteryPct: number;
  calibratedRangeKm: number;
  driveMode: "normal" | "eco" | "sport";
  setDriveMode: (mode: "normal" | "eco" | "sport") => void;
  hvacActive?: boolean;
  setHvacActive?: (active: boolean) => void;
  doorsLocked?: boolean;
  setDoorsLocked?: (locked: boolean) => void;
  isPreconditioning: boolean;
  setIsPreconditioning: (pre: boolean) => void;
  nearestUltraStation?: { name: string; distanceKm: number; powerKw: number } | null;
  onNavigateToNearest?: () => void;
  onOpenGarage?: () => void;
  onOpenJourneyPlanner?: () => void;
  selectedCity?: string;
  onCityChange?: (city: string) => void;
}

export function VehicleCockpit({
  vehicle,
  currentBatteryPct,
  calibratedRangeKm,
  driveMode,
  setDriveMode,
  isPreconditioning,
  setIsPreconditioning,
  nearestUltraStation,
  onNavigateToNearest,
  onOpenGarage,
  onOpenJourneyPlanner,
  selectedCity = "Pune",
  onCityChange,
}: VehicleCockpitProps) {
  // Collapsible Chassis Specs (collapsed by default to keep screen focused)
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState<boolean>(false);

  // Auto-scroll to section anchor if requested in URL
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#vehicle-readiness") {
      setTimeout(() => {
        document.getElementById("vehicle-readiness")?.scrollIntoView();
      }, 300);
    }
  }, []);

  // Popular quick location chips - ensure active city is always visible among the chips
  const allCityNames = Object.keys(CITY_CONFIGS);
  const displayCities = useMemo(() => {
    const defaultQuick = ["Pune", "Mumbai", "Navi Mumbai", "Pimpri-Chinchwad", "Thane"];
    if (selectedCity && !defaultQuick.some((c) => c.toLowerCase() === selectedCity.toLowerCase())) {
      return [selectedCity, ...defaultQuick];
    }
    return defaultQuick;
  }, [selectedCity]);

  return (
    <div className="space-y-4 pb-12 select-none">
      {/* ──────────────────────────────────────────────────────────────────
          LOCATION SELECTION ("Where do you live?")
         ────────────────────────────────────────────────────────────────── */}
      <section
        aria-label="Location Selection"
        className="bg-white rounded-2xl p-4 border border-black/[0.06] shadow-2xs space-y-2.5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#111312]">Where do you live?</h2>

          {/* Active city indicator */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111312]">
            <MapPin size={13} className="text-[#16A34A]" />
            <span>{selectedCity}</span>
          </div>
        </div>

        {/* Quick Location Pills - Smooth Horizontal Scroll, No Awkward Scrollbars */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-0.5 scroll-smooth touch-pan-x">
          {displayCities.map((city) => {
            const isSelected = selectedCity.toLowerCase() === city.toLowerCase();
            return (
              <button
                key={city}
                type="button"
                onClick={() => onCityChange?.(city)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                  isSelected
                    ? "bg-[#111312] text-white shadow-2xs font-semibold"
                    : "bg-[#F7F6F2] hover:bg-[#EFECE5] text-[#525854] border border-black/[0.04]"
                }`}
              >
                {city}
              </button>
            );
          })}

          {/* More Cities Dropdown Trigger */}
          <button
            type="button"
            onClick={() => setIsCityDropdownOpen(!isCityDropdownOpen)}
            className="shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#F7F6F2] hover:bg-[#EFECE5] text-[#525854] border border-black/[0.04] whitespace-nowrap flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
            aria-expanded={isCityDropdownOpen}
            aria-label="More regions"
          >
            <span>More</span>
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ${
                isCityDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        {/* Expandable Full City List Dropdown */}
        {isCityDropdownOpen && (
          <div className="pt-2 border-t border-black/[0.05] animate-in fade-in-50 duration-150">
            <div className="text-[10px] font-mono text-[#767D78] uppercase mb-1.5">
              All Regional Charging Grids ({allCityNames.length})
            </div>
            <select
              value={selectedCity}
              onChange={(e) => {
                onCityChange?.(e.target.value);
                setIsCityDropdownOpen(false);
              }}
              className="w-full bg-[#F7F6F2] border border-black/[0.08] text-[#111312] text-xs font-semibold rounded-xl px-3 py-2 cursor-pointer focus:outline-hidden"
            >
              {allCityNames.map((city) => (
                <option key={city} value={city}>
                  {city} ({CITY_CONFIGS[city]?.desc || "Regional Grid"})
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* ──────────────────────────────────────────────────────────────────
          YOUR VEHICLE HERO SECTION
         ────────────────────────────────────────────────────────────────── */}
      <section
        aria-label="Your Vehicle Cockpit"
        className="bg-white rounded-2xl p-4 sm:p-5 border border-black/[0.06] shadow-2xs relative"
      >
        {/* Vehicle Identity Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-mono uppercase tracking-widest text-[#767D78] font-bold">
              Your Vehicle
            </h2>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#111312] leading-tight mt-1 line-clamp-2 break-words">
              {vehicle.make} {vehicle.model}
            </h1>
            <div className="text-xs font-mono text-[#525854] mt-0.5">
              {vehicle.year} • {vehicle.plugType}
            </div>
          </div>

          {/* Switch Vehicle Button */}
          <button
            type="button"
            onClick={onOpenGarage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#111312] bg-[#F5F4EF] hover:bg-[#EAE8E2] border border-black/[0.06] shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0 self-start focus-visible:outline-2 focus-visible:outline-[#111312]"
            title="Switch or configure vehicle in garage"
            aria-label="Switch vehicle"
          >
            <Car size={14} className="text-[#111312]" />
            <span>Switch</span>
          </button>
        </div>

        {/* Central Vehicle Showcase Stage */}
        <div className="relative w-full h-44 sm:h-48 my-3 rounded-2xl overflow-hidden border border-black/[0.06] bg-gradient-to-b from-[#F7F6F2] via-[#EFECE5] to-[#E2DED5] shadow-2xs flex items-center justify-center">
          {vehicle.image.toLowerCase().endsWith(".png") ? (
            <div className="relative w-[92%] h-[80%] flex items-center justify-center">
              <div className="absolute bottom-1 w-3/4 h-3 bg-black/15 blur-sm rounded-full pointer-events-none" />
              <Image
                src={vehicle.image}
                alt={`${vehicle.make} ${vehicle.model}`}
                fill
                className="object-contain select-none transition-transform duration-300 hover:scale-[1.02]"
                priority
              />
            </div>
          ) : (
            <Image
              src={vehicle.image}
              alt={`${vehicle.make} ${vehicle.model}`}
              fill
              className="object-cover select-none transition-transform duration-300 hover:scale-[1.02]"
              priority
            />
          )}
        </div>

        {/* Subtitle Calibration Notice */}
        <div className="text-[10px] font-mono text-[#767D78] text-center pt-1">
          Simulated vehicle profile • Calibrated from OEM homologation specs
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────
          VEHICLE READINESS & INSTRUMENT CLUSTER
         ────────────────────────────────────────────────────────────────── */}
      <section
        id="vehicle-readiness"
        aria-label="Vehicle Readiness"
        className="bg-white rounded-2xl p-4 sm:p-5 border border-black/[0.06] shadow-2xs space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#111312]">Vehicle Readiness</h2>
          <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-[#16A34A]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
            <span>Ready to Drive</span>
          </div>
        </div>

        {/* Primary Instrument Cluster: Estimated Range & Battery SoC */}
        <div className="grid grid-cols-2 gap-4 items-center pt-1">
          {/* Estimated Driving Range */}
          <div className="pr-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#767D78] font-semibold">
              Estimated Range
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111312] font-mono">
                {calibratedRangeKm}
              </span>
              <span className="text-xs font-semibold text-[#525854]">km</span>
            </div>
            <div className="text-[10px] font-mono text-[#525854] mt-0.5">
              Mode: <span className="font-semibold text-[#111312] uppercase">{driveMode}</span>
            </div>
          </div>

          {/* Battery State of Charge (SoC) */}
          <div className="text-right pl-2 border-l border-black/[0.06]">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#767D78] font-semibold">
              Battery SoC
            </div>
            <div className="flex items-baseline justify-end gap-1 mt-0.5">
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111312] font-mono">
                {currentBatteryPct}
              </span>
              <span className="text-xs font-semibold text-[#525854]">%</span>
            </div>

            {/* Automotive Battery Progress Track */}
            <div className="w-full bg-[#EAE8E2] h-2 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  currentBatteryPct > 20 ? "bg-[#111312]" : "bg-[#DC2626]"
                }`}
                style={{ width: `${Math.max(5, currentBatteryPct)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Subtle Divider */}
        <div className="border-t border-black/[0.05]" />

        {/* Drive Dynamics Mode Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#111312]">Drive Dynamics</span>
            <span className="text-[10px] font-mono text-[#767D78]">
              {driveMode === "eco"
                ? "+12% Range Efficiency"
                : driveMode === "sport"
                ? "-14% Range Consumption"
                : "Standard Calibration"}
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Drive Mode"
            className="grid grid-cols-3 gap-1 p-1 bg-[#F5F4EF] rounded-xl border border-black/[0.04]"
          >
            {[
              { id: "eco" as const, label: "Eco", sub: "+12%" },
              { id: "normal" as const, label: "Normal", sub: "Balanced" },
              { id: "sport" as const, label: "Sport", sub: "Power" },
            ].map((m) => {
              const isSelected = driveMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setDriveMode(m.id)}
                  className={`py-2 px-1 rounded-lg text-center transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#111312] text-white shadow-2xs font-bold"
                      : "text-[#525854] hover:text-[#111312] font-semibold"
                  }`}
                >
                  <div className="text-xs">{m.label}</div>
                  <div
                    className={`text-[9px] font-mono mt-0.5 ${
                      isSelected ? "text-[#C8F369]" : "text-[#767D78]"
                    }`}
                  >
                    {m.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subtle Divider */}
        <div className="border-t border-black/[0.05]" />

        {/* Secondary Vehicle Readiness Strip: Preconditioning & Core Specs */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {/* Battery Preconditioning Action */}
          <button
            type="button"
            onClick={() => setIsPreconditioning(!isPreconditioning)}
            className={`p-2.5 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer active:scale-95 ${
              isPreconditioning
                ? "bg-[#111312] text-white border-[#111312] shadow-2xs"
                : "bg-[#FAF9F6] border-black/[0.06] text-[#111312] hover:bg-[#F5F4EF]"
            }`}
            aria-pressed={isPreconditioning}
            aria-label="Toggle battery thermal preconditioning"
          >
            <div className="flex items-center justify-between w-full">
              <Zap
                size={14}
                className={isPreconditioning ? "text-[#C8F369]" : "text-[#16A34A]"}
              />
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isPreconditioning ? "bg-[#C8F369] animate-pulse" : "bg-[#A3A3A3]"
                }`}
              />
            </div>
            <div className="mt-1">
              <div className="text-[10px] font-bold">Battery Prep</div>
              <div
                className={`text-[9px] font-mono truncate mt-0.5 ${
                  isPreconditioning ? "text-[#C8F369]" : "text-[#525854]"
                }`}
              >
                {isPreconditioning ? "Warming Up" : "Standby"}
              </div>
            </div>
          </button>

          {/* Efficiency Metric */}
          <div className="p-2.5 rounded-xl bg-[#FAF9F6] border border-black/[0.06] flex flex-col justify-between text-left">
            <span className="text-[9.5px] font-mono uppercase text-[#767D78]">
              Efficiency
            </span>
            <div className="mt-1">
              <div className="text-xs font-mono font-bold text-[#111312]">
                {vehicle.efficiencyKwh100km}
              </div>
              <div className="text-[9px] font-mono text-[#525854]">kWh/100km</div>
            </div>
          </div>

          {/* Max Fast Charging Power */}
          <div className="p-2.5 rounded-xl bg-[#FAF9F6] border border-black/[0.06] flex flex-col justify-between text-left">
            <span className="text-[9.5px] font-mono uppercase text-[#767D78]">
              Max DC Rate
            </span>
            <div className="mt-1">
              <div className="text-xs font-mono font-bold text-[#111312]">
                {vehicle.maxDcSpeedKw} kW
              </div>
              <div className="text-[9px] font-mono text-[#525854]">DC Fast</div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────
          JOURNEY ENTRY POINT ("Will I Make It?")
         ────────────────────────────────────────────────────────────────── */}
      <section
        aria-label="Journey Planning Simulation"
        className="bg-[#111312] text-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 relative overflow-hidden"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#111312] bg-[#C8F369] px-2 py-0.5 rounded-full">
              Simulator
            </span>
            <span className="text-xs font-bold text-white/90">Corridor Dispatch</span>
          </div>
          <span className="text-[10px] font-mono text-white/60">Elevation &amp; Range Physics</span>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#C8F369] shrink-0">
            <Gauge size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white leading-tight">
              &quot;Will I Make It?&quot; Journey Planner
            </h3>
            <p className="text-xs text-white/70 mt-1 leading-snug">
              Simulate route elevation, corridor energy depletion, and verified en-route fast chargers.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenJourneyPlanner}
          className="w-full py-3 px-4 bg-[#C8F369] text-[#111312] font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-[#D5F87F] active:scale-[0.98] transition-all cursor-pointer shadow-xs focus-visible:outline-2 focus-visible:outline-white"
        >
          <span>Start Journey Simulation</span>
          <ChevronRight size={15} />
        </button>
      </section>

      {/* ── Nearest Fast Charger Shortcut (if nearby) ──────────────────── */}
      {nearestUltraStation && (
        <section
          aria-label="Nearest Charger"
          className="bg-white rounded-2xl p-3.5 border border-black/[0.06] shadow-2xs flex items-center justify-between gap-3"
        >
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
            className="px-3 py-1.5 bg-[#FAF9F6] hover:bg-[#EAE8E2] border border-black/[0.08] text-[#111312] text-xs font-semibold rounded-lg flex items-center gap-1 active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <Navigation size={12} className="text-[#16A34A]" />
            <span>Route</span>
          </button>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────────────
          CHASSIS SPECIFICATIONS & OEM HOMOLOGATION
         ────────────────────────────────────────────────────────────────── */}
      <section
        aria-label="Chassis Specifications and Homologation"
        className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden shadow-2xs"
      >
        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-[#111312] hover:bg-[#FAF9F6] transition-colors cursor-pointer"
          aria-expanded={showDiagnostics}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#767D78] font-bold">
              Chassis Specs
            </span>
            <span className="text-xs font-bold text-[#111312]">
              OEM Specifications &amp; Homologation
            </span>
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
          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-black/[0.05] animate-in fade-in-50 duration-150">
            <div className="divide-y divide-black/[0.05] text-xs font-mono">
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#525854]">Battery Capacity (Usable / Gross):</span>
                <span className="font-bold text-[#111312]">
                  {vehicle.usableKwh} / {vehicle.batteryKwh} kWh
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#525854]">Certified WLTP/ARAI Range:</span>
                <span className="font-bold text-[#111312]">{vehicle.wltpRangeKm} km</span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#525854]">State of Health (SOH):</span>
                <span className="font-bold text-[#16A34A]">
                  {vehicle.sohPct || 99}% (Simulated Model)
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#525854]">Connector Standard:</span>
                <span className="font-bold text-[#111312]">{vehicle.plugType}</span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#525854]">Chassis Identification (VIN):</span>
                <span className="font-bold text-[#111312] truncate max-w-[180px]">
                  {vehicle.vin || "Standard Homologation"}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#525854]">Tire Pressures (Front / Rear):</span>
                <span className="font-bold text-[#111312]">2.4 / 2.6 bar (Recommended)</span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#525854]">Battery Pack Thermals:</span>
                <span className="font-bold text-[#16A34A]">24°C Nominal (Simulated Baseline)</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
