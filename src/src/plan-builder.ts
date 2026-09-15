import type {
  AssetRiskScore,
  MaintenancePlan,
  CrewAssignment,
  PrePositioningZone,
  SeverityLevel,
} from "./types.js";

// ─── Crew & Certification Specifications ──────────────────────────────────────

interface CrewSpec {
  size: number;
  type: CrewAssignment["crew_type"];
  equipment: string[];
  certifications: string[];
  precautions: string[];
  baseRepairCostUsd: number;
}

const CREW_SPECS: Record<string, CrewSpec> = {
  immediate_shutdown: {
    size: 4,
    type: "emergency",
    equipment: ["mobile substation / bypass trailer", "high-voltage switching gear", "PPE class-4 arc flash suits", "SF6/dielectric pump unit"],
    certifications: ["OSHA 1910.269 HV Switching Qualified", "Certified Master Lineman", "Substation Relay Specialist"],
    precautions: [
      "Establish equipotential zone grounding prior to physical contact.",
      "Strict Lockout/Tagout (LOTO) clearance protocol with regional dispatch.",
      "Maintain minimum approach boundary (10 ft for 115kV, 15 ft for 230kV, 26 ft for 500kV).",
    ],
    baseRepairCostUsd: 45000,
  },
  emergency_inspection: {
    size: 3,
    type: "inspection",
    equipment: ["calibrated infrared thermography camera", "portable DGA multi-gas analyser", "acoustic PD detector probe", "dielectric breakdown tester"],
    certifications: ["Level II Thermographer (ASNT)", "CIGRE Transformer Diagnostic Specialist"],
    precautions: [
      "Non-contact thermal scanning from designated ground safety perimeter.",
      "Continuous atmospheric combustible gas monitoring if entering transformer bund.",
    ],
    baseRepairCostUsd: 18000,
  },
  pre_position_crew: {
    size: 2,
    type: "standby",
    equipment: ["emergency splice and termination trailer", "portable generator (150 kVA)", "all-terrain bucket truck", "line grounding sets"],
    certifications: ["Storm Restoration Lineman Certified", "Commercial Driver Class A (CDL)"],
    precautions: [
      "Stand by in sheltered staging facility during active severe lightning / wind exceedances.",
      "Monitor satellite weather feed and SCADA feeder alarms continuously.",
    ],
    baseRepairCostUsd: 8000,
  },
  scheduled_inspection: {
    size: 2,
    type: "maintenance",
    equipment: ["ASTM D1816 oil sampler kit", "sweep frequency response analyser (SFRA)", "winding resistance meter", "insulation resistance megohmmeter"],
    certifications: ["Substation Maintenance Technician", "Laboratory Dielectric Analyst"],
    precautions: [
      "Coordinate scheduled feeder outage window with load balancing team.",
      "Collect fluid samples following ASTM D923 airtight syringe procedures.",
    ],
    baseRepairCostUsd: 5000,
  },
  monitor: {
    size: 1,
    type: "standby",
    equipment: ["portable IoT sensor gateway", "handheld thermal imager"],
    certifications: ["Substation Safety Escort Certified"],
    precautions: [
      "Observe standard substation entry protocol; do not enter live bays without clearance.",
    ],
    baseRepairCostUsd: 1000,
  },
};

// ─── Pre-positioning Zone Builder ─────────────────────────────────────────────

function buildPrePositioningZones(scores: AssetRiskScore[]): PrePositioningZone[] {
  const byRegion = new Map<string, AssetRiskScore[]>();
  for (const score of scores) {
    if (score.weather_risk_multiplier < 1.3) continue;
    if (score.grid_impact_severity === "low") continue;
    const list = byRegion.get(score.region) ?? [];
    list.push(score);
    byRegion.set(score.region, list);
  }

  const zones: PrePositioningZone[] = [];
  let zoneIdx = 1;

  for (const [region, assets] of byRegion) {
    if (assets.length === 0) continue;

    const equipmentSet = new Set<string>();
    let maxCrewSize = 0;
    const reasonParts: string[] = [];

    for (const a of assets) {
      const spec = CREW_SPECS[a.recommended_action];
      if (!spec) continue;
      spec.equipment.forEach((e) => equipmentSet.add(e));
      maxCrewSize = Math.max(maxCrewSize, spec.size);

      if (a.weather_risk_multiplier >= 1.5 && !reasonParts.includes("severe storm / wind amplification")) {
        reasonParts.push("severe storm / wind amplification");
      }
      if (a.grid_impact_severity === "critical" && !reasonParts.includes("tier-1 critical asset at imminent risk")) {
        reasonParts.push("tier-1 critical asset at imminent risk");
      }
    }

    const deployBy = new Date(Date.now() + 4 * 3_600_000).toISOString();

    zones.push({
      zone_id: `ZONE-${String(zoneIdx++).padStart(3, "0")}`,
      region,
      reason: reasonParts.join("; ") || "Proactive weather resilience staging",
      staging_location: `${region} Regional Operations & Grid Staging Hub`,
      assets_covered: assets.map((a) => a.asset_id),
      crew_count: Math.max(2, maxCrewSize + 1), // +1 standby redundancy
      equipment: Array.from(equipmentSet),
      deploy_by: deployBy,
    });
  }

  return zones;
}

// ─── Crew Assignment Builder ──────────────────────────────────────────────────

function buildCrewAssignments(scores: AssetRiskScore[]): {
  assignments: CrewAssignment[];
  totalRepairCost: number;
} {
  const actionable = scores.filter((s) => s.recommended_action !== "monitor");
  const assignments: CrewAssignment[] = [];
  let totalRepairCost = 0;

  for (let i = 0; i < actionable.length; i++) {
    const score = actionable[i]!;
    const spec = CREW_SPECS[score.recommended_action] ?? CREW_SPECS["monitor"]!;
    const latestStart = new Date(
      Date.now() + score.action_window_hours * 3_600_000
    ).toISOString();

    totalRepairCost += spec.baseRepairCostUsd;

    const durationMap: Record<string, number> = {
      immediate_shutdown: 6,
      emergency_inspection: 4,
      pre_position_crew: 2,
      scheduled_inspection: 3,
      monitor: 1,
    };

    const switchingNote = score.contingency_plan
      ? `Backup feeder: ${score.contingency_plan.backup_substation || "N/A"} | Shed target: ${score.contingency_plan.load_shed_target_mw || 0} MW`
      : undefined;

    const notes = [
      `Risk Score: ${score.overall_risk_score}/100`,
      `7-Day Failure: ${(score.failure_probability_7d * 100).toFixed(1)}%`,
      score.weather_risk_multiplier > 1.1 ? `Weather Amplification: ×${score.weather_risk_multiplier}` : null,
      score.dga_fault_classification ? `DGA: ${score.dga_fault_classification}` : null,
      score.thermal_aging_factor_faa ? `Thermal Aging: ${score.thermal_aging_factor_faa}×` : null,
      `Customers: ${score.estimated_customers_at_risk.toLocaleString()}`,
      `Est. Outage Loss: $${(score.estimated_outage_cost_usd / 1_000_000).toFixed(2)}M`,
    ]
      .filter(Boolean)
      .join(" | ");

    assignments.push({
      priority_rank: i + 1,
      asset_id: score.asset_id,
      asset_name: score.asset_name,
      region: score.region,
      action: score.recommended_action,
      crew_type: spec.type,
      estimated_crew_size: spec.size,
      latest_start_time: latestStart,
      estimated_duration_hours: durationMap[score.recommended_action] ?? 3,
      required_certifications: spec.certifications,
      safety_precautions: spec.precautions,
      switching_recommendation: switchingNote,
      notes,
    });
  }

  return { assignments, totalRepairCost };
}

// ─── Executive Summary ────────────────────────────────────────────────────────

function buildExecutiveSummary(
  scores: AssetRiskScore[],
  horizonHours: number,
  avoidedLosses: number,
  repairCost: number,
  romRatio: number
): string {
  const critical = scores.filter((s) => s.grid_impact_severity === "critical");
  const high = scores.filter((s) => s.grid_impact_severity === "high");
  const totalCustomers = [...critical, ...high].reduce(
    (sum, s) => sum + s.estimated_customers_at_risk,
    0
  );
  const totalCost = [...critical, ...high].reduce(
    (sum, s) => sum + s.estimated_outage_cost_usd,
    0
  );
  const weatherAmplified = scores.filter((s) => s.weather_risk_multiplier > 1.3).length;

  const lines: string[] = [
    `Assessment evaluated ${scores.length} grid assets across a ${horizonHours}-hour planning horizon.`,
    `IDENTIFIED: ${critical.length} CRITICAL and ${high.length} HIGH priority assets requiring urgent operational action.`,
    `TOTAL RISK EXPOSURE: ${totalCustomers.toLocaleString()} customers at risk with a potential outage liability of $${(totalCost / 1_000_000).toFixed(2)}M.`,
    `BUSINESS CASE: Executing this maintenance and switching plan delivers an estimated $${(avoidedLosses / 1_000_000).toFixed(2)}M in avoided customer outage losses against an estimated intervention cost of $${(repairCost / 1000).toFixed(0)}k (Return on Maintenance Ratio: ${romRatio.toFixed(1)}×).`,
  ];

  if (weatherAmplified > 0) {
    lines.push(
      `WEATHER IMPACT: ${weatherAmplified} asset(s) exhibit dangerous compounding risks due to adverse regional weather forecasts — emergency pre-positioning active.`
    );
  }

  if (critical.length > 0) {
    lines.push(
      `IMMEDIATE ACTIONS: ${critical
        .map((s) => `${s.asset_name} [Action window: ${s.action_window_hours}h; DGA: ${s.dga_fault_classification || "Degraded"}]`)
        .join("; ")}.`
    );
  }

  return lines.join(" ");
}

// ─── Maintenance Plan Builder ─────────────────────────────────────────────────

export function buildMaintenancePlan(
  scores: AssetRiskScore[],
  horizonHours: number
): MaintenancePlan {
  const bySeverity = (level: SeverityLevel) =>
    scores
      .filter((s) => s.grid_impact_severity === level)
      .sort((a, b) => b.overall_risk_score - a.overall_risk_score);

  const critical = bySeverity("critical");
  const high = bySeverity("high");
  const medium = bySeverity("medium");
  const low = bySeverity("low");

  const sorted = [...critical, ...high, ...medium, ...low];
  const { assignments, totalRepairCost } = buildCrewAssignments(sorted);
  const prePositioningZones = buildPrePositioningZones(sorted);

  const totalAvoidedLosses = [...critical, ...high].reduce(
    (sum, s) => sum + (s.avoided_loss_potential_usd ?? 0),
    0
  );

  const romRatio = totalRepairCost > 0 ? totalAvoidedLosses / totalRepairCost : 1.0;

  return {
    generated_at: new Date().toISOString(),
    planning_horizon_hours: horizonHours,
    total_assets_assessed: scores.length,
    critical_assets: critical,
    high_assets: high,
    medium_assets: medium,
    low_assets: low,
    crew_assignments: assignments,
    pre_positioning_zones: prePositioningZones,
    total_avoided_losses_usd: totalAvoidedLosses,
    total_estimated_repair_cost_usd: totalRepairCost,
    return_on_maintenance_ratio: Math.round(romRatio * 10) / 10,
    executive_summary: buildExecutiveSummary(
      scores,
      horizonHours,
      totalAvoidedLosses,
      totalRepairCost,
      romRatio
    ),
  };
}
