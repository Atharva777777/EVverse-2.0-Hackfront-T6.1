"use client";

import React from "react";
import Image from "next/image";
import {
  ChevronRight,
  Car,
  MapPin,
  SlidersHorizontal,
  Bookmark,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { CITY_CONFIGS } from "@/components/CountryCitySelector";
import type { EVVehicle } from "./VehicleCockpit";

export interface DriverProfileProps {
  activeVehicle: EVVehicle;
  vehicles: EVVehicle[];
  currentBatteryPct: number;
  selectedCity: string;
  onCityChange: (city: string) => void;
  autoCompatibility: boolean;
  onToggleAutoCompatibility: (enabled: boolean) => void;
  savedStationIds: Set<string>;
  onOpenVehicleManager: () => void;
}

export const DriverProfile: React.FC<DriverProfileProps> = ({
  activeVehicle,
  vehicles,
  currentBatteryPct,
  selectedCity,
  onCityChange,
  autoCompatibility,
  onToggleAutoCompatibility,
  savedStationIds,
  onOpenVehicleManager,
}) => {
  return (
    <div className="p-4 flex-1 space-y-4 max-w-lg mx-auto w-full pb-8">
      {/* ── Driver Header Banner ─────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
        <div>
          <h2 className="text-base font-bold text-[#111312]">Driver Profile</h2>
          <p className="text-[11px] text-[#525854]">Vehicle readiness &amp; charging preferences</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-[#0284C7] text-white flex items-center justify-center font-bold text-xs shadow-xs">
          EV
        </div>
      </div>

      {/* ── Active Vehicle Card ──────────────────────────────────── */}
      <div className="p-4 bg-white rounded-2xl border border-black/[0.06] shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Car size={13} className="text-[#111312]" aria-hidden="true" />
            <span className="text-[10.5px] font-mono uppercase tracking-wider text-[#767D78] font-bold">
              Active Vehicle
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenVehicleManager}
            className="min-h-[36px] px-2.5 py-1 text-xs font-semibold text-[#111312] hover:text-[#252826] bg-[#FAF9F6] hover:bg-[#F2EFE9] border border-black/[0.06] rounded-xl flex items-center gap-1 transition-all cursor-pointer"
          >
            <span>Manage Fleet ({vehicles.length})</span>
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-3.5 pt-1">
          <div className="relative w-18 h-14 rounded-xl bg-[#FAF9F6] p-1.5 shrink-0 flex items-center justify-center border border-black/[0.05]">
            <Image
              src={activeVehicle.image}
              alt={activeVehicle.model}
              fill
              sizes="72px"
              className="object-contain p-1"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-[#111312] truncate">
              {activeVehicle.make} {activeVehicle.model}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-[#FAF9F6] text-[#111312] px-2 py-0.5 rounded-md border border-black/[0.06]">
                <Zap size={9.5} className="text-[#16A34A]" aria-hidden="true" />
                {activeVehicle.plugType}
              </span>
              <span className="text-[10.5px] font-mono text-[#525854]">
                {activeVehicle.usableKwh} kWh • {activeVehicle.wltpRangeKm} km WLTP
              </span>
            </div>
          </div>
        </div>

        {/* Current Battery Level Bar */}
        <div className="pt-2 border-t border-black/[0.05] space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] text-[#525854] font-medium">Battery Level</span>
            <span className="font-mono font-bold text-[#111312]">{currentBatteryPct}%</span>
          </div>
          <div className="h-2 w-full bg-[#FAF9F6] rounded-full overflow-hidden border border-black/[0.05]">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                currentBatteryPct > 50
                  ? "bg-[#16A34A]"
                  : currentBatteryPct > 20
                  ? "bg-[#EAB308]"
                  : "bg-[#EF4444]"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, currentBatteryPct))}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Driver Activity & Saved Summary ──────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 bg-white rounded-2xl border border-black/[0.06] shadow-2xs space-y-1">
          <div className="flex items-center gap-1.5 text-[#525854]">
            <Bookmark size={13} className="text-[#111312]" aria-hidden="true" />
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Saved Hubs</span>
          </div>
          <div className="text-lg font-bold font-mono text-[#111312]">
            {savedStationIds.size}
          </div>
          <p className="text-[10px] text-[#767D78]">Bookmarked stations</p>
        </div>

        <div className="p-3 bg-white rounded-2xl border border-black/[0.06] shadow-2xs space-y-1">
          <div className="flex items-center gap-1.5 text-[#525854]">
            <Car size={13} className="text-[#111312]" aria-hidden="true" />
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Vehicles</span>
          </div>
          <div className="text-lg font-bold font-mono text-[#111312]">
            {vehicles.length}
          </div>
          <p className="text-[10px] text-[#767D78]">Registered in garage</p>
        </div>
      </div>

      {/* ── Regional & Charging Preferences ──────────────────────── */}
      <div className="p-4 bg-white rounded-2xl border border-black/[0.06] shadow-2xs space-y-3.5">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal size={13} className="text-[#111312]" aria-hidden="true" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#767D78] font-bold">
            Regional &amp; Filtering Preferences
          </span>
        </div>

        <div className="flex items-center justify-between text-xs gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-[#111312] flex items-center gap-1">
              <MapPin size={12} className="text-[#525854]" aria-hidden="true" />
              <span>Home Region</span>
            </div>
            <div className="text-[10.5px] text-[#525854]">Default charging grid region</div>
          </div>
          <select
            value={selectedCity}
            onChange={(e) => onCityChange(e.target.value)}
            className="min-h-[38px] bg-[#FAF9F6] border border-black/[0.08] text-[#111312] text-xs font-semibold rounded-xl px-3 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#111312]"
            aria-label="Select default home region"
          >
            {Object.keys(CITY_CONFIGS).map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-2.5 border-t border-black/[0.05] flex items-center justify-between text-xs gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-[#111312]">Auto-Filter Plug Standards</div>
            <div className="text-[10.5px] text-[#525854]">
              Only display stations with {activeVehicle.plugType} connectors
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoCompatibility}
            aria-label="Auto-filter compatible plug standards"
            onClick={() => onToggleAutoCompatibility(!autoCompatibility)}
            className={`min-w-[44px] w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
              autoCompatibility ? "bg-[#0284C7]" : "bg-[#D1D5DB]"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform duration-200 ${
                autoCompatibility ? "right-1" : "left-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* ── Privacy & Location Transparency ─────────────────────── */}
      <div className="p-4 bg-[#FAF9F6] rounded-2xl border border-black/[0.06] space-y-2">
        <div className="flex items-center gap-1.5 text-[#111312]">
          <ShieldCheck size={14} className="text-[#16A34A]" aria-hidden="true" />
          <span className="text-[11px] font-bold">Location &amp; Telemetry Notice</span>
        </div>
        <p className="text-[11px] text-[#525854] leading-relaxed">
          Device GPS coordinates are used in-memory solely for active road navigation and local range physics. No location logs or device traces are written to external analytics services.
        </p>
      </div>
    </div>
  );
};
