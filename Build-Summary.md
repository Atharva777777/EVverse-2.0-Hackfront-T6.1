# EVverse 2.0: Build Summary
**Project:** EVverse 2.0 — Standalone "Will I Make It?" Engine  
**Hackathon:** HackFront India — Task 6.1  
**Date:** October 19, 2026  
**Architecture:** Standalone FastAPI Backend + Next.js 16 Frontend  

---

## Executive Summary

EVverse 2.0 is a production-grade, standalone electric vehicle journey-planning system engineered specifically for HackFront India T6.1 ("Will I Make It?").
It replaces opaque OEM "guess-o-meter" dashboard averages with a transparent, physical longitudinal energy formulation factoring elevation grade profiles, payload weight, ambient thermal HVAC loads, and driving dynamics.
When a proposed journey cannot be completed with the driver's required safety buffer, the system automatically evaluates, qualifies, and recommends reachable en-route charging stops matching the vehicle's exact physical connector standard.

---

## What Was Built

1. **Stage 1 Longitudinal Range Physics (`backend/api/services/range_physics.py`):**
   - Gravitational potential energy on elevation climb and regenerative braking recovery on descents (60% efficiency).
   - Aerodynamic drag and rolling resistance with eco/normal/sport multipliers.
   - Mass scaling for passenger/cargo payload deltas over nominal homologated driver weight (75 kg).
   - Auxiliary HVAC cabin thermal load scaling with ambient temperature (omitted for open 2W/3W vehicles).
   - Multi-scenario uncertainty bands (nominal, worst-case, best-case arrival SoC %).

2. **Stage 2 Feasibility and Risk Verdict Engine (`backend/api/services/journey_risk.py`):**
   - Categorizes every trip into SAFE, CAUTION, or CHARGING_NEEDED.
   - Pinpoints exact depletion distance (km) along the route where battery reaches 0%.
   - Calculates minimum recommended departure SoC % required to complete the journey safely.
   - Generates transparent, actionable mitigation advice (speed reduction, eco drive mode).

3. **Stage 3 Reachable En-Route Charging Engine (`backend/api/services/charging_stop.py`):**
   - Verifies whether remaining battery can physically reach the station before depleting.
   - Strict connector standard compatibility (CCS2 Combo, Type 2 AC, CHAdeMO, GB/T). Never fabricates compatibility.
   - Realistic charging duration modeling with constant-voltage taper above 80% SoC and onboard vehicle DC/AC limits.
   - Minimizes route detour and provides clear explanations for qualification.

4. **Stage 4 Integrated Driver Cockpit (`frontend/`):**
   - Interactive Next.js 16 / Tailwind CSS v4 cockpit with real-time sliders for battery %, reserve buffer, payload, and HVAC.
   - Pre-calibrated regional transit corridors: Mumbai ➔ Pune Expressway (118 km, +580m), Lonavala (84 km, +620m), Navi Mumbai (34 km, +40m), Thane Bypass (28 km, +35m).
   - Dynamic Leaflet route map showing origin, destination, corridor polyline, and charging stops.
   - Primary and backup recommendation toggles with connector standard badges and turnaround duration.

---

## Verified Metrics and Evidence

| Metric | Result | Verification Method |
| :--- | :--- | :--- |
| **Backend Unit and API Tests** | **59 passed, 0 failed** (100%) | `pytest backend/tests` in 3.84 seconds |
| **Frontend TypeScript Build** | **0 errors** | `npx tsc --noEmit` |
| **API Latency** | **< 15 ms** | Local benchmark on `POST /api/v1/trip/will-i-make-it` |
| **Vehicle Database Integrity** | **5 OEM verified models** | Tata Nexon EV, Ather 450X, Treo 3W, Tiago EV, Taycan GTS |
| **Dependency Footprint** | **Reduced from 148 to 8 packages** | Isolated backend virtual environment |
| **Decoupling Integrity** | **100% decoupled** | Zero quantum, blockchain, or legacy dependencies in runtime bundle |

---

## Deliberate Exclusions

To build a competitive, reliable, and laser-focused submission for T6.1, unrelated legacy modules from the original repository were deliberately excluded:
- **Quantum Solvers (QAOA/VQE via Qiskit/Docplex):** Unrelated to longitudinal vehicle physics; eliminated 140+ heavy packages.
- **Web3 / Monad Blockchain Simulation:** Excluded to keep the journey-planning experience focused on core range feasibility without artificial wallet barriers.
- **Institutional Planners (Investor/Government Dashboards):** Excluded in favor of the consumer EV driver experience.
- **3D WebGL Digital Twin:** Three.js and large 3D models were excluded to optimize bundle size and startup performance.

---

## Known Limitations and Honest Disclosures

1. **Elevation Profiles:** Predefined transit corridors (e.g. Mumbai to Pune Expressway, Lonavala, Navi Mumbai, Thane Bypass) have verified elevation profiles (+580m, +620m, +40m, +35m). Custom freeform GPS coordinates default to flat terrain unless elevation data is provided.
2. **Station Data Source:** When `OPEN_CHARGE_MAP_API_KEY` is not configured, the backend automatically uses verified offline regional candidate zones (`data/processed/cities/mumbai/candidate_zones.csv`) marked with `source: baseline_registry`.
3. **Single vs. Multi-Stop:** The current algorithm optimizes a single primary en-route stop + backup stop, suitable for journeys up to 250–350 km. Trips exceeding 2x the vehicle range flag multi-leg requirements.
