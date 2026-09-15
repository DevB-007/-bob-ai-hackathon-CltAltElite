#!/usr/bin/env node
/**
 * grid-sensor-validate.mjs
 *
 * Supporting script for the grid-resilience skill.
 * Reads a CSV file of sensor readings and validates all values against
 * IEEE C57.91 / IEC 60076-7 thresholds, printing a structured JSON
 * summary that Bob can pass into ingest_sensor_readings.
 *
 * Usage:
 *   node grid-sensor-validate.mjs <path-to-csv>
 *
 * Expected CSV columns (header row required, order flexible):
 *   asset_id, timestamp, temperature_c, vibration_mm_s,
 *   partial_discharge_pC, oil_quality_index, load_percent,
 *   tap_position (optional), dissolved_gas_ppm (optional)
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Thresholds ────────────────────────────────────────────────────────────────
const THRESHOLDS = {
  temperature_c:         { alarm: 85,  danger: 98   },
  vibration_mm_s:        { alarm: 7.1, danger: 11.2 },
  partial_discharge_pC:  { alarm: 500, danger: 1000 },
  oil_quality_index:     { alarm: 60,  danger: 40, inverted: true },  // lower is worse
  load_percent:          { alarm: 100, danger: 110  },
  dissolved_gas_ppm:     { alarm: 200, danger: 500  },
};

// ─── CSV Parser ────────────────────────────────────────────────────────────────
function parseCsv(content) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

// ─── Validate One Reading ─────────────────────────────────────────────────────
function validateReading(row) {
  const required = ["asset_id", "timestamp", "temperature_c", "vibration_mm_s",
                    "partial_discharge_pC", "oil_quality_index", "load_percent"];
  const missing = required.filter((f) => !row[f] && row[f] !== "0");
  if (missing.length > 0) {
    return { asset_id: row.asset_id ?? "?", valid: false, errors: [`Missing fields: ${missing.join(", ")}`], warnings: [], reading: null };
  }

  const reading = {
    asset_id: row.asset_id,
    timestamp: row.timestamp,
    temperature_c: parseFloat(row.temperature_c),
    vibration_mm_s: parseFloat(row.vibration_mm_s),
    partial_discharge_pC: parseFloat(row.partial_discharge_pC),
    oil_quality_index: parseFloat(row.oil_quality_index),
    load_percent: parseFloat(row.load_percent),
  };
  if (row.tap_position)      reading.tap_position = parseInt(row.tap_position, 10);
  if (row.dissolved_gas_ppm) reading.dissolved_gas_ppm = parseFloat(row.dissolved_gas_ppm);

  const errors = [];
  const warnings = [];
  const flags = [];

  for (const [field, limits] of Object.entries(THRESHOLDS)) {
    const val = reading[field];
    if (val === undefined || isNaN(val)) continue;
    const { alarm, danger, inverted = false } = limits;
    const isDanger = inverted ? val < danger : val > danger;
    const isAlarm  = inverted ? val < alarm  : val > alarm;
    if (isDanger) {
      errors.push(`${field}=${val} exceeds DANGER threshold (${inverted ? "<" : ">"}${danger})`);
      flags.push({ field, value: val, level: "danger", threshold: danger });
    } else if (isAlarm) {
      warnings.push(`${field}=${val} exceeds ALARM threshold (${inverted ? "<" : ">"}${alarm})`);
      flags.push({ field, value: val, level: "alarm", threshold: alarm });
    }
  }

  // Timestamp validation
  const ts = new Date(reading.timestamp);
  if (isNaN(ts.getTime())) {
    errors.push(`Invalid timestamp format: ${reading.timestamp}`);
  } else {
    const ageHours = (Date.now() - ts.getTime()) / 3_600_000;
    if (ageHours > 72) warnings.push(`Reading is ${Math.round(ageHours)}h old — consider refreshing sensor data`);
  }

  return {
    asset_id: reading.asset_id,
    valid: errors.length === 0,
    errors,
    warnings,
    flags,
    reading,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node grid-sensor-validate.mjs <path-to-csv>");
  process.exit(1);
}

const csvPath = resolve(args[0]);
let content;
try {
  content = readFileSync(csvPath, "utf8");
} catch (err) {
  console.error(`Cannot read file: ${csvPath}\n${err.message}`);
  process.exit(1);
}

const rows = parseCsv(content);
const results = rows.map(validateReading);

const valid    = results.filter((r) => r.valid);
const invalid  = results.filter((r) => !r.valid);
const allFlags = results.flatMap((r) => (r.flags ?? []).map((f) => ({ asset_id: r.asset_id, ...f })));
const dangerCount = allFlags.filter((f) => f.level === "danger").length;
const alarmCount  = allFlags.filter((f) => f.level === "alarm").length;

const output = {
  summary: {
    total_readings: results.length,
    valid_readings: valid.length,
    invalid_readings: invalid.length,
    danger_flags: dangerCount,
    alarm_flags: alarmCount,
  },
  validation_errors: invalid.map((r) => ({ asset_id: r.asset_id, errors: r.errors })),
  sensor_flags: allFlags,
  ready_to_ingest: valid.map((r) => r.reading),
};

console.log(JSON.stringify(output, null, 2));
