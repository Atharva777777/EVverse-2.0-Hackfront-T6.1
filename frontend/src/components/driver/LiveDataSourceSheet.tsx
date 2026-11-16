"use client";

import React from "react";
import {
  X,
  RefreshCw,
  Database,
  Radio,
  Layers,
  Info,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Globe,
} from "lucide-react";

interface LiveDataSourceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCity: string;
  isLive: boolean;
  source: string;
  stationCount: number;
  lastUpdatedTime: string;
  loading: boolean;
  fallbackReason?: string | null;
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
  fallbackReason,
  onRefresh,
}: LiveDataSourceSheetProps) {
  if (!isOpen) return null;

  const isKaggleActive = source === "kaggle_baseline";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-source-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl border border-black/[0.08] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-black/[0.06] flex items-center justify-between bg-[#FAF9F6]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#111312] text-[#C8F369] flex items-center justify-center shrink-0">
              <Radio size={16} />
            </div>
            <div>
              <h2 id="data-source-title" className="text-sm font-bold text-[#111312]">
                Charging Grid Data Sources
              </h2>
              <div className="text-[10.5px] font-mono text-[#525854]">
                Active Grid: <span className="font-semibold text-[#111312]">{selectedCity}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-black/[0.08] flex items-center justify-center text-[#525854] hover:text-[#111312] hover:bg-[#F2EFE9] transition-all cursor-pointer"
            aria-label="Close data source panel"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable Source Cards */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 divide-y divide-black/[0.05]">
          {/* Source 1: Open Charge Map */}
          <div className="pt-2 first:pt-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Globe size={13} className="text-[#16A34A]" />
                <span className="text-xs font-bold text-[#111312]">Open Charge Map</span>
              </div>
              <span
                className={`text-[9.5px] font-mono font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  isLive
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLive ? "bg-emerald-500 animate-pulse" : "bg-neutral-400"
                  }`}
                />
                {isLive ? "Connected • Live API" : "Standby • Offline Fallback Active"}
              </span>
            </div>

            <p className="text-[11px] text-[#525854] leading-relaxed">
              Global community registry providing verified physical station coordinates, connector
              types, and rated power.
            </p>

            <div className="flex items-center justify-between text-[10px] font-mono text-[#767D78] pt-0.5">
              <span>
                Inventory:{" "}
                <strong className="text-[#111312]">
                  {isLive ? `${stationCount} stations in ${selectedCity}` : "0 (API unreached)"}
                </strong>
              </span>
              <span className="flex items-center gap-1">
                <Clock size={10} />
                <span>{isLive ? lastUpdatedTime : "N/A"}</span>
              </span>
            </div>
            <div className="text-[9px] font-mono text-[#8C938E]">
              Licensing: CC BY 4.0 • Open Charge Map contributors
            </div>
          </div>

          {/* Source 2: Bureau of Energy Efficiency (BEE) */}
          <div className="pt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Database size={13} className="text-[#2563EB]" />
                <span className="text-xs font-bold text-[#111312]">Bureau of Energy Efficiency (BEE)</span>
              </div>
              <span className="text-[9.5px] font-mono font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                Verified API • Pending Integration
              </span>
            </div>

            <p className="text-[11px] text-[#525854] leading-relaxed">
              Official Ministry of Power catalog (29,184 stations / 39,640 chargers). API endpoints
              and Pune queries verified; pending backend multi-source merger.
            </p>

            <div className="text-[9px] font-mono text-[#8C938E] pt-0.5">
              Licensing: Ministry of Power, Govt. of India • REST API via OSC India
            </div>
          </div>

          {/* Source 3: OpenStreetMap (OSM) */}
          <div className="pt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Layers size={13} className="text-[#7C3AED]" />
                <span className="text-xs font-bold text-[#111312]">OpenStreetMap (Local Western Zone)</span>
              </div>
              <span className="text-[9.5px] font-mono font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200">
                Local Dataset • Pending Integration
              </span>
            </div>

            <p className="text-[11px] text-[#525854] leading-relaxed">
              Extracted regional PBF dataset (97 distinct physical stations; 42 in Pune/PCMC).
              Processed with polygon centroid geometries; pending backend multi-source merger.
            </p>

            <div className="text-[9px] font-mono text-[#8C938E] pt-0.5">
              Licensing: ODbL 1.0 • © OpenStreetMap contributors
            </div>
          </div>

          {/* Source 4: Kaggle Baseline */}
          <div className="pt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Info size={13} className={isKaggleActive ? "text-[#D97706]" : "text-[#767D78]"} />
                <span className="text-xs font-bold text-[#111312]">Kaggle Baseline</span>
              </div>
              <span
                className={`text-[9.5px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                  isKaggleActive
                    ? "bg-amber-50 text-amber-900 border border-amber-200 font-bold"
                    : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                }`}
              >
                {isKaggleActive ? "Active Fallback • Static & Unverified" : "Standby • Inactive"}
              </span>
            </div>

            <p className="text-[11px] text-[#525854] leading-relaxed">
              {isKaggleActive
                ? "Serving static, unverified baseline stations because the live API is currently unreached. This data is not verified live telemetry."
                : "Static offline candidate baseline stored on disk as a safety net; currently inactive because live data is reachable."}
            </p>

            {isKaggleActive && fallbackReason && (
              <div className="text-[10px] font-mono text-[#B45309] bg-amber-50/70 p-2 rounded-lg border border-amber-200/60 flex items-start gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>Reason: {fallbackReason}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer: Live Telemetry Caveat & Refresh Button */}
        <div className="shrink-0 p-4 bg-[#FAF9F6] border-t border-black/[0.06] space-y-3">
          {/* Transparency Disclaimer */}
          <div className="text-[10px] font-mono text-[#767D78] bg-white p-2.5 rounded-xl border border-black/[0.06] leading-relaxed flex items-start gap-2">
            <Info size={13} className="text-[#16A34A] shrink-0 mt-0.5" />
            <span>
              <strong>Transparency Note:</strong> Station counts represent mapped and registered
              infrastructure. They do not represent real-time charging socket occupancy or live power availability.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="flex-1 py-2.5 px-3 bg-[#111312] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 hover:bg-[#252826] active:scale-98 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin text-[#C8F369]" : "text-[#C8F369]"} />
              <span>{loading ? "Refreshing Grid..." : "Refresh Live Data"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 bg-white border border-black/[0.08] text-[#111312] text-xs font-semibold rounded-xl hover:bg-[#F2EFE9] active:scale-98 transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
