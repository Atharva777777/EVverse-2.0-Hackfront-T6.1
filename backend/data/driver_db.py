"""
backend/data/driver_db.py
=========================
SQLite persistence engine for EV Verse driver profiles, garage vehicles,
preferences, favourites, station issue reports, and charging sessions.

Thread-safe, self-migrating, zero external ORM dependencies.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

# Default database path inside the project data directory
DB_PATH = Path(os.environ.get("DRIVER_DB_PATH", "data/driver.db"))

_lock = threading.Lock()

# ── Verified OEM Fleet Seeds ───────────────────────────────────────────────────
DEFAULT_SEED_VEHICLES = [
    {
        "id": "tata-nexon-ev",
        "make": "Tata",
        "model": "Nexon EV Long Range",
        "year": 2025,
        "image": "/images/car-tata-nexon.jpg",
        "battery_kwh": 40.5,
        "usable_kwh": 39.0,
        "current_battery_pct": 72,
        "wltp_range_km": 465,
        "efficiency_kwh100km": 14.5,
        "max_dc_speed_kw": 30,
        "max_ac_speed_kw": 7,
        "plug_type": "CCS2 Combo",
        "plug_image": "/images/plug-ccs2.png",
        "vin": "MAT624108PNA09821",
        "soh_pct": 99.2,
        "is_active": 1,
    },
    {
        "id": "ather-450x-gen3",
        "make": "Ather",
        "model": "450X (Gen 3)",
        "year": 2025,
        "image": "/images/scooter-ather-450x.jpg",
        "battery_kwh": 3.7,
        "usable_kwh": 3.24,
        "current_battery_pct": 84,
        "wltp_range_km": 150,
        "efficiency_kwh100km": 2.8,
        "max_dc_speed_kw": 3,
        "max_ac_speed_kw": 3,
        "plug_type": "Type 2 (AC)",
        "plug_image": "/images/plug-type2.png",
        "vin": "ME4ATH450XPN10492",
        "soh_pct": 98.9,
        "is_active": 0,
    },
    {
        "id": "mahindra-treo-auto",
        "make": "Mahindra",
        "model": "Treo Electric 3W Auto",
        "year": 2025,
        "image": "/images/auto-mahindra-treo.jpg",
        "battery_kwh": 7.37,
        "usable_kwh": 7.0,
        "current_battery_pct": 65,
        "wltp_range_km": 140,
        "efficiency_kwh100km": 5.4,
        "max_dc_speed_kw": 3,
        "max_ac_speed_kw": 3,
        "plug_type": "Type 2 (AC)",
        "plug_image": "/images/plug-type2.png",
        "vin": "MA1TR3W84PNA19024",
        "soh_pct": 97.8,
        "is_active": 0,
    },
    {
        "id": "tata-tiago-ev",
        "make": "Tata",
        "model": "Tiago EV TechLux",
        "year": 2025,
        "image": "/images/car-model.png",
        "battery_kwh": 24.0,
        "usable_kwh": 22.8,
        "current_battery_pct": 78,
        "wltp_range_km": 315,
        "efficiency_kwh100km": 12.8,
        "max_dc_speed_kw": 15,
        "max_ac_speed_kw": 7,
        "plug_type": "CCS2 Combo",
        "plug_image": "/images/plug-ccs2.png",
        "vin": "MAT612903PNA44102",
        "soh_pct": 98.4,
        "is_active": 0,
    },
    {
        "id": "porsche-taycan-gts",
        "make": "Porsche",
        "model": "Taycan GTS",
        "year": 2025,
        "image": "/images/car-porsche.png",
        "battery_kwh": 93.4,
        "usable_kwh": 83.7,
        "current_battery_pct": 68,
        "wltp_range_km": 504,
        "efficiency_kwh100km": 20.3,
        "max_dc_speed_kw": 270,
        "max_ac_speed_kw": 22,
        "plug_type": "CCS2 Combo",
        "plug_image": "/images/plug-ccs2.png",
        "vin": "WP0AA2Y15PSA92811",
        "soh_pct": 98.4,
        "is_active": 0,
    },
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_db_connection() -> Generator[sqlite3.Connection, None, None]:
    """Yield a SQLite connection configured for WAL mode with dict-like row access."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_driver_db() -> None:
    """Initialize driver database schema and run migrations idempotently."""
    with _lock:
        with get_db_connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS driver_sessions (
                    driver_id TEXT PRIMARY KEY,
                    token TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    email TEXT,
                    created_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_driver_sessions_token ON driver_sessions(token);

                CREATE TABLE IF NOT EXISTS driver_vehicles (
                    id TEXT NOT NULL,
                    driver_id TEXT NOT NULL,
                    make TEXT NOT NULL,
                    model TEXT NOT NULL,
                    year INTEGER NOT NULL,
                    image TEXT,
                    battery_kwh REAL NOT NULL,
                    usable_kwh REAL NOT NULL,
                    current_battery_pct INTEGER NOT NULL,
                    wltp_range_km INTEGER NOT NULL,
                    efficiency_kwh100km REAL NOT NULL,
                    max_dc_speed_kw INTEGER NOT NULL,
                    max_ac_speed_kw INTEGER NOT NULL,
                    plug_type TEXT NOT NULL,
                    plug_image TEXT,
                    vin TEXT,
                    soh_pct REAL NOT NULL,
                    is_active INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (id, driver_id),
                    FOREIGN KEY (driver_id) REFERENCES driver_sessions(driver_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_driver_vehicles_driver ON driver_vehicles(driver_id);

                CREATE TABLE IF NOT EXISTS driver_preferences (
                    driver_id TEXT PRIMARY KEY,
                    active_vehicle_id TEXT,
                    auto_compatibility INTEGER DEFAULT 1,
                    default_city TEXT DEFAULT 'Mumbai',
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (driver_id) REFERENCES driver_sessions(driver_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS driver_favourites (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    driver_id TEXT NOT NULL,
                    station_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(driver_id, station_id),
                    FOREIGN KEY (driver_id) REFERENCES driver_sessions(driver_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_driver_favourites_driver ON driver_favourites(driver_id);

                CREATE TABLE IF NOT EXISTS station_reports (
                    id TEXT PRIMARY KEY,
                    driver_id TEXT NOT NULL,
                    station_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    connector_type TEXT,
                    notes TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (driver_id) REFERENCES driver_sessions(driver_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_station_reports_station ON station_reports(station_id);

                CREATE TABLE IF NOT EXISTS charging_sessions (
                    id TEXT PRIMARY KEY,
                    driver_id TEXT NOT NULL,
                    station_id TEXT NOT NULL,
                    station_name TEXT NOT NULL,
                    kwh_delivered REAL NOT NULL,
                    duration_seconds INTEGER NOT NULL,
                    cost REAL NOT NULL,
                    max_power_kw REAL NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (driver_id) REFERENCES driver_sessions(driver_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_charging_sessions_driver ON charging_sessions(driver_id);

                CREATE TABLE IF NOT EXISTS driver_bookings (
                    id TEXT PRIMARY KEY,
                    driver_id TEXT NOT NULL,
                    station_id TEXT NOT NULL,
                    station_name TEXT NOT NULL,
                    bay_number TEXT NOT NULL,
                    connector_type TEXT NOT NULL,
                    duration_minutes INTEGER NOT NULL,
                    total_cost TEXT NOT NULL,
                    mon_amount TEXT NOT NULL,
                    wei_amount TEXT NOT NULL,
                    pin_code TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    expiry_time TEXT NOT NULL,
                    expiry_timestamp INTEGER NOT NULL,
                    payment_method TEXT NOT NULL,
                    tx_hash TEXT UNIQUE,
                    block_number INTEGER,
                    from_address TEXT,
                    to_address TEXT,
                    gas_used TEXT,
                    payment_status TEXT NOT NULL,
                    session_type TEXT DEFAULT 'hold_only',
                    target_kwh REAL,
                    target_battery_pct INTEGER,
                    created_at TEXT NOT NULL,
                    verified_at TEXT,
                    FOREIGN KEY (driver_id) REFERENCES driver_sessions(driver_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_driver_bookings_station ON driver_bookings(station_id);
                CREATE INDEX IF NOT EXISTS idx_driver_bookings_driver ON driver_bookings(driver_id);
                CREATE INDEX IF NOT EXISTS idx_driver_bookings_status ON driver_bookings(payment_status);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_bookings_tx_hash ON driver_bookings(tx_hash) WHERE tx_hash IS NOT NULL;
            """)


# ── Session & Auth Operations ──────────────────────────────────────────────────

def get_or_create_driver_session(token: Optional[str] = None, name: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve an existing driver session by token or create a new persistent driver session."""
    import secrets

    init_driver_db()
    now = _now_iso()

    with get_db_connection() as conn:
        if token:
            row = conn.execute(
                "SELECT * FROM driver_sessions WHERE token = ?", (token,)
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE driver_sessions SET last_seen_at = ? WHERE driver_id = ?",
                    (now, row["driver_id"]),
                )
                return dict(row)

        # Create new session
        new_driver_id = f"drv_{secrets.token_hex(8)}"
        new_token = f"tok_{secrets.token_urlsafe(24)}"
        driver_name = name or "EV Driver"

        conn.execute(
            """
            INSERT INTO driver_sessions (driver_id, token, name, email, created_at, last_seen_at)
            VALUES (?, ?, ?, NULL, ?, ?)
            """,
            (new_driver_id, new_token, driver_name, now, now),
        )

        # Seed initial default vehicles for this driver
        for v in DEFAULT_SEED_VEHICLES:
            conn.execute(
                """
                INSERT INTO driver_vehicles (
                    id, driver_id, make, model, year, image,
                    battery_kwh, usable_kwh, current_battery_pct, wltp_range_km,
                    efficiency_kwh100km, max_dc_speed_kw, max_ac_speed_kw,
                    plug_type, plug_image, vin, soh_pct, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    v["id"], new_driver_id, v["make"], v["model"], v["year"], v["image"],
                    v["battery_kwh"], v["usable_kwh"], v["current_battery_pct"], v["wltp_range_km"],
                    v["efficiency_kwh100km"], v["max_dc_speed_kw"], v["max_ac_speed_kw"],
                    v["plug_type"], v["plug_image"], v["vin"], v["soh_pct"], v["is_active"],
                    now, now,
                ),
            )

        # Set default preferences
        conn.execute(
            """
            INSERT INTO driver_preferences (driver_id, active_vehicle_id, auto_compatibility, default_city, updated_at)
            VALUES (?, ?, 1, 'Mumbai', ?)
            """,
            (new_driver_id, DEFAULT_SEED_VEHICLES[0]["id"], now),
        )

        row = conn.execute(
            "SELECT * FROM driver_sessions WHERE driver_id = ?", (new_driver_id,)
        ).fetchone()
        return dict(row)


# ── Vehicle Operations ─────────────────────────────────────────────────────────

def list_driver_vehicles(driver_id: str, page: int = 1, limit: int = 20) -> Dict[str, Any]:
    init_driver_db()
    offset = max(0, (page - 1) * limit)
    with get_db_connection() as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM driver_vehicles WHERE driver_id = ?", (driver_id,)
        ).fetchone()[0]

        rows = conn.execute(
            """
            SELECT * FROM driver_vehicles
            WHERE driver_id = ?
            ORDER BY created_at ASC
            LIMIT ? OFFSET ?
            """,
            (driver_id, limit, offset),
        ).fetchall()

        items = [dict(r) for r in rows]
        # Normalize boolean is_active
        for item in items:
            item["is_active"] = bool(item["is_active"])

        return {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
        }


def get_driver_vehicle(driver_id: str, vehicle_id: str) -> Optional[Dict[str, Any]]:
    init_driver_db()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM driver_vehicles WHERE driver_id = ? AND id = ?",
            (driver_id, vehicle_id),
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["is_active"] = bool(d["is_active"])
        return d


def create_driver_vehicle(driver_id: str, vehicle_data: Dict[str, Any]) -> Dict[str, Any]:
    init_driver_db()
    now = _now_iso()
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO driver_vehicles (
                id, driver_id, make, model, year, image,
                battery_kwh, usable_kwh, current_battery_pct, wltp_range_km,
                efficiency_kwh100km, max_dc_speed_kw, max_ac_speed_kw,
                plug_type, plug_image, vin, soh_pct, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                vehicle_data["id"],
                driver_id,
                vehicle_data["make"],
                vehicle_data["model"],
                vehicle_data.get("year", 2025),
                vehicle_data.get("image", "/images/car-model.png"),
                float(vehicle_data.get("battery_kwh", vehicle_data["usable_kwh"])),
                float(vehicle_data["usable_kwh"]),
                int(vehicle_data.get("current_battery_pct", 75)),
                int(vehicle_data.get("wltp_range_km", 450)),
                float(vehicle_data.get("efficiency_kwh100km", 18.0)),
                int(vehicle_data["max_dc_speed_kw"]),
                int(vehicle_data.get("max_ac_speed_kw", 11)),
                vehicle_data["plug_type"],
                vehicle_data.get("plug_image", "/images/plug-ccs2.png"),
                vehicle_data.get("vin", ""),
                float(vehicle_data.get("soh_pct", 99.0)),
                1 if vehicle_data.get("is_active") else 0,
                now,
                now,
            ),
        )

        row = conn.execute(
            "SELECT * FROM driver_vehicles WHERE driver_id = ? AND id = ?",
            (driver_id, vehicle_data["id"]),
        ).fetchone()
        d = dict(row)
        d["is_active"] = bool(d["is_active"])
        return d


def update_driver_vehicle(driver_id: str, vehicle_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    init_driver_db()
    now = _now_iso()
    with get_db_connection() as conn:
        existing = conn.execute(
            "SELECT * FROM driver_vehicles WHERE driver_id = ? AND id = ?",
            (driver_id, vehicle_id),
        ).fetchone()
        if not existing:
            return None

        # Build dynamic update
        fields = []
        values = []
        for col in [
            "make", "model", "year", "image", "battery_kwh", "usable_kwh",
            "current_battery_pct", "wltp_range_km", "efficiency_kwh100km",
            "max_dc_speed_kw", "max_ac_speed_kw", "plug_type", "plug_image",
            "vin", "soh_pct", "is_active",
        ]:
            if col in updates and updates[col] is not None:
                fields.append(f"{col} = ?")
                val = updates[col]
                if col == "is_active":
                    val = 1 if val else 0
                values.append(val)

        if not fields:
            d = dict(existing)
            d["is_active"] = bool(d["is_active"])
            return d

        fields.append("updated_at = ?")
        values.append(now)

        values.extend([driver_id, vehicle_id])
        query = f"UPDATE driver_vehicles SET {', '.join(fields)} WHERE driver_id = ? AND id = ?"
        conn.execute(query, values)

        row = conn.execute(
            "SELECT * FROM driver_vehicles WHERE driver_id = ? AND id = ?",
            (driver_id, vehicle_id),
        ).fetchone()
        d = dict(row)
        d["is_active"] = bool(d["is_active"])
        return d


def delete_driver_vehicle(driver_id: str, vehicle_id: str) -> bool:
    init_driver_db()
    with get_db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM driver_vehicles WHERE driver_id = ? AND id = ?",
            (driver_id, vehicle_id),
        )
        return cursor.rowcount > 0


# ── Preferences Operations ─────────────────────────────────────────────────────

def get_driver_preferences(driver_id: str) -> Dict[str, Any]:
    init_driver_db()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM driver_preferences WHERE driver_id = ?", (driver_id,)
        ).fetchone()
        if not row:
            now = _now_iso()
            conn.execute(
                """
                INSERT OR IGNORE INTO driver_preferences (driver_id, active_vehicle_id, auto_compatibility, default_city, updated_at)
                VALUES (?, ?, 1, 'Mumbai', ?)
                """,
                (driver_id, DEFAULT_SEED_VEHICLES[0]["id"], now),
            )
            return {
                "driver_id": driver_id,
                "active_vehicle_id": DEFAULT_SEED_VEHICLES[0]["id"],
                "auto_compatibility": True,
                "default_city": "Mumbai",
            }
        return {
            "driver_id": row["driver_id"],
            "active_vehicle_id": row["active_vehicle_id"] or DEFAULT_SEED_VEHICLES[0]["id"],
            "auto_compatibility": bool(row["auto_compatibility"]),
            "default_city": row["default_city"] or "Mumbai",
        }


def update_driver_preferences(driver_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    init_driver_db()
    now = _now_iso()
    with get_db_connection() as conn:
        current = get_driver_preferences(driver_id)
        active_vehicle_id = updates.get("active_vehicle_id", current["active_vehicle_id"])
        auto_compat = updates.get("auto_compatibility", current["auto_compatibility"])
        default_city = updates.get("default_city", current["default_city"])

        conn.execute(
            """
            INSERT INTO driver_preferences (driver_id, active_vehicle_id, auto_compatibility, default_city, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(driver_id) DO UPDATE SET
                active_vehicle_id = excluded.active_vehicle_id,
                auto_compatibility = excluded.auto_compatibility,
                default_city = excluded.default_city,
                updated_at = excluded.updated_at
            """,
            (
                driver_id,
                active_vehicle_id,
                1 if auto_compat else 0,
                default_city,
                now,
            ),
        )

        return {
            "driver_id": driver_id,
            "active_vehicle_id": active_vehicle_id,
            "auto_compatibility": bool(auto_compat),
            "default_city": default_city,
        }


# ── Favourites Operations ──────────────────────────────────────────────────────

def list_driver_favourites(driver_id: str, page: int = 1, limit: int = 100) -> Dict[str, Any]:
    init_driver_db()
    offset = max(0, (page - 1) * limit)
    with get_db_connection() as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM driver_favourites WHERE driver_id = ?", (driver_id,)
        ).fetchone()[0]

        rows = conn.execute(
            """
            SELECT station_id, created_at FROM driver_favourites
            WHERE driver_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (driver_id, limit, offset),
        ).fetchall()

        station_ids = [r["station_id"] for r in rows]
        return {
            "station_ids": station_ids,
            "total": total,
            "page": page,
            "limit": limit,
        }


def add_driver_favourite(driver_id: str, station_id: str) -> bool:
    init_driver_db()
    now = _now_iso()
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO driver_favourites (driver_id, station_id, created_at)
            VALUES (?, ?, ?)
            """,
            (driver_id, station_id, now),
        )
        return True


def remove_driver_favourite(driver_id: str, station_id: str) -> bool:
    init_driver_db()
    with get_db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM driver_favourites WHERE driver_id = ? AND station_id = ?",
            (driver_id, station_id),
        )
        return cursor.rowcount > 0


# ── Station Reports Operations ────────────────────────────────────────────────

def list_station_reports(
    station_id: Optional[str] = None,
    driver_id: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> Dict[str, Any]:
    init_driver_db()
    offset = max(0, (page - 1) * limit)

    query = "SELECT * FROM station_reports WHERE 1=1"
    count_query = "SELECT COUNT(*) FROM station_reports WHERE 1=1"
    params: List[Any] = []

    if station_id:
        query += " AND station_id = ?"
        count_query += " AND station_id = ?"
        params.append(station_id)

    if driver_id:
        query += " AND driver_id = ?"
        count_query += " AND driver_id = ?"
        params.append(driver_id)

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"

    with get_db_connection() as conn:
        total = conn.execute(count_query, params).fetchone()[0]

        exec_params = list(params)
        exec_params.extend([limit, offset])
        rows = conn.execute(query, exec_params).fetchall()

        return {
            "items": [dict(r) for r in rows],
            "total": total,
            "page": page,
            "limit": limit,
        }


def create_station_report(driver_id: str, report_data: Dict[str, Any]) -> Dict[str, Any]:
    import secrets

    init_driver_db()
    now = _now_iso()
    report_id = f"REP-{int(datetime.now(timezone.utc).timestamp())}-{secrets.token_hex(3)}"

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO station_reports (id, driver_id, station_id, category, connector_type, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                driver_id,
                report_data["station_id"],
                report_data["category"],
                report_data.get("connector_type"),
                report_data.get("notes"),
                now,
            ),
        )

        row = conn.execute(
            "SELECT * FROM station_reports WHERE id = ?", (report_id,)
        ).fetchone()
        return dict(row)


# ── Charging Sessions Operations ──────────────────────────────────────────────

def list_charging_sessions(driver_id: str, page: int = 1, limit: int = 50) -> Dict[str, Any]:
    init_driver_db()
    offset = max(0, (page - 1) * limit)
    with get_db_connection() as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM charging_sessions WHERE driver_id = ?", (driver_id,)
        ).fetchone()[0]

        rows = conn.execute(
            """
            SELECT * FROM charging_sessions
            WHERE driver_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (driver_id, limit, offset),
        ).fetchall()

        return {
            "items": [dict(r) for r in rows],
            "total": total,
            "page": page,
            "limit": limit,
        }


def record_charging_session(driver_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
    import secrets

    init_driver_db()
    now = _now_iso()
    session_id = f"CS-{int(datetime.now(timezone.utc).timestamp())}-{secrets.token_hex(3)}"

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO charging_sessions (
                id, driver_id, station_id, station_name, kwh_delivered,
                duration_seconds, cost, max_power_kw, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                driver_id,
                session_data["station_id"],
                session_data["station_name"],
                float(session_data["kwh_delivered"]),
                int(session_data["duration_seconds"]),
                float(session_data["cost"]),
                float(session_data["max_power_kw"]),
                now,
            ),
        )

        row = conn.execute(
            "SELECT * FROM charging_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        return dict(row)


# ── Driver Bookings & Monad Settlement Operations ─────────────────────────────

def create_driver_booking(driver_id: str, booking_data: Dict[str, Any]) -> Dict[str, Any]:
    """Persist a new driver booking record."""
    import secrets

    init_driver_db()
    now = _now_iso()
    booking_id = booking_data.get("id") or f"RES-{secrets.randbelow(9000) + 1000}-EV"
    pin_code = booking_data.get("pin_code") or str(secrets.randbelow(9000) + 1000)

    import time
    duration_min = int(booking_data.get("duration_minutes") or 30)
    raw_expiry_ts = booking_data.get("expiry_timestamp")
    try:
        expiry_ts = int(raw_expiry_ts) if raw_expiry_ts is not None else int(time.time() + duration_min * 60)
    except (ValueError, TypeError):
        expiry_ts = int(time.time() + duration_min * 60)

    target_kwh_val = None
    if booking_data.get("target_kwh") is not None:
        try:
            target_kwh_val = float(booking_data["target_kwh"])
        except (ValueError, TypeError):
            pass

    target_bat_val = None
    if booking_data.get("target_battery_pct") is not None:
        try:
            target_bat_val = int(booking_data["target_battery_pct"])
        except (ValueError, TypeError):
            pass

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO driver_bookings (
                id, driver_id, station_id, station_name, bay_number,
                connector_type, duration_minutes, total_cost, mon_amount,
                wei_amount, pin_code, start_time, expiry_time, expiry_timestamp,
                payment_method, tx_hash, block_number, from_address, to_address,
                gas_used, payment_status, session_type, target_kwh, target_battery_pct,
                created_at, verified_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                booking_id,
                driver_id,
                booking_data["station_id"],
                booking_data["station_name"],
                booking_data.get("bay_number") or "Bay 01",
                booking_data.get("connector_type") or "CCS2 Combo",
                duration_min,
                booking_data.get("total_cost") or "₹49",
                booking_data.get("mon_amount") or "0.025 MON",
                booking_data.get("wei_amount") or "0",
                pin_code,
                booking_data.get("start_time") or now,
                booking_data.get("expiry_time") or now,
                expiry_ts,
                booking_data.get("payment_method") or "monad_testnet",
                booking_data.get("tx_hash"),
                booking_data.get("block_number"),
                booking_data.get("from_address"),
                booking_data.get("to_address"),
                booking_data.get("gas_used"),
                booking_data.get("payment_status") or "pending_verification",
                booking_data.get("session_type") or "hold_only",
                target_kwh_val,
                target_bat_val,
                now,
                booking_data.get("verified_at"),
            ),
        )

        row = conn.execute(
            "SELECT * FROM driver_bookings WHERE id = ?", (booking_id,)
        ).fetchone()
        return dict(row)


def get_driver_booking(booking_id: str) -> Optional[Dict[str, Any]]:
    """Fetch booking by primary ID."""
    init_driver_db()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM driver_bookings WHERE id = ?", (booking_id,)
        ).fetchone()
        return dict(row) if row else None


def get_booking_by_tx_hash(tx_hash: str) -> Optional[Dict[str, Any]]:
    """Fetch booking by unique transaction hash to prevent duplicate submissions."""
    if not tx_hash:
        return None
    init_driver_db()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM driver_bookings WHERE LOWER(tx_hash) = LOWER(?)", (tx_hash.strip(),)
        ).fetchone()
        return dict(row) if row else None


def list_station_bookings(station_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """List confirmed bookings for station owners."""
    init_driver_db()
    with get_db_connection() as conn:
        if station_id:
            rows = conn.execute(
                """
                SELECT * FROM driver_bookings
                WHERE station_id = ? AND payment_status = 'confirmed'
                ORDER BY created_at DESC LIMIT ?
                """,
                (station_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM driver_bookings
                WHERE payment_status = 'confirmed'
                ORDER BY created_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]


def list_driver_bookings(driver_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """List bookings created by driver."""
    init_driver_db()
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM driver_bookings
            WHERE driver_id = ?
            ORDER BY created_at DESC LIMIT ?
            """,
            (driver_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]

