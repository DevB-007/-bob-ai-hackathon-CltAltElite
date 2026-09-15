import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "path";
import { rmSync, existsSync } from "fs";
import { GridStore } from "../storage.js";
import type { AssetRecord, SensorReading, WeatherForecast } from "../types.js";

const TEST_DB_PATH = resolve(process.cwd(), "data", "test_grid_store.json");

test("GridStore persists and reloads data atomically", () => {
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH);
  }

  const store1 = new GridStore(TEST_DB_PATH);

  const asset: AssetRecord = {
    asset_id: "TX-STORE-1",
    asset_type: "transformer",
    name: "Persistence Test Transformer",
    region: "TestRegion",
    substation_id: "SUB-TEST",
    voltage_kv: 115,
    rated_mva: 50,
    age_years: 10,
    customers_served: 15000,
    criticality_tier: 2,
    last_maintenance_date: "2023-01-01",
    coordinates: { lat: 35.0, lon: -120.0 },
  };

  const reading: SensorReading = {
    asset_id: "TX-STORE-1",
    timestamp: new Date().toISOString(),
    temperature_c: 65,
    vibration_mm_s: 1.5,
    partial_discharge_pC: 20,
    oil_quality_index: 92,
    load_percent: 60,
  };

  const weather: WeatherForecast = {
    region: "TestRegion",
    forecast_time: new Date().toISOString(),
    valid_until: new Date().toISOString(),
    temperature_c: 24,
    wind_speed_kmh: 15,
    precipitation_mm: 0,
    lightning_risk: "none",
    ice_accretion_risk: false,
    storm_watch: false,
    storm_warning: false,
  };

  store1.setAsset(asset);
  store1.setReading(reading);
  store1.setWeather(weather);

  assert.ok(existsSync(TEST_DB_PATH), "Database file should exist on disk");

  // Re-open in a second instance
  const store2 = new GridStore(TEST_DB_PATH);
  assert.equal(store2.getAssets().length, 1);
  assert.equal(store2.getAsset("TX-STORE-1")?.name, "Persistence Test Transformer");
  assert.equal(store2.getReading("TX-STORE-1")?.temperature_c, 65);
  assert.equal(store2.getWeather("TestRegion")?.wind_speed_kmh, 15);

  // Test delete
  assert.equal(store2.deleteAsset("TX-STORE-1"), true);
  assert.equal(store2.getAssets().length, 0);

  // Clean up test file
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH);
  }
});
