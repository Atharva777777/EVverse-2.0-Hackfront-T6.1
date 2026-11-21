'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Sparkles, CheckCircle2, ShieldCheck, Zap, Users } from 'lucide-react';

export interface StageData {
  number: string;
  badge: string;
  zoneTag: string;
  zoneSub: string;
  title: string;
  howItWorks: string;
  communityBenefit: string;
  impactMetric: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const DEFAULT_STAGES: StageData[] = [
  {
    number: '01',
    badge: 'ACCESSIBLE CLEAN ENERGY',
    zoneTag: 'ZONE 01',
    zoneSub: 'CITIZEN ACCESS',
    title: 'Bringing Fast Charging Directly to Real Neighborhoods',
    howItWorks:
      'EVverse maps real daily traffic flows, commuter corridors, and residential habits to pinpoint where electric vehicles actually travel and park.',
    communityBenefit:
      'No more charging deserts. Fast chargers are placed right where families live, work, and grocery shop—making clean electric transportation accessible to every single neighborhood, not just luxury areas.',
    impactMetric: '100% Equal Access · Eliminates regional charging deserts',
    icon: Users,
  },
  {
    number: '02',
    badge: 'ZERO QUEUES & DELAYS',
    zoneTag: 'ZONE 02',
    zoneSub: 'ZERO BOTTLENECKS',
    title: 'Ending Long Charging Lines Before They Ever Form',
    howItWorks:
      'Our smart predictive system anticipates morning rush hours, weekend getaways, and sudden weather shifts days ahead to balance charging demand city-wide.',
    communityBenefit:
      'Drivers pull up to an open, ultra-fast charger with zero waiting. No lost work hours, no missed appointments, and total peace of mind that your family will never be stranded with a dead battery.',
    impactMetric: 'Guaranteed Open Bays · Saves 45+ minutes per charge trip',
    icon: Zap,
  },
  {
    number: '03',
    badge: 'COMMUNITY GRID PROTECTION',
    zoneTag: 'ZONE 03',
    zoneSub: 'GRID STABILITY',
    title: 'Protecting City Power and Preventing Blackouts',
    howItWorks:
      'EVverse balances electricity demand intelligently with local substations, guaranteeing high-voltage chargers never overload neighborhood power transformers.',
    communityBenefit:
      'Neighborhood power stays stable and reliable without brownouts or voltage dips. Electricity bills stay low, and our communities breathe fresh, smog-free air every day.',
    impactMetric: 'Zero Transformer Overload · Clean air & protected home power',
    icon: ShieldCheck,
  },
  {
    number: '04',
    badge: 'SHARED ECONOMIC PROSPERITY',
    zoneTag: 'ZONE 04',
    zoneSub: 'LOCAL GROWTH',
    title: 'Creating Steady Income for Local Businesses and Hosts',
    howItWorks:
      'We connect local property owners, retail hubs, and drivers into one shared system with fair, automated transparent earnings.',
    communityBenefit:
      'Local coffee shops, supermarkets, and mom-and-pop stores gain regular customer foot traffic while drivers charge. The entire community retains wealth locally and creates high-quality green jobs.',
    impactMetric: 'Direct Local Commerce · Sustainable green wealth for communities',
    icon: CheckCircle2,
  },
];

export interface AbstractEditorialTimelineProps {
  stages?: StageData[];
}

export function AbstractEditorialTimeline({ stages = DEFAULT_STAGES }: AbstractEditorialTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const journeyArenaRef = useRef<HTMLDivElement>(null);

  const [scrollProgress, setScrollProgress] = useState(0); // 0 to 1
  const [orbPosition, setOrbPosition] = useState<{
    mode: 'top' | 'fixed' | 'bottom';
    fixedLeft: number;
    fixedTop: number;
    absTop: number;
    absLeftPct: number;
  }>({
    mode: 'top',
    fixedLeft: 0,
    fixedTop: 0,
    absTop: 40,
    absLeftPct: 75,
  });

  useEffect(() => {
    let animationFrameId: number;

    const updateOrb = () => {
      if (!journeyArenaRef.current) return;
      const arenaRect = journeyArenaRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Target eye-level Y on viewport (centered vertically)
      const targetEyeY = windowHeight * 0.45;

      // Calculate progress through the journey arena
      const totalScrollDistance = arenaRect.height - 180;
      const currentScrollDistance = targetEyeY - arenaRect.top;
      const rawProgress = Math.min(
        Math.max(currentScrollDistance / Math.max(totalScrollDistance, 1), 0),
        1
      );
      setScrollProgress(rawProgress);

      const arenaWidth = arenaRect.width;

      // Calculate the exact center of the opposite column (so it NEVER overlaps text)
      const columnCenterOffset = Math.min(Math.max(arenaWidth * 0.25, 120), 280);

      // Smooth cosine zigzag:
      // at progress = 0: cos(0) = +1 -> Center of Right Column
      // at progress = 0.33: cos(pi) = -1 -> Center of Left Column
      // at progress = 0.66: cos(2pi) = +1 -> Center of Right Column
      // at progress = 1.0: cos(3pi) = -1 -> Center of Left Column
      const currentXOffset = Math.cos(rawProgress * Math.PI * 3) * columnCenterOffset;

      // Arena horizontal center in viewport coordinates
      const arenaCenterViewportX = arenaRect.left + arenaWidth / 2;

      // Determine positioning mode
      if (arenaRect.top > targetEyeY) {
        // User is above arena -> dock neatly at top of right column
        setOrbPosition({
          mode: 'top',
          fixedLeft: arenaCenterViewportX + columnCenterOffset,
          fixedTop: targetEyeY,
          absTop: 40,
          absLeftPct: 75,
        });
      } else if (arenaRect.bottom < targetEyeY + 100) {
        // User has scrolled below arena -> dock neatly at bottom of left column
        setOrbPosition({
          mode: 'bottom',
          fixedLeft: arenaCenterViewportX - columnCenterOffset,
          fixedTop: targetEyeY,
          absTop: arenaRect.height - 140,
          absLeftPct: 25,
        });
      } else {
        // Active fixed traveling orb
        setOrbPosition({
          mode: 'fixed',
          fixedLeft: arenaCenterViewportX + currentXOffset,
          fixedTop: targetEyeY,
          absTop: 0,
          absLeftPct: 50,
        });
      }
    };

    const onScrollOrResize = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(updateOrb);
    };

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    updateOrb();

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Compute active stage (0 to 3)
  const activeStage = Math.min(
    Math.floor(scrollProgress * stages.length),
    stages.length - 1
  );
  const currentStageData = stages[activeStage] || stages[0];
  const CurrentIcon = currentStageData.icon;

  const rotationAngle = scrollProgress * 540;
  const progressPercent = Math.round(scrollProgress * 100);

  return (
    <section
      id="how-it-works"
      ref={containerRef}
      className="relative px-6 sm:px-12 md:px-16 py-16 sm:py-20 bg-gradient-to-b from-transparent via-white/20 to-transparent"
    >
      {/* ── Seamless Energy Handover Receiver Node from Hero Bottom Notch ── */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center">
        <div className="w-3.5 h-3.5 rounded-full bg-[#111312] border-2 border-[#14F1D9] shadow-[0_0_14px_rgba(20,241,217,0.75)] flex items-center justify-center">
          <div className="w-1 h-1 rounded-full bg-[#14F1D9] animate-ping" />
        </div>
        <div className="w-px h-8 bg-gradient-to-b from-[#14F1D9] to-black/20" />
      </div>

      <div className="max-w-6xl mx-auto">

        {/* ── Section Header ── */}
        <div className="max-w-3xl space-y-3 mb-14 sm:mb-18">
          <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-black/60 font-bold">
            <Sparkles className="w-3.5 h-3.5 text-black" />
            <span>How EVverse Works & How It Helps Us All</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-normal tracking-tight text-[#111312] leading-[1.12]">
            Clean energy should be effortless, reliable, and shared by everyone.
          </h2>
          <p className="text-sm sm:text-base text-black/65 font-light leading-relaxed pt-1">
            Here is how EVverse transforms public charging from a guessing game into a reliable community utility that protects our electrical grid and powers our local economy.
          </p>
        </div>

        {/* ── Interactive Zigzag Journey Arena ── */}
        <div ref={journeyArenaRef} className="relative">

          {/* ── ABSTRACT UNDULATING PATH GUIDE ── */}
          <div className="absolute inset-0 pointer-events-none hidden md:flex items-center justify-center overflow-hidden opacity-25">
            <svg
              className="w-full h-full"
              viewBox="0 0 800 1200"
              preserveAspectRatio="none"
              fill="none"
            >
              <defs>
                <linearGradient id="energySpline" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#14F1D9" stopOpacity="0.85" />
                  <stop offset="25%" stopColor="#111312" stopOpacity="0.6" />
                  <stop offset="75%" stopColor="#111312" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#14F1D9" stopOpacity="0.45" />
                </linearGradient>
              </defs>
              <path
                d="M 400 -60 C 400 40, 600 50, 600 120 C 600 300, 200 320, 200 480 C 200 660, 600 680, 600 840 C 600 1020, 200 1040, 200 1150"
                stroke="url(#energySpline)"
                strokeWidth="1.5"
                strokeDasharray="4 8"
              />
            </svg>
          </div>

          {/* ── THE SINGLE COMPACT INTERACTIVE TRAVELING ZONE BEACON (Desktop Only) ── */}
          <div
            className={`hidden md:block z-20 pointer-events-none transition-opacity duration-300 ${
              orbPosition.mode === 'fixed'
                ? 'fixed'
                : 'absolute'
            }`}
            style={
              orbPosition.mode === 'fixed'
                ? {
                    left: `${orbPosition.fixedLeft}px`,
                    top: `${orbPosition.fixedTop}px`,
                    transform: 'translate(-50%, -50%)',
                  }
                : {
                    top: `${orbPosition.absTop}px`,
                    left: `${orbPosition.absLeftPct}%`,
                    transform: 'translate(-50%, -50%)',
                  }
            }
          >
            <div className="relative w-48 h-48 lg:w-52 lg:h-52 flex items-center justify-center select-none pointer-events-auto">
              
              {/* Soft Ambient Glow */}
              <div
                className="absolute inset-0 rounded-full transition-all duration-500 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at center, rgba(20,241,217,0.3) 0%, rgba(17,19,18,0.04) 60%, transparent 80%)',
                }}
              />

              {/* Concentric Rotating Outer Kinetic Orbit */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none transition-transform duration-200 ease-out"
                viewBox="0 0 200 200"
                style={{ transform: `rotate(${rotationAngle}deg)` }}
              >
                <circle
                  cx="100"
                  cy="100"
                  r="88"
                  fill="none"
                  stroke="#111312"
                  strokeWidth="1"
                  strokeDasharray="3 8"
                  strokeOpacity="0.25"
                />
                <circle cx="100" cy="12" r="3.5" fill="#111312" />
                <circle
                  cx="100"
                  cy="12"
                  r="7"
                  fill="none"
                  stroke="#111312"
                  strokeWidth="0.8"
                  strokeOpacity="0.3"
                />
                <circle cx="100" cy="188" r="2.5" fill="#111312" fillOpacity="0.5" />
              </svg>

              {/* Concentric Counter-Rotating Orbit */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none transition-transform duration-300 ease-out"
                viewBox="0 0 200 200"
                style={{ transform: `rotate(${-rotationAngle * 0.75}deg)` }}
              >
                <circle
                  cx="100"
                  cy="100"
                  r="70"
                  fill="none"
                  stroke="#111312"
                  strokeWidth="1"
                  strokeDasharray="2 10"
                  strokeOpacity="0.3"
                />
                <circle cx="170" cy="100" r="3" fill="#111312" />
              </svg>

              {/* Progress Arc Ring */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none -rotate-90" viewBox="0 0 200 200">
                <circle
                  cx="100"
                  cy="100"
                  r="78"
                  fill="none"
                  stroke="#111312"
                  strokeWidth="2"
                  strokeOpacity="0.08"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="78"
                  fill="none"
                  stroke="#111312"
                  strokeWidth="2"
                  strokeDasharray={2 * Math.PI * 78}
                  strokeDashoffset={2 * Math.PI * 78 * (1 - scrollProgress)}
                  strokeLinecap="round"
                  className="transition-all duration-150 ease-out"
                />
              </svg>

              {/* Compact Central Telemetry Core */}
              <div className="relative z-10 flex flex-col items-center justify-center text-center p-3 rounded-full bg-white/90 backdrop-blur-md border border-white/95 shadow-[0_15px_35px_rgba(0,0,0,0.08)] w-28 h-28 lg:w-32 lg:h-32 transition-all duration-300">
                <div className="w-6 h-6 rounded-full bg-[#111312] text-[#14F1D9] flex items-center justify-center mb-1 shadow-xs">
                  <CurrentIcon className="w-3 h-3" />
                </div>
                <span className="text-[9px] font-mono uppercase tracking-widest text-black/50 font-bold">
                  {currentStageData.zoneTag}
                </span>
                <span className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-[#111312] leading-none my-0.5">
                  {currentStageData.number}
                </span>
                <span className="text-[8px] font-mono uppercase tracking-wider text-black/70 font-semibold px-2 py-0.5 rounded-full bg-black/[0.04]">
                  {currentStageData.zoneSub}
                </span>
                <span className="text-[7.5px] font-mono text-black/40 mt-0.5">
                  {progressPercent}% SYNCED
                </span>
              </div>

            </div>
          </div>

          {/* ── FOUR ALTERNATING STAGES ── */}
          <div className="space-y-20 sm:space-y-28 pt-2 pb-10">
            {stages.map((stage, index) => {
              const isEven = index % 2 === 0;
              const isStageActive = activeStage === index;
              const Icon = stage.icon;

              return (
                <div
                  key={stage.number}
                  className={`grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-16 items-center transition-opacity duration-400 ${
                    isStageActive ? 'opacity-100' : 'opacity-40 hover:opacity-75'
                  }`}
                >
                  {/* TEXT CONTENT: Left for Even, Right for Odd */}
                  <div
                    className={`space-y-4 max-w-lg ${
                      isEven ? 'md:col-start-1 md:col-end-2 md:pr-4' : 'md:col-start-2 md:col-end-3 md:pl-4'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl sm:text-4xl font-mono font-light tracking-tighter text-[#111312]">
                        {stage.number}
                      </span>
                      <div className="h-5 w-px bg-black/15" />
                      <span className="text-[10.5px] font-mono uppercase tracking-widest font-bold text-black/70">
                        {stage.badge}
                      </span>
                    </div>

                    <h3 className="text-xl sm:text-2xl lg:text-3xl font-normal tracking-tight text-[#111312] leading-snug">
                      {stage.title}
                    </h3>

                    <div className="space-y-1">
                      <span className="text-[9.5px] font-mono uppercase tracking-widest text-black/45 font-bold block">
                        How EVverse Works
                      </span>
                      <p className="text-xs sm:text-sm text-black/75 leading-relaxed font-light">
                        {stage.howItWorks}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9.5px] font-mono uppercase tracking-widest text-[#0D9488] font-bold block">
                        Benefit to the Entire Community
                      </span>
                      <p className="text-xs sm:text-sm text-[#111312] leading-relaxed font-normal">
                        {stage.communityBenefit}
                      </p>
                    </div>

                    <div className="pt-1 flex items-center gap-2 text-xs font-semibold text-black/85">
                      <ArrowRight className="w-3.5 h-3.5 text-black shrink-0" />
                      <span>{stage.impactMetric}</span>
                    </div>

                    <div className="flex md:hidden items-center gap-2 pt-2">
                      <div className="w-6 h-6 rounded-full bg-[#111312] text-[#14F1D9] flex items-center justify-center">
                        <Icon className="w-3 h-3" />
                      </div>
                      <span className="text-[10px] font-mono font-semibold text-black/60 uppercase">
                        {stage.zoneTag} • {stage.zoneSub}
                      </span>
                    </div>

                  </div>

                  {/* Reserved space for traveling orb on desktop */}
                  <div
                    className={`hidden md:block min-h-[160px] ${
                      isEven ? 'md:col-start-2 md:col-end-3' : 'md:col-start-1 md:col-end-2'
                    }`}
                    aria-hidden="true"
                  />
                </div>
              );
            })}
          </div>

        </div>

      </div>
    </section>
  );
}

