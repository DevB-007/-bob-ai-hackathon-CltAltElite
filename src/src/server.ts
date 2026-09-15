import express, { Request, Response } from "express";
import { resolve } from "path";
import { GridStore } from "./storage.js";
import {
  scoreAsset,
  simulateWeatherScenario,
} from "./risk-engine.js";
import { buildMaintenancePlan } from "./plan-builder.js";
import type {
  AssetRecord,
  SensorReading,
  WeatherForecast,
  IncidentRecord,
  AssetRiskScore,
} from "./types.js";

const app = express();
const store = new GridStore();

app.use(express.json());
app.use(express.static(resolve(process.cwd(), "public")));

// ─── Helper: Seed Grid if empty ───────────────────────────────────────────────

export function seedSampleGrid(): void {
  const sampleAssets: AssetRecord[] = [
    {
      asset_id: "TX-001", asset_type: "transformer", name: "North Bay 230/115kV Autotransformer",
      region: "North Bay", substation_id: "SUB-NB-01", voltage_kv: 230, rated_mva: 300,
      age_years: 44, customers_served: 85000, criticality_tier: 1,
      last_maintenance_date: "2021-03-15", coordinates: { lat: 37.82, lon: -122.28 },
      backup_feed_available: true, alternate_substation_id: "SUB-NB-02",
    },
    {
      asset_id: "TX-002", asset_type: "transformer", name: "Eastport 115/33kV Power Transformer",
      region: "Eastport", substation_id: "SUB-EP-02", voltage_kv: 115, rated_mva: 120,
      age_years: 18, customers_served: 22000, criticality_tier: 2,
      last_maintenance_date: "2023-09-10", coordinates: { lat: 37.64, lon: -122.05 },
      backup_feed_available: true, alternate_substation_id: "SUB-EP-01",
    },
    {
      asset_id: "TX-003", asset_type: "transformer", name: "Riverside 500/230kV GSU Transformer",
      region: "Riverside", substation_id: "SUB-RS-01", voltage_kv: 500, rated_mva: 600,
      age_years: 31, customers_served: 210000, criticality_tier: 1,
      last_maintenance_date: "2022-06-20", coordinates: { lat: 33.98, lon: -117.37 },
      backup_feed_available: false,
    },
    {
      asset_id: "CB-001", asset_type: "breaker", name: "North Bay 230kV Bus Tie Breaker",
      region: "North Bay", substation_id: "SUB-NB-01", voltage_kv: 230, rated_mva: 0,
      age_years: 36, customers_served: 85000, criticality_tier: 1,
      last_maintenance_date: "2020-11-01", coordinates: { lat: 37.82, lon: -122.28 },
    },
    {
      asset_id: "TX-004", asset_type: "transformer", name: "Central Valley 115/12kV Distribution Xfmr",
      region: "Central Valley", substation_id: "SUB-CV-03", voltage_kv: 115, rated_mva: 60,
      age_years: 27, customers_served: 14000, criticality_tier: 3,
      last_maintenance_date: "2022-04-05", coordinates: { lat: 36.74, lon: -119.78 },
    },
    {
      asset_id: "TX-005", asset_type: "transformer", name: "Riverside Industrial Park Transformer",
      region: "Riverside", substation_id: "SUB-RS-03", voltage_kv: 115, rated_mva: 80,
      age_years: 11, customers_served: 3200, criticality_tier: 2,
      last_maintenance_date: "2024-01-15", coordinates: { lat: 33.90, lon: -117.42 },
    },
    {
      asset_id: "TX-006", asset_type: "transformer", name: "South Shore 33/11kV Step-down Xfmr",
      region: "South Shore", substation_id: "SUB-SS-05", voltage_kv: 33, rated_mva: 40,
      age_years: 48, customers_served: 9800, criticality_tier: 3,
      last_maintenance_date: "2019-07-22", coordinates: { lat: 33.70, lon: -117.90 },
    },
    {
      asset_id: "SUB-001", asset_type: "substation", name: "North Bay 230kV Main Substation",
      region: "North Bay", substation_id: "SUB-NB-01", voltage_kv: 230, rated_mva: 600,
      age_years: 38, customers_served: 95000, criticality_tier: 1,
      last_maintenance_date: "2022-02-14", coordinates: { lat: 37.82, lon: -122.27 },
    },
    {
      asset_id: "LN-001", asset_type: "line", name: "North Bay–Eastport 115kV Transmission Line",
      region: "North Bay", substation_id: "SUB-NB-01", voltage_kv: 115, rated_mva: 200,
      age_years: 52, customers_served: 107000, criticality_tier: 1,
      last_maintenance_date: "2021-08-30", coordinates: { lat: 37.72, lon: -122.15 },
    },
    {
      asset_id: "TX-007", asset_type: "transformer", name: "Eastport Medical Centre Feeder Xfmr",
      region: "Eastport", substation_id: "SUB-EP-01", voltage_kv: 33, rated_mva: 30,
      age_years: 22, customers_served: 1200, criticality_tier: 1,
      last_maintenance_date: "2023-05-10", coordinates: { lat: 37.65, lon: -122.07 },
    },
    {
      asset_id: "CB-002", asset_type: "breaker", name: "Riverside 500kV Main Bus Breaker",
      region: "Riverside", substation_id: "SUB-RS-01", voltage_kv: 500, rated_mva: 0,
      age_years: 24, customers_served: 210000, criticality_tier: 1,
      last_maintenance_date: "2023-03-01", coordinates: { lat: 33.98, lon: -117.38 },
    },
    {
      asset_id: "TX-008", asset_type: "transformer", name: "Central Valley Irrigation Pump Transformer",
      region: "Central Valley", substation_id: "SUB-CV-05", voltage_kv: 33, rated_mva: 25,
      age_years: 15, customers_served: 450, criticality_tier: 2,
      last_maintenance_date: "2023-11-20", coordinates: { lat: 36.60, lon: -119.90 },
    },
  ];

  for (const a of sampleAssets) store.setAsset(a);

  const now = new Date().toISOString();
  const sampleReadings: SensorReading[] = [
    {
      asset_id: "TX-001", timestamp: now,
      temperature_c: 108, vibration_mm_s: 8.9, partial_discharge_pC: 820,
      oil_quality_index: 28, load_percent: 118, tap_position: 7, dissolved_gas_ppm: 340,
      h2_ppm: 85, c2h4_ppm: 110, c2h2_ppm: 4.2, co_ppm: 620,
    },
    {
      asset_id: "TX-002", timestamp: now,
      temperature_c: 74, vibration_mm_s: 5.2, partial_discharge_pC: 65,
      oil_quality_index: 81, load_percent: 88,
    },
    {
      asset_id: "TX-003", timestamp: now,
      temperature_c: 103, vibration_mm_s: 6.1, partial_discharge_pC: 1150,
      oil_quality_index: 35, load_percent: 112, dissolved_gas_ppm: 610,
      h2_ppm: 210, c2h4_ppm: 95, c2h2_ppm: 6.8, co_ppm: 490,
    },
    {
      asset_id: "CB-001", timestamp: now,
      temperature_c: 62, vibration_mm_s: 9.4, partial_discharge_pC: 280,
      oil_quality_index: 55, load_percent: 75,
    },
    {
      asset_id: "TX-004", timestamp: now,
      temperature_c: 79, vibration_mm_s: 4.1, partial_discharge_pC: 95,
      oil_quality_index: 68, load_percent: 94,
    },
    {
      asset_id: "TX-005", timestamp: now,
      temperature_c: 58, vibration_mm_s: 2.3, partial_discharge_pC: 12,
      oil_quality_index: 93, load_percent: 62,
    },
    {
      asset_id: "TX-006", timestamp: now,
      temperature_c: 91, vibration_mm_s: 7.6, partial_discharge_pC: 430,
      oil_quality_index: 22, load_percent: 103, dissolved_gas_ppm: 195,
    },
    {
      asset_id: "SUB-001", timestamp: now,
      temperature_c: 71, vibration_mm_s: 3.8, partial_discharge_pC: 145,
      oil_quality_index: 63, load_percent: 82,
    },
    {
      asset_id: "LN-001", timestamp: now,
      temperature_c: 68, vibration_mm_s: 5.8, partial_discharge_pC: 220,
      oil_quality_index: 48, load_percent: 89,
    },
    {
      asset_id: "TX-007", timestamp: now,
      temperature_c: 64, vibration_mm_s: 2.0, partial_discharge_pC: 18,
      oil_quality_index: 88, load_percent: 71,
    },
    {
      asset_id: "CB-002", timestamp: now,
      temperature_c: 48, vibration_mm_s: 1.9, partial_discharge_pC: 8,
      oil_quality_index: 96, load_percent: 58,
    },
    {
      asset_id: "TX-008", timestamp: now,
      temperature_c: 55, vibration_mm_s: 1.4, partial_discharge_pC: 5,
      oil_quality_index: 97, load_percent: 45,
    },
  ];

  store.setReadings(sampleReadings);

  const sampleWeather: WeatherForecast[] = [
    {
      region: "North Bay", forecast_time: now,
      valid_until: new Date(Date.now() + 48 * 3_600_000).toISOString(),
      temperature_c: 38, wind_speed_kmh: 85, precipitation_mm: 0,
      lightning_risk: "moderate", heat_index_c: 42, ice_accretion_risk: false,
      storm_watch: true, storm_warning: false,
    },
    {
      region: "Riverside", forecast_time: now,
      valid_until: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      temperature_c: 43, wind_speed_kmh: 45, precipitation_mm: 0,
      lightning_risk: "low", heat_index_c: 48, ice_accretion_risk: false,
      storm_watch: false, storm_warning: false,
    },
    {
      region: "Eastport", forecast_time: now,
      valid_until: new Date(Date.now() + 36 * 3_600_000).toISOString(),
      temperature_c: 22, wind_speed_kmh: 28, precipitation_mm: 12,
      lightning_risk: "none", heat_index_c: undefined, ice_accretion_risk: false,
      storm_watch: false, storm_warning: false,
    },
    {
      region: "Central Valley", forecast_time: now,
      valid_until: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      temperature_c: 41, wind_speed_kmh: 22, precipitation_mm: 0,
      lightning_risk: "low", heat_index_c: 45, ice_accretion_risk: false,
      storm_watch: false, storm_warning: false,
    },
    {
      region: "South Shore", forecast_time: now,
      valid_until: new Date(Date.now() + 72 * 3_600_000).toISOString(),
      temperature_c: 35, wind_speed_kmh: 110, precipitation_mm: 85,
      lightning_risk: "high", heat_index_c: 38, ice_accretion_risk: false,
      storm_watch: true, storm_warning: true,
    },
  ];

  for (const w of sampleWeather) store.setWeather(w);

  const sampleIncidents: IncidentRecord[] = [
    {
      incident_id: "INC-2023-0041", asset_id: "TX-001", occurred_at: "2023-07-18T14:22:00Z",
      type: "near_miss", duration_hours: 0, customers_affected: 0,
      root_cause: "Abnormal DGA results — acetylene spike detected during routine sampling",
    },
    {
      incident_id: "INC-2022-0087", asset_id: "TX-001", occurred_at: "2022-08-03T09:10:00Z",
      type: "fault", duration_hours: 3.5, customers_affected: 12000,
      root_cause: "Tap changer mechanism failure — stuck between positions",
    },
    {
      incident_id: "INC-2024-0012", asset_id: "TX-003", occurred_at: "2024-02-11T02:45:00Z",
      type: "outage", duration_hours: 7.2, customers_affected: 48000,
      root_cause: "Bushing flashover following partial discharge escalation",
    },
    {
      incident_id: "INC-2024-0019", asset_id: "TX-006", occurred_at: "2024-01-05T18:30:00Z",
      type: "maintenance_finding", duration_hours: 0, customers_affected: 0,
      root_cause: "Oil sample shows moisture ingress and reduced dielectric strength",
    },
  ];

  for (const inc of sampleIncidents) store.addIncident(inc);
}

// Auto-seed if database is empty on boot
if (store.getAssets().length === 0) {
  seedSampleGrid();
}

// ─── REST Endpoints ───────────────────────────────────────────────────────────

// GET /api/kpis
app.get("/api/kpis", (_req: Request, res: Response) => {
  const assets = store.getAssets();
  const scored: AssetRiskScore[] = [];

  for (const a of assets) {
    const r = store.getReading(a.asset_id);
    if (!r) continue;
    const w = store.getWeather(a.region);
    const inc = store.getIncidents(a.asset_id);
    scored.push(scoreAsset(a, r, inc, w));
  }

  const critical = scored.filter((s) => s.grid_impact_severity === "critical");
  const high = scored.filter((s) => s.grid_impact_severity === "high");
  const totalCustomers = [...critical, ...high].reduce((sum, s) => sum + s.estimated_customers_at_risk, 0);
  const totalLiability = scored.reduce((sum, s) => sum + s.estimated_outage_cost_usd, 0);
  const avoidedLoss = [...critical, ...high].reduce((sum, s) => sum + (s.avoided_loss_potential_usd || 0), 0);
  const avgHealth = scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + s.health_score, 0) / scored.length) : 100;

  const stormAlerts = store.getAllWeather().filter((w) => w.storm_warning || w.storm_watch);

  res.json({
    timestamp: new Date().toISOString(),
    status: critical.length > 0 ? "EMERGENCY ACTION REQUIRED" : stormAlerts.length > 0 ? "ELEVATED POSTURE" : "NOMINAL",
    total_assets: assets.length,
    assessed_assets: scored.length,
    critical_count: critical.length,
    high_count: high.length,
    medium_count: scored.filter((s) => s.grid_impact_severity === "medium").length,
    low_count: scored.filter((s) => s.grid_impact_severity === "low").length,
    customers_at_risk: totalCustomers,
    outage_liability_usd: totalLiability,
    avoided_loss_potential_usd: avoidedLoss,
    average_health_score: avgHealth,
    storm_alerts_count: stormAlerts.length,
  });
});

// GET /api/assets
app.get("/api/assets", (req: Request, res: Response) => {
  const region = req.query.region as string | undefined;
  const severity = req.query.severity as string | undefined;

  const assets = store.getAssets();
  const scored: AssetRiskScore[] = [];

  for (const a of assets) {
    if (region && a.region !== region) continue;
    const r = store.getReading(a.asset_id);
    if (!r) continue;
    const w = store.getWeather(a.region);
    const inc = store.getIncidents(a.asset_id);
    const score = scoreAsset(a, r, inc, w);
    if (!severity || score.grid_impact_severity === severity) {
      scored.push(score);
    }
  }

  scored.sort((a, b) => b.overall_risk_score - a.overall_risk_score);
  res.json(scored);
});

// GET /api/assets/:id
app.get("/api/assets/:id", (req: Request, res: Response) => {
  const asset = store.getAsset(req.params.id);
  if (!asset) {
    res.status(404).json({ error: `Asset ${req.params.id} not found` });
    return;
  }

  const reading = store.getReading(req.params.id);
  const forecast = store.getWeather(asset.region);
  const incidents = store.getIncidents(req.params.id);
  const score = reading ? scoreAsset(asset, reading, incidents, forecast) : null;

  res.json({
    asset,
    reading: reading ?? null,
    risk_evaluation: score,
    incidents,
    weather: forecast ?? null,
  });
});

// GET /api/weather
app.get("/api/weather", (_req: Request, res: Response) => {
  res.json(store.getAllWeather());
});

// GET /api/plan
app.get("/api/plan", (req: Request, res: Response) => {
  const horizon = parseInt((req.query.horizon as string) || "72", 10);
  const assets = store.getAssets();
  const scored: AssetRiskScore[] = [];

  for (const a of assets) {
    const r = store.getReading(a.asset_id);
    if (!r) continue;
    const w = store.getWeather(a.region);
    const inc = store.getIncidents(a.asset_id);
    scored.push(scoreAsset(a, r, inc, w));
  }

  const plan = buildMaintenancePlan(scored, horizon);
  store.setLatestPlan(plan);
  res.json(plan);
});

// POST /api/seed
app.post("/api/seed", (_req: Request, res: Response) => {
  seedSampleGrid();
  res.json({ message: "Sample grid seeded and persisted successfully", assets_count: store.getAssets().length });
});

// POST /api/simulate
app.post("/api/simulate", (req: Request, res: Response) => {
  const { scenario_name, target_region, wind_speed_kmh, temperature_c, lightning_risk, storm_warning } = req.body;
  if (!target_region) {
    res.status(400).json({ error: "target_region is required" });
    return;
  }

  const assets = store.getAssets();
  const readings = store.getAllReadings();
  const incidents = Object.fromEntries(assets.map((a) => [a.asset_id, store.getIncidents(a.asset_id)]));
  const weatherMap = Object.fromEntries(store.getAllWeather().map((w) => [w.region, w]));

  const sim = simulateWeatherScenario(
    scenario_name || "Custom Storm Simulation",
    target_region,
    {
      wind_speed_kmh: Number(wind_speed_kmh) || undefined,
      temperature_c: Number(temperature_c) || undefined,
      lightning_risk,
      storm_warning: Boolean(storm_warning),
    },
    assets,
    readings,
    incidents,
    weatherMap
  );

  res.json(sim);
});

// POST /api/ingest-csv
app.post("/api/ingest-csv", (req: Request, res: Response) => {
  const { csv_content } = req.body;
  if (!csv_content || typeof csv_content !== "string") {
    res.status(400).json({ error: "csv_content string is required" });
    return;
  }

  const lines = csv_content.trim().split(/\r?\n/);
  if (lines.length < 2) {
    res.status(400).json({ error: "CSV must have header and data row" });
    return;
  }

  const headers = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const validReadings: SensorReading[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });

    if (!row["asset_id"] || !row["temperature_c"] || !row["load_percent"]) continue;

    validReadings.push({
      asset_id: row["asset_id"],
      timestamp: row["timestamp"] || new Date().toISOString(),
      temperature_c: parseFloat(row["temperature_c"]),
      vibration_mm_s: parseFloat(row["vibration_mm_s"] || "1.0"),
      partial_discharge_pC: parseFloat(row["partial_discharge_pc"] || "10"),
      oil_quality_index: parseFloat(row["oil_quality_index"] || "90"),
      load_percent: parseFloat(row["load_percent"]),
      tap_position: row["tap_position"] ? parseInt(row["tap_position"], 10) : undefined,
      dissolved_gas_ppm: row["dissolved_gas_ppm"] ? parseFloat(row["dissolved_gas_ppm"]) : undefined,
      h2_ppm: row["h2_ppm"] ? parseFloat(row["h2_ppm"]) : undefined,
      c2h2_ppm: row["c2h2_ppm"] ? parseFloat(row["c2h2_ppm"]) : undefined,
    });
  }

  if (validReadings.length > 0) {
    store.setReadings(validReadings);
  }

  res.json({ ingested_count: validReadings.length });
});

// POST /api/reset
app.post("/api/reset", (_req: Request, res: Response) => {
  store.reset();
  res.json({ message: "Grid store reset to empty state" });
});

const PORT = parseInt(process.env.PORT || "3000", 10);
export const serverInstance = app.listen(PORT, () => {
  console.log(`⚡ Grid Intelligence Web Center active: http://localhost:${PORT}`);
});
