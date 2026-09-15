import test from "node:test";
import assert from "node:assert/strict";
import {
  computeThermalAgingFactor,
  diagnoseDGA,
  computeHealthScore,
  computeWeatherMultiplier,
  computeFailureProbability,
  deriveSeverity,
  deriveAction,
  scoreAsset,
  simulateWeatherScenario,
} from "../risk-engine.js";
import type { AssetRecord, SensorReading, WeatherForecast, IncidentRecord } from "../types.js";

test("IEEE C57.91 Arrhenius thermal aging factor", () => {
  // At 110 °C, F_AA should be ~1.0
  const faa110 = computeThermalAgingFactor(110);
  assert.ok(faa110 >= 0.95 && faa110 <= 1.05, `Expected F_AA ~1.0 at 110C, got ${faa110}`);

  // At 120 °C, accelerated aging
  const faa120 = computeThermalAgingFactor(120);
  assert.ok(faa120 > 2.0 && faa120 < 3.0, `Expected F_AA ~2.5 at 120C, got ${faa120}`);

  // At 70 °C, minimal aging
  const faa70 = computeThermalAgingFactor(70);
  assert.ok(faa70 < 0.1, `Expected F_AA < 0.1 at 70C, got ${faa70}`);
});

test("IEC 60599 / IEEE C57.104 DGA fault diagnosis", () => {
  // Acetylene detection
  const arcingReading: SensorReading = {
    asset_id: "T-1",
    timestamp: new Date().toISOString(),
    temperature_c: 85,
    vibration_mm_s: 2.0,
    partial_discharge_pC: 50,
    oil_quality_index: 80,
    load_percent: 75,
    c2h2_ppm: 5.0,
  };
  const arcingDiag = diagnoseDGA(arcingReading);
  assert.match(arcingDiag.classification, /Arcing/i);
  assert.equal(arcingDiag.penalty, 30);

  // High thermal fault (>700C)
  const thermalReading: SensorReading = {
    asset_id: "T-2",
    timestamp: new Date().toISOString(),
    temperature_c: 90,
    vibration_mm_s: 2.0,
    partial_discharge_pC: 50,
    oil_quality_index: 80,
    load_percent: 75,
    c2h4_ppm: 120,
    c2h6_ppm: 20,
  };
  const thermalDiag = diagnoseDGA(thermalReading);
  assert.match(thermalDiag.classification, /Thermal Fault/i);
});

test("Health scoring handles severe degradation", () => {
  const degradedReading: SensorReading = {
    asset_id: "T-1",
    timestamp: new Date().toISOString(),
    temperature_c: 125,
    vibration_mm_s: 12.0,
    partial_discharge_pC: 1200,
    oil_quality_index: 15,
    load_percent: 125,
    c2h2_ppm: 8,
  };
  const score = computeHealthScore(degradedReading);
  assert.ok(score <= 15, `Expected score <= 15 for severely degraded asset, got ${score}`);
});

test("Weather multiplier scales with storm warning and high winds", () => {
  const severeWx: WeatherForecast = {
    region: "Coast",
    forecast_time: new Date().toISOString(),
    valid_until: new Date().toISOString(),
    temperature_c: 32,
    wind_speed_kmh: 110,
    precipitation_mm: 50,
    lightning_risk: "high",
    storm_watch: true,
    storm_warning: true,
    ice_accretion_risk: false,
  };
  const multiplier = computeWeatherMultiplier(severeWx);
  assert.ok(multiplier >= 2.5, `Expected multiplier >= 2.5, got ${multiplier}`);
});

test("Complete asset scoring generates contingency plan and avoided loss", () => {
  const asset: AssetRecord = {
    asset_id: "TX-TEST",
    asset_type: "transformer",
    name: "Substation Alpha Transformer 1",
    region: "Metro",
    substation_id: "SUB-01",
    voltage_kv: 230,
    rated_mva: 100,
    age_years: 42,
    customers_served: 50000,
    criticality_tier: 1,
    last_maintenance_date: "2020-01-01",
    coordinates: { lat: 37.5, lon: -122.1 },
    backup_feed_available: true,
    alternate_substation_id: "SUB-02",
  };

  const reading: SensorReading = {
    asset_id: "TX-TEST",
    timestamp: new Date().toISOString(),
    temperature_c: 105,
    vibration_mm_s: 8.5,
    partial_discharge_pC: 900,
    oil_quality_index: 25,
    load_percent: 115,
    dissolved_gas_ppm: 450,
  };

  const score = scoreAsset(asset, reading, [], undefined);
  assert.ok(score.overall_risk_score > 70, `Expected risk score > 70, got ${score.overall_risk_score}`);
  assert.equal(score.grid_impact_severity, "critical");
  assert.ok(score.contingency_plan !== undefined);
  assert.ok(score.contingency_plan.switching_sequence.length >= 4);
  assert.ok((score.avoided_loss_potential_usd || 0) > 0);
});

test("Scenario simulation detects elevated risk under hurricane conditions", () => {
  const asset: AssetRecord = {
    asset_id: "TX-SIM",
    asset_type: "transformer",
    name: "Coastal Transformer",
    region: "Coast",
    substation_id: "SUB-C1",
    voltage_kv: 115,
    rated_mva: 50,
    age_years: 25,
    customers_served: 20000,
    criticality_tier: 2,
    last_maintenance_date: "2023-01-01",
    coordinates: { lat: 34.0, lon: -118.0 },
  };

  const reading: SensorReading = {
    asset_id: "TX-SIM",
    timestamp: new Date().toISOString(),
    temperature_c: 75,
    vibration_mm_s: 3.5,
    partial_discharge_pC: 80,
    oil_quality_index: 70,
    load_percent: 85,
  };

  const sim = simulateWeatherScenario(
    "Hurricane Category 2",
    "Coast",
    { wind_speed_kmh: 120, storm_warning: true, lightning_risk: "extreme" },
    [asset],
    { "TX-SIM": reading },
    {},
    {}
  );

  assert.equal(sim.target_region, "Coast");
  assert.ok(sim.scenario_exposure_usd >= sim.baseline_exposure_usd);
  assert.ok(sim.recommended_preparations.length > 0);
});
