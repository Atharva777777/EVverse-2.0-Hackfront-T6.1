'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowUpRight,
  ChevronDown,
  BookOpen,
  Play,
  X,
  Sparkles
} from 'lucide-react';
import { AbstractEditorialTimeline } from './AbstractEditorialTimeline';

export interface EditorialLandingPageProps {
  /**
   * Optional custom routes to navigate to when clicking role cards or header links
   */
  routes?: {
    home?: string;
    howItWorks?: string;
    roles?: string;
    guide?: string;
    investor?: string;
    stationOwners?: string;
    users?: string;
  };
  /**
   * Base path for public assets (defaults to relative or root `/`)
   */
  assetBasePath?: string;
}

export function EditorialLandingPage({
  routes = {
    home: '/',
    howItWorks: '#how-it-works',
    roles: '#roles',
    guide: '/users/knowledge',
    investor: '/investor',
    stationOwners: '/station-owners',
    users: '/users',
  },
  assetBasePath = '',
}: EditorialLandingPageProps) {
  const [scrollY, setScrollY] = useState(0);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const getAsset = (path: string) => `${assetBasePath}${path}`;

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsVideoModalOpen(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  // 3D parallax tilt values & camera push transitions
  const tiltX = mousePos.y * -6;
  const tiltY = mousePos.x * 10;
  
  // Dynamic camera depth and smooth scroll handover
  const heroProgress = Math.min(Math.max(scrollY / 650, 0), 1);
  const heroParallax = Math.min(scrollY * 0.22, 120);
  const monolithScale = 1 - heroProgress * 0.08;
  const monolithOpacity = Math.max(0.65, 1 - heroProgress * 0.4);
  const textParallax = scrollY * 0.16;
  const chargingTextScale = 1 + heroProgress * 0.06;
  const chargingTextOpacity = Math.max(0.18, 0.85 - heroProgress * 0.7);
  const leaderLineOpacity = Math.max(0, 1 - scrollY / 180);
  const energyBeamHeight = Math.min(Math.max((scrollY - 50) * 0.7, 0), 150);

  return (
    <div className="min-h-screen bg-[#D8DCDE] p-2 sm:p-4 md:p-6 text-[#111312] selection:bg-[#111312] selection:text-white font-sans antialiased">
      {/* ── Main Editorial Outer Frame (Matching Reference) ── */}
      <div className="relative w-full max-w-[1400px] mx-auto rounded-[36px] sm:rounded-[44px] md:rounded-[52px] bg-gradient-to-b from-[#E7EAEB] via-[#DEE1E3] to-[#D3D7D9] shadow-[0_30px_90px_rgba(0,0,0,0.12)] border border-white/70 overflow-hidden flex flex-col">
        
        {/* ── Top Header: Minimal Glyph & Navigation ── */}
        <header className="relative z-40 w-full px-4 sm:px-12 py-4 sm:py-8 flex items-center justify-between border-b border-black/[0.04]">
          <Link href={routes.home || '/'} className="flex items-center group" aria-label="Home">
            <div className="relative w-12 h-12 sm:w-16 sm:h-16 flex-shrink-0 group-hover:scale-105 transition-transform">
              <Image
                src={getAsset('/images/evverse-logo.png')}
                alt="EVverse Logo"
                width={64}
                height={64}
                priority
                className="object-contain w-full h-full"
              />
            </div>
          </Link>

          {/* Minimal Links */}
          <nav className="flex items-center gap-2.5 sm:gap-6 text-xs tracking-wider uppercase font-medium text-black/60">
            <a href={routes.home || '#hero'} className="hidden md:inline-block hover:text-black transition-colors">
              Home
            </a>
            <a href={routes.howItWorks || '#how-it-works'} className="hidden md:inline-block hover:text-black transition-colors">
              How It Works
            </a>
            <a href={routes.roles || '#roles'} className="hidden md:inline-block hover:text-black transition-colors">
              Roles
            </a>
            <Link
              href={routes.users || '/users'}
              className="hover:text-black transition-colors flex items-center gap-1.5 font-bold text-[#111312]"
            >
              <span>Users</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-[#111312] text-[#C8F369]">
                App
              </span>
            </Link>
            {routes.guide && (
              <Link
                href={routes.guide}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#14F1D9]/15 border border-[#14F1D9]/30 text-black hover:text-[#0D9488] transition-colors"
              >
                <BookOpen size={12} className="text-[#0D9488]" />
                <span className="text-[11px] font-bold">Guide</span>
              </Link>
            )}
            <Link
              href={routes.users || '/users'}
              className="bg-[#111312] hover:bg-black text-[#C8F369] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-xs transition-all hover:scale-105 cursor-pointer ml-1"
            >
              <span className="text-xs">Launch App</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-[#C8F369]" />
            </Link>
          </nav>
        </header>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* ── HERO VIEWPORT: GIANT CHARGING + 3D MONOLITH ─────────────── */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section
          id="hero"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="relative min-h-[720px] sm:min-h-[800px] md:min-h-[860px] w-full flex items-center justify-center px-6 sm:px-12 py-10 overflow-hidden select-none"
        >
          {/* ── GIANT TYPOGRAPHY: CHARGING with 3D Depth Dispersal ── */}
          <div
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-between px-2 sm:px-8 pointer-events-none z-0 transition-transform duration-100 ease-out"
            style={{
              transform: `translateY(calc(-50% - ${textParallax}px)) scale(${chargingTextScale})`,
              opacity: chargingTextOpacity,
            }}
          >
            <span className="text-[17vw] font-black tracking-tighter text-white/85 leading-none select-none drop-shadow-xs">
              CHAR
            </span>
            <span className="text-[17vw] font-black tracking-tighter text-white/85 leading-none select-none drop-shadow-xs">
              GING
            </span>
          </div>

          {/* ── Top-Left Callout ── */}
          <div
            className="absolute top-6 left-4 sm:top-10 sm:left-12 z-20 space-y-1 max-w-[170px] sm:max-w-xs transition-opacity duration-200"
            style={{ opacity: Math.max(0.2, 1 - scrollY / 260) }}
          >
            <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-black/45 block">
              Fast and Secure
            </span>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-[#111312]">
              Next-Gen Power
            </h1>
            <p className="text-[11px] sm:text-xs text-black/55 pt-0.5 sm:pt-1">
              Guaranteed charging spots. Zero wait time.
            </p>
          </div>

          {/* ── Central 3D Monolith Render with Mouse Parallax Tilt & Scroll Handover ── */}
          <div
            className="relative z-10 w-full max-w-[460px] sm:max-w-[560px] md:max-w-[640px] lg:max-w-[700px] flex items-center justify-center transition-all duration-200 ease-out -mt-4 sm:-mt-8 md:-mt-12"
            style={{
              transform: `translateY(${heroParallax - 52}px) perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${monolithScale})`,
              opacity: monolithOpacity,
            }}
          >
            {/* Ambient Fresh Bright Teal Glow matching station lighting */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#14F1D9]/30 via-teal-400/20 to-transparent rounded-full blur-3xl pointer-events-none -bottom-10" />

            <div className="relative w-full aspect-[1284/1225] drop-shadow-[0_40px_70px_rgba(0,0,0,0.22)]">
              <Image
                src={getAsset('/images/hero-unknown-station.png')}
                alt="EVverse E-Flow Smart Fast Charging Station"
                fill
                priority
                className="object-contain"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 700px, 800px"
              />
            </div>

            {/* Interactive Play Badge hovering over 3D station */}
            <button
              onClick={() => setIsVideoModalOpen(true)}
              className="absolute top-6 sm:top-8 right-2 sm:right-6 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#111312]/90 hover:bg-[#111312] text-white border border-[#14F1D9]/50 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-all hover:scale-105 group cursor-pointer"
              aria-label="Play app video overview"
            >
              <div className="w-5 h-5 rounded-full bg-[#14F1D9] flex items-center justify-center text-[#111312] group-hover:scale-110 transition-transform">
                <Play size={10} className="fill-current translate-x-0.5" />
              </div>
              <span className="text-[11px] font-bold tracking-wide">Play Video</span>
            </button>

            {/* Spec Pointer Dot and Leader Line (Fades smoothly on scroll) */}
            <div
              className="absolute -left-4 sm:left-2 bottom-12 z-20 hidden sm:flex items-center gap-3 transition-opacity duration-200"
              style={{ opacity: leaderLineOpacity }}
            >
              <div className="relative flex items-center">
                <div className="w-2.5 h-2.5 rounded-full bg-[#111312] ring-2 ring-[#14F1D9] shadow-[0_0_10px_rgba(20,241,217,0.7)]" />
                <div className="w-14 h-px bg-black/30" />
              </div>
              <div className="text-left bg-white/70 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/80 shadow-xs">
                <p className="text-xs font-bold text-[#111312]">E-Flow Smart Kiosk</p>
                <p className="text-[10px] text-black/60 font-mono">
                  48-180kW DC Fast Charge • 0kg CO₂
                </p>
              </div>
            </div>
          </div>

          {/* ── Bottom-Right Manifesto Text ── */}
          <div
            className="absolute bottom-10 right-4 sm:bottom-12 sm:right-12 z-20 max-w-[180px] sm:max-w-xs text-right space-y-1.5 sm:space-y-2 transition-opacity duration-200"
            style={{ opacity: Math.max(0.2, 1 - scrollY / 260) }}
          >
            <p className="text-[11px] sm:text-sm text-black/65 leading-snug sm:leading-relaxed">
              Be part of the transformation in electric vehicles via intelligent network planning.
            </p>
            <p className="text-[10px] sm:text-[11px] font-mono text-black/40">
              800V ARCHITECTURE • ISO 15118
            </p>
          </div>

          {/* ── Seamless Energy Conduit Beam (Flows downwards through notch into timeline) ── */}
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-0 w-px pointer-events-none transition-all duration-150 ease-out z-20"
            style={{
              height: `${energyBeamHeight}px`,
              background: 'linear-gradient(to bottom, rgba(20,241,217,0.95), rgba(17,19,18,0.4), transparent)',
              boxShadow: '0 0 16px rgba(20,241,217,0.75)',
            }}
          />

          {/* ── Bottom Notch with Scroll Arrow & Seamless Energy Handover ── */}
          <div className="absolute bottom-0 inset-x-0 flex justify-center z-30 pointer-events-none">
            <div className="relative w-36 h-10 bg-[#D8DCDE] rounded-t-full flex items-center justify-center shadow-inner overflow-hidden">
              {/* Luminous Energy Fill */}
              <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-300"
                style={{
                  background: 'radial-gradient(circle at 50% 100%, rgba(20,241,217,0.5) 0%, transparent 70%)',
                  opacity: Math.min(scrollY / 100, 1),
                }}
              />
              <a
                href={routes.howItWorks || '#how-it-works'}
                aria-label="Scroll down to how it works"
                className="pointer-events-auto p-2 text-black/50 hover:text-black transition-all flex flex-col items-center gap-0.5 group"
              >
                <span className="text-[8px] font-mono uppercase tracking-widest text-black/45 font-bold group-hover:text-black transition-colors">
                  EXPLORE
                </span>
                <ChevronDown className="w-3.5 h-3.5 animate-bounce text-black/70 group-hover:text-black transition-colors" />
              </a>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* ── SECTION 2: ABSTRACT SCROLL TIMELINE (HOW IT WORKS) ──────── */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <AbstractEditorialTimeline />

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* ── SECTION 3: THE 3 USERS / ROLES ──────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <section
          id="roles"
          className="relative px-6 sm:px-10 md:px-14 py-20 border-t border-black/[0.05] bg-white/40 backdrop-blur-md"
        >
          <div className="max-w-6xl mx-auto space-y-12">
            {/* Title Section */}
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#1d1d1f]">
                Welcome to EVverse
              </h2>
              <p className="text-sm sm:text-base text-[#86868b] leading-relaxed">
                Select your role to access tailored infrastructure planning, deployment insights, and optimization tools.
              </p>
            </div>

            {/* Three Distinct Role Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-7 w-full">
              
              {/* ── CARD 1: INVESTOR ─────────────────────────── */}
              <Link href={routes.investor || '/investor'} className="no-underline group">
                <div
                  onMouseEnter={() => setHoveredCard(1)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className={`h-full flex flex-col bg-white rounded-[22px] overflow-hidden border border-black/[0.08] transition-all duration-300 cursor-pointer ${
                    hoveredCard === 1
                      ? 'shadow-[0_20px_40px_rgba(0,0,0,0.1)] -translate-y-1.5'
                      : 'shadow-[0_2px_10px_rgba(0,0,0,0.03)]'
                  }`}
                >
                  <div className="relative w-full h-[220px] overflow-hidden bg-[#f5f5f7]">
                    <Image
                      src={getAsset('/images/card-investor.png')}
                      alt="EV Charging Infrastructure Investment Modeling"
                      fill
                      sizes="(max-width: 768px) 100vw, 360px"
                      className={`object-cover transition-transform duration-500 ${
                        hoveredCard === 1 ? 'scale-105' : 'scale-100'
                      }`}
                    />
                  </div>

                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-2.5">
                      <h3 className="text-[22px] font-semibold text-[#1d1d1f] tracking-tight">
                        Investor
                      </h3>
                      <ArrowUpRight
                        size={18}
                        className={`transition-all duration-200 ${
                          hoveredCard === 1
                            ? 'text-[#0071e3] translate-x-0.5 -translate-y-0.5'
                            : 'text-[#86868b]'
                        }`}
                      />
                    </div>
                    <p className="text-sm leading-relaxed text-[#6e6e73] m-0">
                      Identify high-demand areas, plan strategic deployments, and analyze ROI scenarios.
                    </p>
                  </div>
                </div>
              </Link>

              {/* ── CARD 2: EV STATION OWNERS ───────────────────────── */}
              <Link href={routes.stationOwners || '/station-owners'} className="no-underline group">
                <div
                  onMouseEnter={() => setHoveredCard(2)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className={`h-full flex flex-col bg-white rounded-[22px] overflow-hidden border border-black/[0.08] transition-all duration-300 cursor-pointer ${
                    hoveredCard === 2
                      ? 'shadow-[0_20px_40px_rgba(0,0,0,0.1)] -translate-y-1.5'
                      : 'shadow-[0_2px_10px_rgba(0,0,0,0.03)]'
                  }`}
                >
                  <div className="relative w-full h-[220px] overflow-hidden bg-[#f5f5f7]">
                    <Image
                      src={getAsset('/images/card-station-owners.png')}
                      alt="Real-World Commercial EV Charging Plaza"
                      fill
                      sizes="(max-width: 768px) 100vw, 360px"
                      className={`object-cover transition-transform duration-500 ${
                        hoveredCard === 2 ? 'scale-105' : 'scale-100'
                      }`}
                    />
                  </div>

                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-2.5">
                      <h3 className="text-[22px] font-semibold text-[#1d1d1f] tracking-tight">
                        EV Station Owners
                      </h3>
                      <ArrowUpRight
                        size={18}
                        className={`transition-all duration-200 ${
                          hoveredCard === 2
                            ? 'text-[#0071e3] translate-x-0.5 -translate-y-0.5'
                            : 'text-[#86868b]'
                        }`}
                      />
                    </div>
                    <p className="text-sm leading-relaxed text-[#6e6e73] m-0">
                      Manage charging hubs, monitor charger utilization, optimize tariffs, and track grid power uptime.
                    </p>
                  </div>
                </div>
              </Link>

              {/* ── CARD 3: EV USERS ─────────────────────────── */}
              <Link href={routes.users || '/users'} className="no-underline group">
                <div
                  onMouseEnter={() => setHoveredCard(3)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className={`h-full flex flex-col bg-white rounded-[22px] overflow-hidden border border-black/[0.08] transition-all duration-300 cursor-pointer ${
                    hoveredCard === 3
                      ? 'shadow-[0_20px_40px_rgba(0,0,0,0.12)] -translate-y-1.5 ring-2 ring-[#C8F369]'
                      : 'shadow-[0_2px_10px_rgba(0,0,0,0.03)]'
                  }`}
                >
                  <div className="relative w-full h-[220px] overflow-hidden bg-[#f5f5f7]">
                    <Image
                      src={getAsset('/images/card-users.png')}
                      alt="EV Users Vehicle and Fast Charger"
                      fill
                      sizes="(max-width: 768px) 100vw, 360px"
                      className={`object-cover transition-transform duration-500 ${
                        hoveredCard === 3 ? 'scale-105' : 'scale-100'
                      }`}
                    />
                    <div className="absolute top-3 left-3 bg-[#111312]/90 backdrop-blur-md text-[#C8F369] px-2.5 py-1 rounded-full text-[10px] font-mono font-bold flex items-center gap-1.5 border border-[#C8F369]/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C8F369] animate-pulse" />
                      <span>MOBILE DRIVER APP</span>
                    </div>
                  </div>

                  <div className="p-6 flex flex-col flex-1 justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <h3 className="text-[22px] font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
                          <span>EV Users</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#111312] text-[#C8F369] font-bold">
                            Live App
                          </span>
                        </h3>
                        <ArrowUpRight
                          size={18}
                          className={`transition-all duration-200 ${
                            hoveredCard === 3
                              ? 'text-[#111312] translate-x-0.5 -translate-y-0.5'
                              : 'text-[#86868b]'
                          }`}
                        />
                      </div>
                      <p className="text-sm leading-relaxed text-[#6e6e73] m-0">
                        Discover charging stations, reserve bays, check connector compatibility, and plan journeys in the interactive mobile driver cockpit.
                      </p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-black/[0.06] flex items-center justify-between text-xs font-semibold text-[#111312]">
                      <span className="text-[#16A34A] flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                        Ready to Explore
                      </span>
                      <span className="group-hover:translate-x-1 transition-transform flex items-center gap-1 font-bold text-[#111312]">
                        Open Mobile App →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>

            </div>
          </div>
        </section>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <footer className="border-t border-black/[0.06] px-6 sm:px-12 py-6 flex flex-col sm:flex-row justify-between items-center text-xs text-[#86868b] gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#111312]">EVverse</span>
            <span>•</span>
            <span>Decision Intelligence for EV Infrastructure</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            {routes.guide && (
              <Link href={routes.guide} className="hover:text-black transition-colors font-semibold text-[#0D9488]">
                Driver & Host Guide
              </Link>
            )}
            <Link href={routes.users || '/users'} className="hover:text-black transition-colors font-medium text-[#111312]">
              EV Users (Mobile App)
            </Link>
            <Link href={routes.stationOwners || '/station-owners'} className="hover:text-black transition-colors">
              Station Owners
            </Link>
            <Link href={routes.investor || '/investor'} className="hover:text-black transition-colors">
              Investors
            </Link>
          </div>
        </footer>

      </div>

      {/* ── VIDEO MODAL DIALOG ──────────────────────────────── */}
      {isVideoModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 md:p-10 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsVideoModalOpen(false);
            }
          }}
        >
          <div className="relative w-full max-w-5xl rounded-3xl overflow-hidden border border-white/10 bg-black shadow-[0_30px_100px_rgba(0,0,0,0.9),0_0_80px_rgba(20,241,217,0.2)]">
            {/* Minimalist Floating Close Button */}
            <button
              onClick={() => setIsVideoModalOpen(false)}
              className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-black/70 hover:bg-black/95 text-white/80 hover:text-white flex items-center justify-center transition-all backdrop-blur-md border border-white/15 cursor-pointer shadow-lg"
              aria-label="Close video modal"
            >
              <X size={18} />
            </button>

            {/* Video Player */}
            <div className="relative aspect-video w-full bg-black flex items-center justify-center">
              <video
                ref={videoRef}
                src={getAsset('/videos/demo_video.mp4')}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

