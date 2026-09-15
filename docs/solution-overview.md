# Solution Overview: GridGuard AI Predictive Resilience Architecture

## 1. What We Built

GridGuard AI is an autonomous, standards-compliant grid intelligence system that unites electrical asset telemetry, physical degradation models, and dynamic meteorological forecasting inside an **IBM Bob Model Context Protocol (MCP)** server and real-time operations dashboard.

Rather than waiting for alarms to trip or equipment to explode, GridGuard AI calculates continuous failure probabilities for high-voltage transformers, switchgear, and transmission lines. When extreme weather threatens degraded equipment, GridGuard AI automatically formulates **contingency feeder load-transfer sequences** and dispatches **certified maintenance crew pre-positioning work orders** hours before severe storm arrival.

---

## 2. How It Works: The 5-Stage Resilience Pipeline

```
[ Sensor Telemetry ] ──┐
  (Temp, DGA, Vib)     │
                       ├─► [ IEEE/IEC Risk Engine ] ──► [ Weather Multiplier ] ──► [ Asset Risk Score ]
[ Weather Alerts ] ────┘       (Arrhenius, DGA)              (Storm, Wind, Ice)             │
  (NOAA, Radar)                                                                             ▼
                                                                                   [ IBM Bob Agent ]
[ Contingency Switching ] ◄─────────────────────────────────────────────────────── (MCP Protocol)
  (Feeder Load Transfer)                                                                    │
                                                                                            ▼
[ Crew Pre-Positioning ] ◄──────────────────────────────────────────────────────── [ Dispatch Orders ]
  (OSHA 1910.269 Matched)
```

### Step 1: Multi-Modal Ingestion & Telemetry Harmonization
Real-time sensor streams (or historical batch CSVs) are ingested into the atomic GridStore. Telemetry includes:
- Top-oil & winding temperatures (°C)
- Mechanical vibration velocity (mm/s)
- Partial discharge acoustic pulses (pC)
- Dielectric breakdown oil quality index (0–100)
- Multi-gas Dissolved Gas Analysis (DGA): $H_2, CH_4, C_2H_2, C_2H_4, C_2H_6, CO$ in PPM

### Step 2: Physics-Grounded Degradation Modeling
Unlike uncalibrated ML regressors, the engine applies established electrical engineering standards:
1. **IEEE C57.91 Arrhenius Thermal Aging Acceleration Factor ($F_{AA}$)**:
   $$F_{AA} = \exp\left(\frac{15000}{383} - \frac{15000}{\theta_H + 273}\right)$$
   Where $\theta_H$ is the winding hottest-spot temperature. At 110°C, $F_{AA} = 1.0$. If load and ambient heat drive $\theta_H$ to 140°C, insulation aging accelerates by over **14.8× normal rate**.
2. **IEC 60599 / IEEE C57.104 DGA Fault Identification**:
   Evaluates combustible hydrocarbon gas ratios ($C_2H_2 / C_2H_4$, $CH_4 / H_2$, $C_2H_4 / C_2H_6$) to pinpoint active thermal faults ($T > 700^\circ\text{C}$), high-energy electrical arcing ($D_2$), or corona partial discharge ($PD$).
3. **ASTM D1816 / IEC 60034-14**:
   Checks dielectric oil breakdown voltage and mechanical shaft/core vibration velocity.

### Step 3: Dynamic Weather Risk Compounding
The system evaluates active regional meteorological feeds. If an asset has an underlying sensor degradation (e.g., thermal aging or gassing), the weather multiplier compounds the baseline risk:
- **Storm Warning**: +1.2
- **Storm Watch**: +0.6
- **Extreme Lightning Risk**: +0.8
- **Wind Speed > 100 km/h**: +0.5
- **Ice Accretion Hazard**: +0.4
- **Extreme Heat Index (>42°C)**: +0.3
- **Compounding Risk Cap**: 3.0×

### Step 4: Autonomous AI Triaging with IBM Bob
Operating as an MCP client, IBM Bob accesses the grid's live state via:
- 12 purpose-built MCP tools (`rank_grid_assets`, `assess_asset_risk`, `generate_maintenance_plan`, `simulate_weather_scenario`, etc.)
- 4 dynamic MCP resources (`grid://kpis`, `grid://assets`, `grid://weather`, `grid://plans/latest`)
- 3 operational prompt workflows (`pre-storm-briefing`, `asset-deep-dive`, `shift-handoff-report`)

### Step 5: Actionable Execution: Contingency Switching & Crew Staging
The system outputs:
- **Feeder Load Switching Sequence**: Step-by-step instructions to transfer critical loads (Tier-1 hospitals, Tier-2 manufacturing) to alternate substations before isolating high-risk equipment.
- **OSHA-Compliant Crew Dispatch**: Work orders specifying required crew sizes, safety certifications (OSHA 1910.269 high voltage, EPRI DGA specialist), PPE requirements, and staging zones.
- **Return on Maintenance (ROM) ROI**: Computes estimated avoided customer outage loss vs repair costs using EPRI's benchmark of **$18/customer-hour**.

---

## 3. Key Design Decisions

| Decision | Rationale |
|---|---|
| **Model Context Protocol (MCP) as Core Interface** | Allows any LLM or specialized AI agent (specifically IBM Bob) to inspect, query, and command grid operations with strict JSON schema validation and zero hallucinations. |
| **Physics-Informed Scoring (IEEE/IEC Standards)** | Regulated electric utilities will not accept unexplainable "black-box" neural network scores. Basing risk on IEEE C57.91 and IEC 60599 provides defensible, auditable calculations. |
| **Separate Web Operations Center + MCP Server** | Operators need visual situational awareness (GIS maps, gauge needles, risk matrix), while AI agents need programmatic MCP tools. The dual architecture serves both seamlessly. |
| **Atomic File-Based GridStore** | Ensures transactional safety during multi-tool MCP operations without requiring complex external database clustering for local hackathon evaluation. |

---

## 4. IBM Technologies Used

- **IBM Bob:** Serves as the primary autonomous agent brain. IBM Bob executes the `grid-resilience` skill workflow, queries live MCP resources, runs scenario simulations, and writes control room shift handoff reports.
- **Model Context Protocol (MCP):** Implemented via `@modelcontextprotocol/sdk`, establishing a standardized, bidirectional channel between IBM Bob and our grid intelligence backend.
- **watsonx.ai Integration Ready:** Designed with standardized prompt templates and structured JSON schema payloads ready for immediate zero-shot reasoning or fine-tuning with IBM Granite 3.0 models.
