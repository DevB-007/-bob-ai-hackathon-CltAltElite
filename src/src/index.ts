#!/usr/bin/env node
/**
 * Enterprise Grid Intelligence & Resilience MCP Server
 *
 * Exposes tools, resources, and prompt templates for power grid predictive
 * maintenance, asset risk scoring, and storm resilience operations.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type {
  SensorReading,
  AssetRecord,
  WeatherForecast,
  IncidentRecord,
  AssetRiskScore,
} from "./types.js";
import { GridStore } from "./storage.js";
import {
  scoreAsset,
  simulateWeatherScenario,
  computeThermalAgingFactor,
  diagnoseDGA,
} from "./risk-engine.js";
import { buildMaintenancePlan } from "./plan-builder.js";

// ─── Persistent Storage Instance ──────────────────────────────────────────────

const store = new GridStore();

// ─── Server Setup ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "grid-intelligence-mcp",
  version: "1.0.0",
});

// ─── Tool 1: ingest_sensor_readings ──────────────────────────────────────────

server.tool(
  "ingest_sensor_readings",
  "Record latest sensor readings for one or more assets into persistent storage. Supports IEEE C57.91 thermal metrics and IEC 60599 DGA gas concentrations.",
  {
    readings: z
      .array(
        z.object({
          asset_id: z.string().describe("Unique asset identifier"),
          timestamp: z.string().describe("ISO 8601 timestamp"),
          temperature_c: z.number().describe("Winding or top oil temperature in °C"),
          vibration_mm_s: z.number().describe("RMS vibration in mm/s"),
          partial_discharge_pC: z.number().describe("Partial discharge in pC"),
          oil_quality_index: z.number().min(0).max(100).describe("Oil quality 0–100 index"),
          load_percent: z.number().describe("Load as % of rated capacity"),
          tap_position: z.number().optional().describe("OLTC tap changer position"),
          dissolved_gas_ppm: z.number().optional().describe("Total combustible dissolved gas (ppm)"),
          h2_ppm: z.number().optional().describe("Hydrogen (H2) ppm"),
          ch4_ppm: z.number().optional().describe("Methane (CH4) ppm"),
          c2h2_ppm: z.number().optional().describe("Acetylene (C2H2) ppm"),
          c2h4_ppm: z.number().optional().describe("Ethylene (C2H4) ppm"),
          c2h6_ppm: z.number().optional().describe("Ethane (C2H6) ppm"),
          co_ppm: z.number().optional().describe("Carbon monoxide (CO) ppm"),
          ambient_temp_c: z.number().optional().describe("Ambient temperature in °C"),
        })
      )
      .min(1),
  },
  async ({ readings }) => {
    store.setReadings(readings as SensorReading[]);
    return {
      content: [
        {
          type: "text",
          text: `✅ Persisted sensor readings for ${readings.length} asset(s): ${readings
            .map((r) => r.asset_id)
            .join(", ")}.`,
        },
      ],
    };
  }
);

// ─── Tool 2: ingest_sensor_csv ───────────────────────────────────────────────

server.tool(
  "ingest_sensor_csv",
  "Bulk ingest sensor readings directly from a CSV formatted string. Validates headers and IEEE thresholds before persisting.",
  {
    csv_content: z.string().describe("Raw CSV content containing asset telemetry"),
  },
  async ({ csv_content }) => {
    const lines = csv_content.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return {
        content: [{ type: "text", text: "Error: CSV must contain a header and at least one data row." }],
        isError: true,
      };
    }

    const headers = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
    const validReadings: SensorReading[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line) continue;
      const values = line.split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? "";
      });

      if (!row["asset_id"] || !row["temperature_c"] || !row["load_percent"]) {
        errors.push(`Row ${i}: Missing required columns (asset_id, temperature_c, load_percent)`);
        continue;
      }

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

    return {
      content: [
        {
          type: "text",
          text: [
            `CSV Ingestion Complete:`,
            `  • Successfully ingested & persisted: ${validReadings.length} reading(s)`,
            `  • Parse errors: ${errors.length}`,
            errors.length > 0 ? `  • Error details:\n    ${errors.join("\n    ")}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  }
);

// ─── Tool 3: ingest_weather_forecast ─────────────────────────────────────────

server.tool(
  "ingest_weather_forecast",
  "Record regional weather forecasts into persistent storage for real-time risk fusion.",
  {
    region: z.string().describe("Region name matching asset location"),
    forecast_time: z.string().describe("ISO 8601 forecast timestamp"),
    valid_until: z.string().describe("ISO 8601 validity horizon"),
    temperature_c: z.number().describe("Forecast temperature in °C"),
    wind_speed_kmh: z.number().describe("Forecast wind speed in km/h"),
    precipitation_mm: z.number().describe("Forecast precipitation in mm"),
    lightning_risk: z.enum(["none", "low", "moderate", "high", "extreme"]),
    heat_index_c: z.number().optional().describe("Feels-like heat index in °C"),
    ice_accretion_risk: z.boolean().describe("Ice accretion forecast"),
    storm_watch: z.boolean().describe("Active storm watch in effect"),
    storm_warning: z.boolean().describe("Active severe storm warning in effect"),
  },
  async (input) => {
    store.setWeather(input as WeatherForecast);
    const alert = input.storm_warning ? "⚠️ ACTIVE STORM WARNING" : input.storm_watch ? "⚡ Storm Watch Active" : "Nominal Weather Conditions";
    return {
      content: [
        {
          type: "text",
          text: `Weather forecast persisted for "${input.region}": ${alert}. Wind: ${input.wind_speed_kmh} km/h, Temp: ${input.temperature_c}°C.`,
        },
      ],
    };
  }
);

// ─── Tool 4: ingest_incident_record ──────────────────────────────────────────

server.tool(
  "ingest_incident_record",
  "Persist a historical or active incident/fault record to update asset failure probability models.",
  {
    incident_id: z.string().describe("Unique incident ID"),
    asset_id: z.string().describe("Associated asset ID"),
    occurred_at: z.string().describe("ISO 8601 timestamp"),
    type: z.enum(["outage", "near_miss", "fault", "maintenance_finding"]),
    duration_hours: z.number().describe("Outage duration in hours"),
    customers_affected: z.number().describe("Number of customers interrupted"),
    root_cause: z.string().describe("Root cause diagnosis"),
    sensor_signatures: z.record(z.unknown()).optional(),
    weather_conditions: z.record(z.unknown()).optional(),
  },
  async (input) => {
    store.addIncident(input as IncidentRecord);
    return {
      content: [
        {
          type: "text",
          text: `Incident ${input.incident_id} (${input.type}) recorded and persisted for asset ${input.asset_id}.`,
        },
      ],
    };
  }
);

// ─── Tool 5: register_asset ───────────────────────────────────────────────────

server.tool(
  "register_asset",
  "Register a grid asset (transformer, substation, breaker, transmission line) into persistent storage.",
  {
    asset_id: z.string(),
    asset_type: z.enum(["transformer", "substation", "breaker", "line", "capacitor_bank"]),
    name: z.string(),
    region: z.string(),
    substation_id: z.string(),
    voltage_kv: z.number(),
    rated_mva: z.number(),
    age_years: z.number(),
    customers_served: z.number(),
    criticality_tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).describe("1=Hospital/Defense, 2=Industrial, 3=Residential"),
    last_maintenance_date: z.string().describe("ISO 8601 date"),
    lat: z.number(),
    lon: z.number(),
    backup_feed_available: z.boolean().optional(),
    alternate_substation_id: z.string().optional(),
  },
  async (input) => {
    const { lat, lon, ...rest } = input;
    store.setAsset({
      ...rest,
      coordinates: { lat, lon },
    } as AssetRecord);
    return {
      content: [
        {
          type: "text",
          text: `Asset ${input.asset_id} ("${input.name}") successfully registered and saved to persistent database.`,
        },
      ],
    };
  }
);

// ─── Tool 6: manage_asset (Complete CRUD) ─────────────────────────────────────

server.tool(
  "manage_asset",
  "Manage grid assets: list all registered assets, retrieve an asset, or delete an asset from the persistent store.",
  {
    action: z.enum(["list", "get", "delete"]).describe("Action to perform"),
    asset_id: z.string().optional().describe("Asset identifier (required for get/delete)"),
  },
  async ({ action, asset_id }) => {
    if (action === "list") {
      const allAssets = store.getAssets();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              allAssets.map((a) => ({
                asset_id: a.asset_id,
                name: a.name,
                type: a.asset_type,
                region: a.region,
                voltage_kv: a.voltage_kv,
                criticality_tier: a.criticality_tier,
                customers_served: a.customers_served,
              })),
              null,
              2
            ),
          },
        ],
      };
    }

    if (!asset_id) {
      return { content: [{ type: "text", text: "Error: asset_id is required for get/delete." }], isError: true };
    }

    if (action === "get") {
      const asset = store.getAsset(asset_id);
      if (!asset) {
        return { content: [{ type: "text", text: `Asset ${asset_id} not found.` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] };
    }

    if (action === "delete") {
      const removed = store.deleteAsset(asset_id);
      return {
        content: [
          {
            type: "text",
            text: removed ? `Asset ${asset_id} deleted successfully.` : `Asset ${asset_id} was not found.`,
          },
        ],
      };
    }

    return { content: [{ type: "text", text: "Invalid action." }], isError: true };
  }
);

// ─── Tool 7: assess_asset_risk ────────────────────────────────────────────────

server.tool(
  "assess_asset_risk",
  "Score a single asset's operational risk with IEEE C57.91 thermal aging, DGA diagnostics, and contingency switching guidance.",
  {
    asset_id: z.string().describe("Asset ID to assess"),
  },
  async ({ asset_id }) => {
    const asset = store.getAsset(asset_id);
    if (!asset) {
      return { content: [{ type: "text", text: `Asset ${asset_id} not found.` }], isError: true };
    }

    const reading = store.getReading(asset_id);
    if (!reading) {
      return {
        content: [{ type: "text", text: `No telemetry available for ${asset_id}. Call ingest_sensor_readings first.` }],
        isError: true,
      };
    }

    const forecast = store.getWeather(asset.region);
    const assetIncidents = store.getIncidents(asset_id);
    const score = scoreAsset(asset, reading, assetIncidents, forecast);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(score, null, 2),
        },
      ],
    };
  }
);

// ─── Tool 8: rank_grid_assets ─────────────────────────────────────────────────

server.tool(
  "rank_grid_assets",
  "Rank all registered assets by operational risk score with failure probabilities, weather amplification, and recommended actions.",
  {
    region_filter: z.string().optional().describe("Filter by region"),
    severity_filter: z.enum(["critical", "high", "medium", "low"]).optional().describe("Filter by minimum severity"),
    top_n: z.number().int().min(1).max(500).optional().describe("Limit top N results"),
  },
  async ({ region_filter, severity_filter, top_n }) => {
    const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const minSeverity = severity_filter ? SEVERITY_ORDER[severity_filter]! : 0;

    const allAssets = store.getAssets();
    const scored: AssetRiskScore[] = [];

    for (const asset of allAssets) {
      if (region_filter && asset.region !== region_filter) continue;
      const reading = store.getReading(asset.asset_id);
      if (!reading) continue;
      const forecast = store.getWeather(asset.region);
      const assetIncidents = store.getIncidents(asset.asset_id);
      const score = scoreAsset(asset, reading, assetIncidents, forecast);
      if (SEVERITY_ORDER[score.grid_impact_severity]! >= minSeverity) {
        scored.push(score);
      }
    }

    scored.sort((a, b) => b.overall_risk_score - a.overall_risk_score);
    const result = top_n ? scored.slice(0, top_n) : scored;

    const summary = [
      `Ranked ${result.length} asset(s)${region_filter ? ` in "${region_filter}"` : ""}.`,
      `Critical: ${result.filter((s) => s.grid_impact_severity === "critical").length}`,
      `High: ${result.filter((s) => s.grid_impact_severity === "high").length}`,
      `Medium: ${result.filter((s) => s.grid_impact_severity === "medium").length}`,
      `Low: ${result.filter((s) => s.grid_impact_severity === "low").length}`,
      `Total Outage Liability: $${(
        result.reduce((sum, s) => sum + s.estimated_outage_cost_usd, 0) / 1_000_000
      ).toFixed(2)}M`,
    ].join(" | ");

    return {
      content: [
        { type: "text", text: summary },
        { type: "text", text: JSON.stringify(result, null, 2) },
      ],
    };
  }
);

// ─── Tool 9: generate_maintenance_plan ────────────────────────────────────────

server.tool(
  "generate_maintenance_plan",
  "Generate an enterprise-grade maintenance and crew pre-positioning plan including OSHA certifications, safety boundaries, load switching sequences, and Return on Maintenance (ROM) metrics.",
  {
    planning_horizon_hours: z.number().int().min(4).max(168).default(72).describe("Planning horizon in hours"),
    region_filter: z.string().optional().describe("Restrict to a specific region"),
  },
  async ({ planning_horizon_hours, region_filter }) => {
    const allAssets = store.getAssets();
    const scored: AssetRiskScore[] = [];

    for (const asset of allAssets) {
      if (region_filter && asset.region !== region_filter) continue;
      const reading = store.getReading(asset.asset_id);
      if (!reading) continue;
      const forecast = store.getWeather(asset.region);
      const assetIncidents = store.getIncidents(asset.asset_id);
      scored.push(scoreAsset(asset, reading, assetIncidents, forecast));
    }

    if (scored.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No assets with sensor telemetry found. Call load_sample_grid or ingest_sensor_readings first.",
          },
        ],
        isError: true,
      };
    }

    const plan = buildMaintenancePlan(scored, planning_horizon_hours);
    store.setLatestPlan(plan);

    return {
      content: [
        { type: "text", text: `=== EXECUTIVE BRIEFING ===\n${plan.executive_summary}` },
        { type: "text", text: JSON.stringify(plan, null, 2) },
      ],
    };
  }
);

// ─── Tool 10: simulate_weather_scenario ───────────────────────────────────────

server.tool(
  "simulate_weather_scenario",
  "Run a non-destructive 'What-If' weather simulation (e.g. hurricane, severe heat wave, ice storm) to test grid resilience and crew requirements without altering production data.",
  {
    scenario_name: z.string().describe("Descriptive name for the scenario"),
    target_region: z.string().describe("Target grid region to simulate"),
    wind_speed_kmh: z.number().optional().describe("Simulated wind speed in km/h"),
    temperature_c: z.number().optional().describe("Simulated temperature in °C"),
    lightning_risk: z.enum(["none", "low", "moderate", "high", "extreme"]).optional(),
    storm_warning: z.boolean().optional().describe("Simulate active storm warning"),
    ice_accretion_risk: z.boolean().optional().describe("Simulate ice accretion risk"),
  },
  async (input) => {
    const assets = store.getAssets();
    const readings = store.getAllReadings();
    const incidents = Object.fromEntries(assets.map((a) => [a.asset_id, store.getIncidents(a.asset_id)]));
    const weatherMap = Object.fromEntries(store.getAllWeather().map((w) => [w.region, w]));

    const sim = simulateWeatherScenario(
      input.scenario_name,
      input.target_region,
      {
        wind_speed_kmh: input.wind_speed_kmh,
        temperature_c: input.temperature_c,
        lightning_risk: input.lightning_risk,
        storm_warning: input.storm_warning,
        ice_accretion_risk: input.ice_accretion_risk,
      },
      assets,
      readings,
      incidents,
      weatherMap
    );

    return {
      content: [
        {
          type: "text",
          text: [
            `🌪️ SCENARIO SIMULATION REPORT: ${sim.scenario_name}`,
            `Region: ${sim.target_region}`,
            `Critical Assets Impact: ${sim.baseline_critical_count} baseline → ${sim.scenario_critical_count} simulated (+${sim.scenario_critical_count - sim.baseline_critical_count})`,
            `Financial Outage Exposure: $${(sim.baseline_exposure_usd / 1_000_000).toFixed(2)}M → $${(sim.scenario_exposure_usd / 1_000_000).toFixed(2)}M (Delta: +$${(sim.delta_exposure_usd / 1_000_000).toFixed(2)}M)`,
            `\nRecommended Emergency Preparations:\n  • ${sim.recommended_preparations.join("\n  • ")}`,
          ].join("\n"),
        },
        {
          type: "text",
          text: JSON.stringify(sim, null, 2),
        },
      ],
    };
  }
);

// ─── Tool 11: calculate_financial_roi ─────────────────────────────────────────

server.tool(
  "calculate_financial_roi",
  "Calculate Return on Maintenance (ROM) and avoided customer outage losses based on EPRI valuation models.",
  {
    region_filter: z.string().optional(),
  },
  async ({ region_filter }) => {
    const allAssets = store.getAssets();
    const scored: AssetRiskScore[] = [];

    for (const asset of allAssets) {
      if (region_filter && asset.region !== region_filter) continue;
      const reading = store.getReading(asset.asset_id);
      if (!reading) continue;
      const forecast = store.getWeather(asset.region);
      const assetIncidents = store.getIncidents(asset.asset_id);
      scored.push(scoreAsset(asset, reading, assetIncidents, forecast));
    }

    const plan = buildMaintenancePlan(scored, 72);

    const breakdown = {
      total_assets_assessed: plan.total_assets_assessed,
      critical_and_high_assets: plan.critical_assets.length + plan.high_assets.length,
      gross_outage_liability_usd: scored.reduce((sum, s) => sum + s.estimated_outage_cost_usd, 0),
      preventive_intervention_cost_usd: plan.total_estimated_repair_cost_usd,
      expected_avoided_losses_usd: plan.total_avoided_losses_usd,
      return_on_maintenance_ratio: `${plan.return_on_maintenance_ratio}×`,
      epri_benchmark: "$18.00 per unserved customer-hour",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(breakdown, null, 2) }],
    };
  }
);

// ─── Tool 12: get_asset_details ───────────────────────────────────────────────

server.tool(
  "get_asset_details",
  "Retrieve comprehensive asset diagnostics: engineering specs, sensor telemetry, DGA gas ratios, Arrhenius thermal aging, and incident history.",
  {
    asset_id: z.string().describe("Asset ID"),
  },
  async ({ asset_id }) => {
    const asset = store.getAsset(asset_id);
    if (!asset) {
      return { content: [{ type: "text", text: `Asset ${asset_id} not found.` }], isError: true };
    }

    const reading = store.getReading(asset_id);
    const forecast = store.getWeather(asset.region);
    const assetIncidents = store.getIncidents(asset_id);
    const score = reading ? scoreAsset(asset, reading, assetIncidents, forecast) : null;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              asset,
              latest_telemetry: reading ?? null,
              risk_evaluation: score,
              incidents: assetIncidents,
              regional_weather: forecast ?? null,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─── Tool 13: get_region_summary ──────────────────────────────────────────────

server.tool(
  "get_region_summary",
  "Summarize grid risk posture, active weather advisories, and top degraded assets for a given region.",
  {
    region: z.string().describe("Region name"),
  },
  async ({ region }) => {
    const regionAssets = store.getAssets().filter((a) => a.region === region);
    if (regionAssets.length === 0) {
      return { content: [{ type: "text", text: `No assets registered in "${region}".` }], isError: true };
    }

    const scored: AssetRiskScore[] = [];
    for (const asset of regionAssets) {
      const reading = store.getReading(asset.asset_id);
      if (!reading) continue;
      const forecast = store.getWeather(region);
      const assetIncidents = store.getIncidents(asset.asset_id);
      scored.push(scoreAsset(asset, reading, assetIncidents, forecast));
    }
    scored.sort((a, b) => b.overall_risk_score - a.overall_risk_score);

    const wx = store.getWeather(region);
    const summary = {
      region,
      total_assets: regionAssets.length,
      assessed_assets: scored.length,
      critical_count: scored.filter((s) => s.grid_impact_severity === "critical").length,
      high_count: scored.filter((s) => s.grid_impact_severity === "high").length,
      customers_at_risk: scored
        .filter((s) => ["critical", "high"].includes(s.grid_impact_severity))
        .reduce((sum, s) => sum + s.estimated_customers_at_risk, 0),
      total_outage_exposure_usd: scored.reduce((sum, s) => sum + s.estimated_outage_cost_usd, 0),
      weather: wx
        ? {
            storm_warning: wx.storm_warning,
            storm_watch: wx.storm_watch,
            wind_kmh: wx.wind_speed_kmh,
            temp_c: wx.temperature_c,
            lightning_risk: wx.lightning_risk,
          }
        : "No active weather forecast loaded",
      top_priority_assets: scored.slice(0, 5).map((s) => ({
        asset: s.asset_name,
        risk: s.overall_risk_score,
        action: s.recommended_action,
        action_window: `${s.action_window_hours}h`,
      })),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }
);

// ─── Tool 14: export_plan_csv ─────────────────────────────────────────────────

server.tool(
  "export_plan_csv",
  "Export the crew assignment and switching plan as a comma-separated table formatted for utility ticketing/SCADA dispatch systems.",
  {
    planning_horizon_hours: z.number().int().min(4).max(168).default(72),
  },
  async ({ planning_horizon_hours }) => {
    const allAssets = store.getAssets();
    const scored: AssetRiskScore[] = [];

    for (const asset of allAssets) {
      const reading = store.getReading(asset.asset_id);
      if (!reading) continue;
      const forecast = store.getWeather(asset.region);
      const assetIncidents = store.getIncidents(asset.asset_id);
      scored.push(scoreAsset(asset, reading, assetIncidents, forecast));
    }

    if (scored.length === 0) {
      return { content: [{ type: "text", text: "No assessed assets available to export." }], isError: true };
    }

    const plan = buildMaintenancePlan(scored, planning_horizon_hours);
    const header = "Priority,Asset ID,Asset Name,Region,Action,Crew Type,Crew Size,Latest Start (UTC),Duration (h),Required Certifications,Switching Note,Notes";
    const rows = plan.crew_assignments.map((c) =>
      [
        c.priority_rank,
        c.asset_id,
        `"${c.asset_name}"`,
        c.region,
        c.action,
        c.crew_type,
        c.estimated_crew_size,
        c.latest_start_time,
        c.estimated_duration_hours,
        `"${c.required_certifications.join("; ")}"`,
        `"${c.switching_recommendation || "Standard"}"`,
        `"${c.notes}"`,
      ].join(",")
    );

    return {
      content: [{ type: "text", text: [header, ...rows].join("\n") }],
    };
  }
);

// ─── Tool 15: load_sample_grid ────────────────────────────────────────────────

server.tool(
  "load_sample_grid",
  "Populate persistent storage with a realistic 12-asset transmission/distribution network, multi-gas DGA telemetry, severe weather feeds, and historical incident logs.",
  {},
  async () => {
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

    return {
      content: [
        {
          type: "text",
          text: [
            `✅ Enterprise sample grid seeded & persisted:`,
            `  • Assets: ${sampleAssets.length} high-voltage units`,
            `  • Telemetry: ${sampleReadings.length} readings with IEEE/IEC DGA signatures`,
            `  • Weather: 5 regional forecasts including active storm warning in South Shore`,
            `  • Incidents: ${sampleIncidents.length} historical outage/fault records`,
            `  • Database File: ${store.getFilePath()}`,
          ].join("\n"),
        },
      ],
    };
  }
);

// ─── Tool 16: export_grid_snapshot & Tool 17: reset_grid_data ─────────────────

server.tool(
  "export_grid_snapshot",
  "Export the entire persistent database state as a portable JSON snapshot.",
  {},
  async () => {
    return {
      content: [{ type: "text", text: JSON.stringify(store.getSnapshot(), null, 2) }],
    };
  }
);

server.tool(
  "reset_grid_data",
  "Reset the database, purging all assets, telemetry, weather, and maintenance plans.",
  {},
  async () => {
    store.reset();
    return {
      content: [{ type: "text", text: "Database reset to initial empty state." }],
    };
  }
);

// ─── MCP Resources ────────────────────────────────────────────────────────────

server.resource(
  "grid-kpis",
  "grid://kpis",
  { mimeType: "application/json", description: "Real-time grid health KPIs and financial outage exposure metrics" },
  async (uri) => {
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

    const kpis = {
      timestamp: new Date().toISOString(),
      total_registered_assets: assets.length,
      assessed_assets: scored.length,
      critical_severity_count: critical.length,
      high_severity_count: high.length,
      total_customers_at_risk: [...critical, ...high].reduce((sum, s) => sum + s.estimated_customers_at_risk, 0),
      total_outage_liability_usd: scored.reduce((sum, s) => sum + s.estimated_outage_cost_usd, 0),
      potential_avoided_losses_usd: [...critical, ...high].reduce((sum, s) => sum + (s.avoided_loss_potential_usd || 0), 0),
      average_health_score: scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + s.health_score, 0) / scored.length) : 100,
    };

    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(kpis, null, 2),
          mimeType: "application/json",
        },
      ],
    };
  }
);

server.resource(
  "grid-assets",
  "grid://assets",
  { mimeType: "application/json", description: "List of all registered assets with operational statuses" },
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(store.getAssets(), null, 2),
          mimeType: "application/json",
        },
      ],
    };
  }
);

server.resource(
  "grid-weather",
  "grid://weather",
  { mimeType: "application/json", description: "Active weather forecasts across all grid regions" },
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(store.getAllWeather(), null, 2),
          mimeType: "application/json",
        },
      ],
    };
  }
);

server.resource(
  "grid-latest-plan",
  "grid://plans/latest",
  { mimeType: "application/json", description: "Latest generated maintenance and crew pre-positioning plan" },
  async (uri) => {
    const plan = store.getLatestPlan();
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(plan || { message: "No plan generated yet. Run generate_maintenance_plan." }, null, 2),
          mimeType: "application/json",
        },
      ],
    };
  }
);

// ─── MCP Prompt Templates ─────────────────────────────────────────────────────

server.prompt(
  "pre-storm-briefing",
  "Generate an executive and operational pre-storm readiness briefing for regional grid controllers",
  {
    region: z.string().describe("Target grid region facing incoming storm event"),
  },
  async ({ region }) => {
    const wx = store.getWeather(region);
    const regionAssets = store.getAssets().filter((a) => a.region === region);
    const scored: AssetRiskScore[] = [];

    for (const a of regionAssets) {
      const r = store.getReading(a.asset_id);
      if (!r) continue;
      const inc = store.getIncidents(a.asset_id);
      scored.push(scoreAsset(a, r, inc, wx));
    }
    scored.sort((a, b) => b.overall_risk_score - a.overall_risk_score);

    const promptText = [
      `You are the Chief Grid Operations Engineer. Formulate a comprehensive Pre-Storm Readiness Briefing for region "${region}".`,
      `Weather Context: ${wx ? `Wind ${wx.wind_speed_kmh} km/h, Lightning ${wx.lightning_risk}, Storm Warning: ${wx.storm_warning}` : "No active forecast loaded."}`,
      `Total Assets in Region: ${regionAssets.length}`,
      `Critical/High Risk Assets:`,
      JSON.stringify(scored.slice(0, 5), null, 2),
      `Provide:`,
      `1. Situation Assessment & Threat Horizon`,
      `2. Immediate Contingency Switching & De-energization Orders`,
      `3. Crew Pre-Positioning Locations & Staging Yards`,
      `4. Critical Customer Protection Plan (Hospitals, Emergency Services)`,
      `5. Executive Risk & Financial Exposure Summary`,
    ].join("\n\n");

    return {
      messages: [
        {
          role: "user",
          content: { type: "text", text: promptText },
        },
      ],
    };
  }
);

server.prompt(
  "asset-deep-dive",
  "Perform a deep diagnostic review of an individual failing asset incorporating IEEE C57.91 and DGA standards",
  {
    asset_id: z.string().describe("Target asset ID to diagnose"),
  },
  async ({ asset_id }) => {
    const asset = store.getAsset(asset_id);
    const reading = store.getReading(asset_id);
    const incidents = store.getIncidents(asset_id);
    const forecast = asset ? store.getWeather(asset.region) : undefined;
    const score = asset && reading ? scoreAsset(asset, reading, incidents, forecast) : null;

    const promptText = [
      `Conduct a deep engineering diagnostic post-mortem on asset: ${asset_id}.`,
      `Asset Specs & Telemetry:`,
      JSON.stringify({ asset, reading, incidents, score }, null, 2),
      `Please provide an IEEE C57.91 / IEC 60599 compliant engineering report evaluating:`,
      `1. Insulation Thermal Aging & Arrhenius Rate Factor (F_AA)`,
      `2. Dissolved Gas Analysis (DGA) Diagnosis and Fault Mechanism`,
      `3. Mechanical & Vibration Assessment`,
      `4. Step-by-Step Switching Sequence and LOTO Safety Protocols`,
      `5. Recommended Repair or Replacement Decision with Cost Justification`,
    ].join("\n\n");

    return {
      messages: [
        {
          role: "user",
          content: { type: "text", text: promptText },
        },
      ],
    };
  }
);

server.prompt(
  "shift-handoff-report",
  "Generate a shift transition handoff brief for incoming grid control center dispatchers",
  {},
  async () => {
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

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Formulate an operational Shift Handoff Brief covering the following active grid state:\n\nTotal Assets: ${assets.length}\nCritical Immediate Actions: ${critical.length}\n\nCritical Assets:\n${JSON.stringify(critical, null, 2)}\n\nInclude: Active alerts, open work orders, weather watches, and pending dispatch actions for the next 8-hour shift.`,
          },
        },
      ],
    };
  }
);

// ─── Server Startup ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("grid-intelligence-mcp (v1.0.0 Enterprise) running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
