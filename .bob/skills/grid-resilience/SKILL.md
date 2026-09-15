---
name: grid-resilience
description: Use when the user wants to assess power grid asset health, predict outages, rank at-risk transformers or substations, or generate a maintenance and crew pre-positioning plan from sensor data, weather forecasts, and incident history.
---

# Grid Resilience — Predictive Maintenance Workflow

This skill walks you through the full grid intelligence cycle: data ingestion → risk fusion → asset ranking → maintenance plan generation → crew briefing.

---

## Step 1 — Understand What Data Is Available

Ask the user (via `ask_followup_question`) which data sources are ready:
- **Sensor readings**: do they have live/recent sensor exports (temperature, vibration, partial discharge, oil quality, load)?
- **Weather forecasts**: do they have a weather feed or forecast data per region?
- **Incident history**: do they have historical outage or fault records to load?
- **Scope**: full grid, specific region, or specific asset IDs?

If the user has no data yet, offer to load the sample grid using `load_sample_grid`. This populates the persistent database (`data/grid_store.json`) with realistic transmission and distribution units.

---

## Step 2 — Load Data into the Grid Intelligence MCP Server

Data automatically persists to `data/grid_store.json`. You can inspect or reset state at any time via `manage_asset`, `export_grid_snapshot`, or `reset_grid_data`.

### 2a. Register Assets
Call `register_asset` (or `manage_asset`) for each asset. Key fields:
- `asset_id`, `asset_type`, `name`, `region`, `substation_id`
- `voltage_kv`, `rated_mva`, `age_years`
- `customers_served`, `criticality_tier` (1=hospital/critical, 2=industrial, 3=residential)
- `last_maintenance_date`, `lat`, `lon`
- Optional: `backup_feed_available` (boolean), `alternate_substation_id` (string)

### 2b. Ingest Sensor Readings & Telemetry
Choose between array ingestion or direct CSV string ingestion:
- **Direct CSV Ingestion**: Call `ingest_sensor_csv` with raw CSV text.
- **Structured Array Ingestion**: Call `ingest_sensor_readings` with sensor objects.

Fields supported (IEEE C57.91 & IEC 60599):
- `asset_id`, `timestamp` (ISO 8601)
- `temperature_c`, `vibration_mm_s`, `partial_discharge_pC`, `oil_quality_index`, `load_percent`
- Multi-gas DGA: `h2_ppm`, `ch4_ppm`, `c2h2_ppm`, `c2h4_ppm`, `c2h6_ppm`, `co_ppm`, `dissolved_gas_ppm`

Thresholds reference:
| Metric | Normal | Alarm | Danger | Standard |
|--------|--------|-------|--------|----------|
| Temperature (°C) | < 70 | > 85 | > 98 | IEEE C57.91 |
| Arrhenius Aging ($F_{AA}$) | 1.0× | > 2.0× | > 10.0× | IEEE C57.91 |
| Vibration (mm/s) | < 4.5 | > 7.1 | > 11.2 | IEC 60034-14 |
| Partial Discharge (pC) | < 100 | > 500 | > 1000 | IEC 60270 |
| Oil Quality Index | > 75 | < 60 | < 40 | ASTM D1816 |
| Dissolved Gas (TCG ppm) | < 80 | > 200 | > 500 | IEC 60599 |
| Acetylene ($C_2H_2$ ppm)| 0 | > 2 | > 5 | IEEE C57.104 |

### 2c. Ingest Weather Forecasts
Call `ingest_weather_forecast` for each region.
Key fields: `region`, `temperature_c`, `wind_speed_kmh`, `precipitation_mm`, `lightning_risk`, `ice_accretion_risk`, `storm_watch`, `storm_warning`.

### 2d. Ingest Incident History
Call `ingest_incident_record` for outages, faults, or near-misses to calibrate the failure probability model.

---

## Step 3 — Verify Data Coverage

Call `get_region_summary` for each region to confirm:
- All assets are registered and have readings
- Weather forecasts are loaded for all regions
- The asset counts and criticality tiers look correct

If any asset is missing a reading, remind the user and wait before proceeding.

---

## Step 4 — Run Risk Assessment

Call `rank_grid_assets` to score and rank all assets:
- Use `severity_filter: "medium"` to focus on actionable assets
- Use `region_filter` if scoped to one area
- Use `top_n: 20` for a focused view on the highest-risk assets

Interpret the results:
- **overall_risk_score 80–100**: imminent failure likely — act within hours
- **60–79**: high risk — act within 24h
- **40–59**: elevated risk — schedule within 72h
- **below 40**: monitor; schedule next maintenance cycle

Highlight the `weather_risk_multiplier` for any asset above 1.3 — these are assets where adverse weather is compounding sensor-detected degradation. This combination is the most dangerous failure mode.

---

## Step 5 — Assess Individual High-Risk Assets

For each CRITICAL or HIGH severity asset, call `assess_asset_risk` and `get_asset_details` to:
1. Review all `risk_drivers` — including Arrhenius thermal aging factors ($F_{AA}$) and DGA fault classifications
2. Check `contingency_plan` — review the feeder tie and switching sequence to transfer load safely before de-energizing
3. Check `failure_probability_7d` — communicate this clearly to the operator
4. Check `action_window_hours` — this is the time before the risk becomes unmanageable
5. Note `avoided_loss_potential_usd` — financial justification demonstrating cost savings from preventive action

Present findings per asset in a concise summary table before moving to the plan.

---

## Step 6 — Generate Maintenance and Crew Plan

Call `generate_maintenance_plan` with:
- `planning_horizon_hours`: 24 for emergency posture, 72 for standard 3-day window, 168 for weekly
- `region_filter` if scoped

The plan includes:
- **Crew assignments**: ranked by priority, with action type, crew size, equipment needed, required OSHA certifications, safety precautions, and switching recommendations
- **Pre-positioning zones**: staging areas where weather-risk-elevated assets justify pre-deploying crews before failure
- **Business case & ROI**: avoided outage loss vs. repair costs and Return on Maintenance (ROM) ratio
- **Executive summary**: ready to send to operations leadership

You can also call `calculate_financial_roi` for a focused financial breakdown across the grid.

---

## Step 7 — Advanced Operations: Scenario Simulation & Shift Transition

### 7a. Run What-If Weather Simulations
Call `simulate_weather_scenario` to evaluate hypothetical storms, heat waves, or ice accretion without modifying production grid data.
- Input parameters: `scenario_name`, `target_region`, `wind_speed_kmh`, `storm_warning`, `lightning_risk`, `temperature_c`.
- Output: Delta in critical assets, delta outage liability, and recommended advance staging preparations.

### 7b. Access MCP Resources
The server exposes live grid state via standard MCP Resources:
- `grid://kpis` — High-level grid health KPIs and financial outage exposure
- `grid://assets` — Inventory of all registered assets and current operational status
- `grid://weather` — Regional weather feeds and active storm alerts
- `grid://plans/latest` — The most recently generated maintenance and pre-positioning plan

### 7c. Use MCP Prompt Templates
The server provides pre-engineered prompt workflows:
- `pre-storm-briefing` — Prepares an operational briefing for emergency command centers
- `asset-deep-dive` — Generates a detailed engineering failure diagnosis
- `shift-handoff-report` — Formulates a shift transition briefing for incoming control room dispatchers

---

## Step 8 — Export and Handoff

If the user needs to send the plan to a field operations system or SCADA ticketing:
- Call `export_plan_csv` to get a spreadsheet-ready crew assignment table including safety precautions and switching notes.
- Present the CSV output so the user can copy it directly.

---

## Step 9 — Brief the Operator

Synthesise the findings into a concise operational briefing covering:

1. **Headline risk**: how many critical/high assets, total customers at risk, total exposure cost
2. **Top immediate actions** with asset name, action required, deadline, and feeder switching recommendation
3. **Weather-driven pre-positioning**: which zones need crews deployed before the storm/heat event
4. **Financial ROI**: estimated avoided customer outage losses vs. repair costs
5. **Monitoring watch list**: medium-risk assets to check again in 24–48h
6. **Recommended planning horizon**: when to re-run this assessment (suggest re-run after new sensor poll or weather update)

---

## Key Thresholds Reference

| Risk Score | Severity | Recommended Action | Max Time Window |
|------------|----------|-------------------|-----------------|
| 80–100 | CRITICAL | Immediate shutdown / emergency inspection | 4 hours |
| 60–79 | HIGH | Emergency inspection | 12 hours |
| 40–59 | MEDIUM | Scheduled inspection or crew pre-position | 24–72 hours |
| < 40 | LOW | Monitor | 1 week |

## Weather Multiplier Reference

| Condition | Multiplier Added |
|-----------|-----------------|
| Storm warning | +1.2 |
| Storm watch | +0.6 |
| Extreme lightning | +0.8 |
| High lightning | +0.5 |
| Wind > 100 km/h | +0.5 |
| Ice accretion risk | +0.4 |
| Heat index > 42°C | +0.3 |
| Cap | 3.0× |

---

## Reminders

- Always run `rank_grid_assets` before `generate_maintenance_plan` — the ranking gives the user a chance to review before committing to a plan.
- Never skip Step 3 (data coverage check) — a plan based on incomplete sensor data is misleading.
- The `load_sample_grid` tool loads a complete realistic dataset into `data/grid_store.json` — use it for demos or when the user wants to explore the system before connecting real data.
- Financial figures use EPRI's average of $18/customer-hour. Advise the user if their actual figure differs.

