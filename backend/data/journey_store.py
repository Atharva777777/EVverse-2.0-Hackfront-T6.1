"""
backend/data/journey_store.py
=============================
Transparent personalization store for EVverse Journey Intelligence.

Design rules
------------
* Everything here is visible and editable by the driver (see /api/v1/journey/preferences).
* Preferences are only ever written from an explicit driver action: editing a preference,
  accepting a suggestion, or - when the driver has switched on "learn from my journeys" -
  recording a journey they chose to start.
* Learning is OPT-IN (`personalization_enabled`, default off).
* Suggestions are derived on demand from the driver's own history. They are never applied
  until the driver accepts them.
* Only coarse facts are kept per journey (destination name, distance, reserve, chosen
  station). Origin coordinates / GPS traces are never stored.
"""

from __future__ import annotations

import json
import statistics
import uuid
from collections import Counter
from typing import Any, Dict, List, Optional

from backend.data.driver_db import _now_iso, get_db_connection, init_driver_db

# Minimum evidence before a suggestion is surfaced.
MIN_EVIDENCE = 3

# key -> (type, validator description). Anything else is rejected.
PREFERENCE_SPECS: Dict[str, Dict[str, Any]] = {
    "personalization_enabled": {"type": bool, "label": "Learn from my journeys", "default": False},
    "prefer_reliable_charging": {"type": bool, "label": "Prefer reliable chargers over the shortest detour", "default": False},
    "prefer_faster_chargers": {"type": bool, "label": "Prefer faster chargers", "default": False},
    "prefer_fewer_stops": {"type": bool, "label": "Prefer fewer charging stops", "default": False},
    "default_reserve_pct": {"type": int, "label": "Usual arrival reserve", "default": None, "min": 0, "max": 50},
}


def ensure_journey_tables() -> None:
    init_driver_db()
    with get_db_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS journey_preferences (
                driver_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                source TEXT NOT NULL,
                evidence TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (driver_id, key),
                FOREIGN KEY (driver_id) REFERENCES driver_sessions(driver_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS journey_events (
                id TEXT PRIMARY KEY,
                driver_id TEXT NOT NULL,
                destination_name TEXT NOT NULL,
                distance_km REAL NOT NULL,
                option_kind TEXT NOT NULL,
                reserve_pct REAL NOT NULL,
                start_battery_pct REAL NOT NULL,
                stops_count INTEGER NOT NULL,
                station_id TEXT,
                station_name TEXT,
                station_power_kw REAL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (driver_id) REFERENCES driver_sessions(driver_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_journey_events_driver ON journey_events(driver_id);
            """
        )


# ── Preferences ───────────────────────────────────────────────────────────────

def _coerce(key: str, value: Any) -> Any:
    spec = PREFERENCE_SPECS.get(key)
    if spec is None:
        raise ValueError(f"Unknown preference '{key}'.")
    if value is None:
        return None
    if spec["type"] is bool:
        if not isinstance(value, bool):
            raise ValueError(f"Preference '{key}' must be true or false.")
        return value
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Preference '{key}' must be a number.")
    iv = int(round(value))
    if iv < spec["min"] or iv > spec["max"]:
        raise ValueError(f"Preference '{key}' must be between {spec['min']} and {spec['max']}.")
    return iv


def get_preferences(driver_id: str) -> Dict[str, Dict[str, Any]]:
    """Return every known preference with its value and where it came from."""
    ensure_journey_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT key, value, source, evidence, updated_at FROM journey_preferences WHERE driver_id = ?",
            (driver_id,),
        ).fetchall()
    stored = {r["key"]: r for r in rows}
    out: Dict[str, Dict[str, Any]] = {}
    for key, spec in PREFERENCE_SPECS.items():
        row = stored.get(key)
        out[key] = {
            "key": key,
            "label": spec["label"],
            "value": json.loads(row["value"]) if row else spec["default"],
            "is_set": row is not None,
            "source": row["source"] if row else "default",
            "evidence": row["evidence"] if row else None,
            "updated_at": row["updated_at"] if row else None,
        }
    return out


def set_preference(
    driver_id: str,
    key: str,
    value: Any,
    source: str = "explicit",
    evidence: Optional[str] = None,
) -> None:
    value = _coerce(key, value)
    ensure_journey_tables()
    with get_db_connection() as conn:
        if value is None:
            conn.execute("DELETE FROM journey_preferences WHERE driver_id = ? AND key = ?", (driver_id, key))
            return
        conn.execute(
            """
            INSERT INTO journey_preferences (driver_id, key, value, source, evidence, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(driver_id, key) DO UPDATE SET
                value = excluded.value, source = excluded.source,
                evidence = excluded.evidence, updated_at = excluded.updated_at
            """,
            (driver_id, key, json.dumps(value), source, evidence, _now_iso()),
        )


def reset_personalization(driver_id: str) -> Dict[str, int]:
    """Delete every stored preference and every recorded journey for this driver."""
    ensure_journey_tables()
    with get_db_connection() as conn:
        p = conn.execute("DELETE FROM journey_preferences WHERE driver_id = ?", (driver_id,)).rowcount
        e = conn.execute("DELETE FROM journey_events WHERE driver_id = ?", (driver_id,)).rowcount
    return {"preferences_removed": p, "journeys_removed": e}


# ── Journey history (opt-in) ──────────────────────────────────────────────────

def record_journey_event(driver_id: str, event: Dict[str, Any]) -> bool:
    """
    Record a journey the driver chose to start. No-op (returns False) unless the driver
    has switched personalization on.
    """
    prefs = get_preferences(driver_id)
    if not prefs["personalization_enabled"]["value"]:
        return False
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO journey_events (
                id, driver_id, destination_name, distance_km, option_kind, reserve_pct,
                start_battery_pct, stops_count, station_id, station_name, station_power_kw, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()), driver_id, event["destination_name"], event["distance_km"],
                event["option_kind"], event["reserve_pct"], event["start_battery_pct"],
                event["stops_count"], event.get("station_id"), event.get("station_name"),
                event.get("station_power_kw"), _now_iso(),
            ),
        )
    return True


def list_journey_events(driver_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    ensure_journey_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM journey_events WHERE driver_id = ? ORDER BY created_at DESC LIMIT ?",
            (driver_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def _charging_session_power(driver_id: str) -> List[float]:
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT max_power_kw FROM charging_sessions WHERE driver_id = ? AND max_power_kw > 0 "
            "ORDER BY created_at DESC LIMIT 30",
            (driver_id,),
        ).fetchall()
    return [float(r["max_power_kw"]) for r in rows]


def get_familiar_station_ids(driver_id: str) -> List[str]:
    """Stations the driver has actually charged at or chosen more than once (opt-in only)."""
    prefs = get_preferences(driver_id)
    if not prefs["personalization_enabled"]["value"]:
        return []
    counts: Counter[str] = Counter()
    with get_db_connection() as conn:
        for r in conn.execute(
            "SELECT station_id FROM charging_sessions WHERE driver_id = ?", (driver_id,)
        ).fetchall():
            counts[r["station_id"]] += 1
        for r in conn.execute(
            "SELECT station_id FROM journey_events WHERE driver_id = ? AND station_id IS NOT NULL", (driver_id,)
        ).fetchall():
            counts[r["station_id"]] += 1
    return [sid for sid, n in counts.items() if n >= 2]


# ── Suggestions (never applied automatically) ─────────────────────────────────

def derive_suggestions(driver_id: str) -> List[Dict[str, Any]]:
    """
    Suggest preferences from the driver's own authorised history. Returns [] unless the
    driver opted in. Each suggestion states exactly what evidence it is based on.
    """
    prefs = get_preferences(driver_id)
    if not prefs["personalization_enabled"]["value"]:
        return []

    events = list_journey_events(driver_id)
    session_power = _charging_session_power(driver_id)
    suggestions: List[Dict[str, Any]] = []

    def _add(key: str, value: Any, text: str, evidence: str) -> None:
        current = prefs[key]
        if current["is_set"] and current["value"] == value:
            return
        if current["is_set"] and current["source"] == "explicit":
            return  # never second-guess something the driver set by hand
        suggestions.append({"key": key, "value": value, "text": text, "evidence": evidence})

    if len(events) >= MIN_EVIDENCE:
        reserves = [e["reserve_pct"] for e in events]
        med = int(round(statistics.median(reserves)))
        if med >= 20:
            _add(
                "default_reserve_pct", med,
                f"You usually keep about {med}% in reserve. Use that as your starting point?",
                f"Median reserve across your last {len(events)} journeys.",
            )

        stop_events = [e for e in events if e["stops_count"] > 0]
        if len(events) >= MIN_EVIDENCE and len(stop_events) == 0:
            _add(
                "prefer_fewer_stops", True,
                "You tend to choose journeys without charging stops. Prefer fewer stops?",
                f"None of your last {len(events)} journeys included a charging stop.",
            )

    powers = [e["station_power_kw"] for e in events if e.get("station_power_kw")] + session_power
    if len(powers) >= MIN_EVIDENCE and statistics.median(powers) >= 50:
        _add(
            "prefer_faster_chargers", True,
            "You mostly use fast chargers. Prefer faster chargers when choosing stops?",
            f"Median charger power {statistics.median(powers):.0f} kW across {len(powers)} stops/sessions.",
        )

    return suggestions
