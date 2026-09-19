// ─── Enterprise Domain Types ───────────────────────────────────────────────────

export type AssetType = "transformer" | "substation" | "breaker" | "line" | "capacitor_bank";
export type SeverityLevel = "critical" | "high" | "medium" | "low";
export type MaintenanceAction =
  | "immediate_shutdown"
  | "emergency_inspection"
  | "scheduled_inspection"
  | "monitor"
  | "pre_position_crew";

export interface DGAReadings {
  h2_ppm?: number;     // Hydrogen (partial discharge / corona)
  ch4_ppm?: number;    // Methane (sparking / low-temperature overheating)
  c2h2_ppm?: number;   // Acetylene (arcing / high-energy discharge)
  c2h4_ppm?: number;   // Ethylene (high-temperature thermal fault > 700°C)
  c2h6_ppm?: number;   // Ethane (low-temperature thermal fault < 300°C)
  co_ppm?: number;     // Carbon monoxide (paper / cellulose degradation)
}

export interface SensorReading extends DGAReadings {
  asset_id: string;
  timestamp: string;            // ISO 8601
  temperature_c: number;        // Winding or top oil temperature
  vibration_mm_s: number;       // RMS vibration (IEC 60034-14)
  partial_discharge_pC: number; // Partial discharge in picocoulombs (IEC 60270)
  oil_quality_index: number;    // 0–100 index (dielectric strength, moisture, acidity)
  load_percent: number;         // Current load as % of rated capacity
  tap_position?: number;        // On-load tap changer (OLTC) tap index
  dissolved_gas_ppm?: number;   // Total combustible dissolved gas (TCG proxy)
  voltage_v?: number;           // Live voltage
  current_a?: number;           // Live current
  ambient_temp_c?: number;      // Ambient weather temperature for delta-T calculations
}

export interface AssetRecord {
  asset_id: string;
  asset_type: AssetType;
  name: string;
  region: string;
  substation_id: string;
  voltage_kv: number;
  rated_mva: number;
  age_years: number;
  customers_served: number;     // Downstream connected customers
  criticality_tier: 1 | 2 | 3; // 1=Hospital / Life-support / Defense, 2=Industrial / Commercial, 3=Residential
  last_maintenance_date: string;
  coordinates: { lat: number; lon: number };
  backup_feed_available?: boolean;
  alternate_substation_id?: string;
}

export interface WeatherForecast {
  region: string;
  forecast_time: string;        // ISO 8601
  valid_until: string;          // ISO 8601
  temperature_c: number;
  wind_speed_kmh: number;
  precipitation_mm: number;
  lightning_risk: "none" | "low" | "moderate" | "high" | "extreme";
  heat_index_c?: number;
  ice_accretion_risk: boolean;
  storm_watch: boolean;
  storm_warning: boolean;
}

export interface IncidentRecord {
  incident_id: string;
  asset_id: string;
  occurred_at: string;
  type: "outage" | "near_miss" | "fault" | "maintenance_finding";
  duration_hours: number;
  customers_affected: number;
  root_cause: string;
  sensor_signatures?: Partial<SensorReading>;
  weather_conditions?: Partial<WeatherForecast>;
}

export interface ContingencySwitchingPlan {
  backup_substation?: string;
  load_shed_target_mw?: number;
  switching_sequence: string[];
  risk_mitigation_notes: string;
}

export interface AssetRiskScore {
  asset_id: string;
  asset_name: string;
  asset_type: AssetType;
  region: string;
  substation_id: string;
  overall_risk_score: number;           // 0–100
  failure_probability_7d: number;       // 0–1
  health_score: number;                 // 0–100 (inverse of degradation)
  weather_risk_multiplier: number;      // 1.0 = no amplification
  grid_impact_severity: SeverityLevel;
  estimated_customers_at_risk: number;
  estimated_outage_cost_usd: number;    // $/hour × estimated duration
  risk_drivers: string[];               // Human-readable top factors
  recommended_action: MaintenanceAction;
  action_window_hours: number;          // Hours before risk becomes critical
  thermal_aging_factor_faa?: number;    // IEEE C57.91 relative aging rate
  dga_fault_classification?: string;   // Duval / Rogers gas analysis diagnosis
  contingency_plan?: ContingencySwitchingPlan;
  avoided_loss_potential_usd?: number;  // Expected value of saved outage costs
}

export interface CrewAssignment {
  priority_rank: number;
  asset_id: string;
  asset_name: string;
  region: string;
  action: MaintenanceAction;
  crew_type: "emergency" | "inspection" | "maintenance" | "standby";
  estimated_crew_size: number;
  latest_start_time: string;   // ISO 8601
  estimated_duration_hours: number;
  required_certifications: string[];
  safety_precautions: string[];
  switching_recommendation?: string;
  notes: string;
}

export interface PrePositioningZone {
  zone_id: string;
  region: string;
  reason: string;
  staging_location: string;
  assets_covered: string[];
  crew_count: number;
  equipment: string[];
  deploy_by: string;           // ISO 8601
}

export interface MaintenancePlan {
  generated_at: string;
  planning_horizon_hours: number;
  total_assets_assessed: number;
  critical_assets: AssetRiskScore[];
  high_assets: AssetRiskScore[];
  medium_assets: AssetRiskScore[];
  low_assets: AssetRiskScore[];
  crew_assignments: CrewAssignment[];
  pre_positioning_zones: PrePositioningZone[];
  total_avoided_losses_usd: number;
  total_estimated_repair_cost_usd: number;
  return_on_maintenance_ratio: number;
  executive_summary: string;
}

export interface ScenarioSimulation {
  scenario_name: string;
  target_region: string;
  simulated_conditions: Partial<WeatherForecast>;
  baseline_critical_count: number;
  scenario_critical_count: number;
  baseline_exposure_usd: number;
  scenario_exposure_usd: number;
  delta_exposure_usd: number;
  highest_risk_assets: AssetRiskScore[];
  recommended_preparations: string[];
}
