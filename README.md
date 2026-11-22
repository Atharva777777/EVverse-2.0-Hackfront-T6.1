# EVverse 2.0 — Proof-Carrying Journey Intelligence
### HackFront India 2026 Grand Finale | Challenge T6.1: "Will I Make It?"
**Team Sync2:** Khushi Bhadangkar (Team Lead) • Atharva Borate  
**Institution:** IIIT Delhi  
**Audit Status:** Fully Implemented, Verified, and Production-Ready (`main` branch)

---

## 🌟 Executive Summary & Core Promise

**EVverse 2.0** is an evidence-backed trip-feasibility and charging-stop intelligence platform engineered around the Indian EV driver’s most consequential pre-trip question: **"Will I make it?"**

Unlike conventional apps that output generic range circles or unverified charging pins, EVverse 2.0 delivers **Proof-Carrying Journey Intelligence**:
> *"Before you leave, EVverse gives you a journey verdict you can inspect, a charging plan you can trust appropriately, and a backup path if conditions change."*

Every recommendation carries an auditable evidence record: deterministic energy estimates, reserve margin, connector compatibility, station-data freshness, reachability bounds, and primary/backup charging paths.

---

## 🧭 The 6-Element Journey Confidence Card

Every completed journey evaluation produces a comprehensive result with six connected elements:

1. **Feasibility Verdict:** Deterministic classification (`SAFE`, `CAUTION`, `CHARGING_NEEDED`) calculated by the physics engine against the driver’s personal reserve threshold.
2. **Arrival Energy:** Nominal arrival State of Charge (SoC) plus an adverse/favorable uncertainty band.
3. **Reserve Margin:** Energy remaining above or below the driver’s required reserve.
4. **Charging Proof:** Explicit connector standard compatibility (`CCS2`, `Type 2`), physical reachability, detour distance, and estimated charge duration.
5. **Recovery Plan:** Primary stop paired with a graph-verified backup stop, with the critical decision point clearly marked.
6. **Plain-Language Explanation:** Grounded, concise summary generated via Sarvam AI, strictly validated against backend facts.

---

## 🕸️ Neo4j Graph Relationship & Reachability Architecture

Charging decisions depend on spatial and electrical relationships that cannot be represented as flat lists. The Neo4j graph layer models these multi-hop relationships:

### Graph Schema
- **Nodes:** `Vehicle`, `Connector`, `Station`, `ChargingPoint`, `Route`, `RouteSegment`, `JourneyPlan`, `Evidence`, `CommunityReport`, `Operator`
- **Relationships:**
  - `(:Vehicle)-[:SUPPORTS]->(:Connector)`
  - `(:ChargingPoint)-[:USES]->(:Connector)`
  - `(:Station)-[:HAS_POINT]->(:ChargingPoint)`
  - `(:Station)-[:NEAR_SEGMENT {detour_km}]->(:RouteSegment)`
  - `(:RouteSegment)-[:CONNECTS_TO {distance_km}]->(:RouteSegment)`
  - `(:Station)-[:HAS_EVIDENCE]->(:Evidence)`
  - `(:CommunityReport)-[:REPORTS_ON]->(:Station)`
  - `(:JourneyPlan)-[:CONSIDERS]->(:Station)`
  - `(:Station)-[:BACKUP_FOR]->(:Station)`

### Core Graph Queries
- `find_compatible_route_stations`: Matches vehicle connectors against charging point capabilities within acceptable detour thresholds.
- `detect_corridor_chokepoints`: Identifies critical corridor segments where a single charging failure could strand a driver due to lack of a reachable backup.
- `find_backup_station_candidates`: Links primary stations to nearby verified alternatives within battery buffer distance.

*Active implementation:* `backend/data/graph_service.py` backed by `Neo4jGraphEngine`, exposed at `POST /api/v1/journey/graph/reachability` and `GET /api/v1/journey/graph/corridor-chokepoints`.

---

## 🗣️ Sarvam AI: Shared Multilingual Language & Explanation Layer

Integrated through a server-side AI service across 23 Indic languages (Hindi, Marathi, Tamil, Bengali, Telugu, etc.):
- **Intent Parsing (`POST /api/v1/journey/intent`):** Parses typed or spoken trip requests into structured origin, destination, vehicle, and reserve constraints.
- **Strict Pydantic Validation:** Model outputs are untrusted; fields are validated against strict enums and bounds before passing to the deterministic engines.
- **Grounded Explanation (`POST /api/v1/journey/explain`):** Explanations are bounded strictly by verified backend facts. If any value deviates, the text is discarded and deterministic explanations remain.
- **Speech-to-Text (`POST /api/v1/journey/transcribe`):** Audio transcription via Sarvam Saaras (`saaras:v4`) capped at 15 seconds.

---

## 📍 Trust, Data Provenance & Real Hardware GPS

- **Station Evidence Model:** Tracks `source_id`, `observed_at`, `ingested_at`, `status_semantics`, `connector_standard`, `power_kw`, and `evidence_label` (`Verified`, `Source-reported`, `Stale`, `Unverified`).
- **30-Day Freshness Policy:** Stations older than 30 days are flagged as stale and downranked.
- **Device Location Separation:** Genuine hardware GPS (`enableHighAccuracy: true`) is decoupled from city catalog exploration; navigation routes are calculated strictly from verified device coordinates.
- **Turn-by-Turn Road Routing:** Real road polylines and maneuvers via OSRM with charging waypoint integration.

---

## 💼 Investor Capital Intelligence: Infrastructure Planning

The investor workspace (`/investor`, `/investor/map`) models network growth:
- **Candidate-Site Scoring:** Evaluates coverage gaps, distance to existing hubs, road accessibility, and traffic demand.
- **Genetic Algorithm Optimization:** Balances site coverage maximization against capital expenditure constraints.
- **Financial Scenario Engine:** Transparent sensitivity modeling (low, base, high utilization) for payback, revenue, and opex without speculative ROI claims.

---

## 🔒 Security, Reliability & Quality Audit

- **Security Rating:** A+ grade (>95% score). Strict CSP, HSTS (`max-age=63072000`), `X-Frame-Options: DENY`, `nosniff`, `same-origin` COOP, and masked server fingerprinting.
- **Vulnerabilities:** 0 vulnerabilities across all dependencies (`npm audit: found 0 vulnerabilities`).
- **Database Safety:** 100% parameterized queries in `backend/data/driver_db.py`.
- **Test Suite:** 132/132 automated tests passing in `backend/tests`.
- **TypeScript:** 0 compiler errors (`tsc --noEmit`).

---

## 🚀 Quickstart & Deployment

### 1. Backend (FastAPI — Port 8000 or 8001)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --reload
```

- Swagger Docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/api/v1/health`

### 2. Frontend (Next.js 16 — Port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

### 3. Vercel Multi-Service Deployment
This repository is configured for multi-service Vercel deployment via root `vercel.json`:
- **`backend` service:** Root `backend`, framework `fastapi`, entrypoint `main:app`.
- **`frontend` service:** Root `frontend`, framework `nextjs`, bound via `BACKEND_URL`.
- **Rewrites:** `/api/(.*)`, `/docs`, `/openapi.json` route to `backend`; `/(.*)` routes to `frontend`.
