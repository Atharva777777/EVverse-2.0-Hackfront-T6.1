"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, TrendingUp, BarChart3, ShieldCheck, Zap } from "lucide-react";

export default function InvestorPage() {
  return (
    <div className="min-h-screen bg-[#D8DCDE] p-3 sm:p-6 md:p-8 text-[#111312] selection:bg-[#111312] selection:text-white font-sans antialiased">
      <div className="max-w-5xl mx-auto rounded-[36px] bg-gradient-to-b from-[#E7EAEB] via-[#DEE1E3] to-[#D3D7D9] shadow-[0_30px_90px_rgba(0,0,0,0.12)] border border-white/70 overflow-hidden flex flex-col p-6 sm:p-12">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-8 border-b border-black/[0.06]">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-black/60 hover:text-black transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Back to EVverse</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/users"
              className="bg-[#111312] hover:bg-black text-[#C8F369] font-bold text-xs px-4 py-2 rounded-full flex items-center gap-1.5 transition-all hover:scale-105"
            >
              <span>Driver Mobile App</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>

        {/* Hero Section */}
        <div className="py-12 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 backdrop-blur-md border border-black/[0.08] text-[11px] font-mono font-bold">
              <TrendingUp size={12} className="text-[#16A34A]" />
              <span>CAPITAL ALLOCATION & PREDICTIVE ROI</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#111312] leading-[1.1]">
              Strategic EV Charging Infrastructure Investment
            </h1>
            <p className="text-sm sm:text-base text-black/70 leading-relaxed">
              EVverse equips institutional and private investors with geospatial demand forecasting, grid capacity constraints, and payback analytics for high-yield fast charging hubs.
            </p>
          </div>

          <div className="relative aspect-[4/3] rounded-3xl overflow-hidden border border-black/[0.08] shadow-xl bg-white">
            <Image
              src="/images/card-investor.png"
              alt="Investor Modeling"
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
              <BarChart3 size={20} />
            </div>
            <h3 className="text-lg font-bold text-[#111312] mb-1">Spatial Demand Scoring</h3>
            <p className="text-xs sm:text-sm text-black/65 leading-relaxed">
              Proprietary traffic flow indexing across major metropolitan transit corridors ensures 90%+ utilization rates.
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 border border-black/[0.06] shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-[#111312] text-[#C8F369] flex items-center justify-center mb-4">
              <Zap size={20} />
            </div>
            <h3 className="text-lg font-bold text-[#111312] mb-1">Grid Interconnection</h3>
            <p className="text-xs sm:text-sm text-black/65 leading-relaxed">
              Automated substation capacity analysis reduces deployment risk and expedites 800V DC fast-charging commissioning.
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 border border-black/[0.06] shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-[#111312] text-[#C8F369] flex items-center justify-center mb-4">
              <ShieldCheck size={20} />
            </div>
            <h3 className="text-lg font-bold text-[#111312] mb-1">Risk-Adjusted Yield</h3>
            <p className="text-xs sm:text-sm text-black/65 leading-relaxed">
              Monte Carlo capital expenditure modeling with dynamic pricing simulations delivers defensible 18-24% IRR trajectories.
            </p>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="mt-10 p-6 rounded-2xl bg-[#111312] text-white flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-bold text-white">Experience Driver Demand in Real-Time</h4>
            <p className="text-xs text-white/70">Test the EVverse Mobile Driver App and observe live routing and bay bookings.</p>
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

