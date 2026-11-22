'use client';

import React, { useState } from 'react';
import {
  TrendingUp,
  Clock,
  Zap,
  Users,
  Activity,
  ArrowUpRight,
} from 'lucide-react';

interface HourlyDataPoint {
  hour: string;
  loadPct: number;
  isPeak?: boolean;
}

const hourlyDemand: HourlyDataPoint[] = [
  { hour: '6am', loadPct: 24 },
  { hour: '8am', loadPct: 78, isPeak: true },
  { hour: '10am', loadPct: 62 },
  { hour: '12pm', loadPct: 54 },
  { hour: '2pm', loadPct: 48 },
  { hour: '4pm', loadPct: 70 },
  { hour: '6pm', loadPct: 94, isPeak: true },
  { hour: '8pm', loadPct: 86, isPeak: true },
  { hour: '10pm', loadPct: 42 },
];

export function StationOwnerDemandTab() {
  const [selectedRange, setSelectedRange] = useState<'today' | 'week'>('today');

  return (
    <div className="space-y-3.5">
      {/* Live Bay Occupancy */}
      <div className="rounded-2xl bg-white p-4 shadow-2xs border border-black/[0.06] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-black/[0.05]">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-[#111312]">Live Occupancy</span>
          </div>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/50">
            1 Bay Open
          </span>
        </div>

        <div className="flex items-baseline justify-between pt-1">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold tracking-tight text-[#111312]">5</span>
              <span className="text-xs text-black/40 font-medium">/ 6 bays in use</span>
            </div>
            <p className="text-[11px] text-black/50 mt-0.5">Average session: 32 min</p>
          </div>
          <div className="text-right">
            <span className="text-xl font-bold text-emerald-600">83%</span>
            <p className="text-[10px] text-black/40">Occupancy</p>
          </div>
        </div>

        {/* Bays Visual Bar */}
        <div className="grid grid-cols-6 gap-1.5 pt-1">
          {[
            { id: 1, type: '180kW', status: 'busy' },
            { id: 2, type: '180kW', status: 'busy' },
            { id: 3, type: '22kW', status: 'busy' },
            { id: 4, type: '22kW', status: 'busy' },
            { id: 5, type: '120kW', status: 'busy' },
            { id: 6, type: '120kW', status: 'free' },
          ].map((bay) => (
            <div
              key={bay.id}
              className={`h-8 rounded-lg flex flex-col items-center justify-center border text-[9.5px] font-semibold transition-all ${
                bay.status === 'busy'
                  ? 'bg-[#111312] text-white border-black'
                  : 'bg-[#C8F369]/30 text-black border-[#C8F369]'
              }`}
            >
              <span>Bay {bay.id}</span>
              <span className={`text-[8px] ${bay.status === 'busy' ? 'text-white/60' : 'text-black/70'}`}>
                {bay.status === 'busy' ? 'Busy' : 'Open'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Hourly Activity Profile */}
      <div className="rounded-2xl bg-white p-4 shadow-2xs border border-black/[0.06] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-black/[0.05]">
          <div>
            <h3 className="text-xs font-bold text-[#111312]">Peak Hours</h3>
            <p className="text-[10px] text-black/40">Busier in evening (6 PM – 9 PM)</p>
          </div>
          <div className="flex items-center gap-1 bg-black/[0.04] p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setSelectedRange('today')}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all ${
                selectedRange === 'today' ? 'bg-white text-black shadow-2xs' : 'text-black/50'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setSelectedRange('week')}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all ${
                selectedRange === 'week' ? 'bg-white text-black shadow-2xs' : 'text-black/50'
              }`}
            >
              7 Days
            </button>
          </div>
        </div>

        {/* Minimal Bar Chart */}
        <div className="h-28 flex items-end justify-between gap-1 pt-2 pb-1 border-b border-black/[0.05]">
          {hourlyDemand.map((item) => (
            <div key={item.hour} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full max-w-[18px] bg-black/[0.05] rounded-t-sm h-18 flex items-end">
                <div
                  style={{ height: `${item.loadPct}%` }}
                  className={`w-full rounded-t-sm transition-all ${
                    item.isPeak ? 'bg-[#111312]' : 'bg-[#111312]/30'
                  }`}
                />
              </div>
              <span className="text-[8.5px] text-black/50 font-mono">{item.hour}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] text-black/50">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-xs bg-[#111312]" />
            <span>Evening Peak (6 PM – 9 PM)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-xs bg-[#111312]/30" />
            <span>Regular</span>
          </div>
        </div>
      </div>

      {/* Simplified Growth Opportunity Card */}
      <div className="rounded-2xl bg-[#111312] text-white p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[#C8F369] font-bold flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-[#C8F369]" />
            High Area Demand
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/80">
            Nearby Traffic
          </span>
        </div>

        <div className="flex items-baseline gap-2 pt-1">
          <span className="text-xl font-bold text-white">+38%</span>
          <span className="text-xs text-white/70">driver search volume</span>
        </div>
        <p className="text-[11px] text-white/60 leading-relaxed">
          Drivers are regularly searching for fast chargers in this area while bays are full. Adding 1 more bay could increase daily revenue.
        </p>
      </div>

      {/* Wait Time & Total Visits */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-white p-3 border border-black/[0.06] shadow-2xs">
          <span className="text-[10px] text-black/40 block">Current Wait Time</span>
          <p className="text-lg font-bold text-[#111312] mt-0.5">0 min</p>
          <p className="text-[10px] text-emerald-600 font-medium">No queue</p>
        </div>

        <div className="rounded-2xl bg-white p-3 border border-black/[0.06] shadow-2xs">
          <span className="text-[10px] text-black/40 block">Today's Visits</span>
          <p className="text-lg font-bold text-[#111312] mt-0.5">38 EVs</p>
          <p className="text-[10px] text-emerald-600 font-medium">+14% vs avg</p>
        </div>
      </div>
    </div>
  );
}
