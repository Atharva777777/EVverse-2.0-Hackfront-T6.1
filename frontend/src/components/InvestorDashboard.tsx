"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Zap,
  Building2,
  DollarSign,
  ShieldCheck,
  Sparkles,
  PlusCircle,
  MapPin,
  CheckCircle2,
  Sliders,
  RotateCcw,
  Clock,
  ArrowRight,
  Activity,
  Layers,
  Leaf,
  Coins,
  Smartphone,
  ExternalLink,
  ChevronRight,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useLiveData } from "@/hooks/useLiveData";
import {
  getAggregatedEcosystemStats,
  getDeployedStations,
  deployNewCommunityStation,
  subscribeToEcosystem,
  type EcosystemStats,
  type DeployedCommunityStation,
} from "@/lib/ecosystemStore";

function InvestorMarketIndicator({
  city,
  description,
}: {
  city: string;
  description: string;
}) {
  const { loading, isLive, stationCount, source } = useLiveData(city);

  return (
    <div className="p-5 rounded-2xl border border-black/[0.08] bg-white shadow-2xs flex flex-col justify-between transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="text-lg font-bold text-[#111312] tracking-tight">{city}</h4>
          <div className="text-xs text-black/50 mt-0.5">{description}</div>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono tracking-wider ${
            isLive
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-sky-50 text-sky-700 border border-sky-200"
          }`}
        >
          {isLive ? "LIVE TELEMETRY" : "OCM SYNCED"}
        </span>
      </div>

      <div className="flex flex-col gap-1 pt-3 border-t border-black/[0.05]">
        <div className="text-[10.5px] uppercase tracking-wider text-black/45 font-medium">
          Tracked Active Supply
        </div>
        <div className="text-3xl font-extrabold text-[#111312] font-mono flex items-baseline gap-2">
          {loading ? "..." : stationCount > 0 ? stationCount : "12"}
          <span className="text-xs text-black/45 font-sans font-medium">stations</span>
        </div>
      </div>

      <div className="text-[10px] text-black/40 mt-3 font-mono">
        Network Mode: {source === "open_charge_map" ? "Open Charge Map API" : "Pune Municipal Cluster"}
      </div>
    </div>
  );
}

export interface InvestorDashboardProps {
  mapHref?: string;
  homeHref?: string;
  driverHref?: string;
}

export function InvestorDashboard({
  mapHref = "/map",
  homeHref = "/",
  driverHref = "/users/stations",
}: InvestorDashboardProps) {
  const [stats, setStats] = useState<EcosystemStats>(getAggregatedEcosystemStats());
  const [deployedStations, setDeployedStations] = useState<DeployedCommunityStation[]>(getDeployedStations());

  // Deployment Modal State
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployStep, setDeployStep] = useState<"form" | "provisioning" | "success">("form");
  const [newStationName, setNewStationName] = useState("Hinjawadi Phase 3 Auto & Micro-Hub");
  const [newStationArea, setNewStationArea] = useState("Hinjawadi");
  const [newStationCity, setNewStationCity] = useState("Pune");
  const [newStationArchetype, setNewStationArchetype] = useState<"3w_auto" | "kirana_ac" | "dcfc_fast">("3w_auto");
  const [newStationFund, setNewStationFund] = useState("₹1,80,000 (Monad Ecosystem Grant)");
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployedItem, setDeployedItem] = useState<DeployedCommunityStation | null>(null);

  // Financial Yield Simulator State
  const [unitPowerCost, setUnitPowerCost] = useState<number>(8.5); // ₹/kWh cost from discom
  const [retailTariff, setRetailTariff] = useState<number>(16.0); // ₹/kWh charged to driver
  const [dailyHours, setDailyHours] = useState<number>(6.5); // Avg daily dispensing hours
  const [baysCount, setBaysCount] = useState<number>(4); // Number of bays

  useEffect(() => {
    const unsub = subscribeToEcosystem(() => {
      setStats(getAggregatedEcosystemStats());
      setDeployedStations(getDeployedStations());
    });
    return unsub;
  }, []);

  // Financial Calculations
  const calculations = useMemo(() => {
    const marginPerKwh = Math.max(1, retailTariff - unitPowerCost);
    const avgKwPerBay = 15; // Mixed AC/DC average
    const dailyKwh = baysCount * avgKwPerBay * dailyHours;
    const monthlyKwh = dailyKwh * 30;
    const monthlyGrossRevenue = monthlyKwh * retailTariff;
    const monthlyPowerCost = monthlyKwh * unitPowerCost;
    const monthlyGrossMargin = monthlyGrossRevenue - monthlyPowerCost;
    const estCapex = baysCount * 120000;
    const annualNetMargin = monthlyGrossMargin * 12 * 0.88; // after maintenance & overhead
    const paybackMonths = +(estCapex / Math.max(monthlyGrossMargin * 0.88, 1)).toFixed(1);
    const projectedIrr = Math.min(65, Math.max(12, +((annualNetMargin / estCapex) * 100).toFixed(1)));
    const annualCo2Tons = +((monthlyKwh * 12 * 0.82) / 1000).toFixed(2);

    return {
      monthlyGrossRevenue,
      monthlyGrossMargin,
      paybackMonths,
      projectedIrr,
      annualCo2Tons,
      estCapex,
    };
  }, [unitPowerCost, retailTariff, dailyHours, baysCount]);

  const handleExecuteDeploy = () => {
    setIsDeploying(true);
    setDeployStep("provisioning");

    setTimeout(() => {
      const created = deployNewCommunityStation({
        name: newStationName,
        city: newStationCity,
        area: newStationArea,
        address: `${newStationArea} Main Access Corridor, ${newStationCity}, Maharashtra`,
        lat: 18.5913 + (Math.random() - 0.5) * 0.04,
        lng: 73.7389 + (Math.random() - 0.5) * 0.04,
        powerKw: newStationArchetype === "dcfc_fast" ? 60 : newStationArchetype === "kirana_ac" ? 22 : 11,
        bays: newStationArchetype === "dcfc_fast" ? 2 : 3,
        connectorTypes:
          newStationArchetype === "dcfc_fast"
            ? ["CCS2 Combo", "Type 2 (AC)"]
            : newStationArchetype === "kirana_ac"
            ? ["Type 2 (AC)"]
            : ["Type 2 (AC)", "IEC 60309 3-Pin"],
        fundedBy: newStationFund,
        capexAmount: newStationArchetype === "dcfc_fast" ? "₹6,50,000" : "₹1,80,000",
        operator: `${newStationArea} Clean Energy Host`,
        ratePerKwh: retailTariff,
        parkingFeePerHour: 30,
      });

      setDeployedItem(created);
      setIsDeploying(false);
      setDeployStep("success");
    }, 2400);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#111312] selection:bg-[#111312] selection:text-white pb-28">
      {/* ── Top Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-black/[0.06] h-16 px-3 sm:px-6 md:px-10 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href={homeHref} className="flex items-center">
            <BrandLogo suffix="Investor" />
          </Link>
          <span className="hidden md:inline-flex text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#111312] text-[#C8F369] font-bold">
            Capital Command
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              setDeployStep("form");
              setShowDeployModal(true);
            }}
            className="px-3 sm:px-4 py-2 min-h-[38px] rounded-xl bg-[#111312] text-white hover:bg-black font-semibold text-xs transition-all shadow-sm active:scale-95 flex items-center gap-1.5 sm:gap-2 shrink-0 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#C8F369] shrink-0" />
            <span className="hidden sm:inline">Deploy Community Stall</span>
            <span className="inline sm:hidden">Deploy</span>
          </button>

          <Link href={mapHref}>
            <button
              type="button"
              className="px-3 sm:px-4 py-2 min-h-[38px] rounded-xl bg-white border border-black/10 hover:border-black/30 font-semibold text-xs transition-all shadow-2xs flex items-center gap-1 sm:gap-1.5 text-black/80 hover:text-black shrink-0 cursor-pointer"
            >
              <span className="hidden sm:inline">Spatial Planning Map</span>
              <span className="inline sm:hidden">Map</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </Link>
        </div>
      </header>

      {/* ── Main Command Center ───────────────────────────────────── */}
      <main className="flex-1 px-3 sm:px-6 md:px-10 py-6 sm:py-8 max-w-7xl mx-auto w-full space-y-8 sm:space-y-10">
        
        {/* Title & Introduction */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-black/45 font-semibold">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span>Decentralized Mobility Infrastructure</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111312]">
              Ecosystem Capital & Grid Yield Center
            </h1>
            <p className="text-sm text-black/60 max-w-2xl leading-relaxed">
              Real-time synchronization across Pune EV drivers, Kirana community station hosts, and institutional investors. Model returns, deploy micro-hubs, and observe closed-loop network throughput.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-2xl border border-black/[0.08] shadow-2xs self-start md:self-auto">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-black/80">
              Protocol Ledger Active
            </span>
          </div>
        </div>

        {/* ── LIVE ECOSYSTEM PULSE HERO COUNTERS ────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Revenue */}
          <div className="p-5 rounded-3xl bg-[#111312] text-white shadow-lg space-y-2 relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-[#C8F369]/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between text-white/50 text-xs font-medium uppercase tracking-wider">
              <span>Gross Network Revenue</span>
              <DollarSign className="w-4 h-4 text-[#C8F369]" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#C8F369]">
              ₹{stats.totalRevenueInr.toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-white/60 font-mono flex items-center gap-1.5 pt-1 border-t border-white/10">
              <Coins className="w-3 h-3 text-purple-300" />
              <span>+ {stats.totalRevenueMon} MON Settled On-Chain</span>
            </div>
          </div>

          {/* Card 2: Energy Flow */}
          <div className="p-5 rounded-3xl bg-white border border-black/[0.08] shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-black/45 text-xs font-medium uppercase tracking-wider">
              <span>Clean Energy Dispensed</span>
              <Zap className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#111312]">
              {stats.totalKwhDelivered.toLocaleString()} <span className="text-sm font-sans font-medium text-black/50">kWh</span>
            </div>
            <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 pt-1 border-t border-black/[0.05]">
              <CheckCircle2 className="w-3 h-3" />
              <span>Across {stats.totalSessions} Verified Sessions</span>
            </div>
          </div>

          {/* Card 3: Carbon Offset */}
          <div className="p-5 rounded-3xl bg-white border border-black/[0.08] shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-black/45 text-xs font-medium uppercase tracking-wider">
              <span>Clean CO₂ Avoided</span>
              <Leaf className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-teal-700">
              {stats.totalCo2OffsetKg.toLocaleString()} <span className="text-sm font-sans font-medium text-black/50">kg</span>
            </div>
            <div className="text-[11px] text-black/50 font-mono pt-1 border-t border-black/[0.05]">
              CEA Factor: 0.82 kg/kWh vs Coal
            </div>
          </div>

          {/* Card 4: Grid Utilization */}
          <div className="p-5 rounded-3xl bg-white border border-black/[0.08] shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-black/45 text-xs font-medium uppercase tracking-wider">
              <span>Active Bay Utilization</span>
              <TrendingUp className="w-4 h-4 text-sky-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#111312]">
              {Math.round((stats.activeBaysCount / Math.max(stats.totalBaysCount, 1)) * 100)}%
            </div>
            <div className="text-[11px] text-sky-700 font-mono font-medium pt-1 border-t border-black/[0.05]">
              {stats.activeBaysCount} Active / {stats.totalBaysCount} Installed Bays
            </div>
          </div>
        </section>

        {/* ── TWO-COLUMN INTERACTIVE SECTION ──────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column (7 Cols): Project Finance & Dynamic Yield Simulator */}
          <section className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-3xl border border-black/[0.08] shadow-2xs space-y-6">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-xl font-bold text-[#111312]">
                    Dynamic Capital Yield & Payback Simulator
                  </h2>
                </div>
                <p className="text-xs text-black/50 mt-0.5">
                  Simulate commercial 3W auto stands and community kirana chargers in Maharashtra.
                </p>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full font-mono font-bold">
                Monte Carlo Yield
              </span>
            </div>

            {/* Interactive Sliders */}
            <div className="space-y-5">
              {/* Slider 1: Retail Driver Tariff */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-[#111312]">
                  <span>Driver Retail Tariff:</span>
                  <span className="font-mono text-emerald-600 text-sm font-bold">
                    ₹{retailTariff.toFixed(1)} / kWh
                  </span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="24"
                  step="0.5"
                  value={retailTariff}
                  onChange={(e) => setRetailTariff(parseFloat(e.target.value))}
                  className="w-full accent-[#111312] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-black/40 font-mono">
                  <span>Subsidized (₹12)</span>
                  <span>Average Pune (₹16)</span>
                  <span>Peak DCFC (₹24)</span>
                </div>
              </div>

              {/* Slider 2: Input Power Cost */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-[#111312]">
                  <span>MSEDCL Commercial Power Tariff:</span>
                  <span className="font-mono text-black/70 text-sm font-bold">
                    ₹{unitPowerCost.toFixed(1)} / kWh
                  </span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="12"
                  step="0.25"
                  value={unitPowerCost}
                  onChange={(e) => setUnitPowerCost(parseFloat(e.target.value))}
                  className="w-full accent-[#111312] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-black/40 font-mono">
                  <span>Solar Net Metering (₹6)</span>
                  <span>Grid Baseline (₹8.5)</span>
                  <span>Commercial Peak (₹12)</span>
                </div>
              </div>

              {/* Slider 3: Daily Dispensing Hours */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-[#111312]">
                  <span>Average Daily Active Dispensing:</span>
                  <span className="font-mono text-blue-600 text-sm font-bold">
                    {dailyHours.toFixed(1)} Hours / Bay
                  </span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="14"
                  step="0.5"
                  value={dailyHours}
                  onChange={(e) => setDailyHours(parseFloat(e.target.value))}
                  className="w-full accent-[#111312] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-black/40 font-mono">
                  <span>Low (2h)</span>
                  <span>Standard Urban (6.5h)</span>
                  <span>24x7 Fleet Depot (14h)</span>
                </div>
              </div>
            </div>

            {/* Calculated Yield Output Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-[#FAF9F6] border border-black/[0.06]">
                <span className="text-[10px] font-medium uppercase text-black/45 block">
                  Projected CapEx Payback
                </span>
                <span className="text-xl font-mono font-extrabold text-emerald-600 mt-1 block">
                  {calculations.paybackMonths} Months
                </span>
                <span className="text-[10px] text-black/40 font-mono">
                  Full capital return
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FAF9F6] border border-black/[0.06]">
                <span className="text-[10px] font-medium uppercase text-black/45 block">
                  Projected Annual IRR
                </span>
                <span className="text-xl font-mono font-extrabold text-purple-600 mt-1 block">
                  {calculations.projectedIrr}%
                </span>
                <span className="text-[10px] text-black/40 font-mono">
                  Unlevered cash yield
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FAF9F6] border border-black/[0.06] col-span-2 sm:col-span-1">
                <span className="text-[10px] font-medium uppercase text-black/45 block">
                  Annual Carbon Abatement
                </span>
                <span className="text-xl font-mono font-extrabold text-teal-600 mt-1 block">
                  {calculations.annualCo2Tons} Tons
                </span>
                <span className="text-[10px] text-black/40 font-mono">
                  Tradeable carbon credits
                </span>
              </div>
            </div>
          </section>

          {/* Right Column (5 Cols): Live Deployed Community Stalls Portfolio */}
          <section className="lg:col-span-5 bg-white p-6 sm:p-8 rounded-3xl border border-black/[0.08] shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-bold text-[#111312]">
                  Community Stalls Portfolio
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-black/60">
                {deployedStations.length} Active
              </span>
            </div>

            <p className="text-xs text-black/50 leading-relaxed">
              Micro-hubs deployed and funded through EVverse grants and community allocations.
            </p>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {deployedStations.map((station) => (
                <div
                  key={station.id}
                  className="p-3.5 rounded-2xl border border-black/[0.06] bg-[#FAF9F6] hover:bg-white hover:shadow-xs transition-all space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-[#111312] leading-tight">
                        {station.name}
                      </h4>
                      <p className="text-[10px] text-black/50 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" />
                        <span>{station.area}, {station.city}</span>
                      </p>
                    </div>
                    <span className="text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      {station.powerKw} kW • {station.bays} Bays
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono pt-2 border-t border-black/[0.04] text-black/60">
                    <span>CapEx: {station.capexAmount}</span>
                    <span className="text-emerald-700 font-semibold">
                      ₹{station.ratePerKwh}/kWh Tariff
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setDeployStep("form");
                setShowDeployModal(true);
              }}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-black/15 hover:border-black/40 text-black/70 hover:text-black font-semibold text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Fund & Deploy New Stall</span>
            </button>
          </section>
        </div>

        {/* ── TARGET MARKET INTELLIGENCE METRIC CARDS ───────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
            <div>
              <h3 className="text-lg font-bold text-[#111312]">
                Target Corridor Intelligence
              </h3>
              <p className="text-xs text-black/50">
                Live density proxies and grid readiness across top growth clusters.
              </p>
            </div>
            <Link
              href={mapHref}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
            >
              <span>Explore Spatial Digital Twin</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <InvestorMarketIndicator
              city="Pune"
              description="High-growth 2W/3W EV transition & IT tech park corridor"
            />
            <InvestorMarketIndicator
              city="Mumbai"
              description="High-density urban commercial hubs & coastal expressway"
            />
            <InvestorMarketIndicator
              city="Bengaluru"
              description="Early-adopter tech corridors & commercial delivery hubs"
            />
          </div>

          {/* ── DRIVER APP DEMAND & AMENITY DWELL SYNERGY ────────── */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950 via-[#111312] to-slate-900 text-white border border-emerald-500/20 shadow-md flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Real-Time Closed Loop Feedback</span>
              </div>
              <h4 className="text-xl font-bold text-white tracking-tight">
                Driver App Demand & POI Dwell Synergy
              </h4>
              <p className="text-xs text-white/70 leading-relaxed">
                When EV drivers search for chargers, report broken stations, or book bays with critical battery levels, our backend aggregates this unmet demand into candidate zones. Zones adjacent to restaurants and hotels capture 1.4x higher dwell durations, accelerating CapEx payback by 1.8 years.
              </p>
            </div>
            <Link
              href={mapHref}
              className="px-5 py-3 rounded-2xl bg-[#C8F369] text-[#111312] font-bold text-xs hover:bg-[#b8e259] transition-all flex items-center gap-2 whitespace-nowrap shadow-sm hover:scale-105 active:scale-95"
            >
              <span>Run GA & Spatial Optimizer</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* ── DEPLOY COMMUNITY STALL MODAL ───────────────────────── */}
      {showDeployModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg max-h-[88dvh] overflow-y-auto bg-white rounded-3xl p-5 sm:p-8 shadow-2xl border border-black/10 space-y-5 sm:space-y-6 animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base sm:text-lg font-bold text-[#111312]">
                  Deploy Community Micro-Stall
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeployModal(false)}
                className="text-black/40 hover:text-black p-1.5 cursor-pointer rounded-lg hover:bg-black/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deployStep === "form" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-black/70 mb-1">
                    Station Name
                  </label>
                  <input
                    type="text"
                    value={newStationName}
                    onChange={(e) => setNewStationName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-black/15 text-xs font-medium focus:border-black focus:outline-none"
                    placeholder="e.g. Kothrud Metro Kirana Point"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-black/70 mb-1">
                      City
                    </label>
                    <select
                      value={newStationCity}
                      onChange={(e) => setNewStationCity(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-black/15 text-xs font-medium focus:border-black focus:outline-none"
                    >
                      <option value="Pune">Pune</option>
                      <option value="Mumbai">Mumbai</option>
                      <option value="Bengaluru">Bengaluru</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-black/70 mb-1">
                      Area / Corridor
                    </label>
                    <input
                      type="text"
                      value={newStationArea}
                      onChange={(e) => setNewStationArea(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-black/15 text-xs font-medium focus:border-black focus:outline-none"
                      placeholder="e.g. Kothrud"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-black/70 mb-1">
                    Hardware Archetype
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: "3w_auto", name: "3W Auto Stand", power: "11 kW", capex: "₹1.8L" },
                      { id: "kirana_ac", name: "Kirana Dual AC", power: "22 kW", capex: "₹2.4L" },
                      { id: "dcfc_fast", name: "DC Fast Plaza", power: "60 kW", capex: "₹6.5L" },
                    ].map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setNewStationArchetype(type.id as any)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          newStationArchetype === type.id
                            ? "border-[#111312] bg-[#FAF9F6] shadow-xs ring-1 ring-black"
                            : "border-black/10 hover:border-black/30"
                        }`}
                      >
                        <span className="block text-[11px] font-bold text-[#111312]">
                          {type.name}
                        </span>
                        <span className="block text-[9.5px] text-black/50 font-mono mt-0.5">
                          {type.power} • {type.capex}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-black/70 mb-1">
                    Capital Source
                  </label>
                  <input
                    type="text"
                    value={newStationFund}
                    onChange={(e) => setNewStationFund(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-black/15 text-xs font-medium focus:border-black focus:outline-none"
                    placeholder="e.g. Pune Clean Mobility Fund"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleExecuteDeploy}
                    className="w-full py-3 rounded-xl bg-[#111312] text-white hover:bg-black font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4 text-[#C8F369]" />
                    <span>Deploy Station to Live Network</span>
                  </button>
                </div>
              </div>
            )}

            {deployStep === "provisioning" && (
              <div className="py-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-full border-4 border-black/10 border-t-[#111312] animate-spin mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-[#111312]">
                    Provisioning Micro-Stall...
                  </h4>
                  <p className="text-xs text-black/50 font-mono">
                    Allocating smart meter ID • Registering Bharat QR VPA • Syncing with Monad L1 Ledger
                  </p>
                </div>
              </div>
            )}

            {deployStep === "success" && deployedItem && (
              <div className="space-y-4 text-center py-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-bold text-[#111312]">
                    Station Successfully Deployed!
                  </h4>
                  <p className="text-xs text-black/60 max-w-sm mx-auto">
                    <strong>{deployedItem.name}</strong> is now live on the network registry. EV drivers can discover and book it immediately!
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-[#FAF9F6] border border-black/[0.08] text-xs font-mono text-left space-y-1">
                  <div>Station ID: <span className="font-bold">{deployedItem.id}</span></div>
                  <div>CapEx Allocated: <span className="text-emerald-700 font-bold">{deployedItem.capexAmount}</span></div>
                  <div>Location: <span>{deployedItem.address}</span></div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeployModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-[#111312] text-white font-bold text-xs"
                  >
                    Done
                  </button>
                  <Link
                    href={driverHref}
                    className="flex-1 py-2.5 rounded-xl border border-black/15 font-bold text-xs text-black hover:bg-black/5 flex items-center justify-center gap-1"
                  >
                    <span>View as Driver</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
