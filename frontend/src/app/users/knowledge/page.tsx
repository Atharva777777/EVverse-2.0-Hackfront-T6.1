"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpen, BatteryCharging, Navigation, ShieldCheck, Zap } from "lucide-react";

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[#D8DCDE] p-2 sm:p-6 md:p-8 text-[#111312] selection:bg-[#111312] selection:text-white font-sans antialiased">
      <div className="max-w-4xl mx-auto rounded-[28px] sm:rounded-[36px] bg-gradient-to-b from-[#E7EAEB] via-[#DEE1E3] to-[#D3D7D9] shadow-[0_30px_90px_rgba(0,0,0,0.12)] border border-white/70 overflow-hidden flex flex-col p-4 sm:p-8 md:p-12">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between gap-2 pb-6 sm:pb-8 border-b border-black/[0.06]">
          <Link
            href="/"
            className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold uppercase tracking-wider text-black/60 hover:text-black transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Back to EVverse</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/users"
              className="bg-[#111312] hover:bg-black text-[#C8F369] font-bold text-xs px-3 sm:px-4 py-2 rounded-full flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
            >
              <span>Driver App</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>

        {/* Header */}
        <div className="py-8 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#14F1D9]/20 border border-[#14F1D9]/30 text-[11px] font-mono font-bold text-[#0D9488]">
            <BookOpen size={12} />
            <span>EV DRIVER & HOST KNOWLEDGE BASE</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#111312]">
            EVverse 2.0 User & Operating Guide
          </h1>
          <p className="text-sm text-black/70 leading-relaxed">
            Essential principles, physics calculations, and operational workflows powering the EVverse journey engine.
          </p>
        </div>

        {/* Guide Topics */}
        <div className="space-y-6 pt-4">
          <div className="bg-white/85 backdrop-blur-md rounded-2xl p-6 border border-black/[0.06] shadow-xs space-y-3">
            <div className="flex items-center gap-2.5 text-base font-bold text-[#111312]">
              <BatteryCharging size={18} className="text-[#16A34A]" />
              <span>1. Longitudinal Range Physics & Safety Buffer</span>
            </div>
            <p className="text-xs sm:text-sm text-black/70 leading-relaxed">
              EVverse calculates real consumption factoring in terrain grade (+580m ascent on the Mumbai-Pune Expressway), payload mass delta (over 75kg base), HVAC thermal load, and aerodynamic drag. A 15% reserve buffer ensures you never risk deep-discharge depletion.
            </p>
          </div>

          <div className="bg-white/85 backdrop-blur-md rounded-2xl p-6 border border-black/[0.06] shadow-xs space-y-3">
            <div className="flex items-center gap-2.5 text-base font-bold text-[#111312]">
              <Navigation size={18} className="text-[#0D9488]" />
              <span>2. Connector Compatibility & Smart Filtering</span>
            </div>
            <p className="text-xs sm:text-sm text-black/70 leading-relaxed">
              The Mobile Driver App automatically verifies connector compatibility (CCS2 Combo, Type 2, CHAdeMO, GB/T) against your active garage vehicle. Only chargers with validated hardware matching and verified power throughput are prioritized.
            </p>
          </div>

          <div className="bg-white/85 backdrop-blur-md rounded-2xl p-6 border border-black/[0.06] shadow-xs space-y-3">
            <div className="flex items-center gap-2.5 text-base font-bold text-[#111312]">
              <ShieldCheck size={18} className="text-[#2563EB]" />
              <span>3. Monad Micro-Reservations & Bay Guarantees</span>
            </div>
            <p className="text-xs sm:text-sm text-black/70 leading-relaxed">
              Reserve charging bays before arriving using seamless sub-second Monad testnet micro-transactions. Lock in priority access, avoiding queuing delays at critical highway hubs.
            </p>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="mt-8 p-6 rounded-2xl bg-[#111312] text-white flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-bold text-white">Ready to take the driver seat?</h4>
            <p className="text-xs text-white/70">Launch the mobile app and test journey calculations across regional corridors.</p>
          </div>
          <Link
            href="/users"
            className="px-5 py-2.5 rounded-full bg-[#C8F369] text-[#111312] font-bold text-xs flex items-center gap-1.5 hover:bg-white transition-colors shrink-0"
          >
            <span>Launch Driver App</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

