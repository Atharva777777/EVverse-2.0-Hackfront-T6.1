"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, Zap, Activity, Users, Settings2 } from "lucide-react";

export default function StationOwnersPage() {
  return (
    <div className="min-h-screen bg-[#D8DCDE] p-2 sm:p-6 md:p-8 text-[#111312] selection:bg-[#111312] selection:text-white font-sans antialiased">
      <div className="max-w-5xl mx-auto rounded-[28px] sm:rounded-[36px] bg-gradient-to-b from-[#E7EAEB] via-[#DEE1E3] to-[#D3D7D9] shadow-[0_30px_90px_rgba(0,0,0,0.12)] border border-white/70 overflow-hidden flex flex-col p-4 sm:p-8 md:p-12">
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

        {/* Hero Section */}
        <div className="py-12 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 backdrop-blur-md border border-black/[0.08] text-[11px] font-mono font-bold">
              <Zap size={12} className="text-[#0D9488]" />
              <span>COMMERCIAL PLAZA & ASSET MANAGEMENT</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#111312] leading-[1.1]">
              Maximize Charger Uptime & Revenue
            </h1>
            <p className="text-sm sm:text-base text-black/70 leading-relaxed">
              EVverse connects your charging bays to thousands of active EV commuters, synchronizing real-time reservation availability, dynamic tariff scheduling, and load balancing.
            </p>
          </div>

          <div className="relative aspect-[4/3] rounded-3xl overflow-hidden border border-black/[0.08] shadow-xl bg-white">
            <Image
              src="/images/card-station-owners.png"
              alt="Station Owners Plaza"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 500px"
              priority
            />
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 border border-black/[0.06] shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-[#111312] text-[#C8F369] flex items-center justify-center mb-4">
              <Activity size={20} />
            </div>
            <h3 className="text-lg font-bold text-[#111312] mb-1">Live Bay Telemetry</h3>
            <p className="text-xs sm:text-sm text-black/65 leading-relaxed">
              Real-time OCPP 2.0.1 heartbeat tracking surfaces connector health, charging curves, and proactive maintenance alerts.
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 border border-black/[0.06] shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-[#111312] text-[#C8F369] flex items-center justify-center mb-4">
              <Users size={20} />
            </div>
            <h3 className="text-lg font-bold text-[#111312] mb-1">Guaranteed Driver Flow</h3>
            <p className="text-xs sm:text-sm text-black/65 leading-relaxed">
              En-route trip guidance directs long-range highway and urban commuters straight to your available DC fast bays.
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 border border-black/[0.06] shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-[#111312] text-[#C8F369] flex items-center justify-center mb-4">
              <Settings2 size={20} />
            </div>
            <h3 className="text-lg font-bold text-[#111312] mb-1">Dynamic Tariff Control</h3>
            <p className="text-xs sm:text-sm text-black/65 leading-relaxed">
              Automated Time-of-Use pricing synchronizes with city grid wholesale costs to protect margins during peak hours.
            </p>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="mt-10 p-6 rounded-2xl bg-[#111312] text-white flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-bold text-white">See Your Station in the Driver App</h4>
            <p className="text-xs text-white/70">Test the driver experience and explore station discovery across Pune & Mumbai.</p>
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

