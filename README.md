# EVverse 2.0 — EV Driver Companion

**EVverse 2.0** is a physics-informed electric vehicle companion app built for Indian drivers. It combines real-time charging station discovery, road-based navigation, and a deterministic range physics engine to answer the driver's core question: *"Will I make it?"*

Built for **HackFront India Grand Finale** · Track 6.1.

---

## What It Does

An EV driver can:
- **Manage their vehicle** — Select from a verified Indian EV fleet, track SoC, choose drive mode.
- **Discover nearby charging stations** — Multi-source live data from OCM, BEE, and OSM with connector compatibility filtering.
- **Plan a journey** — Physics-based feasibility verdict (SAFE / CAUTION / CHARGING REQUIRED) with real OSRM road distance, arrival battery estimate, and conditional charging stop recommendations.
- **Navigate on real roads** — OSRM-powered turn-by-turn navigation with live GPS tracking, route geometry on OSM tiles, and multi-leg charging waypoint support.
- **Manage a charging session** — Live telemetry display, target SoC control, and session cost tracking in ₹.
- **View their driver profile** — Vehicle info, regional preferences, and auto plug-compatibility settings.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12, FastAPI, Uvicorn, Pydantic v2, HTTPX, Pandas |
| **Frontend** | Next.js 16 (App Router, webpack), React 19, TypeScript 5, Tailwind CSS v4, Leaflet 1.9 |
| **Routing** | OSRM (public demo server — `router.project-osrm.org`) |
| **Map Tiles** | OpenStreetMap (`tile.openstreetmap.org`) — keyless, no watermark |
| **Station Data** | Open Charge Map (OCM) API, BEE National EV registry, OpenStreetMap Overpass |
| **Local Storage** | Zero-ORM SQLite (`data/driver.db`) |

---

## Quickstart

### Prerequisites
- Python 3.12+
- Node.js 20+
- `npm`

### 1. Backend (FastAPI — Port 8000)

Run from the **project root** (`C:\Dev\Projects\EV-VERSE\EV2.0`):

```bash
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Start backend
uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --reload
```

- Health check: http://127.0.0.1:8000/api/v1/health
- Swagger docs: http://127.0.0.1:8000/docs

### 2. Frontend (Next.js — Port 3000)

```bash
cd frontend
npm install

# Start dev server (use --webpack to avoid Turbopack build issues)
npm run dev -- --turbo=false
```

Open **http://localhost:3000** in your browser.

> **Note:** Use `npm run dev` with webpack (default). The Turbopack bundler has a known panic on `globals.css` during production builds — this is non-blocking for development. TypeScript (`npx tsc --noEmit`) is the authority for type safety checks.

---

## Sarvam AI (optional)

Natural-language, multilingual and voice journey input plus plain-language explanations. Off unless `SARVAM_API_KEY` is set; the planner works identically without it. See [docs/SARVAM_INTEGRATION.md](docs/SARVAM_INTEGRATION.md).

---

## Running Tests

### Backend Tests

```bash
# Activate venv first
.venv\Scripts\activate

# Run offline unit tests only (async API tests make external HTTP calls and will hang without network)
.venv\Scripts\python -m pytest backend/tests -k "not api_endpoint" -v
```

**Expected results:**
- `test_range_physics.py` — 25 passed
- `test_journey_risk.py` — 12 passed
- `test_charging_stop.py` — 15 passed
- `test_multi_source_integration.py` (offline unit tests) — 3 passed

> Tests named `test_live_stations_api_endpoint` and `test_trip_api.py` make real external HTTP calls to OCM/BEE APIs. Run them only with active internet access.

### Frontend Type Check

```bash
cd frontend
npx tsc --noEmit
```

**Expected:** 0 errors.

---

## Project Structure

```
EV2.0/
├── backend/
│   ├── api/
│   │   ├── main.py                  # FastAPI app, CORS, routers
│   │   ├── routers/                 # trip, stations, driver, monad endpoints
│   │   └── services/
│   │       ├── range_physics.py     # Longitudinal EV energy model
│   │       ├── journey_risk.py      # Feasibility verdict engine
│   │       ├── charging_stop.py     # Reachable charging stop recommender
│   │       └── multi_source_stations.py  # OCM + BEE + OSM integration
│   └── tests/
├── frontend/
│   └── src/
│       ├── app/users/stations/page.tsx   # Main driver app (single-page, 5 tabs)
│       ├── components/
│       │   ├── driver/
│       │   │   ├── VehicleCockpit.tsx    # Home tab: vehicle, range, cockpit
│       │   │   ├── JourneyPlanner.tsx    # Journey tab: feasibility planner
│       │   │   ├── ChargingConsole.tsx   # Charging tab: session management
│       │   │   ├── NavigationHUD.tsx     # Turn-by-turn navigation overlay
│       │   │   ├── StationDetailSheet.tsx # Station info bottom sheet
│       │   │   └── VehicleManager.tsx    # Fleet management modal
│       │   └── DriverMobileMap.tsx       # Leaflet map with OSM tiles
│       ├── lib/
│       │   ├── routeService.ts      # OSRM road routing client
│       │   ├── driverApi.ts         # Backend API client
│       │   ├── vehicleStorage.ts    # Vehicle persistence + sync
│       │   └── stationAdapter.ts    # Station enrichment + reporting
│       └── hooks/
│           └── useLiveData.ts       # Live station data hook
├── data/
│   └── driver.db                    # SQLite: driver sessions, vehicles, favourites
├── requirements.txt
└── README.md
```

---

## Architecture Notes

- **Single-page app**: All 5 driver tabs (`home`, `explore`, `journeys`, `charging`, `profile`) render in `/users/stations/page.tsx`. State is managed locally with React hooks and persisted via backend API and `localStorage`.
- **GPS Privacy**: Device coordinates are only used in-memory (passed to OSRM for routing and backend for physics). No coordinates are stored in SQLite, localStorage, or transmitted to any third-party analytics service.
- **Route Geometry**: Road routes use real OSRM geometry. Map tiles are standard OSM — keyless, no API key required.
- **Station Data**: The backend merges OCM, BEE, and OSM station sources with spatial deduplication. Falls back to local `candidate_zones.csv` when external APIs are unavailable.
