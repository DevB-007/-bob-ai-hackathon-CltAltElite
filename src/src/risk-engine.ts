import type {
  SensorReading,
  AssetRecord,
  WeatherForecast,
  IncidentRecord,
  AssetRiskScore,
  SeverityLevel,
  MaintenanceAction,
  ContingencySwitchingPlan,
  ScenarioSimulation,
} from "./types.js";

// ─── IEEE C57.91 Arrhenius Thermal Aging Model ────────────────────────────────

/**
 * Computes the IEEE C57.91 relative aging rate factor (F_AA).
 * Baseline reference temperature is 110 °C (F_AA = 1.0).
 *
 * Formula: F_AA = exp( 15000/383 - 15000/(theta_H + 273) )
 */
export function computeThermalAgingFactor(hotSpotTempC: number): number {
  if (hotSpotTempC <= 0) return 0.01;
  const kelvin = hotSpotTempC + 273.15;
  const faa = Math.exp(15000 / 383.15 - 15000 / kelvin);
  return Math.round(faa * 100) / 100;
}

// ─── IEC 60599 / IEEE C57.104 DGA Fault Diagnosis ─────────────────────────────

/**
 * Analyzes dissolved combustible gas readings to identify fault conditions.
 */
export function diagnoseDGA(reading: SensorReading): { classification: string; penalty: number; alert: string | null } {
  const { h2_ppm = 0, ch4_ppm = 0, c2h2_ppm = 0, c2h4_ppm = 0, c2h6_ppm = 0, co_ppm = 0, dissolved_gas_ppm } = reading;

  // If specific gases are not reported, fall back to total dissolved gas (TCG)
  if (!h2_ppm && !ch4_ppm && !c2h2_ppm && !c2h4_ppm && !c2h6_ppm && !co_ppm) {
    if (dissolved_gas_ppm !== undefined) {
      if (dissolved_gas_ppm > 500) return { classification: "Critical TCG Dissolved Gas Spike", penalty: 22, alert: `TCG ${dissolved_gas_ppm} ppm exceeds 500 ppm danger limit` };
      if (dissolved_gas_ppm > 200) return { classification: "Elevated Dissolved Gas", penalty: 12, alert: `TCG ${dissolved_gas_ppm} ppm exceeds 200 ppm alarm limit` };
      if (dissolved_gas_ppm > 80)  return { classification: "Guarded Dissolved Gas", penalty: 4, alert: null };
    }
    return { classification: "Normal Dissolved Gas", penalty: 0, alert: null };
  }

  // Acetylene presence indicates high-temperature electrical arcing
  if (c2h2_ppm >= 2) {
    return {
      classification: "High-Energy Electrical Arcing (Flashover Risk)",
      penalty: 30,
      alert: `Acetylene (C2H2) detected at ${c2h2_ppm} ppm — immediate flashover hazard`,
    };
  }

  // Ethylene dominant indicates high thermal fault (> 700°C)
  if (c2h4_ppm > 50 || (c2h6_ppm > 0 && c2h4_ppm / c2h6_ppm > 3)) {
    return {
      classification: "High-Temperature Thermal Fault (> 700°C)",
      penalty: 24,
      alert: `Ethylene (C2H4) at ${c2h4_ppm} ppm indicates severe internal overheating`,
    };
  }

  // Hydrogen dominant indicates partial discharge / corona
  if (h2_ppm > 100 && ch4_ppm < 50) {
    return {
      classification: "Partial Discharge / Dielectric Corona",
      penalty: 18,
      alert: `Hydrogen (H2) at ${h2_ppm} ppm indicates internal dielectric discharge`,
    };
  }

  // Low thermal fault
  if (ch4_ppm > 120 || c2h6_ppm > 65) {
    return {
      classification: "Low/Medium-Temperature Thermal Fault (< 300°C)",
      penalty: 14,
      alert: `Methane (${ch4_ppm} ppm) / Ethane (${c2h6_ppm} ppm) indicates hot spots`,
    };
  }

  // Cellulose degradation
  if (co_ppm > 500) {
    return {
      classification: "Cellulose Paper Thermal Decomposition",
      penalty: 15,
      alert: `Carbon monoxide (CO) at ${co_ppm} ppm confirms solid insulation degradation`,
    };
  }

  return { classification: "Normal Gas Profile", penalty: 0, alert: null };
}

// ─── Sensor Health Scoring ────────────────────────────────────────────────────

/**
 * Converts raw sensor readings into a normalised health score (0–100).
 * Thresholds conform to IEEE C57.91 (transformers) and IEC 60076-7 guidance.
 */
export function computeHealthScore(reading: SensorReading): number {
  let score = 100;

  // Temperature with Arrhenius aging impact
  const faa = computeThermalAgingFactor(reading.temperature_c);
  if (faa > 10) score -= 35;       // > ~135 °C
  else if (faa > 2.5) score -= 22; // > ~120 °C
  else if (reading.temperature_c > 98) score -= 15;
  else if (reading.temperature_c > 85) score -= 8;
  else if (reading.temperature_c > 70) score -= 3;

  // Vibration (IEC 60034-14 class IV)
  if (reading.vibration_mm_s > 11.2) score -= 25;
  else if (reading.vibration_mm_s > 7.1) score -= 15;
  else if (reading.vibration_mm_s > 4.5) score -= 6;

  // Partial discharge (IEC 60270)
  if (reading.partial_discharge_pC > 1000) score -= 30;
  else if (reading.partial_discharge_pC > 500) score -= 18;
  else if (reading.partial_discharge_pC > 100) score -= 8;
  else if (reading.partial_discharge_pC > 20) score -= 2;

  // Oil quality index (dielectric breakdown & moisture)
  if (reading.oil_quality_index < 20) score -= 25;
  else if (reading.oil_quality_index < 40) score -= 14;
  else if (reading.oil_quality_index < 60) score -= 6;
  else if (reading.oil_quality_index < 75) score -= 2;

  // Overload
  if (reading.load_percent > 120) score -= 15;
  else if (reading.load_percent > 110) score -= 8;
  else if (reading.load_percent > 100) score -= 3;

  // DGA diagnostic penalty
  const dga = diagnoseDGA(reading);
  score -= dga.penalty;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Extract Human-Readable Risk Drivers ──────────────────────────────────────

export function extractRiskDrivers(reading: SensorReading, asset: AssetRecord): string[] {
  const drivers: string[] = [];

  const faa = computeThermalAgingFactor(reading.temperature_c);
  if (faa > 2.0) {
    drivers.push(`Accelerated thermal aging rate F_AA = ${faa}× at ${reading.temperature_c.toFixed(1)} °C`);
  } else if (reading.temperature_c > 98) {
    drivers.push(`High winding temperature ${reading.temperature_c.toFixed(1)} °C (alarm limit 98 °C)`);
  }

  if (reading.vibration_mm_s > 7.1) {
    drivers.push(`Elevated vibration ${reading.vibration_mm_s.toFixed(2)} mm/s (alarm 7.1 mm/s)`);
  }
  if (reading.partial_discharge_pC > 500) {
    drivers.push(`Severe partial discharge ${reading.partial_discharge_pC} pC — insulation degradation`);
  } else if (reading.partial_discharge_pC > 100) {
    drivers.push(`Elevated partial discharge ${reading.partial_discharge_pC} pC`);
  }
  if (reading.oil_quality_index < 40) {
    drivers.push(`Poor oil quality index ${reading.oil_quality_index}/100 — dielectric failure risk`);
  }
  if (reading.load_percent > 110) {
    drivers.push(`Overload condition ${reading.load_percent.toFixed(0)}% of rated capacity`);
  }

  const dga = diagnoseDGA(reading);
  if (dga.alert) {
    drivers.push(dga.alert);
  }

  if (asset.age_years > 40) {
    drivers.push(`Asset age ${asset.age_years} years — beyond typical 40-year design life`);
  }

  const maintenanceTimestamp = Date.parse(asset.last_maintenance_date);
  if (!isNaN(maintenanceTimestamp)) {
    const daysSince = Math.floor((Date.now() - maintenanceTimestamp) / 86_400_000);
    if (daysSince > 730) {
      drivers.push(`Overdue maintenance (${Math.floor(daysSince / 365)} years since last overhaul)`);
    }
  }

  return drivers;
}

// ─── Weather Risk Multiplier ──────────────────────────────────────────────────

export function computeWeatherMultiplier(forecast: WeatherForecast | undefined): number {
  if (!forecast) return 1.0;

  let multiplier = 1.0;

  if (forecast.storm_warning) multiplier += 1.2;
  else if (forecast.storm_watch) multiplier += 0.6;

  switch (forecast.lightning_risk) {
    case "extreme": multiplier += 0.8; break;
    case "high":    multiplier += 0.5; break;
    case "moderate":multiplier += 0.25; break;
  }

  if (forecast.wind_speed_kmh > 100) multiplier += 0.5;
  else if (forecast.wind_speed_kmh > 70) multiplier += 0.25;

  if (forecast.ice_accretion_risk) multiplier += 0.4;

  const heatIndex = forecast.heat_index_c ?? forecast.temperature_c;
  if (heatIndex > 42) multiplier += 0.3;
  else if (heatIndex > 36) multiplier += 0.15;

  return Math.min(3.0, Math.round(multiplier * 100) / 100);
}

// ─── Failure Probability Model ────────────────────────────────────────────────

export function computeFailureProbability(
  healthScore: number,
  asset: AssetRecord,
  recentIncidentCount: number,
  weatherMultiplier: number
): number {
  const degradation = (100 - healthScore) / 100;
  const ageRisk = Math.min(0.3, (asset.age_years / 50) * 0.3);
  const incidentRisk = Math.min(0.2, recentIncidentCount * 0.05);

  const rawRisk = degradation * 0.5 + ageRisk + incidentRisk;
  const logisticRisk = 1 / (1 + Math.exp(-10 * (rawRisk - 0.4)));
  const boosted = Math.min(0.99, logisticRisk * weatherMultiplier);

  return Math.round(boosted * 1000) / 1000;
}

// ─── Outage Cost & Financial Impact ───────────────────────────────────────────

export const OUTAGE_COST_PER_CUSTOMER_HOUR_USD = 18; // EPRI industry average

export function computeOutageCost(customersAtRisk: number, estimatedDurationHours: number): number {
  return customersAtRisk * estimatedDurationHours * OUTAGE_COST_PER_CUSTOMER_HOUR_USD;
}

export function deriveSeverity(
  failureProbability: number,
  customersAtRisk: number,
  criticalityTier: 1 | 2 | 3
): SeverityLevel {
  const impactScore =
    failureProbability * 100 +
    Math.log10(Math.max(1, customersAtRisk)) * 5 +
    (criticalityTier === 1 ? 20 : criticalityTier === 2 ? 10 : 0);

  if (impactScore >= 70 || (failureProbability > 0.6 && criticalityTier === 1)) return "critical";
  if (impactScore >= 45) return "high";
  if (impactScore >= 25) return "medium";
  return "low";
}

export function deriveAction(
  severity: SeverityLevel,
  failureProbability: number,
  weatherMultiplier: number
): { action: MaintenanceAction; windowHours: number } {
  if (severity === "critical" || failureProbability > 0.7) {
    return { action: "immediate_shutdown", windowHours: 4 };
  }
  if (severity === "high" || failureProbability > 0.5) {
    return { action: "emergency_inspection", windowHours: 12 };
  }
  if (severity === "medium" && weatherMultiplier > 1.5) {
    return { action: "pre_position_crew", windowHours: 24 };
  }
  if (severity === "medium") {
    return { action: "scheduled_inspection", windowHours: 72 };
  }
  return { action: "monitor", windowHours: 168 };
}

// ─── Contingency & Switching Plan Generator ───────────────────────────────────

export function buildContingencyPlan(
  asset: AssetRecord,
  reading: SensorReading,
  severity: SeverityLevel
): ContingencySwitchingPlan {
  const currentMw = Math.round(asset.rated_mva * (reading.load_percent / 100) * 0.9);
  const targetSubstation = asset.alternate_substation_id || `SUB-ALT-${asset.region.replace(/\s+/g, "").toUpperCase()}`;

  if (severity === "critical" || severity === "high") {
    return {
      backup_substation: targetSubstation,
      load_shed_target_mw: currentMw,
      switching_sequence: [
        `1. Notify Regional Transmission Operator (RTO) of impending de-energization on ${asset.asset_id}.`,
        `2. Arm tie-breaker at ${targetSubstation} to absorb up to ${currentMw} MW transfer.`,
        `3. Close tie breaker to parallel bus and balance phase angles.`,
        `4. Open secondary low-voltage breaker on ${asset.name}.`,
        `5. Open high-voltage disconnect switch (${asset.voltage_kv} kV) on ${asset.asset_id}.`,
        `6. Rack out breaker, lock out / tag out (LOTO), and verify zero potential before maintenance handoff.`,
      ],
      risk_mitigation_notes: `Prevented unnotified interruption for ${asset.customers_served.toLocaleString()} customers by pre-switching to ${targetSubstation}.`,
    };
  }

  return {
    backup_substation: targetSubstation,
    load_shed_target_mw: 0,
    switching_sequence: [
      `1. Log preventive maintenance request in EMS/SCADA.`,
      `2. Verify backup circuit availability at ${targetSubstation} prior to scheduled maintenance.`,
    ],
    risk_mitigation_notes: "Normal operational posture; standby feeder available if needed.",
  };
}

// ─── Complete Asset Risk Scorer ───────────────────────────────────────────────

export function scoreAsset(
  asset: AssetRecord,
  latestReading: SensorReading,
  recentIncidents: IncidentRecord[],
  forecast: WeatherForecast | undefined
): AssetRiskScore {
  const healthScore = computeHealthScore(latestReading);
  const weatherMultiplier = computeWeatherMultiplier(forecast);
  const recentIncidentCount = recentIncidents.filter(
    (i) => i.type === "outage" || i.type === "fault"
  ).length;
  const failureProbability = computeFailureProbability(
    healthScore,
    asset,
    recentIncidentCount,
    weatherMultiplier
  );
  const overallRiskScore = Math.round(failureProbability * 100);
  const severity = deriveSeverity(failureProbability, asset.customers_served, asset.criticality_tier);
  const { action, windowHours } = deriveAction(severity, failureProbability, weatherMultiplier);
  const riskDrivers = extractRiskDrivers(latestReading, asset);
  const estimatedDuration = severity === "critical" ? 8 : severity === "high" ? 5 : 3;
  const outageCost = computeOutageCost(asset.customers_served, estimatedDuration);

  // Weather notes
  if (weatherMultiplier > 1.3 && forecast) {
    const wxDrivers: string[] = [];
    if (forecast.storm_warning) wxDrivers.push("active storm warning");
    if (forecast.lightning_risk === "high" || forecast.lightning_risk === "extreme") {
      wxDrivers.push(`${forecast.lightning_risk} lightning`);
    }
    if (forecast.wind_speed_kmh > 70) wxDrivers.push(`wind ${forecast.wind_speed_kmh} km/h`);
    if (forecast.ice_accretion_risk) wxDrivers.push("ice accretion");
    if (wxDrivers.length > 0) {
      riskDrivers.push(`Weather amplification ×${weatherMultiplier}: ${wxDrivers.join(", ")}`);
    }
  }

  const faa = computeThermalAgingFactor(latestReading.temperature_c);
  const dga = diagnoseDGA(latestReading);
  const contingency = buildContingencyPlan(asset, latestReading, severity);

  // Avoided Loss Potential = (Expected Outage Loss) - (Preventive Repair Cost)
  const estimatedRepairCost = severity === "critical" ? 45000 : severity === "high" ? 18000 : 5000;
  const avoidedLoss = Math.max(0, Math.round(outageCost * failureProbability - estimatedRepairCost));

  return {
    asset_id: asset.asset_id,
    asset_name: asset.name,
    asset_type: asset.asset_type,
    region: asset.region,
    substation_id: asset.substation_id,
    overall_risk_score: overallRiskScore,
    failure_probability_7d: failureProbability,
    health_score: healthScore,
    weather_risk_multiplier: weatherMultiplier,
    grid_impact_severity: severity,
    estimated_customers_at_risk: asset.customers_served,
    estimated_outage_cost_usd: Math.round(outageCost),
    risk_drivers: riskDrivers.length > 0 ? riskDrivers : ["All operating metrics within nominal limits"],
    recommended_action: action,
    action_window_hours: windowHours,
    thermal_aging_factor_faa: faa,
    dga_fault_classification: dga.classification,
    contingency_plan: contingency,
    avoided_loss_potential_usd: avoidedLoss,
  };
}

// ─── Scenario Simulation Helper ───────────────────────────────────────────────

export function simulateWeatherScenario(
  scenarioName: string,
  targetRegion: string,
  simulatedWeather: Partial<WeatherForecast>,
  assets: AssetRecord[],
  readings: Record<string, SensorReading>,
  incidentsMap: Record<string, IncidentRecord[]>,
  currentWeatherMap: Record<string, WeatherForecast>
): ScenarioSimulation {
  const regionAssets = assets.filter((a) => a.region === targetRegion);

  // Baseline scoring
  const baselineScores = regionAssets.map((a) => {
    const r = readings[a.asset_id] || {
      asset_id: a.asset_id,
      timestamp: new Date().toISOString(),
      temperature_c: 65,
      vibration_mm_s: 3.0,
      partial_discharge_pC: 50,
      oil_quality_index: 80,
      load_percent: 75,
    };
    return scoreAsset(a, r, incidentsMap[a.asset_id] || [], currentWeatherMap[targetRegion]);
  });

  // Simulated weather
  const currentWx = currentWeatherMap[targetRegion] || {
    region: targetRegion,
    forecast_time: new Date().toISOString(),
    valid_until: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    temperature_c: 25,
    wind_speed_kmh: 20,
    precipitation_mm: 0,
    lightning_risk: "none",
    ice_accretion_risk: false,
    storm_watch: false,
    storm_warning: false,
  };

  const fusedWx: WeatherForecast = { ...currentWx, ...simulatedWeather, region: targetRegion };

  // Simulated scoring
  const simulatedScores = regionAssets.map((a) => {
    const r = readings[a.asset_id] || {
      asset_id: a.asset_id,
      timestamp: new Date().toISOString(),
      temperature_c: 65,
      vibration_mm_s: 3.0,
      partial_discharge_pC: 50,
      oil_quality_index: 80,
      load_percent: 75,
    };
    return scoreAsset(a, r, incidentsMap[a.asset_id] || [], fusedWx);
  });

  simulatedScores.sort((a, b) => b.overall_risk_score - a.overall_risk_score);

  const baselineCrit = baselineScores.filter((s) => s.grid_impact_severity === "critical").length;
  const scenarioCrit = simulatedScores.filter((s) => s.grid_impact_severity === "critical").length;

  const baselineCost = baselineScores.reduce((sum, s) => sum + s.estimated_outage_cost_usd, 0);
  const scenarioCost = simulatedScores.reduce((sum, s) => sum + s.estimated_outage_cost_usd, 0);

  const preparations: string[] = [
    `Pre-stage emergency restoration crews in ${targetRegion} staging yard at least 4 hours before event onset.`,
    `Review SCADA feeder switching sequences for ${simulatedScores.slice(0, 3).map((s) => s.asset_name).join(", ")}.`,
  ];

  if (fusedWx.wind_speed_kmh > 90) {
    preparations.push("High wind protocol: inspect overhead conductor clearances and vegetation buffers.");
  }
  if (fusedWx.lightning_risk === "high" || fusedWx.lightning_risk === "extreme") {
    preparations.push("Surge arrester audit: verify grounding resistances on transmission substation buses.");
  }

  return {
    scenario_name: scenarioName,
    target_region: targetRegion,
    simulated_conditions: simulatedWeather,
    baseline_critical_count: baselineCrit,
    scenario_critical_count: scenarioCrit,
    baseline_exposure_usd: baselineCost,
    scenario_exposure_usd: scenarioCost,
    delta_exposure_usd: Math.max(0, scenarioCost - baselineCost),
    highest_risk_assets: simulatedScores.slice(0, 5),
    recommended_preparations: preparations,
  };
}
