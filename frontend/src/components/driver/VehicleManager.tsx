"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import Image from "next/image";
import {
  Search,
  Car,
  Check,
  CheckCircle2,
  ArrowLeft,
  X,
  ChevronRight,
  Shield,
  Zap,
  Sliders,
  Plus,
  Trash2,
  Sparkles,
  Info,
  RotateCcw,
} from "lucide-react";
import type { EVVehicle } from "./VehicleCockpit";
import {
  VERIFIED_OEM_CATALOGUE,
  SUPPORTED_CONNECTOR_STANDARDS,
  validateVehicleInput,
  type ConnectorStandard,
} from "@/lib/vehicleStorage";

interface VehicleManagerProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: EVVehicle[];
  activeVehicleId: string;
  onSelectVehicle: (id: string) => void;
  onAddVehicle?: (vehicle: EVVehicle) => Promise<void> | void;
  onUpdateVehicle?: (vehicle: EVVehicle) => Promise<void> | void;
  onRemoveVehicle?: (id: string) => Promise<void> | void;
}

type WizardStep = 1 | 2 | 3 | 4;

export function VehicleManager({
  isOpen,
  onClose,
  vehicles,
  activeVehicleId,
  onSelectVehicle,
  onAddVehicle,
  onUpdateVehicle,
  onRemoveVehicle,
}: VehicleManagerProps) {
  // Wizard flow: Step 1 (Browse) -> Step 2 (Select/Review) -> Step 3 (Configure) -> Step 4 (Save & Activate)
  const [step, setStep] = useState<WizardStep>(1);

  // Search & Filter state for Step 1
  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [sourceTab, setSourceTab] = useState<"all" | "garage" | "catalogue">("all");

  // Selection state for Steps 2, 3, 4
  const [selectedCatalogueItem, setSelectedCatalogueItem] = useState<
    (typeof VERIFIED_OEM_CATALOGUE)[number] | null
  >(null);
  const [selectedGarageVehicle, setSelectedGarageVehicle] = useState<EVVehicle | null>(null);
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Configuration Form State (Step 3)
  const [configBatteryPct, setConfigBatteryPct] = useState<number>(80);
  const [configNickname, setConfigNickname] = useState<string>("");
  const [configVin, setConfigVin] = useState<string>("");

  // Custom Vehicle Form State (if user defines custom EV from scratch)
  const [customMake, setCustomMake] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customYear, setCustomYear] = useState(2025);
  const [customUsableKwh, setCustomUsableKwh] = useState(60);
  const [customMaxDcKw, setCustomMaxDcKw] = useState(100);
  const [customMaxAcKw, setCustomMaxAcKw] = useState(7.2);
  const [customPlugType, setCustomPlugType] = useState<ConnectorStandard>("CCS2 Combo");
  const [customWltpKm, setCustomWltpKm] = useState(420);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Feedback banner state
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Transition timer reference for safe cleanup
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Active Vehicle in garage
  const activeVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === activeVehicleId) || vehicles[0];
  }, [vehicles, activeVehicleId]);

  // Unique brands present in catalogue + garage
  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    vehicles.forEach((v) => brands.add(v.make));
    VERIFIED_OEM_CATALOGUE.forEach((c) => brands.add(c.make));
    return ["all", ...Array.from(brands).sort()];
  }, [vehicles]);

  // Filtered Catalogue List
  const filteredCatalogue = useMemo(() => {
    return VERIFIED_OEM_CATALOGUE.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.make.toLowerCase().includes(q) ||
        item.model.toLowerCase().includes(q) ||
        item.plugType.toLowerCase().includes(q);
      const matchesBrand =
        brandFilter === "all" || item.make.toLowerCase() === brandFilter.toLowerCase();
      return matchesSearch && matchesBrand;
    });
  }, [searchQuery, brandFilter]);

  // Filtered Garage List
  const filteredGarage = useMemo(() => {
    return vehicles.filter((v) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        v.plugType.toLowerCase().includes(q);
      const matchesBrand =
        brandFilter === "all" || v.make.toLowerCase() === brandFilter.toLowerCase();
      return matchesSearch && matchesBrand;
    });
  }, [vehicles, searchQuery, brandFilter]);

  if (!isOpen) return null;

  // ── Step 1: Select vehicle from catalogue ──────────────────────────────────
  const handleSelectCatalogue = (item: (typeof VERIFIED_OEM_CATALOGUE)[number]) => {
    setSelectedCatalogueItem(item);
    setSelectedGarageVehicle(null);
    setIsCustomMode(false);
    setConfigBatteryPct(80);
    setConfigNickname("");
    setConfigVin(item.vin || `EV${Date.now().toString().slice(-6)}`);
    setValidationErrors({});
    setStep(2);
  };

  // ── Step 1: Select vehicle from existing garage ─────────────────────────────
  const handleSelectExistingGarage = (v: EVVehicle) => {
    setSelectedGarageVehicle(v);
    setSelectedCatalogueItem(null);
    setIsCustomMode(false);
    setConfigBatteryPct(v.currentBatteryPct);
    setConfigNickname(v.model);
    setConfigVin(v.vin);
    setValidationErrors({});
    setStep(2);
  };

  // ── Step 1: Start Custom Vehicle Creation ──────────────────────────────────
  const handleStartCustom = () => {
    setIsCustomMode(true);
    setSelectedCatalogueItem(null);
    setSelectedGarageVehicle(null);
    setCustomMake("");
    setCustomModel("");
    setCustomYear(2025);
    setCustomUsableKwh(60);
    setCustomMaxDcKw(100);
    setCustomMaxAcKw(7.2);
    setCustomPlugType("CCS2 Combo");
    setCustomWltpKm(420);
    setConfigBatteryPct(80);
    setConfigVin(`CUSTOM${Date.now().toString().slice(-6)}`);
    setValidationErrors({});
    setStep(3); // Directly to configure for custom
  };

  // ── Step 2: Proceed to configure ──────────────────────────────────────────
  const handleProceedToConfigure = () => {
    setStep(3);
  };

  // ── Step 2 or 3: Direct Quick Activate ────────────────────────────────────
  const handleQuickActivate = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (selectedGarageVehicle) {
      onSelectVehicle(selectedGarageVehicle.id);
      setStep(4);
      timerRef.current = setTimeout(() => {
        onClose();
        setStep(1);
      }, 1200);
      return;
    }

    if (selectedCatalogueItem) {
      const stamp = Date.now().toString().slice(-4);
      const newId = `ev-${selectedCatalogueItem.make.toLowerCase().replace(/[^a-z0-9]/g, "")}-${stamp}`;
      const newVehicle: EVVehicle = {
        ...selectedCatalogueItem,
        id: newId,
        currentBatteryPct: configBatteryPct || 80,
        sohPct: 99.5,
      };

      await onAddVehicle?.(newVehicle);
      onSelectVehicle(newId);
      setStep(4);
      timerRef.current = setTimeout(() => {
        onClose();
        setStep(1);
      }, 1200);
    }
  };

  // ── Step 3: Validate and Save Configuration ───────────────────────────────
  const handleSaveAndActivate = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (isCustomMode) {
      const candidate: Partial<EVVehicle> = {
        make: customMake.trim(),
        model: customModel.trim(),
        year: Number(customYear),
        usableKwh: Number(customUsableKwh),
        batteryKwh: Number(customUsableKwh) * 1.08,
        maxDcSpeedKw: Number(customMaxDcKw),
        maxAcSpeedKw: Number(customMaxAcKw),
        plugType: customPlugType,
        wltpRangeKm: Number(customWltpKm),
      };

      const val = validateVehicleInput(candidate);
      if (!val.isValid) {
        setValidationErrors(val.errors);
        return;
      }

      const stamp = Date.now().toString().slice(-4);
      const newVehicle: EVVehicle = {
        id: `custom-${customMake.toLowerCase().replace(/[^a-z0-9]/g, "")}-${stamp}`,
        make: candidate.make!,
        model: candidate.model!,
        year: candidate.year!,
        image: "/images/car-model.png",
        batteryKwh: candidate.batteryKwh!,
        usableKwh: candidate.usableKwh!,
        currentBatteryPct: Math.min(100, Math.max(5, configBatteryPct)),
        wltpRangeKm: candidate.wltpRangeKm!,
        efficiencyKwh100km: +(
          (candidate.usableKwh! / candidate.wltpRangeKm!) *
          100
        ).toFixed(1),
        maxDcSpeedKw: candidate.maxDcSpeedKw!,
        maxAcSpeedKw: candidate.maxAcSpeedKw!,
        plugType: candidate.plugType!,
        plugImage: "/images/plug-ccs2.png",
        vin: configVin || `CUSTOM${Date.now().toString().slice(-6)}`,
        sohPct: 99.0,
      };

      await onAddVehicle?.(newVehicle);
      onSelectVehicle(newVehicle.id);
      setStep(4);
      timerRef.current = setTimeout(() => {
        onClose();
        setStep(1);
      }, 1200);
      return;
    }

    if (selectedGarageVehicle) {
      const updated: EVVehicle = {
        ...selectedGarageVehicle,
        currentBatteryPct: Math.min(100, Math.max(5, configBatteryPct)),
        model: configNickname.trim() || selectedGarageVehicle.model,
        vin: configVin.trim() || selectedGarageVehicle.vin,
      };
      await onUpdateVehicle?.(updated);
      onSelectVehicle(updated.id);
      setStep(4);
      timerRef.current = setTimeout(() => {
        onClose();
        setStep(1);
      }, 1200);
      return;
    }

    if (selectedCatalogueItem) {
      const stamp = Date.now().toString().slice(-4);
      const newId = `ev-${selectedCatalogueItem.make.toLowerCase().replace(/[^a-z0-9]/g, "")}-${stamp}`;
      const newVehicle: EVVehicle = {
        ...selectedCatalogueItem,
        id: newId,
        model: configNickname.trim() || selectedCatalogueItem.model,
        vin: configVin.trim() || selectedCatalogueItem.vin,
        currentBatteryPct: Math.min(100, Math.max(5, configBatteryPct)),
        sohPct: 99.5,
      };

      await onAddVehicle?.(newVehicle);
      onSelectVehicle(newId);
      setStep(4);
      timerRef.current = setTimeout(() => {
        onClose();
        setStep(1);
      }, 1200);
    }
  };

  // Back button handling
  const handleBack = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (step === 4) {
      onClose();
      setStep(1);
    } else if (step === 3) {
      if (isCustomMode) {
        setStep(1);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      setStep(1);
    } else {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vehicle Management Cockpit"
      className="absolute inset-0 z-50 bg-[#FAF9F6] flex flex-col overflow-hidden text-[#111312] select-none"
    >
      {/* ── Fixed Management Header ─────────────────────────────────────── */}
      <header className="shrink-0 px-4 py-3 bg-[#FAF9F6] border-b border-black/[0.07] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleBack}
            className="w-8 h-8 rounded-xl bg-white border border-black/[0.08] flex items-center justify-center text-[#111312] shadow-2xs hover:bg-[#F4F3EE] active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
            aria-label={step > 1 ? "Go to previous step" : "Close vehicle manager"}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#767D78] font-semibold">
                Step {step} of 4
              </span>
              <span className="w-1 h-1 rounded-full bg-[#16A34A]" />
              <span className="text-[10px] font-medium text-[#525854]">
                {step === 1 && "Browse Catalogue"}
                {step === 2 && "Review Specifications"}
                {step === 3 && "Configure Details"}
                {step === 4 && "Active Confirmation"}
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#111312] leading-tight">
              Vehicle Management
            </h1>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl bg-white border border-black/[0.08] flex items-center justify-center text-[#525854] hover:text-[#111312] shadow-2xs hover:bg-[#F4F3EE] active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
          aria-label="Exit to Home"
        >
          <X size={16} />
        </button>
      </header>

      {/* ── Main Viewport Content ────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto no-scrollbar p-3.5 sm:p-4 pb-10 space-y-4">
        {/* ══════════════════════════════════════════════════════════════════
            STEP 1: BROWSE VEHICLES (Clean Searchable List)
           ══════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="space-y-3.5">
            {/* View Selector & Search */}
            <div className="space-y-2">
              {/* Category Segment Tabs */}
              <div className="grid grid-cols-3 p-1 bg-[#EFECE6] rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSourceTab("all")}
                  className={`py-1.5 rounded-lg transition-all ${
                    sourceTab === "all"
                      ? "bg-white text-[#111312] shadow-2xs"
                      : "text-[#525854] hover:text-[#111312]"
                  }`}
                >
                  All Models ({vehicles.length + VERIFIED_OEM_CATALOGUE.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSourceTab("garage")}
                  className={`py-1.5 rounded-lg transition-all ${
                    sourceTab === "garage"
                      ? "bg-white text-[#111312] shadow-2xs"
                      : "text-[#525854] hover:text-[#111312]"
                  }`}
                >
                  My Garage ({vehicles.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSourceTab("catalogue")}
                  className={`py-1.5 rounded-lg transition-all ${
                    sourceTab === "catalogue"
                      ? "bg-white text-[#111312] shadow-2xs"
                      : "text-[#525854] hover:text-[#111312]"
                  }`}
                >
                  Catalogue ({VERIFIED_OEM_CATALOGUE.length})
                </button>
              </div>

              {/* Clean Search Input */}
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#767D78]"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search make or model (e.g. Tata, MG, Tesla, Ather)..."
                  className="w-full bg-white border border-black/[0.08] rounded-xl pl-9 pr-3.5 py-2 text-xs font-medium text-[#111312] placeholder-[#8C938E] focus:outline-hidden focus:border-[#111312] shadow-2xs transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#767D78] hover:text-[#111312]"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Brand Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {availableBrands.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBrandFilter(b)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors capitalize ${
                      brandFilter === b
                        ? "bg-[#111312] text-white shadow-2xs"
                        : "bg-white border border-black/[0.06] text-[#525854] hover:text-[#111312]"
                    }`}
                  >
                    {b === "all" ? "All Makes" : b}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Vehicle Trigger Button */}
            <button
              onClick={handleStartCustom}
              className="w-full py-2.5 px-3 bg-white border border-dashed border-black/[0.18] rounded-xl flex items-center justify-between text-xs font-semibold text-[#111312] hover:bg-[#F5F4EF] transition-all shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#111312]/5 flex items-center justify-center">
                  <Plus size={13} className="text-[#111312]" />
                </div>
                <span>Create Custom EV Specification</span>
              </div>
              <span className="text-[10px] font-mono text-[#767D78]">User Defined</span>
            </button>

            {/* ── Section: My Garage Fleet (if in 'all' or 'garage') ── */}
            {(sourceTab === "all" || sourceTab === "garage") && filteredGarage.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#767D78] font-bold">
                    My Saved Fleet ({filteredGarage.length})
                  </span>
                  <span className="text-[10px] text-[#525854]">Tap to switch or review</span>
                </div>

                <div className="space-y-1.5" role="list" aria-label="Saved Garage Vehicles">
                  {filteredGarage.map((v) => {
                    const isActive = v.id === activeVehicleId;
                    return (
                      <div
                        key={v.id}
                        role="listitem"
                        className={`w-full p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 bg-white ${
                          isActive
                            ? "border-[#111312] ring-1 ring-[#111312]/10 shadow-2xs"
                            : "border-black/[0.06] hover:border-black/[0.14]"
                        }`}
                      >
                        {/* Left: Thumbnail & Info */}
                        <div
                          onClick={() => handleSelectExistingGarage(v)}
                          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="relative w-12 h-9 rounded-lg bg-[#F5F4EF] p-1 shrink-0 flex items-center justify-center overflow-hidden border border-black/[0.04]">
                            <Image
                              src={v.image}
                              alt={`${v.make} ${v.model}`}
                              fill
                              className="object-contain p-0.5"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h2 className="text-xs font-bold text-[#111312] truncate">
                                {v.make} {v.model}
                              </h2>
                              {isActive && (
                                <span className="text-[9px] font-mono font-bold bg-[#111312] text-[#C8F369] px-1.5 py-0.2 rounded shrink-0">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-[#525854] truncate mt-0.5">
                              {v.plugType} • {v.usableKwh} kWh • {v.wltpRangeKm} km
                            </div>
                          </div>
                        </div>

                        {/* Right: Action Button */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isActive ? (
                            <button
                              onClick={() => handleSelectExistingGarage(v)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-[#111312] bg-[#F4F3EE] hover:bg-[#EAE8E2] rounded-lg border border-black/[0.06]"
                            >
                              Config
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                onSelectVehicle(v.id);
                                setStep(4);
                                setTimeout(() => {
                                  onClose();
                                  setStep(1);
                                }, 1000);
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#111312] hover:bg-[#252826] rounded-lg shadow-2xs"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Section: Verified Catalogue (Structured Clean List) ── */}
            {(sourceTab === "all" || sourceTab === "catalogue") && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#767D78] font-bold">
                    Verified OEM Catalogue ({filteredCatalogue.length})
                  </span>
                  <span className="text-[10px] text-[#525854]">Manufacturer Homologation</span>
                </div>

                {filteredCatalogue.length === 0 ? (
                  <div className="py-8 text-center bg-white rounded-2xl border border-black/[0.06] p-4">
                    <p className="text-xs text-[#525854]">
                      No models matching &quot;{searchQuery}&quot;.
                    </p>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setBrandFilter("all");
                      }}
                      className="mt-2 text-xs font-semibold text-[#111312] underline"
                    >
                      Clear search filters
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5" role="list" aria-label="EV Catalogue Models">
                    {filteredCatalogue.map((item, idx) => (
                      <div
                        key={`${item.make}-${item.model}-${idx}`}
                        role="listitem"
                        onClick={() => handleSelectCatalogue(item)}
                        className="w-full p-2.5 rounded-xl border border-black/[0.06] hover:border-black/[0.14] bg-white transition-all flex items-center justify-between gap-2.5 cursor-pointer active:scale-[0.99] group shadow-2xs"
                      >
                        {/* Thumbnail & Title */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="relative w-12 h-9 rounded-lg bg-[#F5F4EF] p-1 shrink-0 flex items-center justify-center overflow-hidden border border-black/[0.04]">
                            <Image
                              src={item.image}
                              alt={`${item.make} ${item.model}`}
                              fill
                              className="object-contain p-0.5"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h2 className="text-xs font-bold text-[#111312] group-hover:text-black truncate">
                                {item.make} {item.model}
                              </h2>
                              <span className="text-[9px] font-mono text-[#767D78] bg-[#F5F4EF] px-1 py-0.2 rounded">
                                {item.year}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-[#525854] truncate mt-0.5">
                              {item.plugType} • {item.usableKwh} kWh • {item.wltpRangeKm} km
                            </div>
                          </div>
                        </div>

                        {/* Chevron Trigger */}
                        <div className="flex items-center gap-1 text-[#767D78] group-hover:text-[#111312] shrink-0">
                          <span className="text-[11px] font-semibold hidden xs:inline">Select</span>
                          <ChevronRight size={14} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            STEP 2: REVIEW SPECIFICATIONS (Exact Model & Verification)
           ══════════════════════════════════════════════════════════════════ */}
        {step === 2 && (selectedCatalogueItem || selectedGarageVehicle) && (
          <div className="space-y-4 animate-in fade-in-50 duration-200">
            {/* Model Card Hero */}
            {(() => {
              const current = selectedCatalogueItem || selectedGarageVehicle!;
              return (
                <div className="bg-white rounded-2xl p-4 border border-black/[0.07] shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                      <Shield size={11} />
                      Verified OEM Specification
                    </span>
                    <span className="text-xs font-mono font-semibold text-[#525854]">
                      {current.year}
                    </span>
                  </div>

                  {/* Vehicle Name & Image */}
                  <div className="text-center">
                    <h2 className="text-lg font-bold text-[#111312]">
                      {current.make} {current.model}
                    </h2>
                    <p className="text-[11px] text-[#525854] font-medium mt-0.5">
                      Standard Homologation Profile
                    </p>
                  </div>

                  <div className="relative w-full h-32 my-1">
                    <Image
                      src={current.image}
                      alt={`${current.make} ${current.model}`}
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>

                  {/* Verified Technical Data Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-black/[0.06] text-xs">
                    <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-black/[0.05]">
                      <span className="text-[10px] font-mono uppercase text-[#767D78] block">
                        Usable Battery
                      </span>
                      <span className="text-sm font-bold font-mono text-[#111312]">
                        {current.usableKwh} kWh
                      </span>
                      <span className="text-[10px] text-[#525854] block mt-0.5">
                        {current.batteryKwh} kWh gross
                      </span>
                    </div>

                    <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-black/[0.05]">
                      <span className="text-[10px] font-mono uppercase text-[#767D78] block">
                        Certified Range
                      </span>
                      <span className="text-sm font-bold font-mono text-[#111312]">
                        {current.wltpRangeKm} km
                      </span>
                      <span className="text-[10px] text-[#525854] block mt-0.5">WLTP / ARAI cycle</span>
                    </div>

                    <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-black/[0.05]">
                      <span className="text-[10px] font-mono uppercase text-[#767D78] block">
                        Max DC Fast Power
                      </span>
                      <span className="text-sm font-bold font-mono text-[#111312]">
                        {current.maxDcSpeedKw} kW
                      </span>
                      <span className="text-[10px] text-[#525854] block mt-0.5">Direct Current</span>
                    </div>

                    <div className="bg-[#FAF9F6] p-2.5 rounded-xl border border-black/[0.05]">
                      <span className="text-[10px] font-mono uppercase text-[#767D78] block">
                        Connector Standard
                      </span>
                      <span className="text-sm font-bold text-[#111312] truncate block">
                        {current.plugType}
                      </span>
                      <span className="text-[10px] text-[#525854] block mt-0.5">Hardware Match</span>
                    </div>
                  </div>

                  <div className="bg-[#F5F4EF] p-2.5 rounded-xl text-[11px] text-[#525854] flex items-center gap-2">
                    <Info size={14} className="shrink-0 text-[#111312]" />
                    <span>
                      Specifications are strictly verified from manufacturer homologation and EV-Database.
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Actions: Proceed to Configure or Quick Activate */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleProceedToConfigure}
                className="w-full py-3 px-4 bg-[#111312] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-[#252826] active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Configure Vehicle &amp; Battery SoC</span>
                <ChevronRight size={14} />
              </button>

              <button
                onClick={handleQuickActivate}
                className="w-full py-2.5 px-4 bg-white border border-black/[0.1] text-[#111312] rounded-xl text-xs font-semibold hover:bg-[#F5F4EF] active:scale-[0.98] transition-all cursor-pointer"
              >
                Quick Activate (Default 80% Battery)
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            STEP 3: CONFIGURE VEHICLE DETAILS
           ══════════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in-50 duration-200">
            {/* Distinct Badging: Verified vs User Configurable */}
            <div className="bg-white rounded-2xl p-4 border border-black/[0.07] shadow-2xs space-y-4">
              {/* Header */}
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#767D78] font-bold">
                  {isCustomMode ? "Custom Vehicle Setup" : "Profile Configuration"}
                </span>
                <h2 className="text-base font-bold text-[#111312] mt-0.5">
                  {isCustomMode
                    ? "Define Custom EV Specifications"
                    : `${(selectedCatalogueItem || selectedGarageVehicle)?.make} ${(selectedCatalogueItem || selectedGarageVehicle)?.model}`}
                </h2>
              </div>

              {/* If Custom Mode: Full Form */}
              {isCustomMode ? (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10.5px] font-mono text-[#525854] block mb-1">
                        Manufacturer *
                      </label>
                      <input
                        type="text"
                        value={customMake}
                        onChange={(e) => setCustomMake(e.target.value)}
                        placeholder="e.g. Tata, Tesla"
                        className="w-full bg-[#FAF9F6] border border-black/[0.08] rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#111312]"
                      />
                      {validationErrors.make && (
                        <span className="text-[10px] text-[#DC2626] mt-0.5 block">
                          {validationErrors.make}
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="text-[10.5px] font-mono text-[#525854] block mb-1">
                        Model Name *
                      </label>
                      <input
                        type="text"
                        value={customModel}
                        onChange={(e) => setCustomModel(e.target.value)}
                        placeholder="e.g. Custom Concept"
                        className="w-full bg-[#FAF9F6] border border-black/[0.08] rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#111312]"
                      />
                      {validationErrors.model && (
                        <span className="text-[10px] text-[#DC2626] mt-0.5 block">
                          {validationErrors.model}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-mono text-[#525854] block mb-1">
                        Usable kWh *
                      </label>
                      <input
                        type="number"
                        value={customUsableKwh}
                        onChange={(e) => setCustomUsableKwh(Number(e.target.value))}
                        className="w-full bg-[#FAF9F6] border border-black/[0.08] rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-[#111312]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-[#525854] block mb-1">
                        Max DC kW *
                      </label>
                      <input
                        type="number"
                        value={customMaxDcKw}
                        onChange={(e) => setCustomMaxDcKw(Number(e.target.value))}
                        className="w-full bg-[#FAF9F6] border border-black/[0.08] rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-[#111312]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-[#525854] block mb-1">
                        WLTP Range *
                      </label>
                      <input
                        type="number"
                        value={customWltpKm}
                        onChange={(e) => setCustomWltpKm(Number(e.target.value))}
                        className="w-full bg-[#FAF9F6] border border-black/[0.08] rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-[#111312]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-mono text-[#525854] block mb-1">
                      Connector Standard *
                    </label>
                    <select
                      value={customPlugType}
                      onChange={(e) => setCustomPlugType(e.target.value as ConnectorStandard)}
                      className="w-full bg-[#FAF9F6] border border-black/[0.08] rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#111312]"
                    >
                      {SUPPORTED_CONNECTOR_STANDARDS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                /* Verified OEM Data Summary */
                <div className="p-3 rounded-xl bg-[#FAF9F6] border border-black/[0.05] space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#525854] flex items-center gap-1.5 font-medium">
                      <Shield size={12} className="text-[#16A34A]" />
                      Verified Usable Battery:
                    </span>
                    <span className="font-mono font-bold text-[#111312]">
                      {(selectedCatalogueItem || selectedGarageVehicle)?.usableKwh} kWh
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#525854] flex items-center gap-1.5 font-medium">
                      <Zap size={12} className="text-[#16A34A]" />
                      Max Fast DC Power:
                    </span>
                    <span className="font-mono font-bold text-[#111312]">
                      {(selectedCatalogueItem || selectedGarageVehicle)?.maxDcSpeedKw} kW
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#525854] flex items-center gap-1.5 font-medium">
                      <Check size={12} className="text-[#16A34A]" />
                      Connector Type:
                    </span>
                    <span className="font-bold text-[#111312]">
                      {(selectedCatalogueItem || selectedGarageVehicle)?.plugType}
                    </span>
                  </div>
                </div>
              )}

              {/* User-Configurable Parameters Section */}
              <div className="pt-2 border-t border-black/[0.06] space-y-3">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#767D78] font-bold block">
                  User Configurable Parameters
                </span>

                {/* Starting / Current Battery SoC Slider & Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[#111312]">
                      Current Battery State of Charge (SoC)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={5}
                        max={100}
                        value={configBatteryPct}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val)) {
                            setConfigBatteryPct(Math.min(100, Math.max(5, val)));
                          }
                        }}
                        className="w-12 text-right font-mono font-bold text-xs bg-[#FAF9F6] border border-black/[0.1] rounded-md px-1 py-0.5 text-[#111312]"
                        aria-label="Battery percentage value"
                      />
                      <span className="text-xs font-mono font-bold text-[#525854]">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    value={configBatteryPct}
                    onChange={(e) => setConfigBatteryPct(Number(e.target.value))}
                    className="w-full accent-[#111312] cursor-pointer"
                    aria-label="Battery percentage slider"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-[#767D78] mt-1">
                    <span>5% (Depleted)</span>
                    <span>50%</span>
                    <span>100% (Full)</span>
                  </div>
                </div>

                {/* Nickname / Display Label */}
                <div>
                  <label className="text-xs font-semibold text-[#111312] block mb-1">
                    Custom Vehicle Label / Nickname
                  </label>
                  <input
                    type="text"
                    value={configNickname}
                    onChange={(e) => setConfigNickname(e.target.value)}
                    placeholder="e.g. Daily Commuter, Pune Nexon"
                    className="w-full bg-[#FAF9F6] border border-black/[0.08] rounded-xl px-3 py-1.5 text-xs font-medium text-[#111312]"
                  />
                </div>

                {/* VIN */}
                <div>
                  <label className="text-xs font-semibold text-[#111312] block mb-1">
                    Chassis VIN (Optional)
                  </label>
                  <input
                    type="text"
                    value={configVin}
                    onChange={(e) => setConfigVin(e.target.value)}
                    placeholder="Chassis identification number"
                    className="w-full bg-[#FAF9F6] border border-black/[0.08] rounded-xl px-3 py-1.5 text-xs font-mono text-[#111312]"
                  />
                </div>
              </div>
            </div>

            {/* Validation Errors banner if any */}
            {Object.keys(validationErrors).length > 0 && (
              <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl text-xs text-[#DC2626]">
                Please review and correct form inputs before saving.
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleSaveAndActivate}
                className="w-full py-3 px-4 bg-[#111312] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-[#252826] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Check size={15} className="text-[#C8F369]" />
                <span>Save &amp; Activate as Primary EV</span>
              </button>

              <button
                onClick={handleBack}
                className="w-full py-2.5 px-4 bg-white border border-black/[0.1] text-[#525854] hover:text-[#111312] rounded-xl text-xs font-semibold hover:bg-[#F5F4EF] active:scale-[0.98] transition-all cursor-pointer"
              >
                {isCustomMode ? "Back to Browse" : "Back to Review"}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            STEP 4: SAVE AND ACTIVATE (Confirmation & Return)
           ══════════════════════════════════════════════════════════════════ */}
        {step === 4 && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-[#DCFCE7] border border-[#86EFAC] flex items-center justify-center text-[#15803D] shadow-sm">
              <CheckCircle2 size={32} />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#111312]">Vehicle Activated</h2>
              <p className="text-xs text-[#525854] max-w-xs">
                Your selected vehicle has been calibrated and set as the active EV cockpit.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  if (timerRef.current) clearTimeout(timerRef.current);
                  onClose();
                  setStep(1);
                }}
                className="px-6 py-2.5 bg-[#111312] text-white rounded-xl text-xs font-bold hover:bg-[#252826] shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                Return to Cockpit
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

