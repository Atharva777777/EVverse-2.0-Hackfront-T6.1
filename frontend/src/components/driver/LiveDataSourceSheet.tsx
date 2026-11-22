"use client";

import React, { useEffect } from "react";
import { X, RefreshCw, Radio } from "lucide-react";
import type { SourceStatus } from "@/types/api";

interface LiveDataSourceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCity: string;
  isLive: boolean;
  source: string;
  stationCount: number;
  lastUpdatedTime?: string | null;
  loading: boolean;
  fallbackReason?: string | null;
  sources?: Record<string, SourceStatus>;
  onRefresh: () => void;
}

export function LiveDataSourceSheet({
  isOpen,
  onClose,
  selectedCity,
  isLive,
  source,
  stationCount,
  lastUpdatedTime,
  loading,
  sources,
  onRefresh,
}: LiveDataSourceSheetProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scrolling when open on mobile
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

  // Format timestamp helper
  const formatIso = (isoStr?: string | null): string | null => {
    if (!isoStr) return null;
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return null;
    }
  };

  // Source-specific telemetry
  const ocm = sources?.open_charge_map;
  const bee = sources?.bee;
  const osm = sources?.osm;
  const kaggle = sources?.kaggle_baseline;

  const isKaggleActive = kaggle ? kaggle.status === "active_fallback" : source === "kaggle_baseline";
  const ocmConnected = ocm ? ocm.status === "connected" && ocm.station_count > 0 : isLive;
  const beeConnected = bee ? bee.status === "connected" && bee.station_count > 0 : false;
  const osmLoaded = osm ? osm.status === "loaded" && osm.station_count > 0 : false;

  const ocmTimestamp = ocm ? formatIso(ocm.last_updated) : (isLive && lastUpdatedTime !== "Just now" ? lastUpdatedTime : null);
  const beeTimestamp = bee ? formatIso(bee.last_updated) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-data-popover-title"
      className="absolute inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in-50 duration-150"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl border border-black/[0.08] shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-black/[0.06] flex items-center justify-between bg-[#FAF9F6]">
          <div className="flex items-center gap-2">
            <Radio size={14} className={isLive ? "text-[#16A34A]" : "text-[#D97706]"} />
            <div>
              <h2 id="live-data-popover-title" className="text-xs font-bold text-[#111312] leading-tight">
                Live Data Sources
              </h2>
              <div className="text-[10px] font-mono text-[#767D78]">
                Grid: <span className="text-[#111312] font-semibold">{selectedCity}</span>
                {stationCount > 0 && (
                  <span className="text-[#16A34A] font-medium ml-1.5">• {stationCount} stations</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              title="Refresh live data"
              aria-label="Refresh live data"
              className="w-7 h-7 rounded-lg bg-white border border-black/[0.08] flex items-center justify-center text-[#525854] hover:text-[#111312] hover:bg-[#F2EFE9] transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? "animate-spin text-[#16A34A]" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close panel"
              aria-label="Close panel"
              className="w-7 h-7 rounded-lg bg-white border border-black/[0.08] flex items-center justify-center text-[#525854] hover:text-[#111312] hover:bg-[#F2EFE9] transition-all cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* 4 Compact Source Rows */}
        <div className="p-3 divide-y divide-black/[0.05] text-xs">
          {/* Row 1: Open Charge Map */}
          <div className="py-2.5 first:pt-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#111312]">Open Charge Map</span>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    ocmConnected ? "bg-[#16A34A] animate-pulse" : "bg-[#A3A3A3]"
                  }`}
                />
                <span className={ocmConnected ? "text-[#16A34A] font-semibold" : "text-[#767D78]"}>
                  {ocmConnected
                    ? `Connected (${ocm ? ocm.station_count : stationCount} stations)`
                    : "Offline"}
                </span>
              </div>
            </div>
            {ocmTimestamp && (
              <div className="text-[10px] font-mono text-[#767D78] mt-0.5">
                Last updated: {ocmTimestamp}
              </div>
            )}
          </div>

          {/* Row 2: BEE */}
          <div className="py-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#111312]">BEE</span>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    beeConnected ? "bg-[#16A34A] animate-pulse" : bee?.status === "error" ? "bg-[#D97706]" : "bg-[#2563EB]"
                  }`}
                />
                <span
                  className={
                    beeConnected
                      ? "text-[#16A34A] font-semibold"
                      : bee?.status === "error"
                      ? "text-[#D97706]"
                      : "text-[#2563EB]"
                  }
                >
                  {beeConnected
                    ? `Connected (${bee?.station_count ?? 0} stations)`
                    : bee?.status === "error"
                    ? "Unavailable"
                    : "Verified API (Standby)"}
                </span>
              </div>
            </div>
            {beeTimestamp && (
              <div className="text-[10px] font-mono text-[#767D78] mt-0.5">
                Last updated: {beeTimestamp}
              </div>
            )}
          </div>

          {/* Row 3: OpenStreetMap */}
          <div className="py-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#111312]">OpenStreetMap</span>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    osmLoaded ? "bg-[#16A34A]" : "bg-[#7C3AED]"
                  }`}
                />
                <span className={osmLoaded ? "text-[#16A34A] font-semibold" : "text-[#7C3AED]"}>
                  {osmLoaded
                    ? `Loaded (${osm?.station_count ?? 0} stations)`
                    : "Local dataset (Standby)"}
                </span>
              </div>
            </div>
          </div>

          {/* Row 4: Kaggle Baseline */}
          <div className="py-2.5 last:pb-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#111312]">Kaggle Baseline</span>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isKaggleActive ? "bg-[#D97706]" : "bg-[#A3A3A3]"
                  }`}
                />
                <span className={isKaggleActive ? "text-[#D97706] font-semibold" : "text-[#767D78]"}>
                  {isKaggleActive ? "Active fallback • Static & unverified" : "Standby • Static baseline"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer / Transparency Note */}
        <div className="px-4 py-2.5 bg-[#FAF9F6] border-t border-black/[0.05] text-[10px] font-mono text-[#767D78] leading-tight">
          Station inventory reflects registered locations, not real-time socket availability.
        </div>
      </div>
    </div>
  );
}
