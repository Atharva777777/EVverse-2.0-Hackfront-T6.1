"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  Navigation,
  UserRound,
  CheckCircle2,
  AlertTriangle,
  Zap,
  BatteryCharging,
  Search,
  X,
  Compass,
  CalendarCheck,
} from "lucide-react";
import type { EVVehicle } from "./VehicleCockpit";
import type {
  JourneyAnalysis,
  JourneyOption,
  JourneyAiStatus,
  JourneyAnalyzeRequest,
  JourneyConstraints,
  JourneyIntentResult,
  JourneyPreference,
  JourneyStop,
  LiveStation,
} from "@/types/api";
import {
  REGIONAL_CORRIDOR_DESTINATIONS,
  ALL_INDIA_POPULAR_DESTINATIONS,
  DELHI_CORRIDORS,
  type JourneyDestination,
} from "@/lib/journeyRouting";
import { calculateHaversineKm } from "@/lib/stationAdapter";
import { CITY_CONFIGS } from "@/components/CountryCitySelector";
import { fetchRoadRoute } from "@/lib/routeService";
import {
  analyzeJourney,
  fetchJourneyPreferences,
  explainJourney,
  fetchAiStatus,
  recordJourneyStarted,
} from "@/lib/journeyApi";
import { JourneyPreferences } from "./JourneyPreferences";
import { JourneyAskBar } from "./JourneyAskBar";

interface JourneyPlannerProps {
  activeVehicle: EVVehicle;
  currentBatteryPct: number;
  candidateStations: LiveStation[];
  userLocation: [number, number];
  deviceLocation?: [number, number] | null;
  deviceAccuracy?: number | null;
  locationStatus?: string;
  onAcquireLocation?: () => void;
  selectedCity?: string;
  onCityChange?: (city: string) => void;
  onBatteryChange?: (batteryPct: number) => void;
  onInspectStation?: (stationId: string, stationName?: string) => void;
  onStartTripNavigation: (dest: {
    name: string;
    latitude: number;
    longitude: number;
    primaryStation?: LiveStation;
    originCoords?: [number, number];
  }) => void;
}

type Style = "eco" | "normal" | "sport";
type Climate = "off" | "eco" | "normal" | "max";

const RESERVES = [10, 15, 20, 30];
const LOADS: { label: string; kg: number }[] = [
  { label: "Just me", kg: 75 },
  { label: "2 people", kg: 150 },
  { label: "Full car", kg: 300 },
];

const EXPLAIN_LANGS = ["en-IN", "hi-IN", "mr-IN", "ta-IN", "te-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN", "od-IN"];

function constraintLabel(k: keyof JourneyConstraints, v: string | number): string {
  if (k === "max_charging_stops") return v === 0 ? "No charging stops" : `Up to ${v} stop${v === 1 ? "" : "s"}`;
  if (k === "charging_speed") return v === "fast" ? "Fast charging" : "Standard charging";
  const map: Record<string, string> = {
    fewer_stops: "Fewer stops",
    reliable_chargers: "Reliable chargers",
    safer: "Safer",
    faster: "Faster",
    economical: "Most economical",
  };
  return map[String(v)] ?? String(v);
}

interface RouteInfo {
  key: string;
  distanceKm: number;
  durationMins: number | null;
  source: "osrm" | "corridor_table";
}

const mins = (m: number | null | undefined) => {
  if (m == null) return "";
  const r = Math.round(m);
  return r >= 60 ? `${Math.floor(r / 60)} h ${r % 60 ? `${r % 60} min` : ""}`.trim() : `${r} min`;
};

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { v: T; t: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all active:scale-95 ${
            value === o.v
              ? "bg-[#DCFCE7] text-[#15803D] border-[#16A34A] shadow-2xs ring-1 ring-[#16A34A]/25"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
          }`}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

function StopCard({
  stop,
  chosen,
  onChoose,
  onInspect,
}: {
  stop: JourneyStop;
  chosen: boolean;
  onChoose: () => void;
  onInspect?: () => void;
}) {
  const power =
    stop.power_basis === "listed" && stop.power_kw_listed != null
      ? `${stop.power_kw_listed.toFixed(0)} kW listed`
      : stop.power_basis === "registry_unverified" && stop.assumed_power_kw != null
        ? `~${stop.assumed_power_kw.toFixed(0)} kW (unverified)`
        : "Power not listed";
  return (
    <div
      className={`rounded-xl border p-4 bg-white transition-all ${
        chosen ? "border-[#16A34A] shadow-xs ring-1 ring-[#16A34A]/20" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium font-sans">
            {stop.role === "primary" ? "Charging stop" : "Backup"}
          </div>
          <div className="text-sm font-semibold text-[#0F172A] mt-0.5 font-sans">{stop.name}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onInspect && (
            <button
              type="button"
              onClick={onInspect}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#E0F2FE] hover:bg-[#BAE6FD] text-[#0369A1] border border-[#0284C7]/30 transition-all cursor-pointer flex items-center gap-1 font-sans"
              title="Inspect & Book Station Bay"
            >
              <CalendarCheck size={12} />
              <span>Book</span>
            </button>
          )}
          <button
            type="button"
            onClick={onChoose}
            disabled={chosen}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all font-sans ${
              chosen
                ? "bg-[#16A34A] text-white border-[#16A34A] shadow-2xs"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            }`}
          >
            {chosen ? "Selected" : "Use this one"}
          </button>
        </div>
      </div>

      <p className="text-sm text-[#3B403D] mt-2 leading-snug font-sans">{stop.why}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-sans">
        <div>
          <dt className="text-[#767D78]">Off your route</dt>
          <dd className="font-medium">{stop.detour_km <= 1 ? "Almost on it" : `+${stop.detour_km.toFixed(1)} km`}</dd>
        </div>
        <div>
          <dt className="text-[#767D78]">Connector</dt>
          <dd className="font-medium">{stop.connectors_matched[0] ?? "—"}{stop.ac_only ? " · slow AC" : ""}</dd>
        </div>
        <div>
          <dt className="text-[#767D78]">Power</dt>
          <dd className="font-medium">{power}</dd>
        </div>
        <div>
          <dt className="text-[#767D78]">Charging</dt>
          <dd className="font-medium">
            ~{mins(stop.charge_mins)} to {stop.charge_to_pct.toFixed(0)}%{stop.charge_time_is_estimate ? " (estimate)" : ""}
          </dd>
        </div>
      </dl>

      <div className="mt-3 pt-3 border-t border-black/[0.06] text-[11px] text-[#767D78] leading-snug font-sans">
        <div>{stop.status_label}</div>
        <div className="mt-0.5">Source: {stop.data_source} · {stop.freshness_label}</div>
        {stop.recent_driver_reports > 0 && <div className="mt-0.5">{stop.recent_driver_reports} recent driver report(s)</div>}
      </div>
    </div>
  );
}

export function JourneyPlanner({
  activeVehicle,
  currentBatteryPct,
  candidateStations,
  userLocation,
  deviceLocation,
  deviceAccuracy,
  locationStatus,
  onAcquireLocation,
  selectedCity = "Delhi",
  onCityChange,
  onBatteryChange,
  onInspectStation,
  onStartTripNavigation,
}: JourneyPlannerProps) {
  // ── Regional Base Corridors ──
  const baseCorridors = useMemo(
    () => REGIONAL_CORRIDOR_DESTINATIONS[selectedCity] || DELHI_CORRIDORS,
    [selectedCity],
  );

  // ── Custom and Pan-India Searched Destinations ──
  const [customDestinations, setCustomDestinations] = useState<JourneyDestination[]>([]);

  // ── All-India Destination Search State ──
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // ── Combined Corridors List (custom searched destinations prioritized) ──
  const corridors = useMemo(() => {
    const list = [...baseCorridors];
    for (const c of customDestinations) {
      if (!list.some((existing) => existing.id === c.id || existing.name === c.name)) {
        list.unshift(c);
      }
    }
    return list;
  }, [baseCorridors, customDestinations]);

  // ── Active Destination Selection ──
  const [destId, setDestId] = useState<string | null>(null);
  const destination: JourneyDestination =
    corridors.find((c) => c.id === destId) ??
    customDestinations.find((c) => c.id === destId) ??
    corridors[0];

  // Reorder corridors so selected destination appears first in the pill row
  const displayCorridors = useMemo(() => {
    if (!destId) return corridors;
    const selected = corridors.find((c) => c.id === destId);
    if (!selected) return corridors;
    return [selected, ...corridors.filter((c) => c.id !== destId)];
  }, [corridors, destId]);

  // Reset destination if previously selected destination is missing from current corridors
  useEffect(() => {
    if (
      destId &&
      !corridors.some((c) => c.id === destId) &&
      !customDestinations.some((c) => c.id === destId)
    ) {
      setDestId(null);
    }
  }, [corridors, customDestinations, destId]);

  // ── Inputs ──
  const [battery, setBattery] = useState<number>(currentBatteryPct);
  const [reserve, setReserve] = useState<number>(15);
  const [style, setStyle] = useState<Style>("normal");
  const [climate, setClimate] = useState<Climate>("normal");
  const [payload, setPayload] = useState<number>(75);
  const [showDetails, setShowDetails] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [cityCentre, setCityCentre] = useState(false);

  // ── Scan EV Battery Telemetry Simulation ──
  const [isScanningBattery, setIsScanningBattery] = useState(false);
  const [bmsSyncInfo, setBmsSyncInfo] = useState<string | null>(null);

  const handleScanEvBattery = () => {
    setIsScanningBattery(true);
    setBmsSyncInfo(null);
    setTimeout(() => {
      const livePct = Math.round(activeVehicle.currentBatteryPct);
      setBattery(livePct);
      onBatteryChange?.(livePct);
      setIsScanningBattery(false);
      setBmsSyncInfo(`⚡ Connected to ${activeVehicle.make} ${activeVehicle.model} BMS · ${livePct}% SoC`);
      setTimeout(() => setBmsSyncInfo(null), 5000);
    }, 600);
  };

  // ── Scan GPS Location & Auto-detect Nearest Hub ──
  const [isScanningLocation, setIsScanningLocation] = useState(false);
  const [locationSyncInfo, setLocationSyncInfo] = useState<string | null>(null);

  const handleScanLocation = () => {
    setIsScanningLocation(true);
    setLocationSyncInfo(null);
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsScanningLocation(false);
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          onAcquireLocation?.();

          // Auto-detect closest Indian metro hub
          const dToDelhi = Math.hypot(lat - 28.6139, lng - 77.2090) * 111;
          const dToMumbai = Math.hypot(lat - 19.0760, lng - 72.8777) * 111;
          const dToPune = Math.hypot(lat - 18.5204, lng - 73.8567) * 111;
          const dToBlr = Math.hypot(lat - 12.9716, lng - 77.5946) * 111;
          const dToJaipur = Math.hypot(lat - 26.9124, lng - 75.7873) * 111;

          let detected = "Delhi";
          if (dToDelhi <= 150) detected = "Delhi";
          else if (dToMumbai <= 80) detected = "Mumbai";
          else if (dToPune <= 80) detected = "Pune";
          else if (dToJaipur <= 120) detected = "Jaipur";
          else if (dToBlr <= 120) detected = "Bengaluru";

          if (onCityChange && detected !== selectedCity) {
            onCityChange(detected);
          }
          setLocationSyncInfo(`📍 Location Acquired: ${detected} Region (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`);
          setTimeout(() => setLocationSyncInfo(null), 5000);
        },
        (err) => {
          setIsScanningLocation(false);
          onAcquireLocation?.();
          setLocationSyncInfo(`📍 GPS Signal: approximate (${err.message})`);
          setTimeout(() => setLocationSyncInfo(null), 4000);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setIsScanningLocation(false);
      onAcquireLocation?.();
    }
  };

  // Follow the vehicle / battery reading when they change
  const [seen, setSeen] = useState({ id: activeVehicle.id, b: currentBatteryPct });
  if (seen.id !== activeVehicle.id || seen.b !== currentBatteryPct) {
    setSeen({ id: activeVehicle.id, b: currentBatteryPct });
    setBattery(currentBatteryPct);
  }

  const origin: [number, number] | null = deviceLocation ?? userLocation;

  // ── Pan-India Search Matching ──
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matches: JourneyDestination[] = [];
    const seenNames = new Set<string>();

    const refLat = origin ? origin[0] : (deviceLocation ? deviceLocation[0] : 28.6139);
    const refLng = origin ? origin[1] : (deviceLocation ? deviceLocation[1] : 77.2090);

    for (const d of ALL_INDIA_POPULAR_DESTINATIONS) {
      if (d.name.toLowerCase().includes(q) || d.city.toLowerCase().includes(q)) {
        seenNames.add(d.name.toLowerCase());
        const dist = Math.round(calculateHaversineKm(refLat, refLng, d.lat, d.lng));
        matches.push({ ...d, distanceKm: dist });
      }
    }

    for (const [cityName, conf] of Object.entries(CITY_CONFIGS)) {
      if (
        (cityName.toLowerCase().includes(q) || conf.desc.toLowerCase().includes(q)) &&
        !seenNames.has(cityName.toLowerCase())
      ) {
        seenNames.add(cityName.toLowerCase());
        const dist = Math.round(calculateHaversineKm(refLat, refLng, conf.lat, conf.lng));
        matches.push({
          id: `city-${cityName.toLowerCase().replace(/\s+/g, "-")}`,
          name: `${cityName} (${conf.country})`,
          city: cityName,
          lat: conf.lat,
          lng: conf.lng,
          distanceKm: dist,
          elevationGainM: 50,
        });
      }
    }

    return matches.slice(0, 8);
  }, [searchQuery, origin, deviceLocation]);

  const handleSelectSearchResult = (dest: JourneyDestination) => {
    const existing = baseCorridors.find(
      (c) => c.id === dest.id || c.name.toLowerCase() === dest.name.toLowerCase()
    );
    if (existing) {
      setDestId(existing.id);
    } else {
      setCustomDestinations((prev) => [dest, ...prev.filter((d) => d.id !== dest.id)]);
      setDestId(dest.id);
    }
    setSearchQuery("");
    setIsSearchOpen(false);
  };

  // ── AI assistance (optional; everything below works without it) ──
  const [ai, setAi] = useState<JourneyAiStatus | null>(null);
  const [constraints, setConstraints] = useState<JourneyConstraints>({});
  const [explainLang, setExplainLang] = useState("en-IN");

  useEffect(() => {
    fetchAiStatus().then(setAi).catch(() => setAi(null));
  }, []);

  /** Apply a proposal the backend has already validated. Nothing here trusts model output directly. */
  const onIntent = useCallback(
    (r: JourneyIntentResult) => {
      const a = r.applied;
      if (a.destination) {
        const d = corridors.find((c) => c.name === a.destination);
        if (d) setDestId(d.id);
      }
      if (a.battery_pct != null) setBattery(a.battery_pct);
      if (a.reserve_pct != null) setReserve(a.reserve_pct);
      if (a.driving_style) setStyle(a.driving_style);
      if (a.hvac_mode) setClimate(a.hvac_mode);
      if (Object.keys(r.constraints).length) setConstraints((prev) => ({ ...prev, ...r.constraints }));
      if (r.language && r.language !== "en-IN" && ai?.languages.some((l) => l.code === r.language)) setExplainLang(r.language);
    },
    [corridors, ai],
  );

  // ── Preferences ──
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsVersion, setPrefsVersion] = useState(0);
  const reserveSeeded = useRef(false);

  const onPrefsChanged = useCallback((p: JourneyPreference[]) => {
    const r = p.find((x) => x.key === "default_reserve_pct");
    if (r?.is_set && typeof r.value === "number") setReserve(r.value);
    setPrefsVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (reserveSeeded.current) return;
    reserveSeeded.current = true;
    fetchJourneyPreferences()
      .then((res) => {
        const r = res.preferences.find((x) => x.key === "default_reserve_pct");
        if (r?.is_set && typeof r.value === "number") setReserve(r.value);
      })
      .catch(() => undefined); // personalisation is optional
  }, []);

  // ── Route (real road distance when available) ──
  const routeKey = origin ? `${origin[0].toFixed(3)},${origin[1].toFixed(3)}>${destination.id}` : "";
  const [route, setRoute] = useState<RouteInfo | null>(null);

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    const key = routeKey;
    fetchRoadRoute({
      origin,
      destination: [destination.lat, destination.lng],
      destinationName: destination.name,
    })
      .then((r) => {
        if (cancelled) return;
        if (r.success && r.totalDistanceKm > 0) {
          setRoute({ key, distanceKm: r.totalDistanceKm, durationMins: r.totalDurationMins, source: "osrm" });
        } else {
          setRoute({ key, distanceKm: destination.distanceKm, durationMins: null, source: "corridor_table" });
        }
      })
      .catch(() => {
        if (!cancelled) setRoute({ key, distanceKm: destination.distanceKm, durationMins: null, source: "corridor_table" });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  const routeReady = route && route.key === routeKey ? route : null;

  // The single description of "this journey", shared by planning and (optional) explanation.
  const request = useMemo<JourneyAnalyzeRequest | null>(() => {
    if (!origin || !routeReady) return null;
    return {
      vehicle: {
        id: activeVehicle.id,
        make: activeVehicle.make,
        model: activeVehicle.model,
        batteryKwh: activeVehicle.batteryKwh,
        usableKwh: activeVehicle.usableKwh,
        efficiencyKwh100km: activeVehicle.efficiencyKwh100km,
        maxDcSpeedKw: activeVehicle.maxDcSpeedKw,
        plugType: activeVehicle.plugType,
      },
      distance_km: routeReady.distanceKm,
      duration_mins: routeReady.durationMins,
      start_battery_pct: battery,
      reserve_buffer_pct: reserve,
      elevation_gain_m: destination.elevationGainM || 0,
      payload_kg: payload,
      hvac_mode: climate,
      driving_style: style,
      origin_coords: origin,
      destination_coords: [destination.lat, destination.lng],
      city: selectedCity,
      route_source: routeReady.source,
      elevation_source: destination.elevationGainM ? "corridor_table" : "unknown",
      origin_is_approximate: !deviceLocation,
      candidate_stations: (candidateStations || []).slice(0, 40).map((s) => ({
        station_id: s.station_id,
        name: s.name,
        latitude: s.latitude,
        longitude: s.longitude,
        power_kw: s.power_kw ?? null,
        connector_types: s.connector_types,
        status: s.status,
        is_operational: s.is_operational,
        operator: s.operator ?? null,
        address: s.address ?? null,
        source: s.source,
        sources: s.sources ?? null,
        last_status_update: s.last_status_update ?? null,
      })),
      constraints: Object.keys(constraints).length ? constraints : undefined,
    } as JourneyAnalyzeRequest;
  }, [
    activeVehicle,
    destination,
    battery,
    reserve,
    style,
    climate,
    payload,
    routeReady,
    selectedCity,
    candidateStations,
    deviceLocation,
    origin,
    constraints,
  ]);

  // ── Analysis (recalculates whenever any input changes) ──
  const [analysis, setAnalysis] = useState<JourneyAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedKind, setPickedKind] = useState<string | null>(null);
  const [chosenStopId, setChosenStopId] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setBusy(true);
      setError(null);
      analyzeJourney(request)
        .then((res) => {
          if (cancelled) return;
          setAnalysis(res);
          setBusy(false);
          setPickedKind(null);
          setChosenStopId(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setBusy(false);
          setError(e instanceof Error ? e.message : "We couldn't plan this journey right now.");
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [request, prefsVersion]);

  const option: JourneyOption | null = useMemo(() => {
    if (!analysis) return null;
    return analysis.options.find((o) => o.kind === (pickedKind ?? analysis.recommended_kind)) ?? analysis.options[0];
  }, [analysis, pickedKind]);

  // Plain-language explanation of the deterministic result.
  const [explanation, setExplanation] = useState<string | null>(null);
  const optionKind = option?.kind;
  useEffect(() => {
    setExplanation(null);
    if (!ai?.available || !request || !analysis || busy || !optionKind) return;
    let cancelled = false;
    const t = setTimeout(() => {
      explainJourney(request, optionKind, explainLang)
        .then((r) => !cancelled && setExplanation(r.explanation))
        .catch(() => undefined);
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [ai, request, analysis, busy, optionKind, explainLang]);

  const chosenStop: JourneyStop | null =
    option?.charging_stops.find((s) => s.station_id === chosenStopId) ?? option?.charging_stops[0] ?? null;

  // ── Actions ──
  const applyAction = (a: NonNullable<JourneyAnalysis["recovery"][number]["action"]>) => {
    if (a.kind === "set_battery") setBattery(Number(a.value));
    if (a.kind === "set_driving_style") setStyle(a.value as Style);
    if (a.kind === "set_payload") setPayload(Number(a.value));
  };

  const start = () => {
    if (!option || !origin) return;
    const primary = chosenStop ? candidateStations.find((s) => s.station_id === chosenStop.station_id) : undefined;
    recordJourneyStarted({
      destination_name: destination.name,
      distance_km: option.distance_km,
      option_kind: option.kind,
      reserve_pct: reserve,
      start_battery_pct: battery,
      stops_count: chosenStop ? 1 : 0,
      station_id: chosenStop?.station_id,
      station_name: chosenStop?.name,
      station_power_kw: chosenStop?.power_kw_listed ?? null,
    }).catch(() => undefined);
    onStartTripNavigation({
      name: destination.name,
      latitude: destination.lat,
      longitude: destination.lng,
      primaryStation: primary,
      originCoords: origin,
    });
  };

  const tone =
    analysis?.verdict === "SAFE"
      ? "text-[#15803D]"
      : analysis?.verdict === "CAUTION"
        ? "text-[#B45309]"
        : "text-[#B91C1C]";

  const arrivalPct = option ? (option.arrival_soc_with_stop_pct ?? option.arrival_soc_pct) : 0;
  const showArrival = option && (option.verdict === "SAFE" || option.arrival_soc_with_stop_pct != null || option.verdict === "CAUTION");

  // Filter out redundant technical/calculation noise so the mobile screen stays clean and focused
  const actionableWarnings = useMemo(() => {
    if (!analysis?.warnings) return [];
    return analysis.warnings
      .filter((w) => {
        const t = w.text.toLowerCase();
        if (
          t.includes("ambient draws") ||
          t.includes("trip demands") ||
          t.includes("starting point is approximate") ||
          t.includes("listed as operational")
        ) {
          return false;
        }
        return w.level === "alert" || w.level === "warn";
      })
      .slice(0, 2);
  }, [analysis]);

  return (
    <div className="w-full flex-1 flex flex-col gap-4 max-w-lg mx-auto text-[#0F172A] pb-6 font-sans">
      {/* 1 · Where to */}
      <section aria-label="Destination" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#0F172A] font-sans">Where to?</h2>
          <span className="text-xs text-[#767D78] font-sans">{activeVehicle.make} {activeVehicle.model}</span>
        </div>

        {/* Quick Regional Hub Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[11px] font-medium text-slate-500 shrink-0 font-sans">Hub:</span>
          {["Delhi", "Mumbai", "Pune", "Bengaluru", "Jaipur"].map((hub) => {
            const isCurrent = selectedCity.toLowerCase() === hub.toLowerCase();
            return (
              <button
                key={hub}
                type="button"
                onClick={() => {
                  onCityChange?.(hub);
                  setDestId(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all border cursor-pointer font-sans ${
                  isCurrent
                    ? "bg-[#DCFCE7] text-[#15803D] border-[#16A34A] ring-1 ring-[#16A34A]/25"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {hub === "Delhi" ? "Delhi-NCR 🇮🇳" : hub}
              </button>
            );
          })}
        </div>

        {/* All-India Destination Search Bar */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setIsSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              placeholder="Search destination across India (e.g. Agra, Dehradun, Jaipur...)"
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-white border border-slate-200 focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A] focus:outline-none transition-all placeholder:text-slate-400 font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }}
                className="absolute right-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Search Autocomplete Results Dropdown */}
          {isSearchOpen && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
              {searchResults.map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => handleSelectSearchResult(res)}
                  className="w-full px-3 py-2.5 text-left text-xs hover:bg-emerald-50/60 flex items-center justify-between transition-colors cursor-pointer font-sans"
                >
                  <div className="flex items-center gap-2">
                    <MapPin size={13} className="text-[#16A34A] shrink-0" />
                    <div>
                      <span className="font-semibold text-[#0F172A]">{res.name}</span>
                      <span className="text-[11px] text-slate-500 ml-1.5">· {res.city}</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-[#15803D] font-semibold shrink-0">
                    {res.distanceKm} km
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Location Selection Pills — Consistent Rectangular Boxes */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar touch-pan-x">
          {displayCorridors.map((d) => {
            const isSelected = destination.id === d.id;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setDestId(d.id)}
                className={`shrink-0 min-h-[46px] px-3.5 py-2 rounded-xl border text-left cursor-pointer transition-all active:scale-98 font-sans ${
                  isSelected
                    ? "bg-[#DCFCE7] text-[#15803D] border-[#16A34A] shadow-2xs font-semibold ring-1 ring-[#16A34A]/25"
                    : "bg-white border-slate-200 text-[#0F172A] hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  <MapPin size={13} className={isSelected ? "text-[#16A34A]" : "text-slate-400"} />
                  {d.name}
                </div>
                <div className={`text-[11px] font-mono mt-0.5 ${isSelected ? "text-[#15803D] font-semibold" : "text-slate-500"}`}>
                  {d.distanceKm} km
                </div>
              </button>
            );
          })}
        </div>

        {/* Origin Location & Scan Location Button */}
        <div className="flex items-center justify-between gap-2 text-xs text-[#525854] flex-wrap font-sans">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Navigation size={13} className="text-[#16A34A] shrink-0" />
            {deviceLocation ? (
              <span>
                From your location{deviceAccuracy ? ` (±${Math.round(deviceAccuracy)} m)` : ""}
                {locationStatus && locationStatus !== "precise" ? " · approximate" : ""}
              </span>
            ) : cityCentre ? (
              <span>From {selectedCity} city centre (approximate)</span>
            ) : (
              <span>From {selectedCity} (regional hub)</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={handleScanLocation}
              disabled={isScanningLocation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-[#15803D] border border-emerald-300 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50 font-sans"
              title="Scan GPS coordinates and detect nearest city"
            >
              <Compass size={12} className={isScanningLocation ? "animate-spin text-[#16A34A]" : "text-[#16A34A]"} />
              <span>{isScanningLocation ? "Scanning GPS..." : "Scan Location"}</span>
            </button>
            {!deviceLocation && !cityCentre && (
              <button type="button" onClick={() => setCityCentre(true)} className="text-[11px] text-slate-500 hover:text-slate-700 underline cursor-pointer font-sans">
                City centre
              </button>
            )}
          </div>
        </div>

        {/* Geolocation feedback badge */}
        {locationSyncInfo && (
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-[#15803D] flex items-center gap-2 font-medium">
            <CheckCircle2 size={14} className="shrink-0 text-[#16A34A]" />
            <span>{locationSyncInfo}</span>
          </div>
        )}

        <JourneyAskBar
          destinations={corridors.map((c) => c.name)}
          selectedCity={selectedCity}
          ai={ai}
          onIntent={onIntent}
          onPickDestination={(name) => {
            const d = corridors.find((c) => c.name === name);
            if (d) setDestId(d.id);
          }}
          onPreferenceSaved={() => setPrefsVersion((v) => v + 1)}
          currentVehicleName={`${activeVehicle.make} ${activeVehicle.model}`}
        />

        {Object.keys(constraints).length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Requests for this journey">
            {(Object.entries(constraints) as [keyof JourneyConstraints, string | number][]).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setConstraints((c) => { const n = { ...c }; delete n[k]; return n; })}
                title="Remove"
                className="px-2.5 py-1 rounded-full text-[11px] bg-[#EDEBE3] text-[#3B403D] cursor-pointer"
              >
                {constraintLabel(k, v)} ✕
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 2 · Battery & reserve */}
      <section aria-label="Battery" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label htmlFor="battery" className="text-sm font-semibold text-[#0F172A] font-sans">Battery now</label>
            <button
              type="button"
              onClick={handleScanEvBattery}
              disabled={isScanningBattery}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-[#15803D] border border-emerald-300 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50 font-sans"
              title="Query vehicle On-Board BMS telemetry"
            >
              <Zap size={12} className={isScanningBattery ? "animate-pulse text-[#16A34A]" : "text-[#16A34A] fill-[#16A34A]/30"} />
              <span>{isScanningBattery ? "Scanning BMS..." : "Scan EV"}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums font-mono text-[#0F172A]">{Math.round(battery)}%</span>
            <div className="w-6 h-3 rounded-[3px] border border-slate-300 p-[1px] relative flex items-center">
              <div
                className={`h-full rounded-[1px] transition-all ${
                  battery > 30 ? "bg-[#16A34A]" : battery > 15 ? "bg-[#F59E0B]" : "bg-[#EF4444]"
                }`}
                style={{ width: `${Math.max(5, battery)}%` }}
              />
              <div className="absolute -right-[2px] w-[1px] h-1 bg-slate-300 rounded-r-[1px]" />
            </div>
          </div>
        </div>

        {/* BMS Telemetry Scan Result Badge */}
        {bmsSyncInfo && (
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-[#15803D] flex items-center gap-2 font-medium font-sans">
            <CheckCircle2 size={14} className="shrink-0 text-[#16A34A]" />
            <span>{bmsSyncInfo}</span>
          </div>
        )}

        <input
          id="battery"
          type="range"
          min={0}
          max={100}
          value={battery}
          onChange={(e) => setBattery(Number(e.target.value))}
          className="w-full accent-[#16A34A] cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium font-sans">Keep in reserve</span>
          <Segmented
            label="Arrival reserve"
            value={reserve}
            onChange={setReserve}
            options={[...(RESERVES.includes(reserve) ? [] : [{ v: reserve, t: `${reserve}%` }]), ...RESERVES.map((v) => ({ v, t: `${v}%` }))]}
          />
        </div>

        <button type="button" onClick={() => setShowDetails((s) => !s)} className="flex items-center gap-1 text-xs text-[#525854] cursor-pointer font-sans">
          {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Trip details (optional)
        </button>
        {showDetails && (
          <div className="space-y-3 rounded-xl bg-white border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-sans">Driving</span>
              <Segmented<Style> label="Driving style" value={style} onChange={setStyle} options={[{ v: "eco", t: "Gentle" }, { v: "normal", t: "Normal" }, { v: "sport", t: "Sporty" }]} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-sans">Climate</span>
              <Segmented<Climate> label="Climate" value={climate} onChange={setClimate} options={[{ v: "off", t: "Off" }, { v: "eco", t: "Eco" }, { v: "normal", t: "Normal" }, { v: "max", t: "Max" }]} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-sans">On board</span>
              <Segmented<number> label="Load" value={payload} onChange={setPayload} options={LOADS.map((l) => ({ v: l.kg, t: l.label }))} />
            </div>
          </div>
        )}
      </section>

      {/* 3 · The answer */}
      <section aria-label="Journey result" aria-live="polite" className="space-y-4">
        {!origin && <p className="text-sm text-[#767D78] font-sans">Choose a starting point to see your journey.</p>}
        {origin && !analysis && !error && <p className="text-sm text-[#767D78] font-sans">Working out your journey…</p>}
        {error && (
          <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm text-[#991B1B] font-sans">{error}</div>
        )}

        {analysis && option && (
          <div className={`space-y-4 transition-opacity ${busy ? "opacity-60" : ""}`}>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#767D78] font-bold">
                  Will I Make It?
                </span>
                {analysis.verdict === "SAFE" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC] font-sans">
                    <CheckCircle2 size={13} aria-hidden="true" />
                    <span>Safe to Drive</span>
                  </span>
                ) : analysis.verdict === "CAUTION" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A] font-sans">
                    <AlertTriangle size={13} aria-hidden="true" />
                    <span>Caution Advised</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-[#FEE2E2] text-[#B91C1C] border border-[#FCA5A5] font-sans">
                    <Zap size={13} aria-hidden="true" />
                    <span>Charging Needed</span>
                  </span>
                )}
              </div>

              <h3 className={`text-lg sm:text-xl font-bold tracking-tight font-sans ${tone}`}>{analysis.headline}</h3>
              <p className="text-xs sm:text-sm text-[#3B403D] leading-snug font-sans">{analysis.detail}</p>

              {/* Battery story */}
              {showArrival && (
                <div className="pt-2">
                  <div className="relative h-3 rounded-full bg-black/[0.07] overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${
                        arrivalPct > reserve
                          ? "bg-[#16A34A]"
                          : arrivalPct > 0
                          ? "bg-[#D97706]"
                          : "bg-[#DC2626]"
                      }`}
                      style={{ width: `${Math.max(4, Math.min(100, arrivalPct))}%` }}
                    />
                    <div
                      className="absolute inset-y-0 w-0.5 bg-[#B45309] z-10"
                      style={{ left: `${reserve}%` }}
                      title={`Target reserve: ${reserve}%`}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-[#767D78] mt-1.5 font-mono">
                    <span>Departure: {Math.round(battery)}%</span>
                    <span className="font-semibold text-[#111312]">
                      Arrival: ~{Math.round(arrivalPct)}%
                      {option.charging_stops.length ? " (with charge)" : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Option switcher */}
            <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
              {analysis.options.length > 1 && (
                <div role="tablist" aria-label="Journey options" className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {analysis.options.map((o) => (
                    <button
                      key={o.kind}
                      role="tab"
                      aria-selected={o.kind === option.kind}
                      type="button"
                      onClick={() => { setPickedKind(o.kind); setChosenStopId(null); }}
                      className={`shrink-0 min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all font-sans ${
                        o.kind === option.kind
                          ? "bg-[#DCFCE7] text-[#15803D] border-[#16A34A] shadow-2xs font-semibold ring-1 ring-[#16A34A]/25"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {o.title}{o.recommended ? " ✓" : ""}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <div className="text-sm font-semibold font-sans">{option.title}{option.recommended && analysis.options.length > 1 ? " · Recommended" : ""}</div>
                <p className="text-xs text-[#3B403D] mt-1 leading-snug font-sans">{option.recommended ? option.recommendation_reason : option.summary}</p>
                {option.assumption_changes.length > 0 && (
                  <p className="text-[11px] text-[#767D78] mt-1.5 font-sans">Assumes: {option.assumption_changes.join(", ")}.</p>
                )}
              </div>
              <div className="flex gap-5 text-xs text-[#525854] font-sans">
                <span>{option.distance_km.toFixed(0)} km</span>
                {option.drive_mins != null && <span>{mins(option.drive_mins)} driving</span>}
                {option.charging_extra_mins != null && <span>+{mins(option.charging_extra_mins)} charging</span>}
              </div>
            </div>

            {/* Optional Collapsible Plain Language Explanation */}
            {explanation && (
              <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowExplanation((s) => !s)}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer transition-colors font-sans"
                >
                  <span className="flex items-center gap-1.5">
                    <span>💬 View plain explanation</span>
                    <span className="text-[11px] font-normal text-slate-500">(optional)</span>
                  </span>
                  {showExplanation ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showExplanation && (
                  <div className="p-4 pt-1 border-t border-slate-200/80 space-y-2 font-sans">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">AI Summary</span>
                      {ai && (
                        <select
                          aria-label="Explain in"
                          value={explainLang}
                          onChange={(e) => setExplainLang(e.target.value)}
                          className="text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-0.5 cursor-pointer font-sans"
                        >
                          {ai.languages.filter((l) => EXPLAIN_LANGS.includes(l.code)).map((l) => (
                            <option key={l.code} value={l.code}>{l.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-slate-700 font-sans">{explanation}</p>
                    <p className="text-[10px] text-slate-400">Deterministic figures by EVVERSE.</p>
                  </div>
                )}
              </div>
            )}

            {/* Charging stops */}
            {option.charging_stops.length > 0 && (
              <div className="space-y-3">
                {option.charging_optional && <p className="text-xs text-[#767D78] font-sans">A short top-up is optional but suggested.</p>}
                {option.charging_stops.map((s) => (
                  <StopCard
                    key={s.station_id}
                    stop={s}
                    chosen={s.station_id === (chosenStop?.station_id ?? "")}
                    onChoose={() => setChosenStopId(s.station_id)}
                    onInspect={() => onInspectStation?.(s.station_id, s.name)}
                  />
                ))}
              </div>
            )}

            {/* Actionable Alerts — only essential driving advice */}
            {actionableWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 space-y-1.5 font-sans">
                {actionableWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs font-medium text-amber-900 leading-snug font-sans">
                    <AlertTriangle size={14} className="shrink-0 text-amber-600 mt-0.5" />
                    <span>{w.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recovery */}
            {analysis.recovery.length > 0 && (
              <div className="rounded-xl bg-[#F8FAFC] border border-slate-200 p-4 space-y-3 font-sans">
                <div className="text-sm font-semibold font-sans">{option.charging_stops.length ? "Ways to make it easier" : "What you can do"}</div>
                {analysis.recovery.map((r, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-xs">
                    <span className="leading-snug text-slate-700 font-sans">{r.text}</span>
                    {r.action && (
                      <button
                        type="button"
                        onClick={() => applyAction(r.action!)}
                        className="shrink-0 px-3.5 py-1.5 rounded-xl text-xs bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold cursor-pointer shadow-xs active:scale-95 transition-all font-sans"
                      >
                        {r.action.label}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Primary Action Button — Prominent Electric Blue */}
            <button
              type="button"
              onClick={start}
              disabled={busy || (option.verdict === "CHARGING_NEEDED" && option.charging_stops.length === 0)}
              className="w-full min-h-[50px] rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white py-3.5 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99] transition-all shadow-[0_4px_14px_rgba(2,132,199,0.3)] flex items-center justify-center gap-2.5 font-sans"
            >
              <Navigation size={16} className="text-white fill-white/20" aria-hidden="true" />
              <span>{option.charging_stops.length && chosenStop ? `Start · via ${chosenStop.name}` : `Start to ${destination.name}`}</span>
            </button>
            {option.verdict === "CHARGING_NEEDED" && option.charging_stops.length === 0 && (
              <p className="text-[11px] text-[#767D78] text-center font-sans">Starting is disabled until the journey is achievable.</p>
            )}

            <details className="text-xs text-[#767D78] font-sans">
              <summary className="cursor-pointer font-medium hover:text-slate-900">What this assumes</summary>
              <ul className="mt-2 space-y-1 list-disc pl-4 text-[11px]">
                {analysis.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </details>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => setPrefsOpen(true)}
        className="self-start flex items-center gap-1.5 text-xs text-[#525854] cursor-pointer"
      >
        <UserRound size={13} />
        {analysis && analysis.applied_preferences.length > 0 ? `Personalised for you (${analysis.applied_preferences.length}) · Review` : "Your preferences"}
      </button>

      {prefsOpen && <JourneyPreferences onClose={() => setPrefsOpen(false)} onChanged={onPrefsChanged} />}
    </div>
  );
}
