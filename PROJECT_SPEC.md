# EVverse 2.0: Will I Make It? — Technical Project Specification
**Track:** HackFront India — Task 6.1: "Will I Make It?"  
**Version:** 2.0.0 (Standalone Production-Grade Architecture)  
**Target:** Electric Vehicle Journey Feasibility, Range Physics and Charging Optimization  

---

## 1. Problem Statement and Mission

Current electric vehicle range prediction relies heavily on OEM dashboard estimates that extrapolate static homologation test cycles (WLTP/ARAI). These estimates systematically fail in real-world transit because they ignore:
1. **Longitudinal Elevation Profile**: Climbing steep grades (e.g., Western Ghats / Bhor Ghat) drastically increases energy demand, while descents recover energy via regenerative braking.
2. **Payload Loading**: Heavy passenger or cargo loads significantly alter rolling resistance and kinetic inertia.
3. **Thermal Conditioning (HVAC)**: Extreme tropical ambient heat (35°C–45°C) forces continuous cabin A/C compression, consuming 1.5–3.0 kW of auxiliary battery power.
4. **Physical Connector Compatibility**: Drivers frequently navigate to chargers only to find incompatible physical plug standards (e.g., CCS2 vs. Type 2 AC vs. CHAdeMO).
5. **En-Route Reachability**: Drivers needing charging often lack verifiable proof that their remaining battery can physically reach the candidate charger before depleting.

**EVverse 2.0** solves this with a standalone, physics-informed journey prediction engine that delivers deterministic energy calculations, scenario uncertainty bounds, risk verdicts (SAFE, CAUTION, CHARGING_NEEDED), and reachable, connector-compatible en-route charging recommendations.

---

## 2. Mathematical Formulation and Architecture

### Stage 1: Longitudinal Physics Engine (`range_physics.py`)
Calculates net traction energy over distance $d$:
$$E_{\text{total}} = E_{\text{traction}} + E_{\text{elevation}} + E_{\text{payload}} + E_{\text{hvac}}$$

1. **Base Traction Energy:**  
   $$E_{\text{traction}} = d \cdot \left(\frac{\text{efficiency}_{\text{kWh/100km}}}{100.0}\right) \cdot k_{\text{drive}}$$  
   where $k_{\text{drive}} = 0.92$ (Eco), $1.00$ (Normal), or $1.15$ (Sport).
2. **Gravitational Grade and Regeneration:**  
   - If climbing ($\Delta h > 0$):  
     $$E_{\text{elevation}} = \frac{m_{\text{total}} \cdot g \cdot \Delta h}{3.6 \times 10^6 \cdot \eta_{\text{climb}}} \quad (\eta_{\text{climb}} = 0.88)$$
   - If descending ($\Delta h < 0$):  
     $$E_{\text{elevation}} = \frac{m_{\text{total}} \cdot g \cdot \Delta h \cdot \eta_{\text{regen}}}{3.6 \times 10^6} \quad (\eta_{\text{regen}} = 0.60)$$
3. **Payload Mass Delta:**  
   $$E_{\text{payload}} = (m_{\text{actual}} - 75.0) \cdot \left(\frac{d}{100.0}\right) \cdot 0.0035 \; \text{kWh/kg/100km}$$
4. **Auxiliary Thermal Load (HVAC):**  
   $$E_{\text{hvac}} = P_{\text{hvac}} \cdot t_{\text{hours}} \cdot (1.0 + 0.035 \cdot |T_{\text{ambient}} - 22^\circ\text{C}|)$$  
   *(Explicitly omitted for open two-wheelers and three-wheelers like Ather 450X and Mahindra Treo).*
5. **Physical Uncertainty Bounds:**  
   - **Nominal Case:** Standard calibrated parameters.
   - **Worst Case:** +15% aerodynamic drag/speed variation, +25% thermal soak, +10% rolling resistance.
   - **Best Case:** Optimal eco driving, minimal aerodynamic resistance.

---

### Stage 2: Feasibility and Risk Assessment Engine (`journey_risk.py`)
Evaluates arrival State of Charge (SoC %) against the user's defined Reserve Safety Buffer (default 15%):
- **SAFE**: Arrival SoC (worst-case) $\ge$ Reserve Buffer. Vehicle completes journey with reserve even under adverse headwind, thermal soak, and traffic.
- **CAUTION**: Arrival SoC (nominal) $\ge$ Reserve Buffer, but worst-case drops below reserve. Encroaches into emergency safety buffer.
- **CHARGING_NEEDED**: Arrival SoC (nominal) < Reserve Buffer, or battery depletes before arrival.

Outputs include:
- Deterministic depletion distance ($d_{\text{deplete}}$ in km) where battery reaches 0%.
- Minimum recommended departure SoC % required to complete the trip safely without charging.
- Explainable risk factor breakdown and mitigation advice.

---

### Stage 3: Reachable En-Route Charging Engine (`charging_stop.py`)
When `CHARGING_NEEDED` is triggered, the engine filters, ranks, and recommends verified charging stops:
1. **Physical Reachability Verification:**  
   Evaluates whether starting battery is sufficient to reach the station ($E_{\text{to\_station}} < E_{\text{available}}$). Stations that cannot be reached are strictly rejected.
2. **Strict Connector Standard Matching:**  
   A station qualifies only if its physical connector hardware matches the vehicle:
   - CCS2 Combo: Matches CCS2, Combo 2, IEC 62196-3.
   - Type 2 AC: Matches Type 2, Mennekes, IEC 62196-2.
   - CHAdeMO: Matches CHAdeMO standard.
   - GB/T: Matches GB/T DC standard.  
   Never substitutes connector types or fabricates compatibility.
3. **Operational Telemetry Check:**  
   Disqualifies decommissioned or offline stations, and filters stations with recent community reports of power failures or broken handles from local driver persistence.
4. **Realistic Turnaround and Charging Taper:**  
   - Evaluates effective power: $P_{\text{eff}} = \min(P_{\text{station}}, P_{\text{vehicle\_dc\_max}})$.
   - Models constant-current bulk charging up to 80% SoC.
   - Models constant-voltage charging taper above 80% SoC (power scaled to 35%).
5. **Detour Minimization:**  
   Scores detour distance and ranks Primary vs. Backup recommendations.

---

### Stage 4: Integrated Driver Journey Cockpit (`frontend/`)
A responsive, high-contrast, tactile automotive dashboard built in Next.js 16 and Tailwind CSS v4:
- Real-time parameter sliders (battery %, reserve buffer %, payload, HVAC, driving mode).
- Pre-configured regional transit corridors:
  - Mumbai ➔ Pune Expressway: 118 km, +580m elevation
  - Lonavala Ghats: 84 km, +620m elevation
  - Navi Mumbai Hub: 34 km, +40m elevation
  - Thane Bypass: 28 km, +35m elevation
- Interactive Leaflet map displaying corridor route line, origin, destination, and recommended charging stops.
- Dynamic verdict card with color-coded alerts, arrival battery progress bar, worst/nominal/best bounds, and physical factor breakdown.
- Primary and backup charging stop toggle cards with matched connector badges, detour time, and charging duration.

---

## 3. Verified Fleet Specifications

| Vehicle ID | Make and Model | Battery (Gross/Usable) | Efficiency | Max DC Power | Connector Standard | Curb Weight |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `tata-nexon-ev` | Tata Nexon EV LR | 40.5 / 39.0 kWh | 14.5 kWh/100km | 30 kW | CCS2 Combo | 1,400 kg |
| `ather-450x-gen3` | Ather 450X (Gen 3) | 3.7 / 3.24 kWh | 2.8 kWh/100km | 3 kW (AC) | Type 2 (AC) | 108 kg |
| `mahindra-treo-auto` | Mahindra Treo 3W | 7.37 / 7.0 kWh | 5.4 kWh/100km | 3 kW (AC) | Type 2 (AC) | 350 kg |
| `tata-tiago-ev` | Tata Tiago EV TechLux | 24.0 / 22.8 kWh | 12.8 kWh/100km | 15 kW | CCS2 Combo | 1,150 kg |
| `porsche-taycan-gts` | Porsche Taycan GTS | 93.4 / 83.7 kWh | 20.3 kWh/100km | 270 kW | CCS2 Combo | 2,295 kg |

---

## 4. Verification and Test Evidence

- **Backend Pytest Suite:** 59 passed in 3.84s (`test_range_physics.py`, `test_journey_risk.py`, `test_charging_stop.py`, `test_trip_api.py`).
- **Frontend TypeScript:** 0 errors (`npx tsc --noEmit`).
- **Local Runtime Latency:** Sub-15ms end-to-end trip feasibility computation.
- **Decoupling Integrity:** 100% eliminated legacy quantum, blockchain, and large parquet dependencies.
- **Data Integrity:** Transparent fallback to verified candidate zones (`data/processed/cities/mumbai/candidate_zones.csv`) when external OCM API key is unconfigured.
