'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  getDeployedStations,
  subscribeToEcosystem,
  type DeployedCommunityStation,
} from '@/lib/ecosystemStore';
import {
  Zap,
  Building2,
  DollarSign,
  TrendingUp,
  Star,
  ChevronDown,
  ShieldCheck,
  MapPin,
  Clock,
  CheckCircle2,
  Smartphone,
  Maximize2,
  ArrowLeft,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { CodedStationChargersLineup } from './CodedStationChargersLineup';
import { StationOwnerPaymentsConsole } from './StationOwnerPaymentsConsole';
import { StationOwnerDemandTab } from './StationOwnerDemandTab';
import { StationOwnerReviewsTab } from './StationOwnerReviewsTab';

export interface OwnedStation {
  id: string;
  name: string;
  location: string;
  address: string;
  status: 'Online' | 'Maintenance' | 'Offline';
  totalBays: number;
  activeBays: number;
  peakKw: number;
  todayRevenue: string;
  monthlyRevenue: string;
  parkingFeeToday: string;
  totalSessionsToday: number;
  kwhDeliveredToday: string;
  rating: number;
  reviewCount: number;
  ratePerKwh: number;
  parkingFeePerHour: number;
}

const OWNED_STATIONS: OwnedStation[] = [
  {
    id: 'superhub-pune',
    name: 'Expressway Fast Superhub',
    location: 'Mumbai-Pune Expressway',
    address: 'Km 48, Near Khalapur Toll Plaza, MH',
    status: 'Online',
    totalBays: 6,
    activeBays: 5,
    peakKw: 180,
    todayRevenue: '₹24,850',
    monthlyRevenue: '₹6,84,200',
    parkingFeeToday: '₹3,400',
    totalSessionsToday: 38,
    kwhDeliveredToday: '1,142 kWh',
    rating: 4.8,
    reviewCount: 128,
    ratePerKwh: 18.5,
    parkingFeePerHour: 50,
  },
  {
    id: 'bkc-mumbai',
    name: 'BKC Commercial Hub',
    location: 'Bandra Kurla Complex, Mumbai',
    address: 'G-Block, Opp. Trade Centre, Bandra East',
    status: 'Online',
    totalBays: 4,
    activeBays: 3,
    peakKw: 120,
    todayRevenue: '₹18,400',
    monthlyRevenue: '₹5,12,000',
    parkingFeeToday: '₹2,600',
    totalSessionsToday: 26,
    kwhDeliveredToday: '890 kWh',
    rating: 4.9,
    reviewCount: 94,
    ratePerKwh: 16.0,
    parkingFeePerHour: 60,
  },
  {
    id: 'indiranagar-blr',
    name: 'Indiranagar Transit Hub',
    location: '100 Feet Road, Bengaluru',
    address: '12th Main Junction, Indiranagar',
    status: 'Online',
    totalBays: 6,
    activeBays: 4,
    peakKw: 150,
    todayRevenue: '₹21,120',
    monthlyRevenue: '₹5,90,400',
    parkingFeeToday: '₹2,800',
    totalSessionsToday: 32,
    kwhDeliveredToday: '980 kWh',
    rating: 4.7,
    reviewCount: 112,
    ratePerKwh: 17.0,
    parkingFeePerHour: 40,
  },
];

type OwnerTab = 'hub' | 'earnings' | 'demand' | 'reviews';

export interface StationOwnerAppProps {
  homeHref?: string;
  driverHref?: string;
  investorHref?: string;
  initialStationId?: string;
  defaultFramed?: boolean;
}

export function StationOwnerMobileApp({
  homeHref = "/",
  driverHref = "/users/stations",
  investorHref = "/investor",
  initialStationId,
  defaultFramed = true,
}: StationOwnerAppProps = {}) {
  const [deployedStations, setDeployedStations] = useState<DeployedCommunityStation[]>([]);

  useEffect(() => {
    setDeployedStations(getDeployedStations());
    const unsub = subscribeToEcosystem(() => {
      setDeployedStations(getDeployedStations());
    });
    return unsub;
  }, []);

  const allStations = useMemo<OwnedStation[]>(() => {
    const dynamicStations: OwnedStation[] = deployedStations.map((d) => ({
      id: d.id,
      name: d.name,
      location: `${d.area}, ${d.city}`,
      address: d.address,
      status: d.status,
      totalBays: d.bays,
      activeBays: Math.max(1, Math.floor(d.bays * 0.75)),
      peakKw: d.powerKw,
      todayRevenue: `₹${(d.bays * 2800).toLocaleString("en-IN")}`,
      monthlyRevenue: `₹${(d.bays * 84000).toLocaleString("en-IN")}`,
      parkingFeeToday: `₹${(d.bays * 350).toLocaleString("en-IN")}`,
      totalSessionsToday: d.bays * 6,
      kwhDeliveredToday: `${d.bays * 95} kWh`,
      rating: d.rating,
      reviewCount: 32,
      ratePerKwh: d.ratePerKwh,
      parkingFeePerHour: d.parkingFeePerHour,
    }));
    return [...dynamicStations, ...OWNED_STATIONS];
  }, [deployedStations]);

  const [selectedStationId, setSelectedStationId] = useState<string>(
    initialStationId || OWNED_STATIONS[0].id
  );
  const [showStationPicker, setShowStationPicker] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<OwnerTab>('hub');
  const [isFramed, setIsFramed] = useState<boolean>(defaultFramed);

  // Station smart controls
  const [autoReleaseEnabled, setAutoReleaseEnabled] = useState<boolean>(true);
  const [nightIllumination, setNightIllumination] = useState<boolean>(true);
  const [parkingReservationsActive, setParkingReservationsActive] = useState<boolean>(true);

  const currentStation = allStations.find((s) => s.id === selectedStationId) || allStations[0];

  return (
    <div
      className={`min-h-screen w-full flex flex-col items-center selection:bg-[#111312] selection:text-white transition-colors duration-300 ${
        isFramed
          ? "bg-[#0C0E0D] text-[#111312]"
          : "bg-[#FAF9F6] text-[#111312]"
      }`}
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
      }}
    >
      {/* ── Top Desktop Studio Navigation Toolbar ── */}
      <div className="hidden md:flex w-full max-w-5xl items-center justify-between px-6 py-3 border-b border-[rgba(255,255,255,0.08)] text-xs text-[#8C938E] z-50">
        <div className="flex items-center gap-3">
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/15 transition-all border border-white/10"
            title="Return to Home Page"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </Link>
          <div className="flex items-center gap-2 group">
            <div className="relative w-10 h-10 shrink-0">
              <Image
                src="/images/evverse-logo.png"
                alt="EVverse Logo"
                width={40}
                height={40}
                priority
                className="object-contain w-full h-full"
              />
            </div>
          </div>
          <span className="text-[11px] bg-white/10 text-white/80 px-2 py-0.5 rounded-md font-mono">
            Port 3001
          </span>
          <div className="h-3 w-px bg-white/10" />
          <div className="flex items-center gap-2 text-xs">
            <Link
              href={driverHref}
              className="text-[#8C938E] hover:text-white font-medium transition-colors"
            >
              Driver View
            </Link>
            <span className="text-white/20">•</span>
            <span className="font-semibold text-[#111312] px-2 py-0.5 rounded-md bg-[#C8F369]">
              Station Owner
            </span>
            <span className="text-white/20">•</span>
            <Link
              href={investorHref}
              className="text-[#8C938E] hover:text-white font-medium transition-colors"
            >
              Investor View
            </Link>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-[#1A1D1B] p-1 rounded-xl border border-[rgba(255,255,255,0.08)]">
          <button
            type="button"
            onClick={() => setIsFramed(true)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              isFramed ? "bg-[#C8F369] text-[#111312] shadow-xs" : "text-[#8C938E] hover:text-white"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Phone Frame</span>
          </button>
          <button
            type="button"
            onClick={() => setIsFramed(false)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              !isFramed ? "bg-white text-[#111312] shadow-xs" : "text-[#8C938E] hover:text-white"
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Mobile Column</span>
          </button>
        </div>
      </div>

      {/* ── Outer Mobile Container Shell ── */}
      <div
        className={`w-full flex-1 flex items-center justify-center ${
          isFramed ? "py-6 px-4" : "py-0 px-0 max-w-[430px]"
        }`}
      >
        {/* Main Container / Mobile Phone Shell */}
        <div
          className={
            isFramed
              ? "relative w-[424px] h-[866px] rounded-[56px] p-[10px] flex flex-col select-none transition-all my-auto"
              : "w-full max-w-[430px] min-h-screen flex flex-col relative bg-[#FAF9F6] shadow-2xl border-x border-[rgba(17,19,18,0.06)]"
          }
          style={
            isFramed
              ? {
                  background:
                    "linear-gradient(145deg, #383B39 0%, #1D1F1E 30%, #303331 60%, #151716 100%)",
                  boxShadow:
                    "0 45px 120px -20px rgba(0,0,0,0.95), 0 25px 60px -15px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 2px rgba(255,255,255,0.25)",
                }
              : undefined
          }
        >
        {/* Hardware Frame Buttons (in framed mode) */}
        {isFramed && (
          <>
            <div
              className="absolute -left-[5px] top-28 w-[5px] h-8 rounded-l-xs"
              style={{
                background: 'linear-gradient(to right, #242625, #444845)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)',
              }}
            />
            <div
              className="absolute -left-[5px] top-40 w-[5px] h-12 rounded-l-xs"
              style={{
                background: 'linear-gradient(to right, #242625, #444845)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)',
              }}
            />
            <div
              className="absolute -left-[5px] top-56 w-[5px] h-12 rounded-l-xs"
              style={{
                background: 'linear-gradient(to right, #242625, #444845)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)',
              }}
            />
            <div
              className="absolute -right-[5px] top-36 w-[5px] h-16 rounded-r-xs"
              style={{
                background: 'linear-gradient(to left, #242625, #444845)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)',
              }}
            />
          </>
        )}

        {/* Inner OLED Glass Bezel */}
        <div
          className={
            isFramed
              ? 'w-full h-full rounded-[48px] bg-[#0A0C0B] p-[6px] flex flex-col relative overflow-hidden'
              : 'w-full h-full flex flex-col'
          }
        >
          {/* Inner Display Screen */}
          <div className="w-full h-full bg-[#FAF9F6] rounded-[42px] flex flex-col relative overflow-hidden">
            {/* iOS Dynamic Island & Status Bar */}
            <div className="h-10 w-full flex items-center justify-between px-6 shrink-0 z-40 bg-[#FAF9F6] border-b border-black/[0.04] select-none">
              <span className="text-[12px] font-semibold text-[#111312] font-mono tracking-tight">
                9:41
              </span>
              <div className="h-5 w-28 bg-black rounded-full flex items-center justify-center gap-1.5 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-mono font-bold text-white tracking-wider uppercase">
                  Live Hub
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-black/60">5G</span>
                <div className="w-4 h-2 rounded-xs border border-black/40 flex items-center p-0.5">
                  <div className="w-2.5 h-full bg-black rounded-2xs" />
                </div>
              </div>
            </div>

            {/* ── Sticky Header: Station Switcher ── */}
            <header className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md px-3 py-2.5 border-b border-black/[0.06] shrink-0">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={homeHref}
                  className="w-8 h-8 rounded-xl bg-white border border-black/[0.08] shadow-2xs flex items-center justify-center text-black/70 hover:text-black shrink-0"
                  title="Back to EVverse"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Link>

                {/* Station Selector Button */}
                <div className="relative flex-1">
                  <button
                    type="button"
                    onClick={() => setShowStationPicker(!showStationPicker)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-2xl bg-white border border-black/[0.08] shadow-2xs hover:border-black/20 transition-all text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-[#111312] text-[#C8F369] flex items-center justify-center shrink-0">
                        <Zap className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[#111312] truncate block">
                          {currentStation.name}
                        </span>
                        <span className="text-[9.5px] text-black/50 block truncate">
                          {currentStation.location}
                        </span>
                      </div>
                    </div>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-black/40 shrink-0 transition-transform ${
                        showStationPicker ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {/* Dropdown Modal */}
                  {showStationPicker && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl p-2 shadow-xl border border-black/10 z-50 animate-in fade-in duration-150">
                      <div className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-black/40">
                        Select Station
                      </div>
                      <div className="space-y-1">
                        {allStations.map((st) => {
                          const isSel = st.id === currentStation.id;
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => {
                                setSelectedStationId(st.id);
                                setShowStationPicker(false);
                              }}
                              className={`w-full text-left p-2 rounded-xl flex items-center justify-between transition-colors ${
                                isSel ? 'bg-[#111312] text-white' : 'hover:bg-black/[0.04] text-[#111312]'
                              }`}
                            >
                              <div>
                                <p className="text-xs font-semibold">{st.name}</p>
                                <p className={`text-[10px] ${isSel ? 'text-white/70' : 'text-black/50'}`}>
                                  {st.location} • {st.totalBays} Bays
                                </p>
                              </div>
                              {isSel && <CheckCircle2 className="w-3.5 h-3.5 text-[#C8F369]" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bay Status Badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-[10px] font-bold shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  <span>{currentStation.activeBays}/{currentStation.totalBays} Busy</span>
                </div>
              </div>
            </header>

            {/* ── Scrollable Screen Body (Properly Contained) ── */}
            <main className="flex-1 overflow-y-auto no-scrollbar px-3.5 py-3 pb-24 space-y-3">
              {/* TAB 1: HUB (Hardware, Telemetry, Controls) */}
              {activeTab === 'hub' && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {/* Daily Stats Summary */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl bg-white p-2.5 border border-black/[0.06] shadow-2xs">
                      <span className="text-[9px] text-black/50 font-medium block">Today</span>
                      <span className="text-sm font-bold text-[#111312] mt-0.5 block">{currentStation.todayRevenue}</span>
                      <span className="text-[8.5px] text-emerald-600 font-semibold">+18% growth</span>
                    </div>
                    <div className="rounded-2xl bg-white p-2.5 border border-black/[0.06] shadow-2xs">
                      <span className="text-[9px] text-black/50 font-medium block">Energy</span>
                      <span className="text-sm font-bold text-[#111312] mt-0.5 block">{currentStation.kwhDeliveredToday}</span>
                      <span className="text-[8.5px] text-black/50">{currentStation.totalSessionsToday} Sessions</span>
                    </div>
                    <div className="rounded-2xl bg-white p-2.5 border border-black/[0.06] shadow-2xs">
                      <span className="text-[9px] text-black/50 font-medium block">Rating</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Star className="w-3 h-3 fill-[#111312] text-[#111312]" />
                        <span className="text-sm font-bold text-[#111312]">{currentStation.rating}</span>
                      </div>
                      <span className="text-[8.5px] text-black/50">{currentStation.reviewCount} reviews</span>
                    </div>
                  </div>

                  {/* Real Coded Image & Charger Hardware Presentation */}
                  <CodedStationChargersLineup stationName={currentStation.name} />

                  {/* Station Settings & Controls (Merged, clean, no clutter) */}
                  <div className="rounded-2xl bg-white p-3.5 border border-black/[0.06] shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-black/[0.05]">
                      <span className="text-xs font-bold text-[#111312]">Station Controls</span>
                      <span className="text-[10px] text-black/50 font-mono">
                        ₹{currentStation.ratePerKwh.toFixed(2)}/kWh • ₹{currentStation.parkingFeePerHour}/hr
                      </span>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-[#111312]">Parking Spot Holds</p>
                          <p className="text-[10px] text-black/50">Allow advance 30-min booking holds</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setParkingReservationsActive(!parkingReservationsActive)}
                          className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${
                            parkingReservationsActive ? 'bg-[#111312]' : 'bg-black/20'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${
                              parkingReservationsActive ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-black/[0.04]">
                        <div>
                          <p className="font-semibold text-[#111312]">Night Canopy Lighting</p>
                          <p className="text-[10px] text-black/50">Automatic evening illumination</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNightIllumination(!nightIllumination)}
                          className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${
                            nightIllumination ? 'bg-[#111312]' : 'bg-black/20'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${
                              nightIllumination ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: EARNINGS & PAYOUTS CONSOLE */}
              {activeTab === 'earnings' && (
                <div className="animate-in fade-in duration-200">
                  <StationOwnerPaymentsConsole />
                </div>
              )}

              {/* TAB 3: DEMAND & LIVE OCCUPANCY PROFILE */}
              {activeTab === 'demand' && (
                <div className="animate-in fade-in duration-200">
                  <StationOwnerDemandTab />
                </div>
              )}

              {/* TAB 4: REVIEWS & DRIVER SATISFACTION */}
              {activeTab === 'reviews' && (
                <div className="animate-in fade-in duration-200">
                  <StationOwnerReviewsTab
                    stationName={currentStation.name}
                    averageRating={currentStation.rating}
                    totalReviews={currentStation.reviewCount}
                  />
                </div>
              )}
            </main>

            {/* ── Fixed Bottom Navigation Bar (Ultra-clean, 4 tabs, zero emojis) ── */}
            <nav className="absolute bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/[0.08] px-3 py-2 flex items-center justify-around">
              <button
                type="button"
                onClick={() => setActiveTab('hub')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                  activeTab === 'hub' ? 'text-[#111312]' : 'text-black/40 hover:text-black/70'
                }`}
              >
                <div className={`p-1 rounded-lg ${activeTab === 'hub' ? 'bg-[#111312] text-[#C8F369]' : ''}`}>
                  <Building2 className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-semibold tracking-tight">Hub</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('earnings')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                  activeTab === 'earnings' ? 'text-[#111312]' : 'text-black/40 hover:text-black/70'
                }`}
              >
                <div className={`p-1 rounded-lg ${activeTab === 'earnings' ? 'bg-[#111312] text-[#C8F369]' : ''}`}>
                  <DollarSign className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-semibold tracking-tight">Earnings</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('demand')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                  activeTab === 'demand' ? 'text-[#111312]' : 'text-black/40 hover:text-black/70'
                }`}
              >
                <div className={`p-1 rounded-lg ${activeTab === 'demand' ? 'bg-[#111312] text-[#C8F369]' : ''}`}>
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-semibold tracking-tight">Demand</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('reviews')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                  activeTab === 'reviews' ? 'text-[#111312]' : 'text-black/40 hover:text-black/70'
                }`}
              >
                <div className={`p-1 rounded-lg ${activeTab === 'reviews' ? 'bg-[#111312] text-[#C8F369]' : ''}`}>
                  <Star className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-semibold tracking-tight">Reviews</span>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>
  </div>
);
}

export const StationOwnerApp = StationOwnerMobileApp;
export default StationOwnerMobileApp;
