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
} from "lucide-react";
import { ParkingBookingModal } from "./ParkingBookingModal";
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
  onOpenBookingModal?: () => void;
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
  onOpenBookingModal,
}) => {
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isReportingOpen, setIsReportingOpen] = useState(false);
  const [reportSuccessMessage, setReportSuccessMessage] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState<StationReport["category"]>(
    "Broken / Damaged Connector"
  );
  const [reportNotes, setReportNotes] = useState("");
  const [selectedConnectorForReport, setSelectedConnectorForReport] = useState<string>("All Connectors");
  const [liveReports, setLiveReports] = useState<StationReport[]>([]);

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
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Drawer Sheet */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${details.name} station details`}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] bg-[#FFFFFF] rounded-t-[32px] border-t border-[rgba(17,19,18,0.08)] shadow-2xl flex flex-col overflow-hidden max-w-lg mx-auto animate-in slide-in-from-bottom duration-300"
      >
        {/* Drag / Pull handle */}
        <div className="w-full pt-3 pb-1 flex justify-center shrink-0 cursor-grab">
          <div className="w-12 h-1.5 bg-[#E5E5DF] rounded-full" />
        </div>

        {/* Scrollable Container */}
        <div className="overflow-y-auto px-5 pt-2 pb-8 space-y-5 flex-1 overscroll-contain">
          
          {/* Header Section (Matching reference photo styling) */}
          <div className="flex items-start justify-between gap-3 pt-1">
            <div className="flex items-start gap-3.5">
              {/* Charger hardware image */}
              <div className="relative w-14 h-16 bg-[#FAF9F6] rounded-2xl border border-[rgba(17,19,18,0.08)] flex items-center justify-center shrink-0 p-1 overflow-hidden shadow-2xs">
                <Image
                  src="/images/charger-hub-3d-reference.png"
                  alt="Charger terminal visual"
                  width={56}
                  height={64}
                  className="object-contain"
                  priority
                />
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-[#8C938E] bg-[#F4F3EE] px-2 py-0.5 rounded-md">
                    {details.operator}
                  </span>
                  <span className="text-[10px] font-mono text-[#8C938E] flex items-center gap-1">
                    <Clock size={10} aria-hidden="true" />
                    {details.lastUpdatedText}
                  </span>
                </div>

                <h2 className="text-lg font-bold text-[#111312] mt-1 leading-snug">
                  {details.name}
                </h2>

                <p className="text-xs text-[#525854] mt-0.5 leading-normal">
                  {details.address}
                </p>

                {/* Rating & Reviews row */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        size={11}
                        className={i <= 4 ? "fill-[#F59E0B] text-[#F59E0B]" : "fill-none text-[#F59E0B]/40"}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-[#111312] font-mono">
                    {details.rating}
                  </span>
                  <span className="text-[11px] text-[#8C938E]">
                    ({details.reviewsCount} reviews)
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions (Save & Close) */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onToggleSave(station.station_id)}
                aria-label={isSaved ? "Remove from favourites" : "Save to favourites"}
                className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312] ${
                  isSaved
                    ? "bg-[#FEF2F2] border-[#FCA5A5] text-[#EF4444] shadow-xs"
                    : "bg-[#F4F3EE] border-[rgba(17,19,18,0.06)] text-[#525854] hover:bg-[#EAE8E2]"
                }`}
              >
                <Heart
                  size={18}
                  fill={isSaved ? "#EF4444" : "none"}
                  aria-hidden="true"
                />
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close station detail sheet"
                className="w-11 h-11 rounded-full bg-[#F4F3EE] flex items-center justify-center text-[#525854] hover:bg-[#EAE8E2] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Operational Status Banner (Honest 4-state indicator) */}
          <div
            className={`p-3.5 rounded-2xl border ${currStatus.border} ${currStatus.badgeBg} flex items-start gap-3`}
          >
            <div className="mt-0.5 shrink-0">
              <span className="relative flex h-3 w-3">
                {details.status === "available" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${currStatus.dotBg}`} />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-bold uppercase tracking-wide ${currStatus.badgeText}`}>
                  {currStatus.title}
                </span>
                <span className="text-[10px] font-mono text-[#525854] shrink-0 bg-white/70 px-2 py-0.5 rounded-md">
                  {details.sourceLabel.split(" ")[0]}
                </span>
              </div>
              <p className="text-xs text-[#334155] mt-0.5 leading-relaxed">
                {currStatus.desc}
              </p>
            </div>
          </div>

          {/* Connectors Section (Visual Plug Cards matching prompt design) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#111312] font-mono">
                Connectors ({details.connectors.length})
              </h3>
              <span className="text-[11px] text-[#525854] font-medium">
                Peak {details.powerKw} kW Rated
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {details.connectors.map((conn) => (
                <div
                  key={conn.id}
                  className="p-3 bg-[#FAF9F6] rounded-2xl border border-[rgba(17,19,18,0.06)] flex items-center justify-between gap-3 hover:border-[rgba(17,19,18,0.15)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-xl border border-[rgba(17,19,18,0.08)] flex items-center justify-center p-1.5 shrink-0 shadow-2xs">
                      <Image
                        src={conn.image}
                        alt={`${conn.type} plug`}
                        width={38}
                        height={38}
                        className="object-contain"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#111312]">
                        {conn.type}
                      </div>
                      <div className="text-[10px] text-[#8C938E] font-mono mt-0.5">
                        {conn.currentType} • {conn.powerKw} kW
                      </div>
                      {conn.voltage && (
                        <div className="text-[9.5px] text-[#525854] mt-0.5">
                          {conn.voltage}V • {conn.amps}A
                        </div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`text-[9.5px] font-mono uppercase font-semibold px-2 py-1 rounded-md shrink-0 ${
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
          <div className="grid grid-cols-3 gap-2 p-3.5 bg-[#FAF9F6] rounded-2xl border border-[rgba(17,19,18,0.06)] text-center">
            <div>
              <div className="text-[10px] font-mono uppercase text-[#8C938E]">Distance</div>
              <div className="text-sm font-bold text-[#111312] font-mono mt-0.5">
                {details.distanceKm} km
              </div>
              <div className="text-[10px] text-[#525854]">
                ~{details.estimatedDriveTimeMins} mins drive
              </div>
            </div>

            <div className="border-x border-[rgba(17,19,18,0.08)]">
              <div className="text-[10px] font-mono uppercase text-[#8C938E]">Max Speed</div>
              <div className="text-sm font-bold text-[#16A34A] font-mono mt-0.5">
                {details.powerKw} kW
              </div>
              <div className="text-[10px] text-[#525854]">
                {details.bays} Bay{details.bays > 1 ? "s" : ""} Total
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase text-[#8C938E]">Arrival Battery</div>
              <div className="text-sm font-bold text-[#111312] font-mono mt-0.5">
                ~{estimatedArrivalSoc}%
              </div>
              <div className="text-[10px] text-[#16A34A] font-medium">
                {estimatedArrivalSoc > 20 ? "Good battery" : "Low battery"}
              </div>
            </div>
          </div>

          {/* Supplied Tariffs & Pricing Breakdown */}
          <div className="p-4 bg-[#FAF9F6] rounded-2xl border border-[rgba(17,19,18,0.06)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#111312] font-mono flex items-center gap-1.5">
                <DollarSign size={13} className="text-[#16A34A]" aria-hidden="true" />
                Supplied Tariffs & Fees
              </h3>
              <span className="text-[10px] font-mono text-[#8C938E]">
                Official Network Rates
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-[rgba(17,19,18,0.04)]">
                <span className="text-[#525854]">Energy Rate:</span>
                <span className="font-bold text-[#111312] font-mono">
                  {details.tariff.energyRate}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[rgba(17,19,18,0.04)]">
                <span className="text-[#525854]">Parking Fee:</span>
                <span className="font-medium text-[#15803D]">
                  {details.tariff.parkingFee}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[rgba(17,19,18,0.04)]">
                <span className="text-[#525854]">Connection / Session Fee:</span>
                <span className="font-medium text-[#111312]">
                  {details.tariff.sessionFee}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-[#525854]">Overstay / Idle Fee:</span>
                <span className="font-mono text-[#8C938E] text-[11px]">
                  {details.tariff.idleFee}
                </span>
              </div>
            </div>
          </div>

          {/* Operating Hours & Access Restrictions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3.5 bg-[#FAF9F6] rounded-2xl border border-[rgba(17,19,18,0.06)]">
              <div className="text-[10px] font-mono uppercase text-[#8C938E] flex items-center gap-1">
                <Clock size={11} aria-hidden="true" />
                Operating Hours
              </div>
              <div className="text-xs font-bold text-[#111312] mt-1">
                {details.operatingHours}
              </div>
            </div>

            <div className="p-3.5 bg-[#FAF9F6] rounded-2xl border border-[rgba(17,19,18,0.06)]">
              <div className="text-[10px] font-mono uppercase text-[#8C938E] flex items-center gap-1">
                <ShieldCheck size={11} aria-hidden="true" />
                Access Restrictions
              </div>
              <div className="text-xs font-bold text-[#111312] mt-1">
                {details.accessRestrictions}
              </div>
            </div>
          </div>

          {/* Station Issue Reporting & Community Feedback */}
          <div className="p-3.5 bg-[#FAF9F6] rounded-2xl border border-[rgba(17,19,18,0.06)] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Flag size={13} className="text-[#EF4444]" aria-hidden="true" />
                <span className="text-xs font-bold text-[#111312]">Driver Reports</span>
              </div>
              <button
                type="button"
                onClick={() => setIsReportingOpen(true)}
                className="text-xs font-semibold text-[#111312] hover:underline flex items-center gap-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312] rounded-md px-1 py-0.5"
              >
                <span>Report Issue</span>
                <ChevronRight size={12} aria-hidden="true" />
              </button>
            </div>

            {(liveReports.length > 0 ? liveReports : details.communityReports).length > 0 ? (
              <div className="space-y-1.5 pt-1">
                {(liveReports.length > 0 ? liveReports : details.communityReports).map((report) => (
                  <div
                    key={report.id}
                    className="p-2 bg-white rounded-xl border border-[rgba(17,19,18,0.06)] text-[11px] flex items-start justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold text-[#991B1B]">
                        {report.category}
                      </span>
                      {report.notes && (
                        <p className="text-[#525854] mt-0.5">{report.notes}</p>
                      )}
                    </div>
                    <span className="text-[9.5px] font-mono text-[#8C938E] shrink-0">
                      {new Date(report.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[#525854]">
                No operational faults reported by drivers today.
              </p>
            )}
          </div>

          {/* Primary Action Button Bar */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => onStartNavigation(station)}
              className="w-full min-h-[52px] py-3.5 px-6 bg-[#111312] text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#252826] active:scale-[0.99] transition-all shadow-md cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
            >
              <Navigation size={15} className="text-[#C8F369]" aria-hidden="true" />
              <span>Start Navigation</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onOpenBookingModal) {
                    onOpenBookingModal();
                  } else {
                    setIsBookingModalOpen(true);
                  }
                }}
                className="min-h-[44px] py-2.5 bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#DCFCE7] active:scale-98 transition-all shadow-2xs cursor-pointer focus-visible:outline-2 focus-visible:outline-[#15803D]"
              >
                <Zap size={14} className="text-[#16A34A]" aria-hidden="true" />
                <span>Book Stall & Charge</span>
              </button>

              <button
                type="button"
                onClick={() => onStartCharging(station)}
                className="min-h-[44px] py-2.5 bg-[#C8F369] text-[#111312] border border-[#111312] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#BCE95D] active:scale-98 transition-all shadow-2xs cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
              >
                <Zap size={14} aria-hidden="true" />
                <span>Start Charging</span>
              </button>
            </div>

            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${details.latitude},${details.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[36px] py-2 bg-[#FAF9F6] border border-[rgba(17,19,18,0.08)] text-[#525854] hover:text-[#111312] rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:bg-[#F4F3EE] transition-all cursor-pointer"
            >
              <span>Open in Google Maps</span>
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </div>

        </div>
      </aside>

      {/* Parking Spot Booking Modal */}
      <ParkingBookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        station={station}
        onStartNavigation={(st: any) => onStartNavigation(st)}
        activeVehicle={activeVehicle}
      />

      {/* Issue Reporting Modal */}
      {isReportingOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report Station Issue"
          className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
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
                    className="flex-1 py-2.5 bg-[#111312] text-white text-xs font-bold rounded-xl hover:bg-[#252826] cursor-pointer"
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
