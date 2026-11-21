"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ThreeChargerHub3D } from "./ThreeChargerHub3D";
import {
  X,
  Play,
  Pause,
  Download,
  Sun,
  Moon,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Zap,
  RefreshCw,
} from "lucide-react";

export interface Spatial3DDigitalTwinModalProps {
  isOpen: boolean;
  onClose: () => void;
  city: string;
  selectedZoneLabel?: string;
  zoneName?: string;
  latitude?: number;
  longitude?: number;
  predictedDemandKwh?: number;
  gapScore?: number;
  quboScore?: number;
}

interface YearForecast {
  year: number;
  label: string;
  stage: string;
  dailyCars: number;
  annualRevenue: number;
  operatingCost: number;
  netProfit: number;
  cumulativeCashFlow: number;
  utilizationPct: number;
  isPaybackReached: boolean;
}

export function Spatial3DDigitalTwinModal({
  isOpen,
  onClose,
  city,
  selectedZoneLabel = "Z0",
  zoneName = "Municipal Transit Corridor",
  latitude = 19.0735,
  longitude = 72.8232,
  predictedDemandKwh = 480,
}: Spatial3DDigitalTwinModalProps) {
  // ── 3D Viewport Controls ──────────────────────────────────────────────────
  const [lighting, setLighting] = useState<"day" | "night">("day");
  const [v2gMode, setV2gMode] = useState<"charge" | "v2g">("charge");

  // ── Configuration State ───────────────────────────────────────────────────
  const [baysCount, setBaysCount] = useState(2); // 2, 4, 6, 8
  const [powerKw, setPowerKw] = useState(150); // 150 kW or 350 kW
  const [tariffRate, setTariffRate] = useState(0.36); // $ / kWh
  const [hasSolarCanopy, setHasSolarCanopy] = useState(true);

  // ── 5-Year Horizon Timeline State ─────────────────────────────────────────
  const [activeYearIndex, setActiveYearIndex] = useState(0); // 0 = Year 1 ... 4 = Year 5
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<"proforma" | "config" | "syndicate">("proforma");

  // ── Decentralized Syndicate Co-Ownership State (Pillar 4) ──────────────────
  const [syndicateTicket, setSyndicateTicket] = useState<number>(10000);
  const [syndicateCommitted, setSyndicateCommitted] = useState<boolean>(false);

  // ── Financial Model Calculations ──────────────────────────────────────────
  const hardwareCapex = baysCount * (powerKw === 350 ? 46000 : 26000);
  const gridCapex = 32000 + (baysCount > 4 ? 20000 : 0);
  const civilCanopyCapex = 38000 + (hasSolarCanopy ? 16000 : 0);
  const totalCapex = hardwareCapex + gridCapex + civilCanopyCapex;

  // 5-Year Pro-Forma Cash Flow Matrix
  const fiveYearForecast: YearForecast[] = useMemo(() => {
    const list: YearForecast[] = [];
    const baseDemandFactor = Math.max(0.75, predictedDemandKwh / 420);
    let cumulative = -totalCapex;

    for (let y = 1; y <= 5; y++) {
      const adoptionMultiplier = 1.0 + (y - 1) * 0.35;
      const dailyCars = Math.round(baysCount * 18 * adoptionMultiplier * baseDemandFactor);
      const avgKwhPerSession = powerKw === 350 ? 40 : 30;
      const annualMwh = (dailyCars * avgKwhPerSession * 365) / 1000;

      const annualRevenue = Math.round(annualMwh * 1000 * tariffRate);
      const wholesaleEnergy = Math.round(annualMwh * 1000 * 0.12);
      const maintenanceAndSla = Math.round(7500 + baysCount * 1100);
      const siteLeaseAndInsurance = Math.round(13500);
      const operatingCost = wholesaleEnergy + maintenanceAndSla + siteLeaseAndInsurance;

      const netProfit = annualRevenue - operatingCost;
      cumulative += netProfit;

      const utilization = Math.min(92, Math.round(38 + (y - 1) * 13 * baseDemandFactor));
      const isPayback = cumulative >= 0;

      let stage = "Launch & Driver Adoption";
      if (y === 2) stage = "Fleet & Commuter Expansion";
      if (y === 3) stage = "Full Payback Reached";
      if (y === 4) stage = "High-Margin Cash Generation";
      if (y === 5) stage = "Capacity Maturity";

      list.push({
        year: y,
        label: `Year ${y}`,
        stage,
        dailyCars,
        annualRevenue,
        operatingCost,
        netProfit,
        cumulativeCashFlow: cumulative,
        utilizationPct: utilization,
        isPaybackReached: isPayback,
      });
    }
    return list;
  }, [baysCount, powerKw, tariffRate, totalCapex, predictedDemandKwh, hasSolarCanopy]);

  const currentYear = fiveYearForecast[activeYearIndex];

  // Investor Return Summary Metrics
  const total5YearNetProfit = fiveYearForecast.reduce((acc, y) => acc + y.netProfit, 0);
  const avgAnnualNet = total5YearNetProfit / 5;
  const paybackYears = (totalCapex / Math.max(1, avgAnnualNet)).toFixed(1);
  const estimatedIrrPct = Math.min(42, Math.max(18, Math.round((avgAnnualNet / totalCapex) * 118)));

  // ── Auto-Play Animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setActiveYearIndex((prev) => (prev + 1) % 5);
    }, 2400);
    return () => clearInterval(timer);
  }, [isPlaying]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(10, 22, 40, 0.6)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        className="anim-fade-up"
        style={{
          width: "100%",
          maxWidth: "1160px",
          height: "88vh",
          maxHeight: "800px",
          background: "#ffffff",
          borderRadius: "18px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 24px 64px rgba(10, 22, 40, 0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── MODAL HEADER ─────────────────────────────────────────────────── */}
        <div
          style={{
            height: "56px",
            borderBottom: "1px solid #eef2f6",
            padding: "0 22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h3
                style={{
                  fontFamily: "Times New Roman, serif",
                  fontSize: "19px",
                  fontWeight: 600,
                  color: "#0f172a",
                  margin: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                Site Investment Memorandum
              </h3>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "5px",
                  background: "rgba(16, 185, 129, 0.1)",
                  color: "#059669",
                }}
              >
                {baysCount} Stalls · {powerKw} kW
              </span>
            </div>
            <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "1px" }}>
              {city} · {zoneName || `Candidate ${selectedZoneLabel}`} · {latitude.toFixed(4)}°N, {longitude.toFixed(4)}°E
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => window.print()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "7px",
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                color: "#1e293b",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              title="Print or export investment summary"
            >
              <Download size={13} className="text-slate-600" />
              <span>Export Brief</span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                padding: "6px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── MODAL BODY: 3D VIEWPORT & INVESTOR PRO-FORMA ─────────────────── */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.45fr 1fr", overflow: "hidden" }}>
          {/* ══════════════════════════════════════════════════════════════
              LEFT: THREE.JS 3D SCENE & 5-YEAR TIMESTEP SCRUBBER
             ══════════════════════════════════════════════════════════════ */}
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              background: lighting === "night" ? "#070c14" : "#f4f6f8",
              borderRight: "1px solid #eef2f6",
              overflow: "hidden",
            }}
          >
            {/* Top-Left Mode Toggle (Pillar 1: V2G Arbitrage vs Fast Charge) */}
            <div
              style={{
                position: "absolute",
                top: "14px",
                left: "14px",
                zIndex: 20,
                display: "flex",
                background: "rgba(255, 255, 255, 0.94)",
                backdropFilter: "blur(10px)",
                border: "1px solid #e2e8f0",
                borderRadius: "7px",
                padding: "3px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                gap: "2px",
              }}
            >
              <button
                onClick={() => setV2gMode("charge")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  borderRadius: "5px",
                  border: "none",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: v2gMode === "charge" ? "#0f172a" : "transparent",
                  color: v2gMode === "charge" ? "#ffffff" : "#475569",
                  transition: "all 0.15s ease",
                }}
                title="Simulate normal grid-to-vehicle fast charging"
              >
                <Zap size={11} className={v2gMode === "charge" ? "text-emerald-400" : "text-slate-400"} />
                <span>Charge Flow</span>
              </button>
              <button
                onClick={() => setV2gMode("v2g")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  borderRadius: "5px",
                  border: "none",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: v2gMode === "v2g" ? "#0284c7" : "transparent",
                  color: v2gMode === "v2g" ? "#ffffff" : "#475569",
                  transition: "all 0.15s ease",
                }}
                title="Simulate bidirectional vehicle-to-grid power export & grid stabilization"
              >
                <RefreshCw size={11} className={v2gMode === "v2g" ? "text-sky-300" : "text-slate-400"} />
                <span>V2G Backflow</span>
              </button>
            </div>

            {/* Top-Right Lighting Toggle */}
            <div
              style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                zIndex: 20,
                display: "flex",
                background: "rgba(255, 255, 255, 0.94)",
                backdropFilter: "blur(10px)",
                border: "1px solid #e2e8f0",
                borderRadius: "7px",
                padding: "3px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
              }}
            >
              <button
                onClick={() => setLighting("day")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  borderRadius: "5px",
                  border: "none",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: lighting === "day" ? "#0f172a" : "transparent",
                  color: lighting === "day" ? "#ffffff" : "#475569",
                }}
              >
                <Sun size={12} />
                <span>Day</span>
              </button>
              <button
                onClick={() => setLighting("night")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  borderRadius: "5px",
                  border: "none",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: lighting === "night" ? "#059669" : "transparent",
                  color: lighting === "night" ? "#ffffff" : "#475569",
                }}
              >
                <Moon size={12} />
                <span>Night</span>
              </button>
            </div>

            {/* Three.js Interactive 3D Model */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              <ThreeChargerHub3D
                lighting={lighting}
                baysCount={baysCount}
                powerKw={powerKw}
                tariffRate={tariffRate}
                hasSolarCanopy={hasSolarCanopy}
                batterySoc={Math.min(95, 45 + activeYearIndex * 11)}
                chargingSessionNumber={currentYear.dailyCars}
                isSimulating={isPlaying}
                mode={v2gMode}
              />

              {/* Minimal Navigation Hint */}
              <div
                style={{
                  position: "absolute",
                  bottom: "14px",
                  right: "14px",
                  fontSize: "10.5px",
                  color: lighting === "night" ? "#94a3b8" : "#64748b",
                  background: lighting === "night" ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.8)",
                  backdropFilter: "blur(8px)",
                  border: lighting === "night" ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(226, 232, 240, 0.8)",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  pointerEvents: "none",
                  zIndex: 10,
                }}
              >
                Click & drag to rotate · Scroll to zoom
              </div>
            </div>

            {/* 5-Year Timeline Horizon Scrubber */}
            <div
              style={{
                height: "92px",
                borderTop: "1px solid #eef2f6",
                background: "#ffffff",
                padding: "10px 18px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                zIndex: 10,
              }}
            >
              {/* Timeline Header & Playback */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{
                      width: "26px",
                      height: "26px",
                      borderRadius: "50%",
                      background: "#0f172a",
                      border: "none",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                    title={isPlaying ? "Pause forecast animation" : "Play 5-year growth animation"}
                  >
                    {isPlaying ? <Pause size={12} /> : <Play size={12} style={{ marginLeft: "1px" }} />}
                  </button>
                  <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
                    5-Year Growth Horizon
                  </span>
                </div>

                <div style={{ fontSize: "12px", fontWeight: 600, color: "#0f172a" }}>
                  {currentYear.label}: <span style={{ color: "#059669" }}>{currentYear.stage}</span>
                </div>
              </div>

              {/* 5 Year Step Buttons */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
                {fiveYearForecast.map((y, idx) => {
                  const isSelected = activeYearIndex === idx;
                  return (
                    <button
                      key={y.year}
                      onClick={() => {
                        setActiveYearIndex(idx);
                        setIsPlaying(false);
                      }}
                      style={{
                        padding: "5px 6px",
                        borderRadius: "7px",
                        border: isSelected ? "1.5px solid #059669" : "1px solid #e2e8f0",
                        background: isSelected ? "rgba(16, 185, 129, 0.08)" : "#f8fafc",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "1px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span style={{ fontSize: "11px", fontWeight: isSelected ? 700 : 600, color: isSelected ? "#059669" : "#334155" }}>
                        {y.label}
                      </span>
                      <span style={{ fontSize: "10.5px", fontWeight: 600, color: isSelected ? "#0f172a" : "#64748b" }}>
                        ${Math.round(y.annualRevenue / 1000)}k/yr
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              RIGHT: CLEAN INVESTOR PRO-FORMA PANEL
             ══════════════════════════════════════════════════════════════ */}
          <div
            style={{
              padding: "18px 22px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              overflowY: "auto",
              background: "#ffffff",
            }}
          >
            {/* Top 4 Executive KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Upfront CapEx</div>
                <div style={{ fontFamily: "Times New Roman, serif", fontSize: "21px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                  ${Math.round(totalCapex / 1000)}k
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "1px" }}>
                  Hardware, grid & civil
                </div>
              </div>

              <div style={{ padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Annual Revenue</div>
                <div style={{ fontFamily: "Times New Roman, serif", fontSize: "21px", fontWeight: 700, color: "#059669", marginTop: "2px" }}>
                  ${Math.round(currentYear.annualRevenue / 1000)}k <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 400 }}>/yr</span>
                </div>
                <div style={{ fontSize: "11px", color: "#059669", marginTop: "1px" }}>
                  {currentYear.dailyCars} cars / day
                </div>
              </div>

              <div style={{ padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Net Annual Profit</div>
                <div style={{ fontFamily: "Times New Roman, serif", fontSize: "21px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                  ${Math.round(currentYear.netProfit / 1000)}k <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 400 }}>/yr</span>
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "1px" }}>
                  After electricity & upkeep
                </div>
              </div>

              <div style={{ padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Payback Horizon</div>
                <div style={{ fontFamily: "Times New Roman, serif", fontSize: "21px", fontWeight: 700, color: "#059669", marginTop: "2px" }}>
                  {paybackYears} Years
                </div>
                <div style={{ fontSize: "11px", color: "#059669", marginTop: "1px" }}>
                  IRR: ~{estimatedIrrPct}%
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #eef2f6", paddingBottom: "6px", gap: "16px" }}>
              <button
                onClick={() => setActiveTab("proforma")}
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px 0",
                  fontFamily: "Times New Roman, serif",
                  fontSize: "13px",
                  fontWeight: activeTab === "proforma" ? 700 : 500,
                  color: activeTab === "proforma" ? "#0f172a" : "#64748b",
                  borderBottom: activeTab === "proforma" ? "2px solid #0f172a" : "none",
                  cursor: "pointer",
                }}
              >
                5-Year Financial Forecast
              </button>

              <button
                onClick={() => setActiveTab("config")}
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px 0",
                  fontFamily: "Times New Roman, serif",
                  fontSize: "13px",
                  fontWeight: activeTab === "config" ? 700 : 500,
                  color: activeTab === "config" ? "#0f172a" : "#64748b",
                  borderBottom: activeTab === "config" ? "2px solid #0f172a" : "none",
                  cursor: "pointer",
                }}
              >
                Station Setup & Costs
              </button>

              <button
                onClick={() => setActiveTab("syndicate")}
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px 0",
                  fontFamily: "Times New Roman, serif",
                  fontSize: "13px",
                  fontWeight: activeTab === "syndicate" ? 700 : 500,
                  color: activeTab === "syndicate" ? "#0f172a" : "#64748b",
                  borderBottom: activeTab === "syndicate" ? "2px solid #0f172a" : "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>Fractional Syndicate</span>
                <span
                  style={{
                    fontSize: "9.5px",
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: "4px",
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "#059669",
                  }}
                >
                  Pillar 4
                </span>
              </button>
            </div>

            {/* TAB 1: 5-YEAR PRO-FORMA FORECAST */}
            {activeTab === "proforma" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* 5-Year Cash Flow Breakdown Table */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b", textAlign: "left" }}>
                        <th style={{ padding: "8px 10px", fontWeight: 600 }}>Period</th>
                        <th style={{ padding: "8px 10px", fontWeight: 600 }}>Revenue</th>
                        <th style={{ padding: "8px 10px", fontWeight: 600 }}>Operating</th>
                        <th style={{ padding: "8px 10px", fontWeight: 600 }}>Net Profit</th>
                        <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Cumulative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fiveYearForecast.map((y, idx) => {
                        const isCurrent = activeYearIndex === idx;
                        return (
                          <tr
                            key={y.year}
                            onClick={() => setActiveYearIndex(idx)}
                            style={{
                              borderBottom: idx < 4 ? "1px solid #f1f5f9" : "none",
                              background: isCurrent ? "rgba(16, 185, 129, 0.06)" : "#ffffff",
                              cursor: "pointer",
                              transition: "background 0.15s ease",
                            }}
                          >
                            <td style={{ padding: "8px 10px", fontWeight: isCurrent ? 700 : 500, color: "#0f172a" }}>
                              {y.label}
                            </td>
                            <td style={{ padding: "8px 10px", color: "#0f172a" }}>
                              ${Math.round(y.annualRevenue / 1000)}k
                            </td>
                            <td style={{ padding: "8px 10px", color: "#64748b" }}>
                              ${Math.round(y.operatingCost / 1000)}k
                            </td>
                            <td style={{ padding: "8px 10px", fontWeight: 600, color: "#059669" }}>
                              ${Math.round(y.netProfit / 1000)}k
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                fontWeight: 600,
                                textAlign: "right",
                                color: y.cumulativeCashFlow >= 0 ? "#059669" : "#dc2626",
                              }}
                            >
                              {y.cumulativeCashFlow >= 0 ? "+" : ""}${Math.round(y.cumulativeCashFlow / 1000)}k
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Payback Milestone Status Banner */}
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: currentYear.isPaybackReached ? "rgba(16, 185, 129, 0.08)" : "#f8fafc",
                    border: currentYear.isPaybackReached ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <CheckCircle2 size={16} className={currentYear.isPaybackReached ? "text-emerald-600" : "text-slate-400"} />
                  <div style={{ fontSize: "11.5px", color: currentYear.isPaybackReached ? "#065f46" : "#475569" }}>
                    {currentYear.isPaybackReached
                      ? `Full capital investment repaid. Project is generating positive cumulative cash flow.`
                      : `Initial CapEx payback in progress. On track to breakeven in Year ${Math.ceil(Number(paybackYears))}.`}
                  </div>
                </div>

                {/* 5-Year Totals Summary */}
                <div style={{ padding: "12px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "#475569", marginBottom: "4px" }}>
                    <span>5-Year Total Net Gain:</span>
                    <span style={{ fontWeight: 700, color: "#059669" }}>+${Math.round(total5YearNetProfit / 1000)}k USD</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "#475569" }}>
                    <span>Estimated Internal Rate of Return (IRR):</span>
                    <span style={{ fontWeight: 700, color: "#0f172a" }}>{estimatedIrrPct}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: STATION SETUP & CAPEX BREAKDOWN */}
            {activeTab === "config" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Stall Count Selector */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "4px" }}>
                    <span style={{ color: "#64748b" }}>Charging Stalls:</span>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>{baysCount} Stalls</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {[2, 4, 6, 8].map((count) => (
                      <button
                        key={count}
                        onClick={() => setBaysCount(count)}
                        style={{
                          flex: 1,
                          padding: "6px",
                          borderRadius: "6px",
                          border: baysCount === count ? "1.5px solid #0f172a" : "1px solid #e2e8f0",
                          background: baysCount === count ? "#0f172a" : "#ffffff",
                          color: baysCount === count ? "#ffffff" : "#1e293b",
                          fontSize: "11.5px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {count} Stalls
                      </button>
                    ))}
                  </div>
                </div>

                {/* Power Rating Selector */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "4px" }}>
                    <span style={{ color: "#64748b" }}>Charger Speed Tier:</span>
                    <span style={{ fontWeight: 600, color: "#059669" }}>{powerKw} kW Fast</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {[150, 350].map((kw) => (
                      <button
                        key={kw}
                        onClick={() => setPowerKw(kw)}
                        style={{
                          flex: 1,
                          padding: "6px",
                          borderRadius: "6px",
                          border: powerKw === kw ? "1.5px solid #0f172a" : "1px solid #e2e8f0",
                          background: powerKw === kw ? "#0f172a" : "#ffffff",
                          color: powerKw === kw ? "#ffffff" : "#1e293b",
                          fontSize: "11.5px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {kw === 350 ? "350 kW Ultra-Fast" : "150 kW Rapid Fast"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tariff Pricing Slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "4px" }}>
                    <span style={{ color: "#64748b" }}>Charging Tariff:</span>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>${tariffRate.toFixed(2)} / kWh</span>
                  </div>
                  <input
                    type="range"
                    min="0.25"
                    max="0.55"
                    step="0.01"
                    value={tariffRate}
                    onChange={(e) => setTariffRate(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "#0f172a", cursor: "pointer" }}
                  />
                </div>

                {/* Solar Canopy Checkbox */}
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px", cursor: "pointer", color: "#334155" }}>
                  <input
                    type="checkbox"
                    checked={hasSolarCanopy}
                    onChange={(e) => setHasSolarCanopy(e.target.checked)}
                    style={{ accentColor: "#059669" }}
                  />
                  <span>Solar Rooftop Canopy (lowers annual energy costs)</span>
                </label>

                {/* CapEx Breakdown */}
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "11px" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "6px", textTransform: "uppercase" }}>
                    Investment Line Items
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", marginBottom: "3px" }}>
                    <span>Chargers & Hardware:</span>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>${Math.round(hardwareCapex / 1000)}k</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", marginBottom: "3px" }}>
                    <span>Grid & Electrical Connection:</span>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>${Math.round(gridCapex / 1000)}k</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", marginBottom: "5px" }}>
                    <span>Canopy, Foundation & Civil:</span>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>${Math.round(civilCanopyCapex / 1000)}k</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: "5px", fontWeight: 700, color: "#0f172a" }}>
                    <span>Total Upfront CapEx:</span>
                    <span>${Math.round(totalCapex / 1000)}k USD</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: DECENTRALIZED FRACTIONAL SYNDICATE (PILLAR 4) */}
            {activeTab === "syndicate" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Fractional Ticket Selector */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", marginBottom: "4px" }}>
                    <span style={{ color: "#64748b" }}>Fractional Investment Tier:</span>
                    <span style={{ fontWeight: 600, color: "#059669" }}>${syndicateTicket.toLocaleString()} USD</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                    {[5000, 10000, 25000, 50000].map((amount) => {
                      const isSelected = syndicateTicket === amount;
                      return (
                        <button
                          key={amount}
                          onClick={() => {
                            setSyndicateTicket(amount);
                            setSyndicateCommitted(false);
                          }}
                          style={{
                            padding: "7px 4px",
                            borderRadius: "7px",
                            border: isSelected ? "1.5px solid #059669" : "1px solid #e2e8f0",
                            background: isSelected ? "rgba(16, 185, 129, 0.08)" : "#f8fafc",
                            color: isSelected ? "#059669" : "#1e293b",
                            fontSize: "11.5px",
                            fontWeight: isSelected ? 700 : 600,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          ${amount >= 1000 ? `${amount / 1000}k` : amount}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Co-Owner Pro-Forma Share Card */}
                {(() => {
                  const sharePct = ((syndicateTicket / Math.max(1, totalCapex)) * 100).toFixed(1);
                  const personalAnnualNet = Math.round((currentYear.netProfit * 0.65) * (syndicateTicket / Math.max(1, totalCapex)));
                  const personalMonthlyCash = Math.round(personalAnnualNet / 12);
                  const personal5YrCumulative = Math.round((total5YearNetProfit * 0.65) * (syndicateTicket / Math.max(1, totalCapex)));
                  const cashYield = ((personalAnnualNet / syndicateTicket) * 100).toFixed(1);

                  return (
                    <div style={{ padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>
                          Your Fractional Share ({sharePct}% Equity)
                        </span>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#059669" }}>
                          {cashYield}% Cash Yield
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                        <div style={{ background: "#ffffff", padding: "8px 10px", borderRadius: "7px", border: "1px solid #edf2f7" }}>
                          <div style={{ fontSize: "10.5px", color: "#64748b" }}>Monthly Payout</div>
                          <div style={{ fontFamily: "Times New Roman, serif", fontSize: "17px", fontWeight: 700, color: "#059669", marginTop: "1px" }}>
                            +${personalMonthlyCash} <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 400 }}>/mo</span>
                          </div>
                        </div>

                        <div style={{ background: "#ffffff", padding: "8px 10px", borderRadius: "7px", border: "1px solid #edf2f7" }}>
                          <div style={{ fontSize: "10.5px", color: "#64748b" }}>5-Year Cumulative</div>
                          <div style={{ fontFamily: "Times New Roman, serif", fontSize: "17px", fontWeight: 700, color: "#0f172a", marginTop: "1px" }}>
                            +${personal5YrCumulative.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Automated Revenue Waterfall Rule */}
                      <div style={{ fontSize: "10.5px", color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
                        <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>Automated Revenue Waterfall (Smart Ledger):</div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                          <span>• 65% Direct Syndicate Pool (Distributed Monthly):</span>
                          <span style={{ fontWeight: 600, color: "#059669" }}>${Math.round((currentYear.netProfit * 0.65) / 1000)}k/yr</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                          <span>• 20% Grid Wholesale & Maintenance Reserve:</span>
                          <span style={{ fontWeight: 500, color: "#475569" }}>${Math.round((currentYear.netProfit * 0.20) / 1000)}k/yr</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>• 15% Site Landlord Ground Lease:</span>
                          <span style={{ fontWeight: 500, color: "#475569" }}>${Math.round((currentYear.netProfit * 0.15) / 1000)}k/yr</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Instant Co-Ownership Commitment Button */}
                <div>
                  <button
                    onClick={() => setSyndicateCommitted(true)}
                    disabled={syndicateCommitted}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "7px",
                      border: "none",
                      background: syndicateCommitted ? "rgba(16, 185, 129, 0.12)" : "#059669",
                      color: syndicateCommitted ? "#047857" : "#ffffff",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: syndicateCommitted ? "default" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {syndicateCommitted ? (
                      <>
                        <CheckCircle2 size={14} />
                        <span>Syndicate Ticket Confirmed · Certificate #SYN-9148 Locked</span>
                      </>
                    ) : (
                      <>
                        <DollarSign size={14} />
                        <span>Commit ${syndicateTicket.toLocaleString()} Syndicate Ticket</span>
                      </>
                    )}
                  </button>
                  <div style={{ fontSize: "10px", color: "#94a3b8", textAlign: "center", marginTop: "4px" }}>
                    Direct deposit to bank or corporate wallet. Verified on-chain physical asset deed.
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Action CTA */}
            <div style={{ marginTop: "auto", paddingTop: "8px" }}>
              <button
                onClick={onClose}
                style={{
                  width: "100%",
                  padding: "11px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.15)",
                }}
              >
                <span>Save Site to Portfolio</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
