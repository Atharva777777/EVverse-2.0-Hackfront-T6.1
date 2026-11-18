# EVverse 2.0 — Technical Project Specification

**Track:** HackFront India Grand Finale · Task 6.1 — "Will I Make It?"
**Version:** 2.0 (Production Architecture)
**Branch:** `main`

---

## 1. Product Vision and Problem Statement

Indian EV drivers face a trust gap: OEM dashboard range estimates use static WLTP/ARAI cycles that fail on real-world routes because they ignore:

1. **Elevation**: Climbing the Western Ghats (Bhor Ghat, +580m) consumes dramatically more energy; descents recover it via regenerative braking.
2. **Payload**: Heavier passenger or cargo loads increase rolling resistance and kinetic inertia.
3. **HVAC**: Tropical ambient temperatures (35°C–45°C) force continuous cabin A/C, consuming 1.5–3.0 kW of auxiliary power.
4. **Connector Mismatch**: Drivers navigate to chargers only to find incompatible plug standards (CCS2 vs CHAdeMO vs Type 2).
5. **En-Route Reachability**: Charger icons on a map offer no guarantee that the driver's remaining battery can physically reach them.

**EVverse 2.0** solves this with a physics-informed, multi-source companion app that provides:
- Deterministic energy calculations with scenario uncertainty bounds.
- Clear feasibility verdicts: **SAFE**, **CAUTION**, **CHARGING REQUIRED**.
- Reachable, connector-compatible charging stop recommendations.
- Real road-based navigation using OSRM and OpenStreetMap.
- Live multi-source charging station discovery.

---

## 2. Core Driver Journey

A driver opens EVverse and can:

1. **Check vehicle readiness** on the Home cockpit (SoC, range, drive mode).
2. **Discover nearby stations** on the Explore map with live data and plug-compatibility filtering.
3. **Plan a journey** in the Journey Planner — input destination, departure SoC, receive a physics-based feasibility verdict and charging recommendations when needed.
4. **Navigate on real roads** — OSRM turn-by-turn navigation with GPS tracking and charging waypoint support.
5. **Manage a charging session** — live telemetry, target SoC, cost tracking in ₹.
6. **View their profile** — vehicle management, regional preferences, auto-compatibility toggle.

---

## 3. Technical Architecture

### Backend (Python 3.12 / FastAPI)

| Module | Responsibility |
|---|---|
| `backend/api/main.py` | FastAPI application, CORS, router registration |
| `backend/api/routers/trip.py` | `POST /api/v1/trip/will-i-make-it` — physics + feasibility + charging stops |
| `backend/api/routers/stations.py` | `GET /api/v1/live-stations` — multi-source station data |
| `backend/api/routers/driver.py` | Driver session, vehicles, favourites, charging sessions |
| `backend/api/services/range_physics.py` | Longitudinal EV energy model |
| `backend/api/services/journey_risk.py` | Feasibility verdict engine |
| `backend/api/services/charging_stop.py` | Reachable charging stop recommender |
| `backend/api/services/multi_source_stations.py` | OCM + BEE + OSM integration with deduplication |
| `data/driver.db` | SQLite: driver sessions, vehicles, favourites, charging sessions |

### Frontend (Next.js 16 / React 19 / TypeScript 5)

| File | Responsibility |
|---|---|
| `app/users/stations/page.tsx` | Main driver app — all state, all 5 tabs, navigation controller |
| `components/driver/VehicleCockpit.tsx` | Home tab: vehicle hero, range display, drive mode, cockpit controls |
| `components/driver/JourneyPlanner.tsx` | Journeys tab: destination input, battery slider, feasibility verdict, charging recs |
| `components/driver/ChargingConsole.tsx` | Charging tab: session telemetry, target SoC, cost in ₹ |
| `components/driver/NavigationHUD.tsx` | Floating turn-by-turn navigation overlay |
| `components/driver/StationDetailSheet.tsx` | Station bottom sheet with navigation + charging actions |
| `components/driver/VehicleManager.tsx` | Fleet management modal |
| `components/driver/DriverDrawer.tsx` | Left-side navigation drawer |
| `components/DriverMobileMap.tsx` | Leaflet map: OSM tiles, route polylines, station pins, GPS marker |
| `lib/routeService.ts` | OSRM routing client, maneuver formatter, off-route detector |
| `lib/driverApi.ts` | Backend API client (session, vehicles, favourites, charging sessions) |
| `lib/vehicleStorage.ts` | Vehicle persistence with backend sync |
| `lib/stationAdapter.ts` | Station enrichment, reporting, favourites sync |
| `lib/ecosystemStore.ts` | Cross-window state sync for community-deployed stations |
| `hooks/useLiveData.ts` | Live station data fetch hook |

### Design System

Tokens defined in `frontend/src/app/globals.css`:
- **Canvas**: `#FAF9F6` (warm off-white background)
- **Charcoal**: `#111312` (primary text, buttons)
- **Volt**: `#C8F369` (primary accent — EV brand green)
- **Success**: `#16A34A`
- Utility classes: `no-scrollbar`, `pb-safe`, `pt-safe`, `glass`, `glass-dark`
- Fonts: Times New Roman (headings), `-apple-system` sans-serif (body), SF Mono (monospace)

---

## 4. Physics Engine

### Stage 1: Longitudinal Range Physics (`range_physics.py`)

Net energy over distance $d$:

$$E_{\text{total}} = E_{\text{traction}} + E_{\text{elevation}} + E_{\text{payload}} + E_{\text{hvac}}$$

- **Traction**: $E = d \cdot (\text{eff}/100) \cdot k_{\text{drive}}$ where $k = 0.92$ (Eco), $1.00$ (Normal), $1.15$ (Sport)
- **Elevation climb**: $E = \frac{m \cdot g \cdot \Delta h}{3.6 \times 10^6 \cdot 0.88}$ (88% drivetrain efficiency)
- **Elevation descent**: $E = \frac{m \cdot g \cdot \Delta h \cdot 0.60}{3.6 \times 10^6}$ (60% regen recovery)
- **Payload delta**: $0.0035 \text{ kWh/kg/100km}$ above 75 kg baseline
- **HVAC**: Scaled by $|T_{\text{ambient}} - 22°C|$; omitted for open 2W/3W vehicles
- **Uncertainty bounds**: Nominal / Worst-case (+15% drag, +25% thermal) / Best-case

### Stage 2: Feasibility Verdict (`journey_risk.py`)

| Verdict | Condition |
|---|---|
| **SAFE** | Worst-case arrival SoC ≥ Reserve Buffer |
| **CAUTION** | Nominal SoC ≥ Reserve, but worst-case falls below reserve |
| **CHARGING REQUIRED** | Nominal SoC < Reserve Buffer, or battery depletes before destination |

Outputs: depletion distance (km), minimum recommended departure SoC, explainable factor breakdown.

### Stage 3: Charging Stop Engine (`charging_stop.py`)

1. **Physical reachability**: Station is reachable only if energy required < available battery.
2. **Strict connector matching**: CCS2, Type 2 AC, CHAdeMO, GB/T — no substitution.
3. **Operational status filtering**: Decommissioned and community-reported offline stations are excluded.
4. **Charging taper model**: Constant-current up to 80% SoC → constant-voltage taper above 80% (35% power).
5. **Detour ranking**: Primary and backup stops ranked by detour distance minimisation.

---

## 5. Navigation Architecture

**Routing engine**: OSRM public demo server (`router.project-osrm.org`)
- Returns actual road geometry (1,156 coordinates for Pune→Lonavala; 2,524 for Pune→Mumbai)
- Real distance and duration
- Structured turn-by-turn maneuver steps

**Map tiles**: `tile.openstreetmap.org/{z}/{x}/{y}.png` — keyless, OSM attribution required, no API key needed.

**GPS tracking**: `navigator.geolocation.watchPosition` — activated only during active navigation. Coordinates used only in-memory (passed to OSRM and backend physics). No coordinates stored in SQLite or localStorage.

**Multi-leg navigation**: Journey Planner's "Navigate to Charging Stop" builds a 2-leg route (origin → charging station → destination). `activeLegIndex` tracks which leg is active.

**Off-route detection**: `evaluateDriverPositionOnRoute` in `routeService.ts` detects when the driver is >50m from the nearest route point.

---

## 6. Data Sources

| Source | Integration | Data |
|---|---|---|
| **Open Charge Map (OCM)** | HTTPX REST API | Station locations, connectors, power ratings, operator |
| **BEE National EV Registry** | HTTPX REST API | Government-registered stations in India |
| **OpenStreetMap Overpass** | HTTPX REST API | Community-mapped charging nodes |
| **Local fallback** | `data/processed/cities/*/candidate_zones.csv` | Verified candidate zones for offline use |

Spatial deduplication merges overlapping results across sources. Community-deployed stations (via `ecosystemStore.ts`) are merged into the map view for the matching city.

---

## 7. Verified Vehicle Fleet

| Vehicle | Battery (Usable) | Efficiency | Max DC | Plug | Weight |
|---|---|---|---|---|---|
| Tata Nexon EV LR | 39.0 kWh | 14.5 kWh/100km | 30 kW | CCS2 | 1,400 kg |
| Ather 450X Gen 3 | 3.24 kWh | 2.8 kWh/100km | 3 kW AC | Type 2 | 108 kg |
| Mahindra Treo 3W | 7.0 kWh | 5.4 kWh/100km | 3 kW AC | Type 2 | 350 kg |
| Tata Tiago EV | 22.8 kWh | 12.8 kWh/100km | 15 kW | CCS2 | 1,150 kg |
| Porsche Taycan GTS | 83.7 kWh | 20.3 kWh/100km | 270 kW | CCS2 | 2,295 kg |

---

## 8. Implementation Status

### ✅ Implemented and Committed

| Feature | Commit |
|---|---|
| Physics engine (range, risk, charging stops) | `cbf7f0b` |
| Multi-source station integration (OCM+BEE+OSM) | `00e4273` |
| Live data status panel | `e0f1cfc`, `d8ce92b` |
| Journey Planner redesign (driver-centric hierarchy) | `4294a0f` |

### 🔄 Implemented, Uncommitted (WS2 Navigation)

| File | Description |
|---|---|
| `frontend/src/lib/routeService.ts` | OSRM routing client, maneuver formatter, off-route detector |
| `frontend/src/components/driver/NavigationHUD.tsx` | Turn-by-turn navigation HUD |
| `frontend/src/components/DriverMobileMap.tsx` | Real road polylines, OSM tiles, charging waypoint pin |
| `frontend/src/app/users/stations/page.tsx` | GPS watchPosition, activeRoute, startRoadNavigation, cancelNavigation |

### 🔄 In Progress (WS3 — UI/UX Polish)

- Codebase cleanup: remove dead code (GarageFleet, monadPayment, ParkingBookingModal, Monad UI state)
- Extract DriverProfile component from page.tsx
- VehicleCockpit visual hierarchy improvements
- ChargingConsole INR currency localization
- Responsive polish for NavigationHUD and JourneyPlanner

### 📋 Planned

- DriverProfile extracted component
- VehicleCockpit section reorder (vehicle hero first)
- ChargingConsole: ₹ currency, dynamic tariff from station data

---

## 9. Engineering Principles

- **No fabricated data**: Every calculation traces to physical laws or real API data. No invented session history, fake tariffs, or hardcoded prices.
- **GPS privacy**: No coordinates written to any database, localStorage, or analytics service.
- **Reuse before creating**: No duplicate components, no unnecessary dependencies.
- **Backend is locked during UI work**: No changes to `backend/` during frontend milestones.
- **TypeScript is authoritative**: `npx tsc --noEmit` must exit 0 before any commit.
- **Never push to GitHub** during active development sprints.
