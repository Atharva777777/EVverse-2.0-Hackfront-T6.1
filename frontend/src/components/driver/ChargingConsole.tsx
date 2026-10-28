"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import {
  Zap,
  Clock,
  DollarSign,
  Sliders,
  CheckCircle2,
  X,
  BatteryCharging,
  ShieldCheck,
  Power,
  RotateCcw,
  Sparkles,
  Layers,
  Thermometer,
} from "lucide-react";
import type { EVVehicle } from "./VehicleCockpit";
import type { DriverStation } from "@/app/users/stations/page";

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
  const remainingKwh = Math.max(0, (vehicle.usableKwh * ((targetLimit - currentBatteryPct) / 100)));
  const effectiveKw = isCharging ? currentKw : Math.min(vehicle.maxDcSpeedKw, chargeStation?.power_kw || 150);
  const estimatedMinsRemaining = Math.max(1, Math.round((remainingKwh / (effectiveKw || 100)) * 60));

  // Compute live electrical telemetry
  const busVoltage = 784; // 800V class architecture
  const currentAmps = isCharging && currentKw > 0 ? Math.round((currentKw * 1000) / busVoltage) : 0;

  // Stable invoice identifier derived deterministically from session parameters
  const invoiceId = useMemo(() => {
    const rawSum = (vehicle.id || "ev").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) * 37 +
      Math.round(kwhDelivered * 100) + Math.round(chargeCost * 100);
    return 100000 + (Math.abs(rawSum) % 900000);
  }, [vehicle.id, kwhDelivered, chargeCost]);

  return (
    <div className="space-y-3.5 pb-20">
      {/* ── Main High-Voltage Console Card ─────────────────────────── */}
      <div className="bg-white rounded-[28px] p-5 border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] relative overflow-hidden text-center space-y-4">
        {/* Subtle high voltage electric glow */}
        {isCharging && (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full pointer-events-none opacity-20 blur-3xl animate-pulse"
            style={{ background: "#C8F369" }}
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
                Charging Status
              </span>
            </div>
            <div className="text-sm font-bold text-[#111312] mt-0.5">
              {chargeStation?.name || "Fast Charger"}
            </div>
          </div>

          <div
            className={`px-3 py-1 rounded-full text-[10.5px] font-semibold flex items-center gap-1.5 transition-colors ${
              isCharging
                ? "bg-[#111312] text-[#C8F369] border border-[#111312]"
                : "bg-[#F4F3EE] text-[#525854] border border-black/[0.05]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isCharging ? "bg-[#C8F369] animate-ping" : "bg-[#9CA3AF]"
              }`}
            />
            {isCharging ? "CHARGING" : "READY"}
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
              <div className="text-[10px] font-bold text-[#111312] mt-1 bg-[#C8F369] px-2 py-0.5 rounded-full shadow-2xs font-mono">
                +{currentKw} kW DC
              </div>
            )}
          </div>
        </div>

        {/* Live Electrical Readout Grid */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-black/[0.06]">
          <div className="bg-[#FAF9F6] p-2.5 rounded-2xl border border-black/[0.04]">
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-[#767D78]">
              Delivered
            </div>
            <div className="text-sm font-bold text-[#111312] font-mono mt-0.5">
              {kwhDelivered.toFixed(2)}
            </div>
            <div className="text-[9.5px] text-[#525854]">kWh</div>
          </div>

          <div className="bg-[#FAF9F6] p-2.5 rounded-2xl border border-black/[0.04]">
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-[#767D78]">
              Power Flow
            </div>
            <div className="text-sm font-bold text-[#111312] font-mono mt-0.5">
              {isCharging ? `${currentAmps}A` : "Ready"}
            </div>
            <div className="text-[9.5px] text-[#525854]">{isCharging ? "Fast DC" : "Connected"}</div>
          </div>

          <div className="bg-[#FAF9F6] p-2.5 rounded-2xl border border-black/[0.04]">
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-[#767D78]">
              Cost
            </div>
            <div className="text-sm font-bold text-[#111312] font-mono mt-0.5">
              ${chargeCost.toFixed(2)}
            </div>
            <div className="text-[9.5px] text-[#525854]">@ $0.28/kWh</div>
          </div>
        </div>

        {/* Target Limit Slider */}
        <div className="bg-[#FAF9F6] rounded-2xl p-3.5 border border-black/[0.05] text-left space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#111312]">
            <label htmlFor="target-battery-limit" className="cursor-pointer">Target Battery Level</label>
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
            className="w-full accent-[#111312] cursor-pointer h-2 bg-[#EAE8E2] rounded-lg appearance-none"
          />

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => setTargetLimit(80)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[10.5px] font-mono transition-colors border cursor-pointer ${
                targetLimit === 80
                  ? "bg-[#111312] text-white border-[#111312] font-bold"
                  : "bg-white text-[#525854] border-black/[0.06] hover:bg-[#F4F3EE]"
              }`}
            >
              80% (Daily use)
            </button>
            <button
              type="button"
              onClick={() => setTargetLimit(100)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[10.5px] font-mono transition-colors border cursor-pointer ${
                targetLimit === 100
                  ? "bg-[#111312] text-white border-[#111312] font-bold"
                  : "bg-white text-[#525854] border-black/[0.06] hover:bg-[#F4F3EE]"
              }`}
            >
              100% (Long trips)
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
                className="object-contain p-1"
              />
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#111312]">
                {vehicle.plugType}
              </div>
              <div className="text-[9.5px] font-mono text-[#767D78]">
                {isCharging ? "Cable locked" : "Ready to plug in"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <ShieldCheck size={16} className={isCharging ? "text-[#16A34A]" : "text-[#8C938E]"} />
          </div>
        </div>

        {/* Action Toggle CTA */}
        {isCharging ? (
          <button
            onClick={onStopCharge}
            className="w-full py-3.5 bg-[#111312] text-[#C8F369] font-bold text-xs rounded-2xl hover:bg-[#252826] active:scale-98 transition-all flex items-center justify-center gap-2 shadow-xs"
          >
            <Power size={14} />
            Stop Charging
          </button>
        ) : (
          <button
            onClick={onStartCharge}
            className="w-full py-3.5 bg-[#111312] text-white font-bold text-xs rounded-2xl hover:bg-[#252826] active:scale-98 transition-all flex items-center justify-center gap-2 shadow-xs"
          >
            <Zap size={14} className="text-[#C8F369]" />
            Start Charging ({Math.min(vehicle.maxDcSpeedKw, chargeStation?.power_kw || 150)} kW)
          </button>
        )}
      </div>

      {/* ── Charging Speed Curve ─────────── */}
      <div className="bg-white rounded-[24px] p-4 border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-2.5">
        <div className="flex items-center justify-between text-xs font-semibold text-[#111312]">
          <span>Charging Speed by Battery Level</span>
          <span className="text-[10px] font-mono text-[#767D78]">Fast DC</span>
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
          Charging naturally slows down past 75% to protect your battery.
        </p>
      </div>

      {/* ── Itemized Session Receipt Modal ──────────────────────────── */}
      {showReceiptModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Session Receipt"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 border border-black/[0.08] shadow-2xl relative text-left">
            <button
              onClick={onCloseReceiptModal}
              aria-label="Close session receipt"
              className="absolute top-3.5 right-3.5 w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#F4F3EE] text-[#525854] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#C8F369] flex items-center justify-center text-[#111312]">
                <CheckCircle2 size={18} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-base font-bold text-[#111312]">Session Receipt</h4>
                  <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded-full bg-black/[0.04] text-black/50 border border-black/[0.06]">
                    Simulated Session
                  </span>
                </div>
                <div className="text-[10px] font-mono text-[#767D78]">
                  Invoice #{invoiceId}
                </div>
              </div>
            </div>

            <div className="space-y-2 py-3 border-y border-black/[0.06] text-xs">
              <div className="flex justify-between">
                <span className="text-[#525854]">Vehicle</span>
                <span className="font-semibold text-[#111312]">{vehicle.make} {vehicle.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Station</span>
                <span className="font-semibold text-[#111312]">{chargeStation?.name || "Charger"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Energy Delivered</span>
                <span className="font-mono font-bold text-[#111312]">{kwhDelivered.toFixed(2)} kWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Session Duration</span>
                <span className="font-mono font-bold text-[#111312]">{timeFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Rate</span>
                <span className="font-mono text-[#111312]">$0.28 / kWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525854]">Energy Source</span>
                <span className="font-semibold text-[#16A34A]">100% Solar & Wind</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-black/[0.06] text-sm">
                <span className="font-bold text-[#111312]">Total Amount</span>
                <span className="font-mono font-bold text-[#111312]">${chargeCost.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={onCloseReceiptModal}
              className="w-full py-3 bg-[#111312] text-white text-xs font-semibold rounded-2xl hover:bg-[#252826] active:scale-98 transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
