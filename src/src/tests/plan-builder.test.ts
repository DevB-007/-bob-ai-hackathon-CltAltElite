import test from "node:test";
import assert from "node:assert/strict";
import { buildMaintenancePlan } from "../plan-builder.js";
import type { AssetRiskScore } from "../types.js";

test("buildMaintenancePlan generates prioritized crew assignments with OSHA certifications and ROM metrics", () => {
  const scores: AssetRiskScore[] = [
    {
      asset_id: "TX-CRIT",
      asset_name: "Critical 500kV Transformer",
      asset_type: "transformer",
      region: "North",
      substation_id: "SUB-01",
      overall_risk_score: 95,
      failure_probability_7d: 0.95,
      health_score: 20,
      weather_risk_multiplier: 1.8,
      grid_impact_severity: "critical",
      estimated_customers_at_risk: 100000,
      estimated_outage_cost_usd: 14400000,
      risk_drivers: ["High DGA", "Arrhenius thermal aging"],
      recommended_action: "immediate_shutdown",
      action_window_hours: 4,
      avoided_loss_potential_usd: 13635000,
      contingency_plan: {
        backup_substation: "SUB-02",
        load_shed_target_mw: 80,
        switching_sequence: ["Switch to backup"],
        risk_mitigation_notes: "Mitigated",
      },
    },
    {
      asset_id: "TX-MED",
      asset_name: "Distribution Transformer 12kV",
      asset_type: "transformer",
      region: "South",
      substation_id: "SUB-02",
      overall_risk_score: 45,
      failure_probability_7d: 0.25,
      health_score: 65,
      weather_risk_multiplier: 1.0,
      grid_impact_severity: "medium",
      estimated_customers_at_risk: 5000,
      estimated_outage_cost_usd: 270000,
      risk_drivers: ["Overdue inspection"],
      recommended_action: "scheduled_inspection",
      action_window_hours: 72,
    },
  ];

  const plan = buildMaintenancePlan(scores, 72);

  assert.equal(plan.total_assets_assessed, 2);
  assert.equal(plan.critical_assets.length, 1);
  assert.equal(plan.medium_assets.length, 1);
  assert.ok(plan.crew_assignments.length > 0);

  const topAssignment = plan.crew_assignments[0]!;
  assert.equal(topAssignment.asset_id, "TX-CRIT");
  assert.equal(topAssignment.action, "immediate_shutdown");
  assert.ok(topAssignment.required_certifications.length > 0);
  assert.ok(topAssignment.safety_precautions.length > 0);
  assert.ok(plan.total_avoided_losses_usd > 0);
  assert.ok(plan.return_on_maintenance_ratio > 0);
  assert.match(plan.executive_summary, /EXPOSURE/i);
});
