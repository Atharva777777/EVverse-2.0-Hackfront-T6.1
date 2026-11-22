"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Zap, CheckCircle2, Clock, Activity, ShieldCheck, AlertCircle } from "lucide-react";

export interface StationChargerHardware {
  id: string;
  name: string;
  modelCode: string;
  powerKw: number;
  type: string;
  tariff: string;
  status: "available" | "in_use" | "reserved";
  currentKw?: number;
  activeVehicle?: string;
  pillGradient: string;
  imageSrc?: string;
}

interface CodedStationChargersLineupProps {
  stationName: string;
  chargers?: StationChargerHardware[];
}

const DEFAULT_CHARGERS: StationChargerHardware[] = [
  {
    id: "CHG-01",
    name: "Volt-DC Ultra",
    modelCode: "180 kW Dual Gun",
    powerKw: 180,
    type: "CCS2 Combo",
    tariff: "₹18.50 / kWh",
    status: "in_use",
    currentKw: 148,
    activeVehicle: "Porsche Taycan (68%)",
    pillGradient: "linear-gradient(135deg, #CFE7FA 0%, #B2D8F7 100%)",
  },
  {
    id: "CHG-02",
    name: "Wall Connector",
    modelCode: "22 kW AC Destination",
    powerKw: 22,
    type: "Type 2 Mennekes",
    tariff: "₹12.00 / kWh",
    status: "available",
    pillGradient: "linear-gradient(135deg, #D4EDDA 0%, #C3E6CB 100%)",
  },
  {
    id: "CHG-03",
    name: "Dual Core Pedestal",
    modelCode: "120 kW High Speed",
    powerKw: 120,
    type: "CCS2 / CHAdeMO",
    tariff: "₹16.00 / kWh",
    status: "in_use",
    currentKw: 92,
    activeVehicle: "Tata Nexon EV (82%)",
    pillGradient: "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
  },
];

export function CodedStationChargersLineup({
  stationName,
  chargers = DEFAULT_CHARGERS,
}: CodedStationChargersLineupProps) {
  const [selectedChargerId, setSelectedChargerId] = useState<string>(chargers[0].id);

  const selectedCharger = chargers.find((c) => c.id === selectedChargerId) || chargers[0];

  return (
    <div className="space-y-3.5">
      {/* ── PHOTO SHOWCASE WITH CODE MATCHING USER REFERENCE ────────── */}
      <div className="relative rounded-3xl overflow-hidden border border-black/[0.08] bg-white shadow-xs p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#767D78]">
              Installed Charger Hardware
            </div>
            <div className="text-xs font-bold text-[#111312]">
              {chargers.length} Active Charging Units
            </div>
          </div>
          <span className="text-[10px] font-mono text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.5 rounded-full font-bold">
            All Units Online
          </span>
        </div>

        {/* Studio Hardware Photo */}
        <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-[#FBFBFA]">
          <Image
            src="/images/station-chargers-lineup.jpg"
            alt={`${stationName} hardware lineup`}
            fill
            className="object-contain"
            sizes="(max-width: 480px) 100vw, 420px"
            priority
          />
        </div>

        {/* Hardware Selector Cards (styled after reference photo pills) */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {chargers.map((chg) => {
            const isSelected = chg.id === selectedChargerId;
            return (
              <button
                key={chg.id}
                type="button"
                onClick={() => setSelectedChargerId(chg.id)}
                className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-between min-h-[96px] ${
                  isSelected
                    ? "border-[#111312] bg-[#FAF9F6] shadow-xs ring-1 ring-[#111312]"
                    : "border-black/[0.06] bg-white hover:bg-[#FAF9F6]"
                }`}
              >
                {/* Pill Graphic Background */}
                <div
                  className="w-12 h-6 rounded-full flex items-center justify-center shadow-2xs mb-1"
                  style={{ background: chg.pillGradient }}
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-[#111312]" />
                </div>

                <div>
                  <div className="text-[11px] font-bold text-[#111312] leading-tight line-clamp-1">
                    {chg.name}
                  </div>
                  <div className="text-[9.5px] font-mono text-[#767D78] mt-0.5">
                    {chg.powerKw} kW
                  </div>
                </div>

                <div className="text-[9.5px] font-mono font-bold text-[#16A34A] mt-1">
                  {chg.tariff.split(" ")[0]}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SELECTED CHARGER LIVE TELEMETRY CARD ───────────────────── */}
      <div className="p-4 rounded-2xl bg-white border border-black/[0.08] shadow-xs space-y-2.5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  selectedCharger.status === "in_use"
                    ? "bg-[#3B82F6] animate-pulse"
                    : "bg-[#16A34A]"
                }`}
              />
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-[#767D78]">
                {selectedCharger.status === "in_use" ? "Charging In Progress" : "Available to Drivers"}
              </span>
            </div>
            <h4 className="text-sm font-bold text-[#111312] mt-0.5">
              {selectedCharger.name} ({selectedCharger.modelCode})
            </h4>
            <div className="text-[11px] text-[#525854]">
              Plug: {selectedCharger.type} • Peak Output: {selectedCharger.powerKw} kW DC
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs font-bold font-mono text-[#111312]">
              {selectedCharger.tariff}
            </div>
            <div className="text-[9.5px] text-[#767D78]">Active Station Rate</div>
          </div>
        </div>

        {/* Live Power Output Meter */}
        {selectedCharger.status === "in_use" && selectedCharger.currentKw && (
          <div className="p-3 bg-[#FAF9F6] rounded-xl border border-black/[0.05] space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[#525854] text-[11px]">Current Draw:</span>
              <span className="font-mono font-bold text-[#3B82F6]">
                {selectedCharger.currentKw} kW / {selectedCharger.powerKw} kW
              </span>
            </div>
            <div className="w-full h-1.5 bg-black/[0.08] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#3B82F6] rounded-full"
                style={{
                  width: `${(selectedCharger.currentKw / selectedCharger.powerKw) * 100}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[#767D78]">
              <span>Vehicle: {selectedCharger.activeVehicle}</span>
              <span>Session: ~24 min</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
