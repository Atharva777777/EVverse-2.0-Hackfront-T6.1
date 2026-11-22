# EVVERSE 2.0: Proof-Carrying Journey Intelligence
## HackFront India 2026 Grand Finale | Challenge T6.1: "Will I Make It?"
**Team Sync2:** Khushi Bhadangkar (Team Lead) • Atharva Borate  
**Institution:** IIIT Delhi  
**Status:** Implemented, Tested, and Verified (`main` branch)

---

## 1. Executive Summary & Core Promise
EVVERSE 2.0 is an evidence-backed trip-feasibility and charging-stop intelligence platform engineered around the Indian EV driver’s most critical pre-trip question: **"Will I make it?"**

Unlike conventional apps that output generic range circles or unverified charging pins, EVVERSE provides **Proof-Carrying Journey Intelligence**:
> *"Before you leave, EVVERSE gives you a journey verdict you can inspect, a charging plan you can trust appropriately, and a backup path if conditions change."*

Every recommendation carries an inspectable evidence record: deterministic energy estimates, reserve margin, connector compatibility, station-data freshness, reachability bounds, and primary/backup charging paths.

---

## 2. The 6-Element Journey Confidence Card
Every completed journey evaluation generates a structured result comprising:

1. **Feasibility Verdict:** Deterministic classification (`SAFE`, `CAUTION`, `CHARGING_NEEDED`) calculated by the physics engine against the driver’s personal reserve threshold.
2. **Arrival Energy:** Nominal arrival State of Charge (SoC) plus an adverse/favorable uncertainty band.
3. **Reserve Margin:** Energy remaining above or below the driver’s selected safety reserve.
4. **Charging Proof:** Explicit connector standard compatibility (`CCS2`, `Type 2`), physical reachability, detour distance, and estimated charge duration.
5. **Recovery Plan:** Primary stop paired with a graph-verified backup stop, with the critical decision point clearly marked.
6. **Plain-Language Explanation:** Grounded, concise summary generated via Sarvam AI, validated against backend facts.

---

## 3. Neo4j Graph Relationship & Reachability Architecture
Charging decisions depend on spatial and electrical relationships that cannot be represented as flat lists. The Neo4j graph layer models these multi-hop relationships:

### Graph Schema
- **Nodes:**
  - `Vehicle`: `vehicle_id`, `usable_battery_kwh`, `rated_efficiency`, `supported_connector_types`
  - `Connector`: `standard`, `power_limit_kw`, `compatibility_attributes`
  - `Station`: `station_id`, `geo_point`, `operator_id`, `source_status`, `last_verified_at`
  - `ChargingPoint`: `point_id`, `connector_type`, `rated_power_kw`, `operational_status`
  - `Route`: `route_id`, `origin`, `destination`, `distance_km`, `elevation_profile_ref`
  - `RouteSegment`: `segment_id`, `distance_km`, `energy_estimate_kwh`, `corridor`
  - `JourneyPlan`: `plan_id`, `vehicle_id`, `departure_soc`, `reserve_soc`, `verdict`
  - `Evidence`: `evidence_id`, `source`, `observation_type`, `observed_at`, `confidence_label`
  - `CommunityReport`: `report_id`, `station_id`, `issue_type`, `submitted_at`, `moderation_status`
  - `Operator`: `operator_id`, `business_profile`, `station_network`

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

*Implementation:* Live service in `backend/data/graph_service.py` backed by `Neo4jGraphEngine`, with REST API integration at `POST /api/v1/journey/graph/reachability` and `GET /api/v1/journey/graph/corridor-chokepoints`.

---

## 4. Sarvam AI: Shared Multilingual Language & Explanation Layer
Sarvam AI powers natural-language journey interaction across 23 Indic languages (Hindi, Marathi, Tamil, Bengali, etc.):

- **Intent Parsing (`POST /api/v1/journey/intent`):** Parses typed or spoken trip requests into structured origin, destination, vehicle, and reserve constraints.
- **Strict Pydantic Validation:** Model outputs are untrusted; fields are validated against strict enums and bounds before passing to the deterministic engines.
- **Grounded Explanation (`POST /api/v1/journey/explain`):** Generates explanations strictly based on verified backend numbers. If any value deviates from the engine output, the text is discarded and deterministic explanations remain.
- **Speech-to-Text (`POST /api/v1/journey/transcribe`):** Audio transcription via Sarvam Saaras (`saaras:v4`) capped at 15 seconds.

---

## 5. Station Evidence Model & Data Provenance
To combat stale or inaccurate charger listings, EVVERSE enforces strict provenance:
- **`source_id` / `source_name`:** Open Charge Map, BEE registry, OpenStreetMap, Community.
- **`observed_at` & `ingested_at`:** True timestamps preserved, never fabricated.
- **`evidence_label`:** `Verified`, `Source-reported`, `Stale`, `Unverified`.
- **Freshness Policy:** Stations older than 30 days are flagged as stale and downgraded in ranking.
- **Community Signals:** Driver reports impact station scoring without acting as permanent invalidations.

---

## 6. Investor Capital Intelligence: Infrastructure Planning
The investor workspace (`/investor`, `/investor/map`) models network growth:
- **Candidate-Site Scoring:** Evaluates coverage gaps, distance to existing hubs, road accessibility, and traffic demand.
- **Genetic Algorithm Optimization:** Balances site coverage maximization against capital expenditure constraints.
- **Financial Scenario Engine:** Transparent sensitivity modeling (low, base, high utilization) for payback, revenue, and opex without speculative ROI claims.

---

## 7. Security, Reliability & Quality Audit
- **Security Rating:** A+ grade (>95% score). Strict CSP, HSTS (`max-age=63072000`), `X-Frame-Options: DENY`, `nosniff`, `same-origin` COOP, and masked server fingerprinting.
- **Vulnerabilities:** 0 vulnerabilities across all dependencies (`npm audit: found 0 vulnerabilities`).
- **Database Safety:** 100% parameterized queries in `backend/data/driver_db.py`.
- **Test Suite:** 132/132 automated tests passing in `backend/tests`.
- **TypeScript:** 0 compiler errors (`tsc --noEmit`).
