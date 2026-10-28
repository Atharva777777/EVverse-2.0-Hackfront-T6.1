# EVverse 2.0 — "Will I Make It?" (HackFront India T6.1)

**EVverse 2.0** is a standalone electric vehicle journey-planning system engineered for **HackFront India Task 6.1 ("Will I Make It?")**. It calculates deterministic energy consumption, models scenario uncertainty, renders clear feasibility verdicts (SAFE, CAUTION, CHARGING_NEEDED), and recommends reachable, connector-compatible en-route charging stops.

---

## Key Features

1. **Longitudinal Range Physics Engine (`backend/api/services/range_physics.py`):**
   - Elevation grade climbing power and regenerative braking recovery (60% recovery efficiency).
   - Passenger/cargo payload delta mass scaling over nominal test weight (75 kg).
   - Auxiliary HVAC cabin thermal power scaling with ambient temperature (omitted for open 2W/3W vehicles).
   - Aerodynamic drag & rolling resistance with Eco, Normal, and Sport dynamics.
   - Physical parameter uncertainty bounds (nominal, worst-case, best-case arrival SoC %).

2. **Feasibility & Risk Verdict Engine (`backend/api/services/journey_risk.py`):**
   - Rigorous evaluation against driver's customizable Reserve Safety Buffer (default 15%).
   - Exact battery depletion distance (km) calculation.
   - Minimum recommended departure SoC % calculation.
   - Actionable mitigation advice (speed reduction, eco drive mode).

3. **Reachable En-Route Charging Stop Recommendations (`backend/api/services/charging_stop.py`):**
   - Verified physical reachability: validates remaining battery can reach the station.
   - Strict physical connector standard matching (CCS2 Combo, Type 2 AC, CHAdeMO, GB/T).
   - Realistic charging duration modeling with constant-voltage taper above 80% SoC and onboard vehicle hardware caps.
   - Route detour penalty minimization and transparent qualification explanations.

4. **Tactile Driver Journey Cockpit (`frontend/`):**
   - Next.js 16 / Tailwind CSS v4 cockpit with real-time reactive sliders.
   - Regional transit corridors: Mumbai ➔ Pune Expressway (118 km, +580m), Lonavala Ghats (84 km, +620m), Navi Mumbai (34 km, +40m), Thane Bypass (28 km, +35m).
   - Interactive Leaflet route map showing origin, destination, corridor polyline, and charging stops.
   - Primary and backup charging stop recommendation cards.

---

## Quickstart Guide

### Option A: One-Click Launch (Windows)
Double-click `run_demo.bat` in the project root or inside `prototype/run_demo.bat`.
This automatically starts both the FastAPI backend and Next.js frontend in separate terminal windows.

### Option B: Manual Launch

#### 1. Backend (FastAPI on Port 8000)
Run from the project root (`C:\Dev\Projects\EV-VERSE\EV2.0`):
```bash
# Create virtual environment (if not already created)
python -m venv .venv
# Activate virtual environment
.venv\Scripts\activate
# Install minimal dependencies (8 packages)
pip install -r requirements.txt
# Start FastAPI backend
uvicorn backend.api.main:app --reload --port 8000
```
- API Health Check: http://127.0.0.1:8000/api/v1/health
- Interactive Swagger Docs: http://127.0.0.1:8000/docs

#### 2. Frontend (Next.js 16 on Port 3000)
```bash
cd frontend
# Install dependencies
npm install
# Start Next.js development server
npm run dev
```
Open **http://localhost:3000** in your browser.

---

## Automated Verification & Test Commands

### Run Backend Pytest Suite
```bash
.venv\Scripts\python -m pytest backend/tests
```
**Result:** 59 passed in 3.84s (100% pass rate).

### Run Frontend TypeScript Compilation
```bash
cd frontend
npx tsc --noEmit
```
**Result:** 0 errors.

---

## Prototype Screenshots

Verified screenshots from browser test runs are preserved in `prototype/screenshots/`:
- `journey_planner_interface_1792421542812.png`: Porsche Taycan GTS, Mumbai ➔ Pune Expressway (118 km), 68% battery -> **SAFE TO PROCEED** (30.3% arrival SoC).
- `charging_needed_recommendation_1792421661757.png`: Starting battery reduced to 31% -> **CHARGING REQUIRED** (Depletion at km 97), Bandra Kurla Complex (BKC) Hub 150 kW CCS2 charger recommended.

---

## Architecture & Technology Stack

- **Backend:** Python 3.12, FastAPI 0.148, Uvicorn, Pydantic v2, HTTPX, Pandas.
- **Frontend:** Next.js 16.3 (App Router, webpack), React 19.2, TypeScript 5, Tailwind CSS v4, Leaflet 1.9, Lucide React.
- **Data:** Zero-ORM SQLite (`data/driver.db`), Open Charge Map API, verified candidate zone fallback registries.
- **Decoupling Integrity:** 100% decoupled from legacy quantum optimization, 3D WebGL assets, and blockchain simulations.
