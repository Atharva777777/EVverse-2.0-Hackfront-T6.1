"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Navigation, UserRound } from "lucide-react";
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
import { REGIONAL_CORRIDOR_DESTINATIONS, type JourneyDestination } from "@/lib/journeyRouting";
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
    fewer_stops: "Fewer stops", reliable_chargers: "Reliable chargers", safer: "Safer", faster: "Faster", economical: "Most economical",
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
  value, options, onChange, label,
}: { value: T; options: { v: T; t: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 rounded-full text-xs border cursor-pointer transition-colors ${
            value === o.v ? "bg-[#111312] text-white border-[#111312]" : "bg-white border-black/10 text-[#111312]"
          }`}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

function StopCard({ stop, chosen, onChoose }: { stop: JourneyStop; chosen: boolean; onChoose: () => void }) {
  const power =
    stop.power_basis === "listed" && stop.power_kw_listed != null
      ? `${stop.power_kw_listed.toFixed(0)} kW listed`
      : stop.power_basis === "registry_unverified" && stop.assumed_power_kw != null
        ? `~${stop.assumed_power_kw.toFixed(0)} kW (unverified)`
        : "Power not listed";
  return (
    <div className={`rounded-2xl border p-4 bg-white ${chosen ? "border-[#111312]" : "border-black/[0.08]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[#767D78]">
            {stop.role === "primary" ? "Charging stop" : "Backup"}
          </div>
          <div className="text-sm font-semibold mt-0.5">{stop.name}</div>
        </div>
        <button
          type="button"
          onClick={onChoose}
          disabled={chosen}
          className={`px-3 py-1.5 rounded-full text-xs border shrink-0 ${chosen ? "bg-[#111312] text-white border-[#111312]" : "border-black/10 cursor-pointer"}`}
        >
          {chosen ? "Selected" : "Use this one"}
        </button>
      </div>

      <p className="text-sm text-[#3B403D] mt-2 leading-snug">{stop.why}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div><dt className="text-[#767D78]">Off your route</dt><dd className="font-medium">{stop.detour_km <= 1 ? "Almost on it" : `+${stop.detour_km.toFixed(1)} km`}</dd></div>
        <div><dt className="text-[#767D78]">Connector</dt><dd className="font-medium">{stop.connectors_matched[0] ?? "—"}{stop.ac_only ? " · slow AC" : ""}</dd></div>
        <div><dt className="text-[#767D78]">Power</dt><dd className="font-medium">{power}</dd></div>
        <div><dt className="text-[#767D78]">Charging</dt><dd className="font-medium">~{mins(stop.charge_mins)} to {stop.charge_to_pct.toFixed(0)}%{stop.charge_time_is_estimate ? " (estimate)" : ""}</dd></div>
      </dl>

      <div className="mt-3 pt-3 border-t border-black/[0.06] text-[11px] text-[#767D78] leading-snug">
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
  selectedCity = "Mumbai",
  onStartTripNavigation,
}: JourneyPlannerProps) {
  const corridors = useMemo(
    () => REGIONAL_CORRIDOR_DESTINATIONS[selectedCity] || REGIONAL_CORRIDOR_DESTINATIONS["Mumbai"],
    [selectedCity],
  );

  // ── Inputs ──
  const [destId, setDestId] = useState<string | null>(null);
  const destination: JourneyDestination = corridors.find((c) => c.id === destId) ?? corridors[0];
  const [battery, setBattery] = useState<number>(currentBatteryPct);
  const [reserve, setReserve] = useState<number>(15);
  const [style, setStyle] = useState<Style>("normal");
  const [climate, setClimate] = useState<Climate>("normal");
  const [payload, setPayload] = useState<number>(75);
  const [showDetails, setShowDetails] = useState(false);
  const [cityCentre, setCityCentre] = useState(false);

  // Follow the vehicle / battery reading when they change
  const [seen, setSeen] = useState({ id: activeVehicle.id, b: currentBatteryPct });
  if (seen.id !== activeVehicle.id || seen.b !== currentBatteryPct) {
    setSeen({ id: activeVehicle.id, b: currentBatteryPct });
    setBattery(currentBatteryPct);
  }

  const origin: [number, number] | null = deviceLocation ?? (cityCentre ? userLocation : null);

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
          power_kw: s.power_kw ?? null, // never defaulted: unknown stays unknown
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
  }, [activeVehicle, destination, battery, reserve, style, climate, payload, routeReady, selectedCity, candidateStations, deviceLocation, origin, constraints]);

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

  // Plain-language explanation of the deterministic result. Optional: absent when AI is off/unavailable.
  const [explanation, setExplanation] = useState<string | null>(null);
  const optionKind = option?.kind;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExplanation(null);
    if (!ai?.available || !request || !analysis || busy || !optionKind) return;
    let cancelled = false;
    const t = setTimeout(() => {
      explainJourney(request, optionKind, explainLang)
        .then((r) => !cancelled && setExplanation(r.explanation))
        .catch(() => undefined); // the deterministic text is already on screen
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
    }).catch(() => undefined); // only stored if the driver opted in
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

  return (
    <div className="w-full flex-1 flex flex-col gap-5 max-w-lg mx-auto text-[#111312] pb-6">
      {/* 1 · Where to */}
      <section aria-label="Destination" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Where to?</h2>
          <span className="text-xs text-[#767D78]">{activeVehicle.make} {activeVehicle.model}</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {corridors.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={destination.id === d.id}
              onClick={() => setDestId(d.id)}
              className={`shrink-0 px-3.5 py-2 rounded-2xl border text-left cursor-pointer ${
                destination.id === d.id ? "bg-[#111312] text-white border-[#111312]" : "bg-white border-black/[0.08]"
              }`}
            >
              <div className="text-sm font-medium flex items-center gap-1.5"><MapPin size={13} />{d.name}</div>
              <div className={`text-[11px] ${destination.id === d.id ? "text-white/70" : "text-[#767D78]"}`}>{d.distanceKm} km</div>
            </button>
          ))}
        </div>

        <div className="text-xs flex items-center gap-2 text-[#525854]">
          <Navigation size={13} />
          {deviceLocation ? (
            <span>From your location{deviceAccuracy ? ` (±${Math.round(deviceAccuracy)} m)` : ""}{locationStatus && locationStatus !== "precise" ? " · approximate" : ""}</span>
          ) : cityCentre ? (
            <span>From the {selectedCity} city centre (approximate)</span>
          ) : (
            <span>We need a starting point.</span>
          )}
          {!deviceLocation && (
            <span className="flex gap-2 ml-auto">
              {onAcquireLocation && <button type="button" onClick={onAcquireLocation} className="underline cursor-pointer">Use my location</button>}
              {!cityCentre && <button type="button" onClick={() => setCityCentre(true)} className="underline cursor-pointer">Use city centre</button>}
            </span>
          )}
        </div>

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
        <div className="flex items-baseline justify-between">
          <label htmlFor="battery" className="text-sm font-medium">Battery now</label>
          <span className="text-2xl font-semibold tabular-nums">{Math.round(battery)}%</span>
        </div>
        <input
          id="battery"
          type="range"
          min={0}
          max={100}
          value={battery}
          onChange={(e) => setBattery(Number(e.target.value))}
          className="w-full accent-[#111312] cursor-pointer"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Keep in reserve</span>
          <Segmented
            label="Arrival reserve"
            value={reserve}
            onChange={setReserve}
            options={[...(RESERVES.includes(reserve) ? [] : [{ v: reserve, t: `${reserve}%` }]), ...RESERVES.map((v) => ({ v, t: `${v}%` }))]}
          />
        </div>

        <button type="button" onClick={() => setShowDetails((s) => !s)} className="flex items-center gap-1 text-xs text-[#525854] cursor-pointer">
          {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Trip details (optional)
        </button>
        {showDetails && (
          <div className="space-y-3 rounded-2xl bg-white border border-black/[0.08] p-4">
            <div className="flex items-center justify-between gap-3"><span className="text-xs">Driving</span>
              <Segmented<Style> label="Driving style" value={style} onChange={setStyle} options={[{ v: "eco", t: "Gentle" }, { v: "normal", t: "Normal" }, { v: "sport", t: "Sporty" }]} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-xs">Climate</span>
              <Segmented<Climate> label="Climate" value={climate} onChange={setClimate} options={[{ v: "off", t: "Off" }, { v: "eco", t: "Eco" }, { v: "normal", t: "Normal" }, { v: "max", t: "Max" }]} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-xs">On board</span>
              <Segmented<number> label="Load" value={payload} onChange={setPayload} options={LOADS.map((l) => ({ v: l.kg, t: l.label }))} /></div>
          </div>
        )}
      </section>

      {/* 3 · The answer */}
      <section aria-label="Journey result" aria-live="polite" className="space-y-4">
        {!origin && <p className="text-sm text-[#767D78]">Choose a starting point to see your journey.</p>}
        {origin && !analysis && !error && <p className="text-sm text-[#767D78]">Working out your journey…</p>}
        {error && (
          <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm text-[#991B1B]">{error}</div>
        )}

        {analysis && option && (
          <div className={`space-y-4 transition-opacity ${busy ? "opacity-60" : ""}`}>
            <div>
              <h3 className={`text-xl font-semibold ${tone}`}>{analysis.headline}</h3>
              <p className="text-sm text-[#3B403D] mt-1">{analysis.detail}</p>
            </div>

            {/* Battery story */}
            {showArrival && (
              <div>
                <div className="relative h-2.5 rounded-full bg-black/[0.07] overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-[#111312]/80 rounded-full" style={{ width: `${Math.max(0, Math.min(100, arrivalPct))}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-[#B45309]" style={{ left: `${reserve}%` }} title="Your reserve" />
                </div>
                <div className="flex justify-between text-[11px] text-[#767D78] mt-1.5">
                  <span>Leave with {Math.round(battery)}%</span>
                  <span>Arrive with about {Math.round(arrivalPct)}%{option.charging_stops.length ? " after charging" : ""}</span>
                </div>
              </div>
            )}

            {/* Option switcher + the one explanation */}
            <div className="rounded-2xl bg-white border border-black/[0.08] p-4 space-y-3">
              {analysis.options.length > 1 && (
                <div role="tablist" aria-label="Journey options" className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {analysis.options.map((o) => (
                    <button
                      key={o.kind}
                      role="tab"
                      aria-selected={o.kind === option.kind}
                      type="button"
                      onClick={() => { setPickedKind(o.kind); setChosenStopId(null); }}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs border cursor-pointer ${o.kind === option.kind ? "bg-[#111312] text-white border-[#111312]" : "border-black/10"}`}
                    >
                      {o.title}{o.recommended ? " ✓" : ""}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <div className="text-sm font-semibold">{option.title}{option.recommended && analysis.options.length > 1 ? " · Recommended" : ""}</div>
                <p className="text-sm text-[#3B403D] mt-1 leading-snug">{option.recommended ? option.recommendation_reason : option.summary}</p>
                {option.assumption_changes.length > 0 && (
                  <p className="text-[11px] text-[#767D78] mt-1.5">Assumes: {option.assumption_changes.join(", ")}.</p>
                )}
              </div>
              <div className="flex gap-5 text-xs text-[#525854]">
                <span>{option.distance_km.toFixed(0)} km</span>
                {option.drive_mins != null && <span>{mins(option.drive_mins)} driving</span>}
                {option.charging_extra_mins != null && <span>+{mins(option.charging_extra_mins)} charging</span>}
              </div>
            </div>

            {explanation && (
              <div className="rounded-2xl bg-[#F4F3EE] p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-medium">In simple words</span>
                  {ai && (
                    <select
                      aria-label="Explain in"
                      value={explainLang}
                      onChange={(e) => setExplainLang(e.target.value)}
                      className="text-[11px] bg-transparent border border-black/10 rounded-full px-2 py-0.5 cursor-pointer"
                    >
                      {ai.languages.filter((l) => EXPLAIN_LANGS.includes(l.code)).map((l) => (
                        <option key={l.code} value={l.code}>{l.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <p className="text-sm leading-snug text-[#3B403D]">{explanation}</p>
                <p className="text-[10.5px] text-[#8C938E] mt-2">Written by Sarvam AI from the figures above. The numbers come from EVVERSE, not the AI.</p>
              </div>
            )}

            {/* Charging stops */}
            {option.charging_stops.length > 0 && (
              <div className="space-y-3">
                {option.charging_optional && <p className="text-xs text-[#767D78]">A short top-up is optional but suggested.</p>}
                {option.charging_stops.map((s) => (
                  <StopCard
                    key={s.station_id}
                    stop={s}
                    chosen={s.station_id === (chosenStop?.station_id ?? "")}
                    onChoose={() => setChosenStopId(s.station_id)}
                  />
                ))}
              </div>
            )}

            {/* Warnings */}
            {analysis.warnings.length > 0 && (
              <ul className="space-y-1.5">
                {analysis.warnings.map((w, i) => (
                  <li key={i} className={`text-xs leading-snug ${w.level === "alert" ? "text-[#B91C1C]" : w.level === "warn" ? "text-[#92400E]" : "text-[#767D78]"}`}>
                    {w.text}
                  </li>
                ))}
              </ul>
            )}

            {/* Recovery */}
            {analysis.recovery.length > 0 && (
              <div className="rounded-2xl bg-[#F4F3EE] p-4 space-y-3">
                <div className="text-sm font-medium">{option.charging_stops.length ? "Ways to make it easier" : "What you can do"}</div>
                {analysis.recovery.map((r, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-sm">
                    <span className="leading-snug">{r.text}</span>
                    {r.action && (
                      <button type="button" onClick={() => applyAction(r.action!)} className="shrink-0 px-3 py-1.5 rounded-full text-xs bg-[#111312] text-white cursor-pointer">
                        {r.action.label}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={start}
              disabled={busy || (option.verdict === "CHARGING_NEEDED" && option.charging_stops.length === 0)}
              className="w-full rounded-2xl bg-[#111312] text-white py-3.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {option.charging_stops.length && chosenStop ? `Start · via ${chosenStop.name}` : `Start to ${destination.name}`}
            </button>
            {option.verdict === "CHARGING_NEEDED" && option.charging_stops.length === 0 && (
              <p className="text-[11px] text-[#767D78] text-center">Starting is disabled until the journey is achievable.</p>
            )}

            <details className="text-xs text-[#767D78]">
              <summary className="cursor-pointer">What this assumes</summary>
              <ul className="mt-2 space-y-1 list-disc pl-4">
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
