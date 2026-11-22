"use client";

import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import {
  Zap,
  Clock,
  CheckCircle2,
  X,
  BatteryCharging,
  ShieldCheck,
  ShieldAlert,
  Power,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  History,
  Coffee,
  Lock,
  Unlock,
  AlertTriangle,
  Car,
  Smartphone,
  Info,
} from "lucide-react";
import type { EVVehicle } from "./VehicleCockpit";
import type { DriverStation } from "@/app/users/stations/page";
import { fetchChargingSessions } from "@/lib/driverApi";
import type { ChargingSessionItem } from "@/types/api";

interface ChargingConsoleProps {
  isCharging: boolean;
  vehicle: EVVehicle;
  currentBatteryPct: number;
  chargeStation: DriverStation | null;
  targetLimit: number;
  setTargetLimit: (limit: number) => void;
  elapsedSeconds: number;
  kwhDelivered: number;
  currentKw: number;
  chargeCost: number;
  onStartCharge: () => void;
  onStopCharge: () => void;
  showReceiptModal: boolean;
  onCloseReceiptModal: () => void;
  onOpenSafetyGuide?: () => void;
}

export function ChargingConsole({
  isCharging,
  vehicle,
  currentBatteryPct,
  chargeStation,
  targetLimit,
  setTargetLimit,
  elapsedSeconds,
  kwhDelivered,
  currentKw,
  chargeCost,
  onStartCharge,
  onStopCharge,
  showReceiptModal,
  onCloseReceiptModal,
  onOpenSafetyGuide,
}: ChargingConsoleProps) {
  // Format elapsed time MM:SS
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const timeFormatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  // Charger Options & Safety Guide State
  const defaultSpeed = Math.min(vehicle.maxDcSpeedKw, chargeStation?.power_kw || 150);
  const [selectedChargerSpeed, setSelectedChargerSpeed] = useState<number>(defaultSpeed);
  const [showSafetyGuide, setShowSafetyGuide] = useState<boolean>(false);

  // Sync default speed when vehicle or station changes
  useEffect(() => {
    setSelectedChargerSpeed(Math.min(vehicle.maxDcSpeedKw, chargeStation?.power_kw || 150));
  }, [vehicle.maxDcSpeedKw, chargeStation?.power_kw]);

  // Available charger options based on vehicle & hub capabilities
  const chargerOptions = useMemo(() => {
    const maxSpeed = Math.min(vehicle.maxDcSpeedKw, chargeStation?.power_kw || 150);
    return [
      {
        id: "ultra",
        name: "Ultra-Fast DC",
        speedKw: maxSpeed,
        plugType: vehicle.plugType || "CCS2 Combo",
        stallName: "Stall #01",
        voltage: "800V Architecture",
        tag: "Fastest",
        description: "Direct high-voltage highway rapid charging",
      },
      {
        id: "fast",
        name: "Standard Fast DC",
        speedKw: Math.min(60, maxSpeed),
        plugType: vehicle.plugType || "CCS2 Combo",
        stallName: "Stall #02",
        voltage: "400V Fast DC",
        tag: "Balanced",
        description: "Optimal battery thermal preservation",
      },
      {
        id: "ac",
        name: "Destination AC",
        speedKw: Math.min(22, vehicle.maxAcSpeedKw || 22),
        plugType: "Type 2 AC",
        stallName: "Stall #03",
        voltage: "230V Three-Phase",
        tag: "Gentle",
        description: "Ideal for shopping, dining, or overnight stays",
      },
    ];
  }, [vehicle, chargeStation]);

  // Time to reach target estimate based on active charger speed
  const remainingKwh = Math.max(0, vehicle.usableKwh * ((targetLimit - currentBatteryPct) / 100));
  const activeKw = isCharging
    ? (currentKw || selectedChargerSpeed)
    : selectedChargerSpeed;
  const estimatedMinsRemaining = Math.max(1, Math.round((remainingKwh / (activeKw || 100)) * 60));

  // Compute live electrical telemetry
  const busVoltage = 784; // 800V class architecture nominal
  const currentAmps =
    isCharging && currentKw > 0 ? Math.round((currentKw * 1000) / busVoltage) : 0;

  // Real session history from backend
  const [pastSessions, setPastSessions] = useState<ChargingSessionItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  useEffect(() => {
    fetchChargingSessions(1, 10)
      .then((res) => {
        if (res && Array.isArray(res.items)) {
          setPastSessions(res.items);
        }
      })
      .catch((err) => {
        console.info("[ChargingConsole] No past session history available:", err.message);
      });
  }, [showReceiptModal]);

  // Stable invoice identifier derived deterministically from session parameters
  const invoiceId = useMemo(() => {
    const rawSum =
      (vehicle.id || "ev").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) * 37 +
      Math.round(kwhDelivered * 100) +
      Math.round(chargeCost * 100);
    return 100000 + (Math.abs(rawSum) % 900000);
  }, [vehicle.id, kwhDelivered, chargeCost]);

  // Dynamic tariff string from station data (no fabricated rate)
  const displayTariff =
    chargeStation?.usage_cost && chargeStation.usage_cost.trim().length > 0
      ? chargeStation.usage_cost
      : "Tariff set by operator";

  // Is target reached?
  const isTargetReached = currentBatteryPct >= targetLimit;

  return (
    <div className="space-y-3.5 pb-8 max-w-lg mx-auto w-full">
      {/* ── Target Reached Notification ────────────────────────────── */}
      {isTargetReached && (
        <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-3.5 flex items-center justify-between text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-[#16A34A] shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <span className="font-bold text-[#15803D]">Target Reached ({targetLimit}%)</span>
              <p className="text-[11px] text-[#525854]">
                Vehicle is charged to your set limit. Ready to unplug.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Main High-Voltage Console Card ─────────────────────────── */}
      <div className="bg-white rounded-[28px] p-5 border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] relative overflow-hidden text-center space-y-4">
        {/* Electric glow effect while actively charging */}
        {isCharging && (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full pointer-events-none opacity-20 blur-3xl animate-pulse"
            style={{ background: "#16A34A" }}
          />
        )}

        {/* Top Header Row */}
        <div className="flex items-center justify-between relative z-10">
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isCharging ? "bg-[#16A34A] animate-pulse" : "bg-[#8C938E]"
                }`}
              />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#767D78] font-medium">
                Charging Session
              </span>
            </div>
            <div className="text-sm font-bold text-[#111312] mt-0.5 truncate max-w-[220px]">
              {chargeStation?.name || "DC Fast Charger"}
            </div>
          </div>

          <div
            className={`px-3 py-1 rounded-full text-[10.5px] font-semibold flex items-center gap-1.5 transition-colors ${
              isCharging
                ? "bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]"
                : "bg-[#F4F3EE] text-[#525854] border border-black/[0.05]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isCharging ? "bg-[#16A34A] animate-ping" : "bg-[#9CA3AF]"
              }`}
            />
            {isCharging ? "CHARGING" : "STANDBY"}
          </div>
        </div>

        {/* Circular Energy Gauge */}
        <div className="relative w-48 h-48 mx-auto flex items-center justify-center my-1 select-none">
          {isCharging && (
            <div className="absolute inset-0 rounded-full bg-[rgba(200,243,105,0.25)] blur-xl animate-pulse" />
          )}

          <svg className="w-44 h-44 transform -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="52"
              className="text-[#F2F1EC]"
              strokeWidth="6"
              stroke="currentColor"
              fill="transparent"
            />
            <circle
              cx="60"
              cy="60"
              r="52"
              strokeWidth="6"
              strokeDasharray={2 * Math.PI * 52}
              strokeDashoffset={2 * Math.PI * 52 * (1 - targetLimit / 100)}
              strokeLinecap="round"
              stroke="rgba(17,19,18,0.12)"
              fill="transparent"
            />
            <circle
              cx="60"
              cy="60"
              r="52"
              strokeWidth="6"
              strokeDasharray={2 * Math.PI * 52}
              strokeDashoffset={2 * Math.PI * 52 * (1 - currentBatteryPct / 100)}
              strokeLinecap="round"
              stroke={isCharging ? "#111312" : "#525854"}
              fill="transparent"
              className="transition-all duration-500 ease-out"
            />
          </svg>

          <div className="absolute flex flex-col items-center justify-center">
            <div className="flex items-baseline gap-0.5">
              <span className="text-4xl font-bold tracking-tight text-[#111312] font-mono">
                {currentBatteryPct}
              </span>
              <span className="text-base font-bold text-[#525854] font-mono">%</span>
            </div>
            <div className="text-[10px] font-mono text-[#767D78] mt-0.5">
              Target: {targetLimit}%
            </div>
            {isCharging && (
              <div className="text-[10px] font-bold text-[#15803D] mt-1 bg-[#DCFCE7] border border-[#86EFAC] px-2 py-0.5 rounded-full shadow-2xs font-mono">
                +{currentKw} kW DC
              </div>
            )}
          </div>
        </div>

        {/* Live Electrical Readout Grid */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-black/[0.06]">
          {/* Delivered Energy */}
          <div className="bg-[#FAF9F6] p-2.5 rounded-2xl border border-black/[0.04]">
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-[#767D78]">
              Delivered
            </div>
            <div className="text-sm font-bold text-[#111312] font-mono mt-0.5">
              {kwhDelivered.toFixed(2)}
            </div>
            <div className="text-[9.5px] text-[#525854]">kWh</div>
          </div>

          {/* Live Power Flow */}
          <div className="bg-[#FAF9F6] p-2.5 rounded-2xl border border-black/[0.04]">
            <div className="flex items-center justify-center gap-1 text-[9.5px] font-mono uppercase tracking-wider text-[#767D78]">
              <span>Current</span>
              {isCharging && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
              )}
            </div>
            <div className="text-sm font-bold text-[#111312] font-mono mt-0.5">
              {isCharging ? `${currentAmps}A` : "Ready"}
            </div>
            <div className="text-[9.5px] text-[#525854]">
              {isCharging ? "(live)" : "Connected"}
            </div>
          </div>

          {/* Cost (INR Localized, No Assumed Tariff) */}
          <div className="bg-[#FAF9F6] p-2.5 rounded-2xl border border-black/[0.04]">
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-[#767D78]">
              Cost
            </div>
            <div className="text-sm font-bold text-[#111312] font-mono mt-0.5 truncate">
              {chargeCost > 0 ? `₹${chargeCost.toFixed(2)}` : "At station"}
            </div>
            <div className="text-[9.5px] text-[#525854] truncate" title={displayTariff}>
              {chargeCost > 0 ? "(estimated)" : displayTariff}
            </div>
          </div>
        </div>

        {/* Target Limit Slider (Min 44px Controls) */}
        <div className="bg-[#FAF9F6] rounded-2xl p-3.5 border border-black/[0.05] text-left space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#111312]">
            <label htmlFor="target-battery-limit" className="cursor-pointer">
              Target Charge Limit
            </label>
            <span className="font-mono text-[11px] text-[#111312] bg-white px-2.5 py-1 rounded-md border border-black/[0.06] shadow-2xs font-bold">
              {targetLimit}%
            </span>
          </div>

          <input
            id="target-battery-limit"
            type="range"
            min={50}
            max={100}
            step={5}
            value={targetLimit}
            onChange={(e) => setTargetLimit(Number(e.target.value))}
            aria-label="Target Battery Charge Limit Percentage"
            aria-valuemin={50}
            aria-valuemax={100}
            aria-valuenow={targetLimit}
            className="w-full accent-[#0284C7] cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
          />

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => setTargetLimit(80)}
              className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs font-mono transition-colors border cursor-pointer flex flex-col items-center justify-center ${
                targetLimit === 80
                  ? "bg-[#E0F2FE] text-[#0369A1] border-[#0284C7] font-bold shadow-2xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>80%</span>
              <span className="text-[9.5px] opacity-80">Daily Commute</span>
            </button>
            <button
              type="button"
              onClick={() => setTargetLimit(100)}
              className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs font-mono transition-colors border cursor-pointer flex flex-col items-center justify-center ${
                targetLimit === 100
                  ? "bg-[#E0F2FE] text-[#0369A1] border-[#0284C7] font-bold shadow-2xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>100%</span>
              <span className="text-[9.5px] opacity-80">Highway Trip</span>
            </button>
          </div>
        </div>

        {/* ── Charger Options Selector ────────────────────────────── */}
        <div className="bg-[#FAF9F6] rounded-2xl p-3.5 border border-black/[0.05] text-left space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#111312]">
            <div className="flex items-center gap-1.5">
              <Zap size={13} className="text-[#16A34A]" />
              <span>Select Charger &amp; Speed</span>
            </div>
            <span className="text-[10px] font-mono text-[#767D78]">
              {isCharging ? "Session Locked" : "3 Options Available"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {chargerOptions.map((opt) => {
              const isSelected = selectedChargerSpeed === opt.speedKw;
              const mins = Math.max(1, Math.round((remainingKwh / (opt.speedKw || 100)) * 60));
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isCharging}
                  onClick={() => setSelectedChargerSpeed(opt.speedKw)}
                  className={`p-2 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    isCharging && !isSelected ? "opacity-50 cursor-not-allowed" : ""
                  } ${
                    isSelected
                      ? "bg-[#E0F2FE] border-[#0284C7] text-[#0369A1] shadow-2xs ring-1 ring-[#0284C7]/20"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-mono uppercase font-bold text-slate-500">
                        {opt.stallName}
                      </span>
                      <span
                        className={`text-[8.5px] font-mono px-1 py-0.2 rounded font-bold ${
                          opt.tag === "Fastest"
                            ? "bg-emerald-100 text-emerald-800"
                            : opt.tag === "Balanced"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {opt.tag}
                      </span>
                    </div>
                    <div className="text-xs font-bold mt-1 text-[#111312]">
                      {opt.speedKw} kW
                    </div>
                    <div className="text-[9.5px] text-slate-500 truncate">
                      {opt.name.split(" ")[0]}
                    </div>
                  </div>

                  <div className="text-[9px] font-mono text-[#0284C7] font-semibold mt-1">
                    ~{mins}m to {targetLimit}%
                  </div>
                </button>
              );
            })}
          </div>

          {/* Physical Coupler Status Row */}
          <div className="pt-1 flex items-center justify-between text-[10.5px] text-slate-600 font-mono border-t border-black/[0.04]">
            <span className="flex items-center gap-1.5 font-sans font-medium">
              <span className="w-2 h-2 rounded-full bg-[#16A34A] shrink-0" />
              <span>Coupler: <strong className="text-[#111312]">{vehicle.plugType}</strong></span>
            </span>
            <span className="text-[9.5px] text-slate-500">
              {isCharging ? "Interlock Engaged" : "Ready to Connect"}
            </span>
          </div>
        </div>

        {/* ── Active Session: What to do while charging notice ── */}
        {isCharging && (
          <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-left space-y-1.5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                <Coffee size={14} className="text-[#16A34A]" />
                <span>While Charging is in Progress</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-700 font-semibold">
                ~{estimatedMinsRemaining}m left
              </span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-snug">
              Safe to relax in vehicle with cabin A/C running, or visit a nearby cafe while battery SoC streams to your phone.
            </p>
          </div>
        )}

        {/* Primary Action Button (Min 48px Touch Target) */}
        {isCharging ? (
          <button
            type="button"
            onClick={onStopCharge}
            className="w-full min-h-[48px] py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-2xl active:scale-98 transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-rose-600"
          >
            <Power size={14} aria-hidden="true" />
            <span>Stop Charging &amp; Get Receipt</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartCharge}
            className="w-full min-h-[50px] py-3.5 bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-xs rounded-2xl active:scale-98 transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(2,132,199,0.3)] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0284C7]"
          >
            <Zap size={14} className="text-white fill-white/20" aria-hidden="true" />
            <span>
              Start Charging ({selectedChargerSpeed} kW)
            </span>
          </button>
        )}

        {/* ── Dedicated Safety Precautions & Diagram Button ────────── */}
        <button
          type="button"
          onClick={() => {
            if (onOpenSafetyGuide) {
              onOpenSafetyGuide();
            } else {
              setShowSafetyGuide(true);
            }
          }}
          className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#111312] border border-black/[0.08] rounded-2xl flex items-center justify-between text-xs font-semibold shadow-2xs transition-all cursor-pointer group active:scale-98"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC] flex items-center justify-center shrink-0">
              <ShieldAlert size={14} />
            </div>
            <div className="text-left">
              <div className="font-bold text-[#111312] group-hover:text-[#0284C7] transition-colors">
                Safety Precautions &amp; Guide
              </div>
              <div className="text-[10px] text-slate-500 font-normal">
                What to do while charging • Step-by-step diagram
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#0284C7] font-bold shrink-0">
            <span>View Diagram</span>
            <ChevronRight size={14} />
          </div>
        </button>
      </div>

      {/* ── Charging Speed Curve ─────────────────────────────────────── */}
      <div className="bg-white rounded-[24px] p-4 border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-2.5">
        <div className="flex items-center justify-between text-xs font-semibold text-[#111312]">
          <span>Fast DC Charging Taper Profile</span>
          <span className="text-[10px] font-mono text-[#767D78]">CV Taper Above 80%</span>
        </div>

        {/* Charging Curve Visual */}
        <div className="h-10 w-full bg-[#FAF9F6] rounded-xl p-2 border border-black/[0.04] flex items-end gap-1">
          {[95, 95, 95, 90, 85, 75, 60, 45, 30, 20].map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-xs transition-all ${
                i <= Math.floor(currentBatteryPct / 10)
                  ? "bg-[#111312]"
                  : "bg-black/[0.08]"
              }`}
              style={{ height: `${h}%` }}
              title={`Battery ${i * 10}%`}
            />
          ))}
        </div>

        <p className="text-[10.5px] text-[#525854] leading-relaxed">
          Charging rate tapers above 80% SoC to preserve battery health and prevent cell degradation.
        </p>
      </div>

      {/* ── Verified Session History (from SQLite Backend) ──────────── */}
      <div className="bg-white rounded-[24px] border border-black/[0.06] shadow-2xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-xs font-semibold text-[#111312] hover:bg-[#FAF9F6] transition-colors cursor-pointer"
          aria-expanded={showHistory}
        >
          <div className="flex items-center gap-2">
            <History size={14} className="text-[#525854]" aria-hidden="true" />
            <span>Recent Charging History</span>
            <span className="text-[10px] font-mono text-[#767D78]">
              ({pastSessions.length})
            </span>
          </div>
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 text-[#525854] ${
              showHistory ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>

        {showHistory && (
          <div className="p-4 pt-1 border-t border-black/[0.05] space-y-2 text-xs">
            {pastSessions.length > 0 ? (
              <div className="divide-y divide-black/[0.04]">
                {pastSessions.map((s) => (
                  <div key={s.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[#111312] truncate">
                        {s.station_name}
                      </div>
                      <div className="text-[10px] font-mono text-[#767D78]">
                        {s.kwh_delivered.toFixed(1)} kWh • {Math.round(s.duration_seconds / 60)} min
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-[#111312]">
                        {s.cost > 0 ? `₹${s.cost.toFixed(2)}` : "Recorded"}
                      </div>
                      <div className="text-[9.5px] text-[#16A34A] font-semibold">Complete</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-3 text-center text-[11px] text-[#767D78]">
                No past charging sessions recorded yet. Completed sessions will be saved here.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Itemized Session Receipt Modal (INR Localized) ──────────── */}
      {showReceiptModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Session Receipt"
          className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 border border-black/[0.08] shadow-2xl relative text-left">
            <button
              type="button"
              onClick={onCloseReceiptModal}
              aria-label="Close session receipt"
              className="absolute top-3.5 right-3.5 w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#F4F3EE] text-[#525854] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#DCFCE7] border border-[#86EFAC] flex items-center justify-center text-[#15803D]">
                <CheckCircle2 size={18} aria-hidden="true" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-base font-bold text-[#111312]">Session Receipt</h4>
                </div>
                <div className="text-[10px] font-mono text-[#767D78]">
                  Invoice #{invoiceId}
                </div>
              </div>
            </div>

            <div className="space-y-2 py-3 border-y border-black/[0.06] text-xs">
              <div className="flex justify-between">
                <span className="text-[#525854]">Vehicle</span>
                <span className="font-semibold text-[#111312]">
                  {vehicle.make} {vehicle.model}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Station</span>
                <span className="font-semibold text-[#111312] truncate max-w-[180px]">
                  {chargeStation?.name || "Fast Charger"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Energy Delivered</span>
                <span className="font-mono font-bold text-[#111312]">
                  {kwhDelivered.toFixed(2)} kWh
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Session Duration</span>
                <span className="font-mono font-bold text-[#111312]">{timeFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Connector</span>
                <span className="font-mono text-[#111312]">{vehicle.plugType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Tariff</span>
                <span className="font-mono text-[#111312]">{displayTariff}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-black/[0.06] text-sm">
                <span className="font-bold text-[#111312]">Total Amount</span>
                <span className="font-mono font-bold text-[#111312]">
                  {chargeCost > 0 ? `₹${chargeCost.toFixed(2)}` : "Settled at station"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onCloseReceiptModal}
              className="w-full min-h-[44px] py-3 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-2xl shadow-xs active:scale-98 transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Safety Precautions & Visual What-To-Do Diagram Modal ───── */}
      {showSafetyGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Charging Safety & Protocol Guide"
          className="absolute inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[92%] flex flex-col p-4 sm:p-5 border border-black/[0.08] shadow-2xl relative text-left overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC] flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} aria-hidden="true" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#111312] leading-tight">
                    Charging Safety &amp; Protocol
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    What to do while charging • Step-by-step diagram
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowSafetyGuide(false)}
                aria-label="Close safety guide"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Diagram Area */}
            <div className="overflow-y-auto py-3 space-y-3.5 pr-1 text-xs">
              {/* Visual Flow Diagram */}
              <div className="space-y-3 relative before:absolute before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
                {/* Step 1: Plug & Lock */}
                <div className="relative flex items-start gap-3 pl-1">
                  <div className="w-6 h-6 rounded-full bg-[#0284C7] text-white flex items-center justify-center text-[10px] font-bold shrink-0 z-10 shadow-xs">
                    1
                  </div>
                  <div className="flex-1 bg-slate-50/80 rounded-xl p-2.5 border border-slate-200/80">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-[#111312] text-[11.5px] flex items-center gap-1.5">
                        <Lock size={12} className="text-[#0284C7]" />
                        <span>Plug &amp; Mechanical Auto-Lock</span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                        Interlock
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-600 mt-1 leading-snug">
                      Firmly insert the coupler until it clicks. The vehicle solenoid automatically locks the connector to prevent accidental uncoupling.
                    </p>
                  </div>
                </div>

                {/* Step 2: High Voltage Flow */}
                <div className="relative flex items-start gap-3 pl-1">
                  <div className="w-6 h-6 rounded-full bg-[#16A34A] text-white flex items-center justify-center text-[10px] font-bold shrink-0 z-10 shadow-xs">
                    2
                  </div>
                  <div className="flex-1 bg-slate-50/80 rounded-xl p-2.5 border border-slate-200/80">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-[#111312] text-[11.5px] flex items-center gap-1.5">
                        <Zap size={12} className="text-[#16A34A]" />
                        <span>High-Voltage Active Flow</span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                        IP67 Safe
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-600 mt-1 leading-snug">
                      Up to 800V DC flows through insulated lines. 100% weatherproof and grounded; completely safe to use in heavy rain. Never yank cable.
                    </p>
                  </div>
                </div>

                {/* Step 3: What To Do While Charging (Core Visual Diagram) */}
                <div className="relative flex items-start gap-3 pl-1">
                  <div className="w-6 h-6 rounded-full bg-[#0284C7] text-white flex items-center justify-center text-[10px] font-bold shrink-0 z-10 shadow-xs">
                    3
                  </div>
                  <div className="flex-1 bg-emerald-50/70 rounded-xl p-2.5 border border-emerald-200/80">
                    <div className="font-bold text-emerald-950 text-[11.5px] flex items-center gap-1.5">
                      <Coffee size={13} className="text-[#16A34A]" />
                      <span>What To Do While Charging</span>
                    </div>

                    {/* 2 Choice Diagram Cards */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="bg-white rounded-lg p-2 border border-emerald-100 shadow-2xs">
                        <div className="flex items-center gap-1 text-[10.5px] font-bold text-slate-900">
                          <Car size={11} className="text-[#0284C7]" />
                          <span>Inside Car</span>
                        </div>
                        <p className="text-[9.5px] text-slate-600 mt-1 leading-tight">
                          Cabin A/C &amp; music are safe! Climate draws directly from the grid charger, not your EV battery.
                        </p>
                      </div>

                      <div className="bg-white rounded-lg p-2 border border-emerald-100 shadow-2xs">
                        <div className="flex items-center gap-1 text-[10.5px] font-bold text-slate-900">
                          <Smartphone size={11} className="text-[#16A34A]" />
                          <span>Walk Away</span>
                        </div>
                        <p className="text-[9.5px] text-slate-600 mt-1 leading-tight">
                          Visit a cafe or lounge. Live % and completion notification stream directly to this phone.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 4: Safe Disconnect */}
                <div className="relative flex items-start gap-3 pl-1">
                  <div className="w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0 z-10 shadow-xs">
                    4
                  </div>
                  <div className="flex-1 bg-slate-50/80 rounded-xl p-2.5 border border-slate-200/80">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-[#111312] text-[11.5px] flex items-center gap-1.5">
                        <Unlock size={12} className="text-slate-700" />
                        <span>Safe Unplug Sequence</span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-bold">
                        0 Amps First
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-600 mt-1 leading-snug">
                      Tap <strong>Stop Charging</strong> in the app or pedestal. Wait 3 seconds for current to drop to zero, hear the solenoid unlock click, then holster coupler.
                    </p>
                  </div>
                </div>
              </div>

              {/* Emergency E-Stop Mushroom Callout */}
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-left flex items-start gap-2">
                <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[11px] font-bold text-rose-900">
                    Emergency E-Stop Procedure
                  </div>
                  <p className="text-[10px] text-rose-700 leading-snug mt-0.5">
                    If you detect smoke, water flooding, or sparking, strike the large red Emergency Stop mushroom button located on the charger pedestal immediately.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="pt-2 border-t border-black/[0.06] shrink-0">
              <button
                type="button"
                onClick={() => setShowSafetyGuide(false)}
                className="w-full min-h-[44px] py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-2xl shadow-xs active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Understood • Return to Charging</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
