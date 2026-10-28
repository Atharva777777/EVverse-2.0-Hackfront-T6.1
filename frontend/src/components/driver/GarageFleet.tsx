"use client";

import React, { useState, useId, useCallback } from "react";
import Image from "next/image";
import {
  CheckCircle2,
  Zap,
  Car,
  Shield,
  Gauge,
  Sliders,
  ChevronRight,
  Plus,
  Trash2,
  Edit3,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  X,
  Check,
  Info,
  Filter,
} from "lucide-react";
import type { EVVehicle } from "./VehicleCockpit";
import {
  SUPPORTED_CONNECTOR_STANDARDS,
  VERIFIED_OEM_CATALOGUE,
  validateVehicleInput,
  type ConnectorStandard,
} from "@/lib/vehicleStorage";
import { getPlugImage } from "@/lib/stationAdapter";

interface GarageFleetProps {
  vehicles: EVVehicle[];
  activeVehicleId: string;
  onSelectVehicle: (id: string) => void;
  onAddVehicle?: (vehicle: EVVehicle) => void;
  onUpdateVehicle?: (vehicle: EVVehicle) => void;
  onRemoveVehicle?: (id: string) => void;
  autoCompatibility?: boolean;
  onToggleAutoCompatibility?: (enabled: boolean) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  onClearError?: () => void;
  onResetDefaults?: () => void;
}

export function GarageFleet({
  vehicles,
  activeVehicleId,
  onSelectVehicle,
  onAddVehicle,
  onUpdateVehicle,
  onRemoveVehicle,
  autoCompatibility = true,
  onToggleAutoCompatibility,
  isLoading = false,
  errorMessage = null,
  onClearError,
  onResetDefaults,
}: GarageFleetProps) {
  const [suspensionMap, setSuspensionMap] = useState<Record<string, "aero" | "normal" | "high">>({});

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<"catalog" | "custom">("catalog");
  const [editingVehicle, setEditingVehicle] = useState<EVVehicle | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state for Adding / Editing
  const [formMake, setFormMake] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formYear, setFormYear] = useState(2025);
  const [formUsableKwh, setFormUsableKwh] = useState(75);
  const [formMaxDcSpeedKw, setFormMaxDcSpeedKw] = useState(150);
  const [formMaxAcSpeedKw, setFormMaxAcSpeedKw] = useState(11);
  const [formPlugType, setFormPlugType] = useState<ConnectorStandard>("CCS2 Combo");
  const [formWltpRangeKm, setFormWltpRangeKm] = useState(480);
  const [formVin, setFormVin] = useState("");
  const [formValidationErrors, setFormValidationErrors] = useState<Record<string, string>>({});

  // Accessibility unique IDs
  const makeId = useId();
  const modelId = useId();
  const yearId = useId();
  const usableKwhId = useId();
  const maxDcId = useId();
  const plugTypeId = useId();
  const wltpId = useId();
  const vinId = useId();

  // Open Edit Modal with vehicle values
  const handleOpenEdit = (v: EVVehicle) => {
    setEditingVehicle(v);
    setFormMake(v.make);
    setFormModel(v.model);
    setFormYear(v.year);
    setFormUsableKwh(v.usableKwh);
    setFormMaxDcSpeedKw(v.maxDcSpeedKw);
    setFormMaxAcSpeedKw(v.maxAcSpeedKw);
    setFormPlugType(v.plugType as ConnectorStandard);
    setFormWltpRangeKm(v.wltpRangeKm);
    setFormVin(v.vin);
    setFormValidationErrors({});
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setIsAddModalOpen(true);
    setAddMode("catalog");
    setFormMake("");
    setFormModel("");
    setFormYear(2025);
    setFormUsableKwh(75);
    setFormMaxDcSpeedKw(150);
    setFormMaxAcSpeedKw(11);
    setFormPlugType("CCS2 Combo");
    setFormWltpRangeKm(480);
    setFormVin(`EV${Date.now().toString().slice(-8)}`);
    setFormValidationErrors({});
  };

  // Add from verified catalogue preset
  const handleSelectCataloguePreset = useCallback((preset: (typeof VERIFIED_OEM_CATALOGUE)[number]) => {
    const stamp = Date.now().toString().slice(-4);
    const newVehicle: EVVehicle = {
      ...preset,
      id: `ev-${preset.make.toLowerCase().replace(/[^a-z0-9]/g, "")}-${stamp}`,
      currentBatteryPct: 80,
      sohPct: 99.5,
    };

    onAddVehicle?.(newVehicle);
    setIsAddModalOpen(false);
  }, [onAddVehicle]);

  // Submit Custom Vehicle Form
  const handleSubmitCustomVehicle = (e: React.FormEvent) => {
    e.preventDefault();

    const candidate = {
      make: formMake,
      model: formModel,
      year: Number(formYear),
      usableKwh: Number(formUsableKwh),
      batteryKwh: Number(formUsableKwh) * 1.08,
      maxDcSpeedKw: Number(formMaxDcSpeedKw),
      maxAcSpeedKw: Number(formMaxAcSpeedKw),
      plugType: formPlugType,
      wltpRangeKm: Number(formWltpRangeKm),
      efficiencyKwh100km: +( (Number(formUsableKwh) / Number(formWltpRangeKm)) * 100 ).toFixed(1),
      vin: formVin.trim() || `EV${Date.now().toString().slice(-8)}`,
      image: "/images/car-model.png",
      plugImage: getPlugImage(formPlugType),
    };

    const validation = validateVehicleInput(candidate);
    if (!validation.isValid) {
      setFormValidationErrors(validation.errors);
      return;
    }

    if (editingVehicle) {
      const updated: EVVehicle = {
        ...editingVehicle,
        ...candidate,
        plugImage: getPlugImage(candidate.plugType),
      };
      onUpdateVehicle?.(updated);
      setEditingVehicle(null);
    } else {
      const created: EVVehicle = {
        ...candidate,
        id: `ev-custom-${Date.now()}`,
        currentBatteryPct: 75,
        sohPct: 99.0,
      };
      onAddVehicle?.(created);
      setIsAddModalOpen(false);
    }
  };

  // Handle Remove confirmation
  const handleConfirmDelete = (id: string) => {
    if (vehicles.length <= 1) return;
    onRemoveVehicle?.(id);
    setDeleteConfirmId(null);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* ── Error Banner State ────────────────────────────────────────── */}
      {errorMessage && (
        <div
          role="alert"
          className="p-4 bg-[#FEE2E2] border border-[#FCA5A5] rounded-2xl flex items-start justify-between gap-3 animate-in fade-in"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-[#991B1B] shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-[#991B1B]">Garage Persistence Notice</div>
              <p className="text-xs text-[#7F1D1D] mt-0.5">{errorMessage}</p>
            </div>
          </div>
          {onClearError && (
            <button
              type="button"
              onClick={onClearError}
              aria-label="Dismiss error message"
              className="w-7 h-7 rounded-full bg-white/70 hover:bg-white flex items-center justify-center text-[#991B1B] cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ── Fleet Registry Header & Actions ─────────────────────────── */}
      <div className="bg-white rounded-[28px] p-5 border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#767D78] font-medium">
                Garage
              </span>
            </div>
            <h2 className="text-lg font-bold text-[#111312] mt-0.5">
              My Electric Vehicles
            </h2>
            <p className="text-xs text-[#525854] mt-0.5">
              Station compatibility and trip range estimates update automatically for your active car.
            </p>
          </div>

          {/* Add Vehicle Button */}
          <button
            type="button"
            onClick={handleOpenAdd}
            aria-label="Add electric vehicle to garage"
            className="min-h-[44px] px-3.5 py-2.5 bg-[#111312] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs hover:bg-[#252826] active:scale-95 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
          >
            <Plus size={14} className="text-[#C8F369]" aria-hidden="true" />
            <span>Add Vehicle</span>
          </button>
        </div>

        {/* Vehicle Compatibility Auto-Apply Preference Toggle */}
        <div className="p-3.5 bg-[#FAF9F6] rounded-2xl border border-black/[0.05] flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white border border-black/[0.06] flex items-center justify-center text-[#16A34A] shrink-0 mt-0.5">
              <Filter size={15} />
            </div>
            <div>
              <div className="text-xs font-bold text-[#111312]">
                Only show compatible chargers
              </div>
              <p className="text-[11px] text-[#525854] mt-0.5">
                Filters map and routes to only show chargers that fit your car.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoCompatibility}
            aria-label="Toggle automatic vehicle compatibility filter"
            onClick={() => onToggleAutoCompatibility?.(!autoCompatibility)}
            className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#111312] ${
              autoCompatibility ? "bg-[#111312]" : "bg-[#D1D5DB]"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                autoCompatibility ? "translate-x-5 bg-[#C8F369]" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* ── Loading Skeleton State ────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="bg-white rounded-[28px] p-5 border border-black/[0.06] animate-pulse space-y-4"
            >
              <div className="h-4 bg-[#F4F3EE] rounded-md w-1/3" />
              <div className="h-28 bg-[#F4F3EE] rounded-2xl w-full" />
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-[#F4F3EE] rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Vehicle Cards List ──────────────────────────────────────── */
        <div className="space-y-3.5">
          {vehicles.map((v) => {
            const isActive = v.id === activeVehicleId;
            const currentSuspension = suspensionMap[v.id] || "normal";

            return (
              <div
                key={v.id}
                onClick={() => onSelectVehicle(v.id)}
                className={`bg-white rounded-[28px] p-5 border transition-all cursor-pointer relative overflow-hidden ${
                  isActive
                    ? "border-[#111312] shadow-[0_4px_20px_rgba(0,0,0,0.06)] ring-1 ring-[#111312]"
                    : "border-black/[0.06] hover:border-black/[0.15] shadow-[0_2px_12px_rgba(0,0,0,0.02)]"
                }`}
              >
                {/* Active Vehicle Ribbon */}
                {isActive && (
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#111312] text-[#C8F369] text-[10.5px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C8F369]" />
                    Active
                  </div>
                )}

                {/* Title & Metadata */}
                <div className="pr-32">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#767D78]">
                      {v.year} Model
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#FAF9F6] border border-black/[0.06] text-[#111312] font-semibold">
                      {v.plugType}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-[#111312] mt-1">
                    {v.make} {v.model}
                  </h3>

                  <div className="text-[10px] text-[#767D78] font-mono mt-0.5">
                    VIN: {v.vin}
                  </div>
                </div>

                {/* Vehicle Image with Contact Shadow */}
                <div className="relative w-full h-36 my-1 flex flex-col items-center justify-center">
                  <div className="relative w-full h-32">
                    <Image
                      src={v.image || "/images/car-model.png"}
                      alt={`${v.make} ${v.model}`}
                      fill
                      className="object-contain drop-shadow-xs select-none"
                    />
                  </div>
                  {/* Contact Shadow */}
                  <div
                    className="w-3/5 h-2 -mt-1 rounded-full pointer-events-none opacity-60"
                    style={{
                      background:
                        "radial-gradient(ellipse at center, rgba(17,19,18,0.5) 0%, rgba(17,19,18,0.15) 50%, rgba(17,19,18,0) 80%)",
                      filter: "blur(2px)",
                    }}
                  />
                </div>

                {/* Technical Specifications Grid */}
                <div className="grid grid-cols-4 gap-1.5 pt-3 border-t border-black/[0.06] text-center text-xs">
                  <div className="bg-[#FAF9F6] p-2 rounded-xl border border-black/[0.04]">
                    <div className="text-[9px] font-mono text-[#767D78]">Battery</div>
                    <div className="font-bold text-[#111312] font-mono mt-0.5">
                      {v.usableKwh}
                    </div>
                    <div className="text-[8.5px] text-[#525854]">kWh</div>
                  </div>

                  <div className="bg-[#FAF9F6] p-2 rounded-xl border border-black/[0.04]">
                    <div className="text-[9px] font-mono text-[#767D78]">Range</div>
                    <div className="font-bold text-[#111312] font-mono mt-0.5">
                      {v.wltpRangeKm}
                    </div>
                    <div className="text-[8.5px] text-[#525854]">km</div>
                  </div>

                  <div className="bg-[#FAF9F6] p-2 rounded-xl border border-black/[0.04]">
                    <div className="text-[9px] font-mono text-[#767D78]">Fast Charge</div>
                    <div className="font-bold text-[#16A34A] font-mono mt-0.5">
                      {v.maxDcSpeedKw}
                    </div>
                    <div className="text-[8.5px] text-[#525854]">kW</div>
                  </div>

                  <div className="bg-[#FAF9F6] p-2 rounded-xl border border-black/[0.04]">
                    <div className="text-[9px] font-mono text-[#767D78]">Plug</div>
                    <div className="font-bold text-[#111312] font-mono mt-0.5 truncate text-[10.5px]">
                      {v.plugType.split(" ")[0]}
                    </div>
                    <div className="text-[8.5px] text-[#16A34A] font-semibold">Standard</div>
                  </div>
                </div>

                {/* Actions & Adjustments */}
                <div className="mt-3 pt-3 border-t border-black/[0.06] flex flex-wrap items-center justify-between gap-2">
                  {/* Air Suspension Controls (if active) */}
                  {isActive ? (
                    <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-[#767D78]">
                      <Sliders size={13} aria-hidden="true" />
                      <span>Suspension:</span>
                      <div
                        role="radiogroup"
                        aria-label="Chassis Air Suspension Height"
                        className="flex items-center gap-1 ml-1"
                      >
                        {(
                          [
                            { id: "aero", label: "Low" },
                            { id: "normal", label: "Normal" },
                            { id: "high", label: "High" },
                          ] as const
                        ).map((mode) => (
                          <button
                            key={mode.id}
                            role="radio"
                            aria-checked={currentSuspension === mode.id}
                            aria-label={`Suspension height: ${mode.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSuspensionMap((prev) => ({ ...prev, [v.id]: mode.id }));
                            }}
                            className={`text-[9.5px] px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer min-h-[30px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#111312] ${
                              currentSuspension === mode.id
                                ? "bg-[#111312] text-[#C8F369]"
                                : "bg-[#F4F3EE] text-[#525854] hover:bg-[#EAE8E2]"
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#767D78] font-mono">
                      Battery Health: {v.sohPct}%
                    </div>
                  )}

                  {/* Edit & Remove Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(v);
                      }}
                      aria-label={`Edit ${v.make} ${v.model} specifications`}
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#FAF9F6] hover:bg-[#F4F3EE] text-[#111312] text-[11px] font-semibold flex items-center gap-1 border border-black/[0.06] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
                    >
                      <Edit3 size={12} aria-hidden="true" />
                      <span>Edit</span>
                    </button>

                    {vehicles.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(v.id);
                        }}
                        aria-label={`Remove ${v.make} ${v.model} from garage`}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#EF4444] text-[11px] font-semibold flex items-center gap-1 border border-[#FCA5A5] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
                      >
                        <Trash2 size={12} aria-hidden="true" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Set as Active Driver Vehicle Button */}
                {!isActive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectVehicle(v.id);
                    }}
                    className="w-full mt-3 py-3 min-h-[44px] bg-[#F4F3EE] hover:bg-[#EAE8E2] text-[#111312] text-xs font-semibold rounded-xl active:scale-98 transition-all border border-black/[0.05] cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#111312]"
                  >
                    Set as Active
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Vehicle Modal ─────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add Electric Vehicle to Garage"
          className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-3xl p-5 w-full max-w-md border border-[rgba(17,19,18,0.1)] shadow-2xl space-y-4 my-auto animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#111312]">
                  Add Vehicle
                </h3>
                <p className="text-xs text-[#525854]">
                  Choose a popular model or enter your car&apos;s details.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close modal"
                className="w-8 h-8 rounded-full bg-[#F4F3EE] flex items-center justify-center text-[#525854] hover:bg-[#EAE8E2] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="flex p-1 bg-[#FAF9F6] rounded-xl border border-black/[0.06]">
              <button
                type="button"
                onClick={() => setAddMode("catalog")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  addMode === "catalog"
                    ? "bg-[#111312] text-white shadow-xs"
                    : "text-[#525854] hover:text-[#111312]"
                }`}
              >
                Popular Models
              </button>
              <button
                type="button"
                onClick={() => setAddMode("custom")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  addMode === "custom"
                    ? "bg-[#111312] text-white shadow-xs"
                    : "text-[#525854] hover:text-[#111312]"
                }`}
              >
                Custom Details
              </button>
            </div>

            {/* Mode 1: Verified Catalogue Presets */}
            {addMode === "catalog" ? (
              <div className="space-y-2.5">
                <div className="text-[11px] text-[#767D78] font-mono">
                  Select your car from the list:
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {VERIFIED_OEM_CATALOGUE.map((preset) => (
                    <button
                      key={`${preset.make}-${preset.model}`}
                      type="button"
                      onClick={() => handleSelectCataloguePreset(preset)}
                      className="w-full p-3 bg-[#FAF9F6] hover:bg-[#F4F3EE] rounded-2xl border border-black/[0.06] text-left transition-all flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div>
                        <div className="text-xs font-bold text-[#111312] group-hover:text-[#16A34A] transition-colors">
                          {preset.make} {preset.model}
                        </div>
                        <div className="text-[10px] text-[#525854] font-mono mt-0.5">
                          {preset.usableKwh} kWh • Max {preset.maxDcSpeedKw} kW • {preset.plugType}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-[#111312] bg-white px-2.5 py-1 rounded-lg border border-black/[0.06] shrink-0">
                        Select
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Mode 2: Custom Explicit Input Form */
              <form onSubmit={handleSubmitCustomVehicle} className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor={makeId} className="block text-[11px] font-semibold text-[#111312] mb-1">
                      Make *
                    </label>
                    <input
                      id={makeId}
                      type="text"
                      required
                      placeholder="e.g. Tesla"
                      value={formMake}
                      onChange={(e) => setFormMake(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                    />
                    {formValidationErrors.make && (
                      <span className="text-[10px] text-[#DC2626]">{formValidationErrors.make}</span>
                    )}
                  </div>

                  <div>
                    <label htmlFor={modelId} className="block text-[11px] font-semibold text-[#111312] mb-1">
                      Model *
                    </label>
                    <input
                      id={modelId}
                      type="text"
                      required
                      placeholder="e.g. Model 3"
                      value={formModel}
                      onChange={(e) => setFormModel(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                    />
                    {formValidationErrors.model && (
                      <span className="text-[10px] text-[#DC2626]">{formValidationErrors.model}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor={usableKwhId} className="block text-[11px] font-semibold text-[#111312] mb-1">
                      Battery Size (kWh) *
                    </label>
                    <input
                      id={usableKwhId}
                      type="number"
                      step="0.1"
                      min="5"
                      max="250"
                      required
                      value={formUsableKwh}
                      onChange={(e) => setFormUsableKwh(Number(e.target.value))}
                      className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                    />
                    {formValidationErrors.usableKwh && (
                      <span className="text-[10px] text-[#DC2626]">{formValidationErrors.usableKwh}</span>
                    )}
                  </div>

                  <div>
                    <label htmlFor={maxDcId} className="block text-[11px] font-semibold text-[#111312] mb-1">
                      Max Charging Speed (kW) *
                    </label>
                    <input
                      id={maxDcId}
                      type="number"
                      step="1"
                      min="0"
                      max="500"
                      required
                      value={formMaxDcSpeedKw}
                      onChange={(e) => setFormMaxDcSpeedKw(Number(e.target.value))}
                      className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                    />
                    {formValidationErrors.maxDcSpeedKw && (
                      <span className="text-[10px] text-[#DC2626]">{formValidationErrors.maxDcSpeedKw}</span>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor={plugTypeId} className="block text-[11px] font-semibold text-[#111312] mb-1">
                    Plug Type *
                  </label>
                  <select
                    id={plugTypeId}
                    value={formPlugType}
                    onChange={(e) => setFormPlugType(e.target.value as ConnectorStandard)}
                    className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                  >
                    {SUPPORTED_CONNECTOR_STANDARDS.map((std) => (
                      <option key={std} value={std}>
                        {std}
                      </option>
                    ))}
                  </select>
                  {formValidationErrors.plugType && (
                    <span className="text-[10px] text-[#DC2626]">{formValidationErrors.plugType}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor={wltpId} className="block text-[11px] font-semibold text-[#111312] mb-1">
                      WLTP Range (km)
                    </label>
                    <input
                      id={wltpId}
                      type="number"
                      min="50"
                      max="1200"
                      value={formWltpRangeKm}
                      onChange={(e) => setFormWltpRangeKm(Number(e.target.value))}
                      className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                    />
                  </div>

                  <div>
                    <label htmlFor={yearId} className="block text-[11px] font-semibold text-[#111312] mb-1">
                      Model Year
                    </label>
                    <input
                      id={yearId}
                      type="number"
                      min="2010"
                      max="2027"
                      value={formYear}
                      onChange={(e) => setFormYear(Number(e.target.value))}
                      className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-2.5 bg-[#F4F3EE] text-[#525854] text-xs font-semibold rounded-xl hover:bg-[#EAE8E2] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-[#111312] text-white text-xs font-bold rounded-xl hover:bg-[#252826] cursor-pointer"
                  >
                    Add to Garage
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Vehicle Modal ────────────────────────────────────────── */}
      {editingVehicle && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${editingVehicle.make} ${editingVehicle.model}`}
          className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-3xl p-5 w-full max-w-md border border-[rgba(17,19,18,0.1)] shadow-2xl space-y-4 my-auto animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#111312]">
                  Edit Vehicle
                </h3>
                <p className="text-xs text-[#525854]">
                  {editingVehicle.make} {editingVehicle.model}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingVehicle(null)}
                aria-label="Close edit modal"
                className="w-8 h-8 rounded-full bg-[#F4F3EE] flex items-center justify-center text-[#525854] hover:bg-[#EAE8E2] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitCustomVehicle} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#111312] mb-1">
                    Battery Size (kWh)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="5"
                    max="250"
                    required
                    value={formUsableKwh}
                    onChange={(e) => setFormUsableKwh(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                  />
                  {formValidationErrors.usableKwh && (
                    <span className="text-[10px] text-[#DC2626]">{formValidationErrors.usableKwh}</span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#111312] mb-1">
                    Max Charging Speed (kW)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="500"
                    required
                    value={formMaxDcSpeedKw}
                    onChange={(e) => setFormMaxDcSpeedKw(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                  />
                  {formValidationErrors.maxDcSpeedKw && (
                    <span className="text-[10px] text-[#DC2626]">{formValidationErrors.maxDcSpeedKw}</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#111312] mb-1">
                  Plug Type
                </label>
                <select
                  value={formPlugType}
                  onChange={(e) => setFormPlugType(e.target.value as ConnectorStandard)}
                  className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                >
                  {SUPPORTED_CONNECTOR_STANDARDS.map((std) => (
                    <option key={std} value={std}>
                      {std}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#111312] mb-1">
                    Range (km)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="1200"
                    value={formWltpRangeKm}
                    onChange={(e) => setFormWltpRangeKm(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#111312] mb-1">
                    VIN
                  </label>
                  <input
                    type="text"
                    value={formVin}
                    onChange={(e) => setFormVin(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-black/[0.15] bg-white text-[#111312] font-mono focus:outline-2 focus:outline-[#111312]"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingVehicle(null)}
                  className="flex-1 py-2.5 bg-[#F4F3EE] text-[#525854] text-xs font-semibold rounded-xl hover:bg-[#EAE8E2] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#111312] text-white text-xs font-bold rounded-xl hover:bg-[#252826] cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ───────────────────────────────── */}
      {deleteConfirmId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm vehicle removal"
          className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm border border-[rgba(17,19,18,0.1)] shadow-2xl space-y-3 animate-in zoom-in-95">
            <div className="flex items-center gap-2 text-[#EF4444]">
              <AlertTriangle size={20} />
              <h3 className="text-sm font-bold text-[#111312]">Remove Vehicle?</h3>
            </div>
            <p className="text-xs text-[#525854]">
              Are you sure you want to remove this vehicle from your garage?
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 bg-[#F4F3EE] text-[#525854] text-xs font-semibold rounded-xl hover:bg-[#EAE8E2] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelete(deleteConfirmId)}
                className="flex-1 py-2.5 bg-[#DC2626] text-white text-xs font-bold rounded-xl hover:bg-[#B91C1C] cursor-pointer"
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
