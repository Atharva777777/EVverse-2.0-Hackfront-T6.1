"use client";

import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import {
  Car,
  ChevronDown,
  Navigation,
  Zap,
  MapPin,
  ShieldAlert,
  PhoneCall,
  CheckCircle2,
  X,
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
  selectedCity = "Pune",
  onCityChange,
}: VehicleCockpitProps) {
  // Collapsible Chassis Specs (collapsed by default to keep screen focused)
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState<boolean>(false);
  const [isSosOpen, setIsSosOpen] = useState<boolean>(false);
  const [sosBeaconDispatched, setSosBeaconDispatched] = useState<boolean>(false);

  // Auto-scroll to section anchor if requested in URL
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#vehicle-readiness") {
      setTimeout(() => {
        document.getElementById("vehicle-readiness")?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }
  }, []);

  // Popular quick location chips - ensure active city is always visible among the chips
  const allCityNames = Object.keys(CITY_CONFIGS);
  const displayCities = useMemo(() => {
    const defaultQuick = ["Delhi", "Pune", "Mumbai", "Gurugram", "Noida", "Bengaluru", "Jaipur"];
    if (selectedCity && !defaultQuick.some((c) => c.toLowerCase() === selectedCity.toLowerCase())) {
      return [selectedCity, ...defaultQuick];
    }
    return defaultQuick;
  }, [selectedCity]);

  return (
    <div className="space-y-3.5 pb-10 select-none max-w-lg mx-auto w-full">
      {/* ──────────────────────────────────────────────────────────────────
          COMPACT REGIONAL HEADER BAR
         ────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-2.5 px-3 border border-black/[0.06] shadow-2xs space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-bold text-[#111312]">
            <MapPin size={13} className="text-[#16A34A]" aria-hidden="true" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#767D78]">
              Grid Region:
            </span>
            <span className="text-xs font-bold text-[#111312]">{selectedCity}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Circular Red SOS Button — clearly visible for elderly drivers */}
            <button
              type="button"
              onClick={() => setIsSosOpen(true)}
              className="w-8 h-8 min-w-[32px] min-h-[32px] sm:w-9 sm:h-9 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-[11px] tracking-wider flex items-center justify-center shadow-md active:scale-90 transition-all border-2 border-red-200 cursor-pointer"
              title="Emergency SOS Roadside Assistance"
              aria-label="Emergency SOS Roadside Assistance"
            >
              SOS
            </button>

            <button
              type="button"
              onClick={() => setIsCityDropdownOpen(!isCityDropdownOpen)}
              className="min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#525854] hover:text-[#111312] border border-black/[0.06] flex items-center gap-1 transition-all cursor-pointer"
              aria-expanded={isCityDropdownOpen}
              aria-label="Change charging grid region"
            >
              <span>Change</span>
              <ChevronDown
                size={12}
                className={`transition-transform duration-200 ${
                  isCityDropdownOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* Quick City Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 touch-pan-x">
          {displayCities.map((city) => {
            const isSelected = selectedCity.toLowerCase() === city.toLowerCase();
            return (
              <button
                key={city}
                type="button"
                onClick={() => {
                  onCityChange?.(city);
                  setIsCityDropdownOpen(false);
                }}
                className={`min-h-[30px] shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                  isSelected
                    ? "bg-[#E0F2FE] text-[#0369A1] border border-[#0284C7] shadow-2xs font-semibold"
                    : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200"
                }`}
              >
                {city}
              </button>
            );
          })}
        </div>

        {/* Expandable Full City List Dropdown */}
        {isCityDropdownOpen && (
          <div className="pt-2 border-t border-black/[0.05] animate-in fade-in-50 duration-150">
            <label htmlFor="cockpit-city-select" className="text-[10px] font-mono text-[#767D78] uppercase mb-1 block">
              All Regional Charging Grids ({allCityNames.length})
            </label>
            <select
              id="cockpit-city-select"
              value={selectedCity}
              onChange={(e) => {
                onCityChange?.(e.target.value);
                setIsCityDropdownOpen(false);
              }}
              className="w-full min-h-[40px] bg-[#FAF9F6] border border-black/[0.08] text-[#111312] text-xs font-semibold rounded-xl px-3 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#111312]"
            >
              {allCityNames.map((city) => (
                <option key={city} value={city}>
                  {city} ({CITY_CONFIGS[city]?.desc || "Regional Grid"})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          YOUR VEHICLE HERO SECTION (TOP PRIORITY)
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
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#111312] leading-tight mt-0.5 line-clamp-1">
              {vehicle.make} {vehicle.model}
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-[#FAF9F6] text-[#111312] px-2 py-0.5 rounded-md border border-black/[0.06]">
                <Zap size={9.5} className="text-[#16A34A]" aria-hidden="true" />
                {vehicle.plugType}
              </span>
              <span className="text-[11px] font-mono text-[#525854]">
                {vehicle.year} • {vehicle.usableKwh} kWh
              </span>
            </div>
          </div>

          {/* Switch Vehicle Button */}
          <button
            type="button"
            onClick={onOpenGarage}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#111312] bg-[#FAF9F6] hover:bg-[#F2EFE9] border border-black/[0.06] shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0 self-start focus-visible:outline-2 focus-visible:outline-[#111312]"
            title="Switch vehicle in garage"
            aria-label="Switch vehicle"
          >
            <Car size={14} className="text-[#111312]" aria-hidden="true" />
            <span>Switch</span>
          </button>
        </div>

        {/* Central Vehicle Showcase Stage */}
        <div className="relative w-full h-40 sm:h-44 my-3 rounded-2xl overflow-hidden border border-black/[0.06] bg-gradient-to-b from-[#F7F6F2] via-[#EFECE5] to-[#E2DED5] shadow-2xs flex items-center justify-center">
          {vehicle.image.toLowerCase().endsWith(".png") ? (
            <div className="relative w-[92%] h-[82%] flex items-center justify-center">
              <div className="absolute bottom-1 w-3/4 h-3 bg-black/15 blur-sm rounded-full pointer-events-none" />
              <Image
                src={vehicle.image}
                alt={`${vehicle.make} ${vehicle.model}`}
                fill
                sizes="(max-width: 480px) 380px, 420px"
                className="object-contain select-none transition-transform duration-300 hover:scale-[1.02]"
                priority
              />
            </div>
          ) : (
            <Image
              src={vehicle.image}
              alt={`${vehicle.make} ${vehicle.model}`}
              fill
              sizes="(max-width: 480px) 380px, 420px"
              className="object-cover select-none transition-transform duration-300 hover:scale-[1.02]"
              priority
            />
          )}
        </div>

        {/* Subtitle Calibration Notice */}
        <div className="text-[10px] font-mono text-[#767D78] text-center pt-0.5">
          Calibrated from OEM homologation specs • Real-time physics
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
              Drive: <span className="font-semibold text-[#111312] uppercase">{driveMode}</span>
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
            <div className="w-full bg-[#EAE8E2] h-2.5 rounded-full mt-2 overflow-hidden border border-black/[0.04]">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  currentBatteryPct > 50
                    ? "bg-[#16A34A]"
                    : currentBatteryPct > 20
                    ? "bg-[#111312]"
                    : "bg-[#DC2626]"
                }`}
                style={{ width: `${Math.max(5, currentBatteryPct)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Subtle Divider */}
        <div className="border-t border-black/[0.05]" />

        {/* Drive Dynamics Mode Selector (Min 44px Touch Targets) */}
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
            className="grid grid-cols-3 gap-1.5 p-1 bg-[#F5F4EF] rounded-xl border border-black/[0.04]"
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
                  className={`min-h-[44px] py-2 px-1 rounded-lg text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                    isSelected
                      ? "bg-[#0F172A] text-white shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900 font-semibold"
                  }`}
                >
                  <div className="text-xs">{m.label}</div>
                  <div
                    className={`text-[9.5px] font-mono mt-0.5 ${
                      isSelected ? "text-[#38BDF8]" : "text-slate-400"
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
          {/* Battery Preconditioning Action (Min 44px Touch Target) */}
          <button
            type="button"
            onClick={() => setIsPreconditioning(!isPreconditioning)}
            className={`min-h-[52px] p-2.5 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer active:scale-95 ${
              isPreconditioning
                ? "bg-[#DCFCE7] border-[#86EFAC] text-[#15803D] shadow-2xs"
                : "bg-[#FAF9F6] border-slate-200 text-[#0F172A] hover:bg-slate-50"
            }`}
            aria-pressed={isPreconditioning}
            aria-label="Toggle battery thermal preconditioning"
          >
            <div className="flex items-center justify-between w-full">
              <Zap
                size={14}
                className={isPreconditioning ? "text-[#16A34A]" : "text-slate-400"}
                aria-hidden="true"
              />
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isPreconditioning ? "bg-[#16A34A] animate-pulse" : "bg-slate-300"
                }`}
              />
            </div>
            <div className="mt-1">
              <div className="text-[10px] font-bold">Battery Prep</div>
              <div
                className={`text-[9px] font-mono truncate mt-0.5 ${
                  isPreconditioning ? "text-[#16A34A] font-semibold" : "text-slate-500"
                }`}
              >
                {isPreconditioning ? "Warming Up" : "Standby"}
              </div>
            </div>
          </button>

          {/* Efficiency Metric */}
          <div className="min-h-[52px] p-2.5 rounded-xl bg-[#FAF9F6] border border-black/[0.06] flex flex-col justify-between text-left">
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
          <div className="min-h-[52px] p-2.5 rounded-xl bg-[#FAF9F6] border border-black/[0.06] flex flex-col justify-between text-left">
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

      {/* ── Nearest Fast Charger Shortcut (Positioned Right Under Readiness) ─── */}
      {nearestUltraStation && (
        <section
          aria-label="Nearest Charger"
          className="bg-white rounded-2xl p-3.5 border border-black/[0.06] shadow-2xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#FAF9F6] border border-black/[0.06] flex items-center justify-center text-[#16A34A] shrink-0">
              <Zap size={16} aria-hidden="true" />
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
            className="min-h-[38px] px-3.5 py-1.5 bg-[#FAF9F6] hover:bg-[#EAE8E2] border border-black/[0.08] text-[#111312] text-xs font-semibold rounded-xl flex items-center gap-1 active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <Navigation size={12} className="text-[#16A34A]" aria-hidden="true" />
            <span>Route</span>
          </button>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────────────
          CHASSIS SPECIFICATIONS & OEM HOMOLOGATION (COLLAPSIBLE)
         ────────────────────────────────────────────────────────────────── */}
      <section
        aria-label="Chassis Specifications and Homologation"
        className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden shadow-2xs"
      >
        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-xs font-semibold text-[#111312] hover:bg-[#FAF9F6] transition-colors cursor-pointer"
          aria-expanded={showDiagnostics}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#767D78] font-bold">
              Chassis Specs
            </span>
            <span className="text-xs font-bold text-[#111312]">
              OEM Specifications
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#525854]">
            <span>{showDiagnostics ? "Hide" : "View"}</span>
            <ChevronDown
              size={13}
              className={`transition-transform duration-200 ${
                showDiagnostics ? "rotate-180" : ""
              }`}
              aria-hidden="true"
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

      {/* ── Emergency SOS Modal (Contained Strictly Within Phone UI) ── */}
      {isSosOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Emergency SOS Roadside Assistance"
          className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in"
        >
          <div className="bg-white rounded-3xl w-full max-w-sm p-4 sm:p-5 border border-red-200 shadow-2xl space-y-3.5 max-h-[90%] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-red-100 border border-red-300 flex items-center justify-center text-red-600 shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#111312] leading-tight">
                    Emergency SOS
                  </h3>
                  <p className="text-[11px] font-medium text-slate-500">
                    24/7 Roadside Assistance & Breakdown
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSosOpen(false);
                  setSosBeaconDispatched(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
                aria-label="Close SOS"
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Dispatch Beacon Alert */}
            {sosBeaconDispatched ? (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-center space-y-1">
                <CheckCircle2 size={24} className="text-emerald-600 mx-auto" />
                <div className="text-xs font-bold text-emerald-800">SOS Beacon Broadcast</div>
                <p className="text-[11px] text-emerald-700 leading-relaxed">
                  Patrol & towing network dispatched for your {vehicle.make} {vehicle.model} in {selectedCity}. Help is on the way.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSosBeaconDispatched(true)}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 active:scale-98 text-white rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md border border-red-400 cursor-pointer transition-all"
              >
                <PhoneCall size={16} />
                <span>Broadcast SOS to Nearest EV Patrol</span>
              </button>
            )}

            {/* Elder-Friendly Emergency Direct Call Cards */}
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                1-Tap Emergency Direct Call
              </div>

              {/* 1. EV Roadside Assistance */}
              <a
                href="tel:1073"
                className="p-3 rounded-2xl bg-red-50 hover:bg-red-100 border border-red-200 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    EV
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">EV Roadside & Towing</div>
                    <div className="text-[10px] text-slate-500 font-mono">National Helpline: 1073</div>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-red-600 group-hover:underline">Call 1073 →</span>
              </a>

              {/* 2. National Emergency */}
              <a
                href="tel:112"
                className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    112
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">National Emergency (All-in-One)</div>
                    <div className="text-[10px] text-slate-500 font-mono">Police • Ambulance • Fire</div>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-slate-900 group-hover:underline">Call 112 →</span>
              </a>

              {/* 3. Medical Emergency */}
              <a
                href="tel:108"
                className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    108
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">Ambulance & Paramedics</div>
                    <div className="text-[10px] text-slate-500 font-mono">Direct Medical Dispatch</div>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-emerald-700 group-hover:underline">Call 108 →</span>
              </a>
            </div>

            {/* Elder-Readable Location & Vehicle Snapshot */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                Read out this info to emergency operator:
              </div>
              <div className="text-xs font-bold text-slate-800">
                Location: <span className="text-[#0284C7]">{selectedCity} Grid Region</span>
              </div>
              <div className="text-[11px] text-slate-600 font-mono">
                Vehicle: {vehicle.make} {vehicle.model} • Battery: {currentBatteryPct}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
