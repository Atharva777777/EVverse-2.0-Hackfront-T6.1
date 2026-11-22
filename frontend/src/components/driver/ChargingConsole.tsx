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
  Power,
  RotateCcw,
  Sparkles,
  ChevronDown,
  History,
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
}: ChargingConsoleProps) {
  // Format elapsed time MM:SS
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const timeFormatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  // Time to reach target estimate
  const remainingKwh = Math.max(0, vehicle.usableKwh * ((targetLimit - currentBatteryPct) / 100));
  const effectiveKw = isCharging
    ? currentKw
    : Math.min(vehicle.maxDcSpeedKw, chargeStation?.power_kw || 150);
  const estimatedMinsRemaining = Math.max(1, Math.round((remainingKwh / (effectiveKw || 100)) * 60));

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

        {/* Physical Connector Status */}
        <div className="bg-[#FAF9F6] rounded-2xl p-3 border border-black/[0.05] flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-left">
            <div className="relative w-8 h-8 rounded-xl bg-white border border-black/[0.06] p-1 flex items-center justify-center shrink-0">
              <Image
                src={vehicle.plugImage || "/images/plug-ccs2.png"}
                alt="Plug"
                fill
                sizes="32px"
                className="object-contain p-1"
              />
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#111312]">
                {vehicle.plugType}
              </div>
              <div className="text-[9.5px] font-mono text-[#767D78]">
                {isCharging ? "Lock engaged • Flow active" : "Coupler ready"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <ShieldCheck size={16} className={isCharging ? "text-[#16A34A]" : "text-[#8C938E]"} />
          </div>
        </div>

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
              Start Charging ({Math.min(vehicle.maxDcSpeedKw, chargeStation?.power_kw || 150)} kW)
            </span>
          </button>
        )}
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
    </div>
  );
}
