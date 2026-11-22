"""
backend/graph/simulation.py
===========================
Clearly labelled SIMULATED operating data for the station-owner demo.

Real owner operating data (sessions, meter readings, downtime) does not exist
in this project yet. This module generates a deterministic 30-day history for
the demo station so the owner dashboard can show utilisation, energy and
revenue analytics. Every output carries `is_simulated: true`. Nothing here is
written to Neo4j, and nothing here is presented as real.

The tariff is an assumed demo value, not a real operator price.
"""

from __future__ import annotations

import random
from typing import Any, Dict, List, Optional

DEMO_TARIFF_PER_KWH_INR = 18.0  # assumed demo tariff, not a real price
DEMO_SEED = 20261122
SIMULATION_DAYS = 30
DEFAULT_POWER_KW = 30.0


def simulate_owner_month(
    station_id: str,
    max_power_kw: Optional[float],
    connector_count: int,
    days: int = SIMULATION_DAYS,
    seed: int = DEMO_SEED,
    tariff_per_kwh: float = DEMO_TARIFF_PER_KWH_INR,
) -> Dict[str, Any]:
    power = max_power_kw or DEFAULT_POWER_KW
    points = max(1, connector_count)
    rng = random.Random(f"{seed}:{station_id}")

    sessions: List[Dict[str, Any]] = []
    daily: List[Dict[str, Any]] = []
    downtime_events: List[Dict[str, Any]] = []
    total_minutes_available = days * 24 * 60 * points

    for day in range(days):
        day_sessions = rng.randint(3, 9)
        day_energy = 0.0
        day_busy_minutes = 0
        for _ in range(day_sessions):
            duration_min = rng.randint(20, 90)
            energy = round(power * (duration_min / 60) * rng.uniform(0.45, 0.8), 2)
            day_energy += energy
            day_busy_minutes += duration_min
            sessions.append({
                "day": day + 1,
                "duration_minutes": duration_min,
                "energy_kwh": energy,
                "revenue_inr": round(energy * tariff_per_kwh, 2),
            })
        # roughly one fault in every ten days
        downtime_min = 0
        if rng.random() < 0.1:
            downtime_min = rng.randint(30, 180)
            downtime_events.append({"day": day + 1, "downtime_minutes": downtime_min, "reason": "simulated fault"})

        available_minutes = 24 * 60 * points - downtime_min
        daily.append({
            "day": day + 1,
            "sessions": day_sessions,
            "energy_kwh": round(day_energy, 2),
            "revenue_inr": round(day_energy * tariff_per_kwh, 2),
            "busy_minutes": day_busy_minutes,
            "downtime_minutes": downtime_min,
            "availability_pct": round(100 * (available_minutes / (24 * 60 * points)), 1),
        })

    total_energy = round(sum(d["energy_kwh"] for d in daily), 2)
    total_revenue = round(sum(d["revenue_inr"] for d in daily), 2)
    total_busy = sum(d["busy_minutes"] for d in daily)
    total_downtime = sum(d["downtime_minutes"] for d in daily)

    return {
        "is_simulated": True,
        "station_id": station_id,
        "days": days,
        "tariff_per_kwh_inr": tariff_per_kwh,
        "tariff_note": "Assumed demo tariff, not a real operator price.",
        "summary": {
            "sessions": len(sessions),
            "energy_kwh": total_energy,
            "revenue_inr": total_revenue,
            "utilisation_pct": round(100 * total_busy / total_minutes_available, 1),
            "availability_pct": round(100 * (1 - total_downtime / (days * 24 * 60 * points)), 1),
            "downtime_minutes": total_downtime,
            "fault_events": len(downtime_events),
        },
        "daily": daily,
        "downtime_events": downtime_events,
    }
