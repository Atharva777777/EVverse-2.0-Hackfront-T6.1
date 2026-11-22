"use client";

import React, { useState, useEffect, useId } from "react";
import Image from "next/image";
import type { LiveStation } from "@/types/api";
import {
  enrichStation,
  submitReportToBackend,
  syncReportsWithBackend,
  type StationReport,
  type EnrichedStationDetail,
  type StationOperationalStatus,
} from "@/lib/stationAdapter";
import {
  X,
  Heart,
  Navigation,
  Zap,
  Clock,
  ExternalLink,
  Flag,
  CheckCircle2,
  ShieldCheck,
  DollarSign,
  ChevronRight,
  Star,
  Car,
  CalendarCheck,
  ShieldAlert,
} from "lucide-react";
import type { EVVehicle } from "./VehicleCockpit";

interface StationDetailSheetProps {
  station: LiveStation | null;
  userLocation: [number, number];
  isOpen: boolean;
  onClose: () => void;
  onStartNavigation: (st: LiveStation) => void;
  onStartCharging: (st: LiveStation) => void;
  isSaved: boolean;
  onToggleSave: (stationId: string) => void;
  activeVehicleSoc?: number;
  vehicleWltpKm?: number;
  activeVehicle?: EVVehicle;
}

export const StationDetailSheet: React.FC<StationDetailSheetProps> = ({
  station,
  userLocation,
  isOpen,
  onClose,
  onStartNavigation,
  onStartCharging,
  isSaved,
  onToggleSave,
  activeVehicleSoc = 75,
  vehicleWltpKm = 470,
  activeVehicle,
}) => {
  const [isReportingOpen, setIsReportingOpen] = useState(false);
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState<StationReport["category"]>(
    "Broken / Damaged Connector"
  );
  const [reportNotes, setReportNotes] = useState("");
  const [selectedConnectorForReport, setSelectedConnectorForReport] = useState<string>("All Connectors");
  const [liveReports, setLiveReports] = useState<StationReport[]>([]);

  // Station Bay Booking / Reservation State
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedBay, setSelectedBay] = useState<string>("Bay #01 (CCS2 60kW)");
  const [holdMins, setHoldMins] = useState<number>(15);
  const [activeReservation, setActiveReservation] = useState<{
    stationId: string;
    bay: string;
    code: string;
    expiresAt: number;
  } | null>(null);
  const [bookingConfirmedModal, setBookingConfirmedModal] = useState(false);

  // Form input unique IDs for accessibility
  const categoryId = useId();
  const connectorId = useId();
  const notesId = useId();

  // Sync community reports from backend when sheet opens
  useEffect(() => {
    if (isOpen && station?.station_id) {
      syncReportsWithBackend(station.station_id).then(setLiveReports);
    }
  }, [isOpen, station?.station_id]);

  if (!isOpen || !station) return null;

  // Enrich data with complete tariffs, operating hours, plug art, and strict honesty check
  const details: EnrichedStationDetail = enrichStation(station, userLocation);

  // Compute estimated arrival battery percentage
  const kmToStation = details.distanceKm;
  const estimatedEnergyLossPct = Math.round((kmToStation / vehicleWltpKm) * 100);
  const estimatedArrivalSoc = Math.max(2, activeVehicleSoc - estimatedEnergyLossPct);

  // Handle submitting an issue report to backend
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await submitReportToBackend({
      stationId: station.station_id,
      category: reportCategory,
      connectorType: selectedConnectorForReport === "All Connectors" ? undefined : selectedConnectorForReport,
      notes: reportNotes.trim() || undefined,
    });
    setLiveReports((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);

    setReportSuccessMessage("Issue submitted. Station status updated for all local drivers.");
    setTimeout(() => {
      setReportSuccessMessage(null);
      setIsReportingOpen(false);
      setReportNotes("");
    }, 2200);
  };

  // Status visual configuration
  const statusConfig: Record<
    StationOperationalStatus,
    { badgeBg: string; badgeText: string; dotBg: string; border: string; title: string; desc: string }
  > = {
    available: {
      badgeBg: "bg-[#DCFCE7]",
      badgeText: "text-[#15803D]",
      dotBg: "bg-[#16A34A]",
      border: "border-[#86EFAC]",
      title: "Available for Charging",
      desc: details.availableBays
        ? `${details.availableBays} of ${details.bays} bays reported ready`
        : "Operational & ready to connect",
    },
    occupied: {
      badgeBg: "bg-[#FEF3C7]",
      badgeText: "text-[#B45309]",
      dotBg: "bg-[#D97706]",
      border: "border-[#FDE68A]",
      title: "All Bays Occupied",
      desc: "Charging in progress by other vehicles; queueing may be required",
    },
    offline: {
      badgeBg: "bg-[#FEE2E2]",
      badgeText: "text-[#991B1B]",
      dotBg: "bg-[#DC2626]",
      border: "border-[#FCA5A5]",
      title: details.statusLabel || "Station Offline",
      desc: "Hardware powered down or reported inaccessible by drivers",
    },
    unknown: {
      badgeBg: "bg-[#F1F5F9]",
      badgeText: "text-[#475569]",
      dotBg: "bg-[#94A3B8]",
      border: "border-[#CBD5E1]",
      title: "Status Unconfirmed",
      desc: "Live status not reported. Please check on arrival.",
    },
  };

  const currStatus = statusConfig[details.status];

  return (
    <>
      {/* Backdrop — strictly bounded within phone canvas */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs z-50 transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Drawer Sheet — compact, contained strictly inside phone mockup */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${details.name} station details`}
        className="absolute inset-x-0 bottom-0 z-50 max-h-[76%] bg-[#FFFFFF] rounded-t-[28px] border-t border-[rgba(17,19,18,0.08)] shadow-2xl flex flex-col overflow-hidden w-full mx-auto animate-in slide-in-from-bottom duration-300"
      >
        {/* Drag / Pull handle */}
        <div className="w-full pt-2 pb-1 flex justify-center shrink-0 cursor-grab">
          <div className="w-10 h-1 bg-[#E5E5DF] rounded-full" />
        </div>

        {/* Scrollable Container */}
        <div className="overflow-y-auto px-4 pt-1 pb-5 space-y-3 flex-1 overscroll-contain">
          
          {/* Header Section */}
          <div className="flex items-start justify-between gap-3 pt-0.5">
            <div className="flex items-start gap-3 min-w-0">
              {/* Charger hardware image */}
              <div className="relative w-11 h-12 bg-[#FAF9F6] rounded-xl border border-[rgba(17,19,18,0.08)] flex items-center justify-center shrink-0 p-1 overflow-hidden shadow-2xs">
                <Image
                  src="/images/charger-hub-3d-reference.png"
                  alt="Charger terminal visual"
                  width={44}
                  height={48}
                  className="object-contain"
                  priority
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9.5px] font-mono uppercase tracking-wider font-bold text-[#8C938E] bg-[#F4F3EE] px-1.5 py-0.5 rounded">
                    {details.operator}
                  </span>
                  <span className="text-[9.5px] font-mono text-[#8C938E] flex items-center gap-1">
                    <Clock size={10} aria-hidden="true" />
                    {details.lastUpdatedText}
                  </span>
                </div>

                <h2 className="text-base font-bold text-[#111312] mt-0.5 leading-snug truncate">
                  {details.name}
                </h2>

                <p className="text-[11px] text-[#525854] mt-0.5 leading-normal line-clamp-1">
                  {details.address}
                </p>

                {/* Rating & Reviews row */}
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        size={10}
                        className={i <= 4 ? "fill-[#F59E0B] text-[#F59E0B]" : "fill-none text-[#F59E0B]/40"}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold text-[#111312] font-mono">
                    {details.rating}
                  </span>
                  <span className="text-[10px] text-[#8C938E]">
                    ({details.reviewsCount} reviews)
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions (Save & Close) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onToggleSave(station.station_id)}
                aria-label={isSaved ? "Remove from favourites" : "Save to favourites"}
                className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312] ${
                  isSaved
                    ? "bg-[#FEF2F2] border-[#FCA5A5] text-[#EF4444] shadow-xs"
                    : "bg-[#F4F3EE] border-[rgba(17,19,18,0.06)] text-[#525854] hover:bg-[#EAE8E2]"
                }`}
              >
                <Heart
                  size={16}
                  fill={isSaved ? "#EF4444" : "none"}
                  aria-hidden="true"
                />
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close station detail sheet"
                className="w-9 h-9 rounded-full bg-[#F4F3EE] flex items-center justify-center text-[#525854] hover:bg-[#EAE8E2] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Active Reservation Notice Banner if booked */}
          {activeReservation && (
            <div className="p-2.5 bg-[#DCFCE7] border border-[#86EFAC] rounded-xl flex items-center justify-between text-xs animate-in fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 size={16} className="text-[#16A34A] shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-[#15803D] truncate">
                    {activeReservation.bay} Reserved • PIN: {activeReservation.code}
                  </div>
                  <div className="text-[10px] text-[#166534]">
                    Slot held for your {activeVehicle?.model || "EV"} (15 min hold)
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveReservation(null)}
                className="text-[10px] font-bold text-red-600 hover:text-red-700 underline cursor-pointer shrink-0 ml-2"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Operational Status Banner */}
          <div
            className={`p-2.5 rounded-xl border ${currStatus.border} ${currStatus.badgeBg} flex items-start gap-2.5`}
          >
            <div className="mt-0.5 shrink-0">
              <span className="relative flex h-2.5 w-2.5">
                {details.status === "available" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${currStatus.dotBg}`} />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-bold uppercase tracking-wide ${currStatus.badgeText}`}>
                  {currStatus.title}
                </span>
                <span className="text-[9.5px] font-mono text-[#525854] shrink-0 bg-white/70 px-1.5 py-0.5 rounded">
                  {details.sourceLabel.split(" ")[0]}
                </span>
              </div>
              <p className="text-[11px] text-[#334155] mt-0.5 leading-normal">
                {currStatus.desc}
              </p>
            </div>
          </div>

          {/* Connectors Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#111312] font-mono">
                Connectors ({details.connectors.length})
              </h3>
              <span className="text-[10.5px] text-[#525854] font-medium">
                Peak {details.powerKw} kW Rated
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {details.connectors.map((conn) => (
                <div
                  key={conn.id}
                  className="p-2.5 bg-[#FAF9F6] rounded-xl border border-[rgba(17,19,18,0.06)] flex items-center justify-between gap-2 hover:border-[rgba(17,19,18,0.15)] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 bg-white rounded-lg border border-[rgba(17,19,18,0.08)] flex items-center justify-center p-1 shrink-0 shadow-2xs">
                      <Image
                        src={conn.image}
                        alt={`${conn.type} plug`}
                        width={32}
                        height={32}
                        className="object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#111312] truncate">
                        {conn.type}
                      </div>
                      <div className="text-[9.5px] text-[#8C938E] font-mono">
                        {conn.currentType} • {conn.powerKw} kW
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] font-mono uppercase font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                      conn.status === "available"
                        ? "bg-[#DCFCE7] text-[#15803D]"
                        : conn.status === "occupied"
                        ? "bg-[#FEF3C7] text-[#B45309]"
                        : conn.status === "offline"
                        ? "bg-[#FEE2E2] text-[#991B1B]"
                        : "bg-[#F1F5F9] text-[#475569]"
                    }`}
                  >
                    {conn.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Metrics (Distance, Travel Time, Battery on Arrival) */}
          <div className="grid grid-cols-3 gap-2 p-2.5 bg-[#FAF9F6] rounded-xl border border-[rgba(17,19,18,0.06)] text-center">
            <div>
              <div className="text-[9.5px] font-mono uppercase text-[#8C938E]">Distance</div>
              <div className="text-xs font-bold text-[#111312] font-mono mt-0.5">
                {details.distanceKm} km
              </div>
              <div className="text-[9.5px] text-[#525854]">
                ~{details.estimatedDriveTimeMins}m drive
              </div>
            </div>

            <div className="border-x border-[rgba(17,19,18,0.08)]">
              <div className="text-[9.5px] font-mono uppercase text-[#8C938E]">Max Speed</div>
              <div className="text-xs font-bold text-[#16A34A] font-mono mt-0.5">
                {details.powerKw} kW
              </div>
              <div className="text-[9.5px] text-[#525854]">
                {details.bays} Bay{details.bays > 1 ? "s" : ""}
              </div>
            </div>

            <div>
              <div className="text-[9.5px] font-mono uppercase text-[#8C938E]">Arrival Battery</div>
              <div className="text-xs font-bold text-[#111312] font-mono mt-0.5">
                ~{estimatedArrivalSoc}%
              </div>
              <div className="text-[9.5px] text-[#16A34A] font-medium">
                {estimatedArrivalSoc > 20 ? "Good" : "Low"}
              </div>
            </div>
          </div>

          {/* Supplied Tariffs & Pricing Breakdown */}
          <div className="p-3 bg-[#FAF9F6] rounded-xl border border-[rgba(17,19,18,0.06)] space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#111312] font-mono flex items-center gap-1.5">
                <DollarSign size={12} className="text-[#16A34A]" aria-hidden="true" />
                Tariffs & Fees
              </h3>
              <span className="text-[9.5px] font-mono text-[#8C938E]">
                Official Network Rates
              </span>
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between py-0.5 border-b border-[rgba(17,19,18,0.04)]">
                <span className="text-[#525854]">Energy Rate:</span>
                <span className="font-bold text-[#111312] font-mono">
                  {details.tariff.energyRate}
                </span>
              </div>

              <div className="flex items-center justify-between py-0.5 border-b border-[rgba(17,19,18,0.04)]">
                <span className="text-[#525854]">Parking Fee:</span>
                <span className="font-medium text-[#15803D]">
                  {details.tariff.parkingFee}
                </span>
              </div>

              <div className="flex items-center justify-between py-0.5">
                <span className="text-[#525854]">Idle Fee:</span>
                <span className="font-mono text-[#8C938E] text-[10px]">
                  {details.tariff.idleFee}
                </span>
              </div>
            </div>
          </div>

          {/* Operating Hours & Access Restrictions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="p-2.5 bg-[#FAF9F6] rounded-xl border border-[rgba(17,19,18,0.06)]">
              <div className="text-[9.5px] font-mono uppercase text-[#8C938E] flex items-center gap-1">
                <Clock size={10} aria-hidden="true" />
                Operating Hours
              </div>
              <div className="text-xs font-bold text-[#111312] mt-0.5">
                {details.operatingHours}
              </div>
            </div>

            <div className="p-2.5 bg-[#FAF9F6] rounded-xl border border-[rgba(17,19,18,0.06)]">
              <div className="text-[9.5px] font-mono uppercase text-[#8C938E] flex items-center gap-1">
                <ShieldCheck size={10} aria-hidden="true" />
                Access
              </div>
              <div className="text-xs font-bold text-[#111312] mt-0.5">
                {details.accessRestrictions}
              </div>
            </div>
          </div>

          {/* Station Issue Reporting & Community Feedback */}
          <div className="p-2.5 bg-[#FAF9F6] rounded-xl border border-[rgba(17,19,18,0.06)] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Flag size={12} className="text-[#EF4444]" aria-hidden="true" />
                <span className="text-xs font-bold text-[#111312]">Driver Reports</span>
              </div>
              <button
                type="button"
                onClick={() => setIsReportingOpen(true)}
                className="text-xs font-semibold text-[#111312] hover:underline flex items-center gap-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312] rounded-md px-1 py-0.5"
              >
                <span>Report Issue</span>
                <ChevronRight size={11} aria-hidden="true" />
              </button>
            </div>

            {(liveReports.length > 0 ? liveReports : details.communityReports).length > 0 ? (
              <div className="space-y-1.5 pt-0.5">
                {(liveReports.length > 0 ? liveReports : details.communityReports).map((report) => (
                  <div
                    key={report.id}
                    className="p-2 bg-white rounded-xl border border-[rgba(17,19,18,0.06)] text-[10.5px] flex items-start justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold text-[#991B1B]">
                        {report.category}
                      </span>
                      {report.notes && (
                        <p className="text-[#525854] mt-0.5">{report.notes}</p>
                      )}
                    </div>
                    <span className="text-[9px] font-mono text-[#8C938E] shrink-0">
                      {new Date(report.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10.5px] text-[#525854]">
                No operational faults reported by drivers today.
              </p>
            )}
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="shrink-0 p-3 border-t border-[rgba(17,19,18,0.07)] bg-white/95 backdrop-blur-md pb-safe space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onStartNavigation(station)}
              className="min-h-[42px] py-2 px-2 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0284C7]"
            >
              <Navigation size={13} className="text-white fill-white/20" aria-hidden="true" />
              <span>Route</span>
            </button>

            <button
              type="button"
              onClick={() => setIsBookingOpen(true)}
              className={`min-h-[42px] py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer border ${
                activeReservation
                  ? "bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]"
                  : "bg-[#E0F2FE] hover:bg-[#BAE6FD] text-[#0369A1] border-[#0284C7]/30 shadow-xs"
              }`}
            >
              <CalendarCheck size={13} aria-hidden="true" />
              <span>{activeReservation ? "Bay Booked" : "Book Bay"}</span>
            </button>

            <button
              type="button"
              onClick={() => onStartCharging(station)}
              className="min-h-[42px] py-2 px-2 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-[#16A34A]"
            >
              <Zap size={13} aria-hidden="true" className="text-white" />
              <span>Charge</span>
            </button>
          </div>

          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${details.latitude},${details.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[30px] py-1 bg-[#FAF9F6] border border-[rgba(17,19,18,0.08)] text-[#525854] hover:text-[#111312] rounded-lg text-[10.5px] font-semibold flex items-center justify-center gap-1 hover:bg-[#F4F3EE] transition-all cursor-pointer"
          >
            <span>Open in Google Maps</span>
            <ExternalLink size={10} aria-hidden="true" />
          </a>
        </div>
      </aside>

      {/* ── Booking / Reservation Modal (Bounded Strictly Inside Phone) ── */}
      {isBookingOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reserve Charging Bay"
          className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in"
        >
          <div className="bg-white rounded-3xl p-4 w-full max-w-sm border border-slate-200 shadow-2xl space-y-3.5 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#E0F2FE] border border-[#BAE6FD] flex items-center justify-center text-[#0284C7]">
                  <CalendarCheck size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#111312]">
                    Reserve Charging Bay
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Guaranteed slot with 15-min hold
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBookingOpen(false)}
                aria-label="Close reservation modal"
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {bookingConfirmedModal ? (
              <div className="p-4 bg-[#DCFCE7] border border-[#86EFAC] rounded-2xl text-center space-y-2">
                <CheckCircle2 size={28} className="text-[#16A34A] mx-auto" />
                <div className="text-sm font-extrabold text-[#15803D]">
                  Slot Reserved Successfully!
                </div>
                <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-200 text-xs font-mono space-y-1">
                  <div className="text-slate-600">Assigned: <span className="font-bold text-slate-900">{selectedBay}</span></div>
                  <div className="text-slate-600">Station Code: <span className="font-bold text-[#0284C7]">{activeReservation?.code}</span></div>
                  <div className="text-emerald-700 font-semibold text-[11px]">Hold expires in 15:00 minutes</div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBookingOpen(false);
                      setBookingConfirmedModal(false);
                    }}
                    className="flex-1 py-2 bg-white border border-emerald-300 text-[#15803D] text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBookingOpen(false);
                      setBookingConfirmedModal(false);
                      onStartNavigation(station);
                    }}
                    className="flex-1 py-2 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Navigation size={12} />
                    <span>Navigate</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Station & Vehicle Summary */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="font-bold text-slate-900 truncate">{details.name}</div>
                  <div className="text-[10.5px] text-slate-500">
                    Vehicle: {activeVehicle?.make} {activeVehicle?.model} ({activeVehicle?.plugType || "CCS2"})
                  </div>
                </div>

                {/* Bay Selection */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    Select Charging Stall / Bay
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Bay #01 (CCS2 60kW)", "Bay #02 (CCS2 60kW)"].map((b, idx) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setSelectedBay(b)}
                        className={`p-2 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                          selectedBay === b
                            ? "bg-[#E0F2FE] border-[#0284C7] text-[#0369A1] font-bold shadow-2xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-[10px] font-mono text-slate-500">Stall 0{idx + 1}</div>
                        <div className="text-xs font-semibold leading-tight">{b.split(" ")[0]} {b.split(" ")[1]}</div>
                        <div className="text-[9.5px] text-[#16A34A] font-semibold">Available</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hold Duration Choice */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    Hold Duration
                  </label>
                  <div className="flex gap-2">
                    {[
                      { mins: 15, label: "15 min Standard", fee: "Free" },
                      { mins: 30, label: "30 min Priority", fee: "₹25" },
                    ].map((opt) => (
                      <button
                        key={opt.mins}
                        type="button"
                        onClick={() => setHoldMins(opt.mins)}
                        className={`flex-1 p-2 rounded-xl border text-center text-xs transition-all cursor-pointer ${
                          holdMins === opt.mins
                            ? "bg-[#DCFCE7] border-[#16A34A] text-[#15803D] font-bold shadow-2xs"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div>{opt.label}</div>
                        <div className="text-[10px] font-mono text-slate-500">{opt.fee}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Confirm Action */}
                <button
                  type="button"
                  onClick={() => {
                    const code = `EV-${Math.floor(1000 + Math.random() * 9000)}`;
                    setActiveReservation({
                      stationId: station.station_id,
                      bay: selectedBay,
                      code,
                      expiresAt: Date.now() + holdMins * 60 * 1000,
                    });
                    setBookingConfirmedModal(true);
                  }}
                  className="w-full py-2.5 bg-[#16A34A] hover:bg-[#15803D] active:scale-98 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 size={14} />
                  <span>Confirm & Lock {selectedBay.split(" ")[0]} {selectedBay.split(" ")[1]}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Issue Reporting Modal — strictly bounded inside phone */}
      {isReportingOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report Station Issue"
          className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in"
        >
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm border border-[rgba(17,19,18,0.1)] shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flag size={16} className="text-[#EF4444]" aria-hidden="true" />
                <h3 className="text-sm font-bold text-[#111312]">
                  Report Station Issue
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReportingOpen(false)}
                aria-label="Close reporting modal"
                className="w-8 h-8 rounded-full bg-[#F4F3EE] flex items-center justify-center text-[#525854] hover:bg-[#EAE8E2] cursor-pointer"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            {reportSuccessMessage ? (
              <div className="p-4 bg-[#DCFCE7] border border-[#86EFAC] rounded-2xl text-center space-y-1">
                <CheckCircle2 size={24} className="text-[#16A34A] mx-auto" />
                <div className="text-xs font-bold text-[#15803D]">Thank You!</div>
                <p className="text-[11px] text-[#166534]">{reportSuccessMessage}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitReport} className="space-y-3.5">
                <div>
                  <label htmlFor={categoryId} className="block text-xs font-semibold text-[#111312] mb-1">
                    Issue Category
                  </label>
                  <select
                    id={categoryId}
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value as StationReport["category"])}
                    className="w-full text-xs p-2.5 rounded-xl border border-[rgba(17,19,18,0.15)] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                  >
                    <option value="Broken / Damaged Connector">Broken / Damaged Connector</option>
                    <option value="Charger Powered Down / Offline">Charger Powered Down / Offline</option>
                    <option value="ICEing (Blocked by Non-EV)">ICEing (Blocked by Non-EV)</option>
                    <option value="Payment Terminal Failed">Payment Terminal Failed</option>
                    <option value="Access Gate Locked / Closed">Access Gate Locked / Closed</option>
                    <option value="Incorrect Location / Wrong Pin">Incorrect Location / Wrong Pin</option>
                  </select>
                </div>

                <div>
                  <label htmlFor={connectorId} className="block text-xs font-semibold text-[#111312] mb-1">
                    Affected Connector
                  </label>
                  <select
                    id={connectorId}
                    value={selectedConnectorForReport}
                    onChange={(e) => setSelectedConnectorForReport(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-[rgba(17,19,18,0.15)] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                  >
                    <option value="All Connectors">Entire Station / All Plugs</option>
                    {details.connectors.map((c) => (
                      <option key={c.id} value={c.type}>
                        {c.type} ({c.powerKw} kW)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={notesId} className="block text-xs font-semibold text-[#111312] mb-1">
                    Driver Notes (Optional)
                  </label>
                  <textarea
                    id={notesId}
                    value={reportNotes}
                    onChange={(e) => setReportNotes(e.target.value)}
                    placeholder="e.g. Red fault LED blinking on bay #2"
                    rows={2}
                    className="w-full text-xs p-2.5 rounded-xl border border-[rgba(17,19,18,0.15)] bg-white text-[#111312] focus:outline-2 focus:outline-[#111312]"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsReportingOpen(false)}
                    className="flex-1 py-2.5 bg-[#F4F3EE] text-[#525854] text-xs font-semibold rounded-xl hover:bg-[#EAE8E2] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    Submit Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
