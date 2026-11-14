"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import {
  Home,
  Navigation,
  Compass,
  Zap,
  User,
  X,
  ChevronRight,
  Shield,
  Car,
} from "lucide-react";
import type { DriverTab } from "./DriverNav";
import type { EVVehicle } from "./VehicleCockpit";

interface DriverDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: DriverTab;
  onSelectTab: (tab: DriverTab) => void;
  activeVehicle?: EVVehicle;
  onOpenGarage?: () => void;
}

export function DriverDrawer({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  activeVehicle,
  onOpenGarage,
}: DriverDrawerProps) {
  // Close drawer on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Guided Driver Navigation Workflow
  const navItems = [
    {
      id: "home" as DriverTab,
      label: "Home",
      subtitle: "Select & configure your EV",
      stepNumber: "01",
      icon: Home,
    },
    {
      id: "journeys" as DriverTab,
      label: "Journeys",
      subtitle: "Verify corridor range & risk",
      stepNumber: "02",
      icon: Navigation,
    },
    {
      id: "explore" as DriverTab, // mapped to Map view
      label: "Map",
      subtitle: "Explore nearby charging hubs",
      stepNumber: "03",
      icon: Compass,
    },
    {
      id: "charging" as DriverTab,
      label: "Charging",
      subtitle: "Live charging & session billing",
      stepNumber: "04",
      icon: Zap,
    },
    {
      id: "profile" as DriverTab,
      label: "Profile",
      subtitle: "Account, preferences & garage",
      stepNumber: "05",
      icon: User,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navigation Menu"
      className="absolute inset-0 z-[100] flex select-none overflow-hidden"
    >
      {/* Dimmed Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
        aria-hidden="true"
      />

      {/* Slide-in Left Drawer Panel (contained strictly within phone container) */}
      <div
        className="relative w-[84%] max-w-[320px] h-full bg-[#FAF9F6] shadow-2xl flex flex-col justify-between z-10 border-r border-black/[0.08] animate-in slide-in-from-left duration-250 ease-out"
      >
        {/* Top Header Row in Drawer */}
        <div className="p-5 border-b border-black/[0.06]">
          <div className="flex items-center justify-between">
            {/* Brand Logo & Companion Title */}
            <div className="flex items-center gap-2.5">
              <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-white border border-black/[0.06] p-0.5 flex items-center justify-center shadow-2xs">
                <Image
                  src="/images/evverse-logo.png"
                  alt="EVverse"
                  width={30}
                  height={30}
                  className="object-contain"
                />
              </div>
              <div>
                <span className="text-xs font-mono uppercase tracking-widest text-[#767D78] font-bold block">
                  EV Companion
                </span>
                <span className="text-sm font-bold text-[#111312] tracking-tight">
                  Driver Cockpit
                </span>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white border border-black/[0.08] flex items-center justify-center text-[#111312] hover:bg-[#F2EFE9] active:scale-95 transition-all shadow-2xs cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
              aria-label="Close navigation menu"
            >
              <X size={16} />
            </button>
          </div>

          {/* Active Vehicle Snippet Card inside Drawer */}
          {activeVehicle && (
            <div className="mt-4 p-2.5 rounded-xl bg-white border border-black/[0.06] shadow-2xs flex items-center justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                  <span className="text-[9.5px] font-mono uppercase text-[#767D78] font-semibold truncate">
                    Active EV
                  </span>
                </div>
                <div className="text-xs font-bold text-[#111312] truncate mt-0.5">
                  {activeVehicle.make} {activeVehicle.model}
                </div>
                <div className="text-[10px] font-mono text-[#525854]">
                  {activeVehicle.currentBatteryPct}% SoC • {activeVehicle.usableKwh} kWh
                </div>
              </div>

              {onOpenGarage && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenGarage();
                  }}
                  className="px-2 py-1 bg-[#F5F4EF] hover:bg-[#EAE8E2] border border-black/[0.06] rounded-lg text-[10px] font-semibold text-[#111312] transition-colors shrink-0 cursor-pointer flex items-center gap-1"
                >
                  <Car size={11} />
                  <span>Switch</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Guided Workflow Navigation List */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1.5 no-scrollbar">
          <div className="px-2 mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#767D78] font-bold">
              Driver Workflow
            </span>
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isCurrent =
              activeTab === item.id ||
              (item.id === "explore" && activeTab === "explore");

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onClose();
                }}
                className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left transition-all duration-150 cursor-pointer group ${
                  isCurrent
                    ? "bg-[#111312] text-white shadow-xs"
                    : "hover:bg-white text-[#111312]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isCurrent
                        ? "bg-white/10 text-[#C8F369]"
                        : "bg-white border border-black/[0.06] text-[#525854] group-hover:text-[#111312]"
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold leading-tight">
                        {item.label}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1 rounded ${
                          isCurrent
                            ? "bg-white/15 text-[#C8F369]"
                            : "text-[#767D78]"
                        }`}
                      >
                        {item.stepNumber}
                      </span>
                    </div>
                    <div
                      className={`text-[10.5px] truncate mt-0.5 ${
                        isCurrent ? "text-white/70" : "text-[#767D78]"
                      }`}
                    >
                      {item.subtitle}
                    </div>
                  </div>
                </div>

                <ChevronRight
                  size={14}
                  className={`shrink-0 transition-transform ${
                    isCurrent
                      ? "text-[#C8F369] translate-x-0.5"
                      : "text-black/20 group-hover:text-black/50"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Drawer Bottom Footer */}
        <div className="p-4 border-t border-black/[0.06] bg-[#FAF9F6]">
          <div className="flex items-center justify-between text-[11px] text-[#767D78] font-mono">
            <span className="flex items-center gap-1">
              <Shield size={11} className="text-[#16A34A]" />
              Verified Automotive Telemetry
            </span>
            <span>v2.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
