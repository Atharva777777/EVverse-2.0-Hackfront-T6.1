"""
backend/api/services/journey_intelligence.py
============================================
EVverse Journey Intelligence - orchestration layer.

This module does NOT contain a second energy model. Every number comes from the existing
deterministic engines:

    range_physics.estimate_trip_energy      -> energy use, arrival SoC range
    journey_risk.evaluate_journey_feasibility -> SAFE / CAUTION / CHARGING_NEEDED
    charging_stop.recommend_charging_stops  -> reachable, connector-compatible stops

What it adds on top:
    * runs those engines under a small set of explicit assumption variants to build
      meaningful options (balanced / lowest charging dependency / safer / faster),
    * attaches provenance (source, freshness, listed-vs-assumed power) to each station,
    * re-ranks the engine's qualifying stops using the driver's own preferences,
    * produces deterministic, number-backed explanations and recovery what-ifs.

No language model is involved in any calculation or safety decision.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Union

from backend.api.services.charging_stop import (
    ChargingRecommendationResult,
    RecommendedStop,
    recommend_charging_stops,
)
from backend.api.services.journey_risk import (
    FeasibilityVerdict,
    JourneyFeasibilityResult,
    evaluate_journey_feasibility,
)
from backend.api.services.range_physics import (
    OEM_CURB_WEIGHT_MAP,
    TripInput,
    VehicleParameters,
    estimate_trip_energy,
    resolve_vehicle_parameters,
)

SOURCE_LABELS = {
    "open_charge_map": "Open Charge Map",
    "bee": "BEE registry",
    "osm": "OpenStreetMap",
    "kaggle_baseline": "EVverse baseline registry",
}

STALE_AFTER_DAYS = 30
DEFAULT_AMBIENT_C = 25.0  # engine default; disclosed whenever it is used


class VehicleDataMissing(ValueError):
    """Raised when the vehicle record lacks fields we refuse to guess."""

    def __init__(self, missing: List[str]):
        self.missing = missing
        super().__init__("Vehicle is missing: " + ", ".join(missing))


# ── Inputs ────────────────────────────────────────────────────────────────────

@dataclass
class Preferences:
    prefer_reliable_charging: bool = False
    prefer_faster_chargers: bool = False
    prefer_fewer_stops: bool = False
    familiar_station_ids: List[str] = field(default_factory=list)


@dataclass
class JourneyConstraints:
    """Per-trip requests the driver made (by controls, typing or voice). All validated upstream."""
    max_charging_stops: Optional[int] = None          # 0..3
    charging_speed: Optional[str] = None              # "fast" | "standard"
    route_preference: Optional[str] = None            # balanced|fewer_stops|reliable_chargers|safer|faster|economical


FAST_KW = 50.0


@dataclass
class JourneyInput:
    vehicle: Union[Dict[str, Any], str]
    distance_km: float
    start_battery_pct: float
    reserve_buffer_pct: float = 15.0
    elevation_gain_m: float = 0.0
    payload_kg: float = 75.0
    ambient_temp_c: Optional[float] = None
    hvac_mode: str = "normal"
    driving_style: str = "normal"
    duration_mins: Optional[float] = None
    origin_coords: Optional[Tuple[float, float]] = None
    destination_coords: Optional[Tuple[float, float]] = None
    candidate_stations: List[Dict[str, Any]] = field(default_factory=list)
    city: Optional[str] = None
    route_alternatives: List[Dict[str, Any]] = field(default_factory=list)
    route_source: str = "unknown"          # e.g. "osrm", "corridor_table"
    elevation_source: str = "unknown"      # e.g. "corridor_table", "none"
    origin_is_approximate: bool = False
    constraints: JourneyConstraints = field(default_factory=JourneyConstraints)


# ── Vehicle ───────────────────────────────────────────────────────────────────

def _first(d: Dict[str, Any], keys: List[str]) -> Any:
    for k in keys:
        if d.get(k) is not None:
            return d[k]
    return None


def resolve_vehicle(vehicle: Union[Dict[str, Any], str]) -> Tuple[VehicleParameters, Dict[str, Any]]:
    """
    Resolve a vehicle without inventing core facts. A custom vehicle dict must carry
    usable capacity, efficiency and plug type - the engine would otherwise silently
    substitute 39 kWh / 15 kWh per 100 km / CCS2.
    """
    if isinstance(vehicle, dict):
        missing = []
        if _first(vehicle, ["usable_kwh", "usableKwh", "battery_kwh", "batteryKwh", "battery_capacity_kwh"]) is None:
            missing.append("battery capacity")
        if _first(vehicle, ["efficiency_kwh100km", "efficiencyKwh100km", "base_consumption_wh_per_km"]) is None:
            missing.append("energy efficiency")
        if not _first(vehicle, ["plug_type", "plugType"]):
            missing.append("charging connector type")
        if missing:
            raise VehicleDataMissing(missing)

    v = resolve_vehicle_parameters(vehicle)
    estimated = []
    has_weight = isinstance(vehicle, dict) and vehicle.get("curb_weight_kg")
    if not has_weight and v.vehicle_id not in OEM_CURB_WEIGHT_MAP:
        estimated.append("vehicle weight")
    profile = {
        "name": f"{v.make} {v.model}".strip(),
        "usable_kwh": v.usable_kwh,
        "efficiency_kwh100km": v.efficiency_kwh100km,
        "plug_type": v.plug_type,
        "max_dc_speed_kw": v.max_dc_speed_kw,
        "estimated_fields": estimated,
    }
    return v, profile


# ── Station provenance ────────────────────────────────────────────────────────

def _source_label(meta: Dict[str, Any]) -> str:
    srcs = meta.get("sources") or ([meta["source"]] if meta.get("source") else [])
    labels = [SOURCE_LABELS.get(s, str(s).replace("_", " ").title()) for s in srcs if s and s != "merged"]
    return " + ".join(dict.fromkeys(labels)) or "Unknown source"


def _age_days(iso: Optional[str], now: datetime) -> Optional[float]:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(0.0, (now - dt).total_seconds() / 86400.0)
    except ValueError:
        return None


def _age_phrase(days: float) -> str:
    if days < 1:
        return "today"
    if days < 2:
        return "yesterday"
    if days < 60:
        return f"{int(days)} days ago"
    return f"{int(days // 30)} months ago"


STATIC_SOURCES = {"kaggle_baseline"}  # bundled snapshots: their timestamps are load time, not observations


def is_static_only(meta: Dict[str, Any]) -> bool:
    srcs = set(meta.get("sources") or ([meta["source"]] if meta.get("source") else []))
    return bool(srcs) and srcs <= STATIC_SOURCES


def describe_station_data(meta: Dict[str, Any], status_text: str, now: datetime) -> Dict[str, Any]:
    """Never calls a station 'operational' on its own authority - only 'listed as'."""
    source = _source_label(meta)
    if is_static_only(meta):
        return {
            "data_source": source,
            "status_basis": "unknown",
            "status_label": f"From the {source} - its status has not been checked live",
            "status_updated_at": None,
            "status_age_days": None,
            "freshness_label": "Registry snapshot, not a live check",
        }
    days = _age_days(meta.get("last_status_update"), now)
    listed = status_text.strip().lower() or "unknown"
    if listed in ("", "unknown", "unconfirmed"):
        basis, label = "unknown", "Status not confirmed"
    elif days is None:
        basis = "directory_undated"
        label = f"Listed as {listed} by {source} - no update date, not live"
    elif days <= STALE_AFTER_DAYS:
        basis = "directory_recent"
        label = f"Listed as {listed} by {source}, updated {_age_phrase(days)} - not live"
    else:
        basis = "directory_stale"
        label = f"Listed as {listed} by {source}, last updated {_age_phrase(days)} - may be out of date"
    return {
        "data_source": source,
        "status_basis": basis,
        "status_label": label,
        "status_updated_at": meta.get("last_status_update"),
        "status_age_days": round(days, 1) if days is not None else None,
        "freshness_label": f"Updated {_age_phrase(days)}" if days is not None else "Update time unknown",
    }


# ── Engine bundle ─────────────────────────────────────────────────────────────

@dataclass
class _Run:
    trip: TripInput
    feasibility: JourneyFeasibilityResult
    charging: Optional[ChargingRecommendationResult]
    stops: List[RecommendedStop]
    primary: Optional[RecommendedStop]
    backup: Optional[RecommendedStop]
    changes: List[str] = field(default_factory=list)
    route_label: str = "Your route"
    duration_mins: Optional[float] = None


def _tier(verdict: FeasibilityVerdict) -> int:
    return {FeasibilityVerdict.SAFE: 0, FeasibilityVerdict.CAUTION: 1}.get(verdict, 2)


def _viability(run: _Run) -> int:
    """3 = no charging needed, 2 = reachable verified stop, 1 = caution/no stop, 0 = stranded."""
    v = run.feasibility.verdict
    if v == FeasibilityVerdict.SAFE:
        return 3
    if run.primary is not None:
        return 2
    return 1 if v == FeasibilityVerdict.CAUTION else 0


class _Engine:
    def __init__(self, req: JourneyInput, vehicle: VehicleParameters, prefs: Preferences, now: datetime):
        self.req, self.vehicle, self.prefs, self.now = req, vehicle, prefs, now
        self.meta = {
            str(s.get("station_id") or s.get("id")): s for s in req.candidate_stations
        }

    def trip(self, **over: Any) -> TripInput:
        r = self.req
        base = dict(
            distance_km=r.distance_km, start_battery_pct=r.start_battery_pct,
            duration_mins=r.duration_mins, elevation_gain_m=r.elevation_gain_m,
            payload_kg=r.payload_kg,
            ambient_temp_c=r.ambient_temp_c if r.ambient_temp_c is not None else DEFAULT_AMBIENT_C,
            hvac_mode=r.hvac_mode, driving_style=r.driving_style,
            reserve_buffer_pct=r.reserve_buffer_pct,
        )
        base.update(over)
        return TripInput(**base)

    def run(self, trip: TripInput, changes: Optional[List[str]] = None, label: str = "Your route") -> _Run:
        energy = estimate_trip_energy(self.vehicle, trip)
        feas = evaluate_journey_feasibility(self.vehicle, trip, energy_result=energy)
        charging = None
        stops: List[RecommendedStop] = []
        if feas.verdict != FeasibilityVerdict.SAFE:
            charging = recommend_charging_stops(
                vehicle=self.vehicle, trip=trip,
                origin_coords=self.req.origin_coords,
                destination_coords=self.req.destination_coords,
                candidate_stations=self.req.candidate_stations,
                city=self.req.city, feasibility_result=feas,
            )
            stops = self._rank(charging.recommendations)
        primary = stops[0] if stops else None
        backup = next((s for s in stops[1:] if s.station_id != (primary.station_id if primary else None)), None)
        if primary:
            primary = replace(primary, is_primary=True, is_backup=False)
        if backup:
            backup = replace(backup, is_primary=False, is_backup=True)
        return _Run(trip, feas, charging, stops, primary, backup, changes or [], label, trip.duration_mins)

    def _rank(self, stops: List[RecommendedStop]) -> List[RecommendedStop]:
        """Engine order is the baseline; the driver's explicit preferences nudge it."""
        p = self.prefs
        scored = []
        for idx, s in enumerate(stops):
            meta = self.meta.get(s.station_id, {})
            basis = describe_station_data(meta, s.status, self.now)["status_basis"]
            score = float(idx)
            if s.requires_additional_stop:
                score += 3.0
            if p.prefer_reliable_charging:
                score += {"directory_recent": -2.0, "directory_stale": 0.5, "directory_undated": 1.5}.get(basis, 2.0)
            if p.prefer_faster_chargers:
                score -= min(s.effective_charging_kw, 150.0) / 50.0
            if s.station_id in p.familiar_station_ids:
                score -= 1.5
            scored.append((score, idx, s))
        scored.sort(key=lambda t: (t[0], t[1]))
        return [s for _, _, s in scored]


# ── Presentation ──────────────────────────────────────────────────────────────

def _fmt_pct(v: float) -> str:
    return f"{v:.0f}%"


def _present_stop(
    stop: RecommendedStop, eng: _Engine, run: _Run, role: str,
) -> Dict[str, Any]:
    meta = eng.meta.get(stop.station_id, {})
    data = describe_station_data(meta, stop.status, eng.now)

    raw_power = meta.get("power_kw")
    has_power = isinstance(raw_power, (int, float)) and raw_power > 0 and bool(meta.get("source") or meta.get("sources"))
    static = is_static_only(meta)
    power_listed = has_power and not static
    power_basis = "listed" if power_listed else ("registry_unverified" if has_power else "unknown")
    ac_only = bool(stop.matched_connectors) and all("(AC Slow" in c for c in stop.matched_connectors)

    reasons: List[str] = []
    plug = eng.vehicle.plug_type
    if ac_only:
        reasons.append(f"it has a compatible AC connector for your {plug} (slow charging only)")
    else:
        reasons.append(f"its connector matches your vehicle ({plug})")
    reasons.append("it is almost on your route" if stop.detour_km <= 1.0 else f"it adds only {stop.detour_km:.1f} km" if stop.detour_km <= 5 else f"it adds {stop.detour_km:.1f} km of detour")
    reasons.append(f"you would reach it with about {_fmt_pct(stop.arrival_soc_pct)} battery")
    if power_listed:
        reasons.append(f"it is listed at {raw_power:.0f} kW")
    p = eng.prefs
    if p.prefer_reliable_charging and data["status_basis"] == "directory_recent":
        reasons.append("its listing was updated recently, which you prefer")
    if p.prefer_faster_chargers and power_listed and raw_power >= 50:
        reasons.append("it is a fast charger, which you prefer")
    if stop.station_id in p.familiar_station_ids:
        reasons.append("you have used it before")
    why = "Recommended because " + ", ".join(reasons[:-1]) + (" and " if len(reasons) > 1 else "") + reasons[-1] + "."
    if role == "backup":
        why = "A backup in case the first stop is busy or unavailable. " + why

    return {
        "role": role,
        "station_id": stop.station_id,
        "name": stop.name,
        "latitude": stop.latitude,
        "longitude": stop.longitude,
        "address": stop.address,
        "operator": stop.operator,
        "connectors_matched": stop.matched_connectors,
        "ac_only": ac_only,
        "detour_km": stop.detour_km,
        "detour_mins": stop.detour_mins,
        "distance_along_route_km": stop.distance_along_route_km,
        "arrival_soc_pct": stop.arrival_soc_pct,
        "power_kw_listed": float(raw_power) if power_listed else None,
        "power_basis": power_basis,
        "assumed_power_kw": None if power_listed else stop.power_kw,
        "charge_to_pct": stop.target_departure_soc_pct,
        "charge_mins": stop.estimated_charge_mins,
        "charge_time_is_estimate": not power_listed,
        "needs_additional_charge_later": stop.requires_additional_stop,
        "recent_driver_reports": len(stop.recent_reports or []),
        "why": why,
        **data,
    }


def _present_option(kind: str, title: str, run: _Run, eng: _Engine) -> Dict[str, Any]:
    f = run.feasibility
    stops_out: List[Dict[str, Any]] = []
    if run.primary:
        stops_out.append(_present_stop(run.primary, eng, run, "primary"))
    if run.backup:
        stops_out.append(_present_stop(run.backup, eng, run, "backup"))

    extra_mins = None
    total_mins = None
    if run.primary:
        extra_mins = round(run.primary.detour_mins + run.primary.estimated_charge_mins, 0)
    if run.duration_mins is not None:
        total_mins = round(run.duration_mins + (extra_mins or 0), 0)

    return {
        "kind": kind,
        "title": title,
        "route_label": run.route_label,
        "verdict": f.verdict.value,
        "viability": _viability(run),
        "distance_km": run.trip.distance_km,
        "drive_mins": run.duration_mins,
        "charging_extra_mins": extra_mins,
        "total_mins": total_mins,
        "energy_kwh": f.nominal_energy_kwh,
        "arrival_soc_pct": f.nominal_arrival_soc_pct,
        "arrival_soc_range_pct": list(f.arrival_soc_range_pct),
        "reserve_target_pct": run.trip.reserve_buffer_pct,
        "assumption_changes": run.changes,
        "arrival_soc_with_stop_pct": run.primary.destination_soc_pct if run.primary else None,
        "charging_stops": stops_out,
        "charging_stops_needed": 1 if f.verdict == FeasibilityVerdict.CHARGING_NEEDED else 0,
        "charging_optional": f.verdict == FeasibilityVerdict.CAUTION,
        "stations_evaluated": run.charging.stations_evaluated if run.charging else 0,
        "rejection_summary": run.charging.rejection_summary if run.charging else {},
        "summary": "",  # filled by _explain
    }


def _explain(opt: Dict[str, Any], run: _Run, base: Optional[_Run]) -> str:
    """One honest sentence on why this option is on the table - built from its own numbers."""
    f = run.feasibility
    kind = opt["kind"]
    arr = _fmt_pct(f.nominal_arrival_soc_pct)
    res = _fmt_pct(run.trip.reserve_buffer_pct)
    if kind == "balanced":
        if f.verdict == FeasibilityVerdict.SAFE:
            return f"Your usual way: you should arrive with about {arr}, comfortably above your {res} reserve, with no charging."
        if run.primary:
            return f"Your usual way, with one stop at {run.primary.name} so you still arrive with at least {res} in reserve."
        return f"Your usual way, but no compatible charger could be confirmed that fits your battery and reserve."
    if kind == "fewer_charging":
        gain = f.nominal_arrival_soc_pct - base.feasibility.nominal_arrival_soc_pct if base else 0
        tail = "so charging is not needed" if f.verdict == FeasibilityVerdict.SAFE else "so you need less charging"
        return f"Gentle driving and eco climate use less energy: about {gain:.0f} points more battery on arrival ({arr}), {tail}."
    if kind == "safer":
        if f.verdict == FeasibilityVerdict.SAFE:
            return f"Keeps a bigger buffer: you would still arrive with about {arr}, above a {res} reserve."
        return f"Keeps a bigger {res} buffer, which means adding a charging stop to stay on the safe side."
    if kind == "faster" and base:
        saved = (base.duration_mins or 0) + _extra(base) - (run.duration_mins or 0) - _extra(run)
        return f"{run.route_label} saves about {saved:.0f} min overall and still reaches with about {arr} battery."
    return ""


def _extra(run: _Run) -> float:
    return (run.primary.detour_mins + run.primary.estimated_charge_mins) if run.primary else 0.0


def _differs(a: _Run, b: _Run) -> bool:
    if a.feasibility.verdict != b.feasibility.verdict:
        return True
    pa, pb = a.primary, b.primary
    if (pa is None) != (pb is None):
        return True
    if pa and pb:
        if pa.station_id != pb.station_id:
            return True
        if abs(pa.target_departure_soc_pct - pb.target_departure_soc_pct) >= 2 or abs(pa.estimated_charge_mins - pb.estimated_charge_mins) >= 3:
            return True
    return False


# ── Recovery & warnings ───────────────────────────────────────────────────────

def _recovery(req: JourneyInput, eng: _Engine, rec: _Run) -> List[Dict[str, Any]]:
    f = rec.feasibility
    out: List[Dict[str, Any]] = []
    if f.verdict == FeasibilityVerdict.SAFE:
        return out
    stranded = f.verdict == FeasibilityVerdict.CHARGING_NEEDED and rec.primary is None

    if f.recommended_min_departure_soc_pct is not None and f.recommended_min_departure_soc_pct <= 100:
        need = min(100.0, float(int(f.recommended_min_departure_soc_pct) + 1))
        if need > req.start_battery_pct:
            out.append({
                "text": f"Charge to about {need:.0f}% before you leave to reach your destination with your reserve intact.",
                "action": {"kind": "set_battery", "value": need, "label": f"See it at {need:.0f}%"},
            })
    elif f.recommended_min_departure_soc_pct is not None:
        out.append({"text": "Even a full battery would not cover this distance with your reserve, so plan to charge along the way.", "action": None})

    # What-if: gentle driving + eco climate (re-run through the same engine)
    if req.driving_style != "eco" or req.hvac_mode not in ("eco", "off"):
        try:
            alt = eng.run(eng.trip(driving_style="eco", hvac_mode="eco" if req.hvac_mode not in ("off",) else "off"), ["Eco driving", "Eco climate"])
            if _tier(alt.feasibility.verdict) < _tier(f.verdict):
                out.append({
                    "text": f"Driving gently with eco climate would leave you with about {alt.feasibility.nominal_arrival_soc_pct:.0f}% on arrival.",
                    "action": {"kind": "set_driving_style", "value": "eco", "label": "Try gentle driving"},
                })
        except ValueError:
            pass

    if req.payload_kg > 120:
        lighter = eng.run(eng.trip(payload_kg=75.0), ["Lighter load"])
        if _tier(lighter.feasibility.verdict) < _tier(f.verdict):
            out.append({"text": "A lighter load (driver only) would make this journey work.", "action": {"kind": "set_payload", "value": 75, "label": "Try driver only"}})

    if stranded and rec.charging is not None:
        rs = rec.charging.rejection_summary
        if rec.charging.stations_evaluated == 0:
            out.append({"text": "No charging stations were available to check along this journey, so we cannot plan a stop for you.", "action": None})
        else:
            bits = []
            if rs.get("unreachable"):
                bits.append(f"{rs['unreachable']} are too far for your current battery")
            if rs.get("incompatible_connector"):
                bits.append(f"{rs['incompatible_connector']} do not fit your {eng.vehicle.plug_type} connector")
            if rs.get("non_operational"):
                bits.append(f"{rs['non_operational']} are listed as unavailable")
            if rs.get("excessive_detour"):
                bits.append(f"{rs['excessive_detour']} are too far off your route")
            if bits:
                out.append({"text": "Of the stations we checked, " + "; ".join(bits) + ". Charging before you leave is the safest fix.", "action": None})

    for tip in f.mitigation_advice:
        if "charging stop" in tip.lower():
            continue  # redundant with the stop card, or contradicts "no stop could be confirmed"
        if all(tip.lower()[:40] not in o["text"].lower() for o in out):
            out.append({"text": tip, "action": None})
    return out


def _warnings(req: JourneyInput, profile: Dict[str, Any], rec: _Run, opt: Dict[str, Any]) -> List[Dict[str, str]]:
    w: List[Dict[str, str]] = []
    if req.origin_is_approximate:
        w.append({"level": "info", "text": "Your starting point is approximate (city centre), so distances to chargers are approximate too."})
    for rf in rec.feasibility.risk_factors:
        if rf.severity in ("high", "medium"):
            w.append({"level": "warn", "text": rf.description})
    for st in opt["charging_stops"]:
        if st["status_basis"] in ("unknown", "directory_stale", "directory_undated"):
            w.append({"level": "warn", "text": f"{st['name']}: {st['status_label']}. Have a backup in mind."})
        if st["needs_additional_charge_later"] and st["role"] == "primary":
            w.append({"level": "warn", "text": f"One stop at {st['name']} will not be enough for the whole journey. You will need another charge further on."})
        if st["role"] == "primary" and st["recent_driver_reports"]:
            w.append({"level": "info", "text": f"{st['name']} has {st['recent_driver_reports']} recent driver report(s). Check them before you rely on it."})
    if rec.charging and rec.charging.stations_evaluated == 0 and rec.feasibility.verdict != FeasibilityVerdict.SAFE:
        w.append({"level": "alert", "text": "We had no charging-station data for this area, so no stop could be confirmed."})
    return w


def _constraint_notes(req: JourneyInput, rec: Dict[str, Any], runs: Dict[str, Any]) -> List[Dict[str, str]]:
    """Tell the driver, plainly, where a request could not be fully honoured."""
    c, out = req.constraints, []
    stops = [s for s in rec["charging_stops"] if s["role"] == "primary"]
    if c.max_charging_stops is not None:
        if c.max_charging_stops == 0 and (stops or rec["verdict"] == "CHARGING_NEEDED"):
            out.append({"level": "warn", "text": "You asked for no charging stops, but this journey needs one to arrive with your reserve."})
        elif stops and stops[0]["needs_additional_charge_later"] and c.max_charging_stops <= 1:
            out.append({"level": "warn", "text": f"You asked for at most {c.max_charging_stops} stop(s), but one stop will not be enough for this whole journey."})
    if c.charging_speed == "fast" and stops:
        p = stops[0]
        if p["power_kw_listed"] is None or p["power_kw_listed"] < FAST_KW:
            out.append({"level": "warn", "text": f"You asked for fast charging, but the best available stop is not listed as a fast charger ({FAST_KW:.0f} kW or more)."})
    if c.route_preference == "faster" and "faster" not in runs:
        out.append({"level": "info", "text": "No faster route was available to compare, so this is your usual route."})
    if c.route_preference == "economical":
        out.append({"level": "info", "text": "Charging cost is not used to rank chargers because prices are not reliably known."})
    return out


def _assumptions(req: JourneyInput, profile: Dict[str, Any]) -> List[str]:
    a = []
    if req.ambient_temp_c is None:
        a.append(f"Temperature assumed {DEFAULT_AMBIENT_C:.0f}°C - live weather is not connected.")
    else:
        a.append(f"Temperature set to {req.ambient_temp_c:.0f}°C.")
    a.append("Traffic is not included in the energy estimate.")
    if req.route_source == "osrm":
        a.append("Distance and time come from road routing.")
    elif req.route_source == "corridor_table":
        a.append("Distance comes from the saved corridor table, not live routing.")
    if req.elevation_source == "corridor_table":
        a.append("Climb comes from the saved corridor table.")
    elif req.elevation_gain_m == 0:
        a.append("No elevation data - the route is treated as flat.")
    a.append(f"Passenger and cargo weight: {req.payload_kg:.0f} kg.")
    for fld in profile["estimated_fields"]:
        a.append(f"Your {fld} is estimated because it is not on your vehicle record.")
    return a


# ── Public API ────────────────────────────────────────────────────────────────

def analyze_journey(req: JourneyInput, prefs: Optional[Preferences] = None, now: Optional[datetime] = None) -> Dict[str, Any]:
    prefs = prefs or Preferences()
    c = req.constraints
    # Trip-level requests behave like preferences for this journey only (nothing is stored).
    prefs = replace(
        prefs,
        prefer_reliable_charging=prefs.prefer_reliable_charging or c.route_preference == "reliable_chargers",
        prefer_faster_chargers=prefs.prefer_faster_chargers or c.charging_speed == "fast",
        prefer_fewer_stops=prefs.prefer_fewer_stops or c.route_preference == "fewer_stops",
    )
    now = now or datetime.now(timezone.utc)
    vehicle, profile = resolve_vehicle(req.vehicle)
    eng = _Engine(req, vehicle, prefs, now)

    runs: Dict[str, Tuple[str, _Run]] = {}
    base = eng.run(eng.trip(), [], "Your route")
    runs["balanced"] = ("Best balanced journey", base)

    # Lowest charging dependency: gentle driving + eco climate (both are existing engine inputs)
    eco_hvac = "off" if req.hvac_mode == "off" or not vehicle.has_cabin_hvac else "eco"
    if req.driving_style != "eco" or req.hvac_mode not in ("eco", "off"):
        alt = eng.run(eng.trip(driving_style="eco", hvac_mode=eco_hvac), ["Gentle (eco) driving", "Eco climate"], base.route_label)
        better_tier = _tier(alt.feasibility.verdict) < _tier(base.feasibility.verdict)
        less_charge = (
            base.primary and alt.primary and (base.primary.required_charge_kwh - alt.primary.required_charge_kwh) >= 1.0
        )
        if better_tier or less_charge:
            runs["fewer_charging"] = ("Lowest charging dependency", alt)

    # Safer: larger arrival reserve
    if req.reserve_buffer_pct < 40:
        safe_res = min(50.0, max(req.reserve_buffer_pct + 10.0, 25.0))
        alt = eng.run(eng.trip(reserve_buffer_pct=safe_res), [f"Arrive with at least {safe_res:.0f}% in reserve"], base.route_label)
        if _differs(alt, base):
            runs["safer"] = ("Safer, larger reserve", alt)

    # Faster: only from real alternative routes with real durations
    if req.duration_mins:
        best: Optional[Tuple[float, str, _Run]] = None
        base_total = req.duration_mins + _extra(base)
        for i, r in enumerate(req.route_alternatives):
            d, t = r.get("distance_km"), r.get("duration_mins")
            if not d or not t or d <= 0 or t <= 0:
                continue
            alt = eng.run(
                eng.trip(distance_km=float(d), duration_mins=float(t),
                         elevation_gain_m=float(r.get("elevation_gain_m", req.elevation_gain_m))),
                [], str(r.get("label") or f"Alternative route {i + 1}"),
            )
            total = float(t) + _extra(alt)
            if _viability(alt) >= _viability(base) and total <= base_total * 0.95 and (best is None or total < best[0]):
                best = (total, "faster", alt)
        if best:
            runs["faster"] = ("Faster journey", best[2])

    # Present
    options: List[Dict[str, Any]] = []
    for kind, (title, run) in runs.items():
        opt = _present_option(kind, title, run, eng)
        opt["summary"] = _explain(opt, run, base)
        options.append(opt)

    # Recommendation: best viability; the driver's stated preference breaks ties; balanced wins otherwise
    order = {"balanced": 0, "safer": 1, "fewer_charging": 2, "faster": 3}

    def _rank(o: Dict[str, Any]) -> Tuple[int, int, int]:
        wanted = {"safer": "safer", "faster": "faster"}.get(c.route_preference or "")
        if wanted is None and prefs.prefer_fewer_stops:
            wanted = "fewer_charging"
        bonus = 1 if o["kind"] == wanted else 0
        return (-o["viability"], -bonus, order[o["kind"]])

    options.sort(key=_rank)
    rec_opt = options[0]
    rec_run = runs[rec_opt["kind"]][1]
    rec_opt["recommended"] = True
    for o in options[1:]:
        o["recommended"] = False

    # Explain the recommendation choice honestly
    bv = _viability(runs["balanced"][1])
    if rec_opt["kind"] == "balanced":
        rec_opt["recommendation_reason"] = rec_opt["summary"]
    elif rec_opt["viability"] > bv:
        gain = {3: "avoids charging altogether", 2: "gets you there with a confirmed charging stop", 1: "gets you closer to a workable plan"}[rec_opt["viability"]]
        rec_opt["recommendation_reason"] = f"Recommended because, unlike the balanced plan, this one {gain}. " + rec_opt["summary"]
    else:
        rec_opt["recommendation_reason"] = "Recommended because it needs less charging, which matches your preference for fewer stops. " + rec_opt["summary"]

    verdict = rec_run.feasibility.verdict
    arr = rec_run.feasibility.nominal_arrival_soc_pct
    res = rec_run.trip.reserve_buffer_pct
    if verdict == FeasibilityVerdict.SAFE:
        headline, detail = "Your journey looks achievable.", f"You should arrive with about {arr:.0f}% battery, above your {res:.0f}% reserve."
    elif rec_run.primary and verdict == FeasibilityVerdict.CAUTION:
        headline, detail = "Achievable, with a thin margin.", f"You would arrive with about {arr:.0f}%, which could dip below your {res:.0f}% reserve in worse conditions. A short top-up is suggested."
    elif verdict == FeasibilityVerdict.CAUTION:
        headline, detail = "Achievable, but the margin is thin.", f"You would arrive with about {arr:.0f}%, close to your {res:.0f}% reserve, and we could not confirm a charger for a top-up."
    elif rec_run.primary:
        multi = rec_run.primary.requires_additional_stop
        headline = "You will likely need more than one charging stop." if multi else "You may need one charging stop."
        detail = f"Charging at {rec_run.primary.name} lets you arrive with your {res:.0f}% reserve intact."
    else:
        headline, detail = "This journey is not achievable on your current battery.", "We could not confirm a reachable, compatible charger that fixes it. See the ways to recover below."

    recovery = _recovery(req, eng, rec_run)
    warnings = _warnings(req, profile, rec_run, rec_opt)
    warnings += _constraint_notes(req, rec_opt, runs)

    return {
        "headline": headline,
        "detail": detail,
        "verdict": verdict.value,
        "recommended_kind": rec_opt["kind"],
        "options": options,
        "recovery": recovery,
        "warnings": warnings,
        "assumptions": _assumptions(req, profile),
        "vehicle": profile,
        "applied_preferences": [
            k for k in ("prefer_reliable_charging", "prefer_faster_chargers", "prefer_fewer_stops") if getattr(prefs, k)
        ] + (["familiar_stations"] if prefs.familiar_station_ids else []),
        "generated_at": now.isoformat(),
    }


# ── Natural-language convenience (deterministic; fills the form, nothing more) ──

_PCT = r"(\d{1,3}(?:\.\d+)?)\s*(?:%|percent|per\s*cent|pratishat|प्रतिशत|टक्के)"


def parse_journey_text(text: str, known_destinations: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Pull a destination, battery level and reserve out of a short sentence. This is a
    rule-based form-filler: it only returns what it can see in the text.
    """
    t = " " + (text or "").strip() + " "
    low = t.lower()
    out: Dict[str, Any] = {"recognized": []}

    m = re.search(rf"(?:reserve|buffer|spare)\D{{0,12}}{_PCT}|{_PCT}\s*(?:reserve|buffer|spare)|(?:arrive|reach)\w*\s+with\s+(?:at\s+least\s+)?{_PCT}|(?:keep|maintain|have)\s+(?:at\s+least\s+)?{_PCT}(?=[^.]*\b(?:arriv|reach|get there|when i)\w*)|at\s+least\s+{_PCT}", low)
    if m:
        val = next(g for g in m.groups() if g)
        v = float(val)
        if 0 <= v <= 50:
            out["reserve_pct"] = v
            out["recognized"].append(f"{v:.0f}% reserve")
        low = low[:m.start()] + " " + low[m.end():]

    m = re.search(_PCT, low)
    if m:
        v = float(m.group(1))
        if 0 <= v <= 100:
            out["battery_pct"] = v
            out["recognized"].append(f"{v:.0f}% battery")

    if re.search(r"\b(eco|gentle|gently|efficient)\b", low):
        out["driving_style"] = "eco"
        out["recognized"].append("gentle driving")
    elif re.search(r"\b(sport|sporty|sportily|aggressive(?:ly)?|in a hurry)\b", low):
        out["driving_style"] = "sport"
        out["recognized"].append("sporty driving")
    if re.search(r"\b(ac|a/c|air ?con\w*)\s+off\b|\bno\s+(ac|a/c|air ?con\w*)\b|\bwithout\s+(ac|a/c)\b", low):
        out["hvac_mode"] = "off"
        out["recognized"].append("climate off")

    dest = None
    for name in sorted(known_destinations or [], key=len, reverse=True):
        if name.lower() in low:
            dest = name
            break
    if dest:
        out["destination"] = dest
        out["recognized"].append(f"to {dest}")
    else:
        m = re.search(r"\bto\s+([a-z][a-z .\-]{1,40}?)(?=\s+(?:with|at|keep|and|on|in|using|\d)|[,.;]|\s*$)", low)
        if m:
            out["destination_unmatched"] = m.group(1).strip().title()
    return out
