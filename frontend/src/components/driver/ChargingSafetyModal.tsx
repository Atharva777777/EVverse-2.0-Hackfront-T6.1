"use client";

import React from "react";
import {
  ShieldCheck,
  X,
  Lock,
  Zap,
  Coffee,
  Car,
  Smartphone,
  Unlock,
  AlertTriangle,
} from "lucide-react";

interface ChargingSafetyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChargingSafetyModal({ isOpen, onClose }: ChargingSafetyModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Charging Safety & Protocol Guide"
      className="absolute inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-[28px] max-w-[360px] w-full max-h-[88%] flex flex-col p-4 sm:p-5 border border-black/[0.08] shadow-2xl relative text-left overflow-hidden">
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
            onClick={onClose}
            aria-label="Close safety guide"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Diagram Area */}
        <div className="overflow-y-auto py-3 space-y-3.5 pr-1 text-xs">
          {/* Visual Flow Diagram with Connecting Line */}
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
            onClick={onClose}
            className="w-full min-h-[44px] py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-2xl shadow-xs active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Understood • Return to Charging</span>
          </button>
        </div>
      </div>
    </div>
  );
}
