// ─── State ───────────────────────────────────────────────────────────────────
let allAssets = [];
let allWeather = [];
let activePlan = null;

// ─── Startup ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadAllData();
});

async function loadAllData() {
  try {
    await Promise.all([
      fetchKpis(),
      fetchAssets(),
      fetchWeather(),
      fetchPlan(),
    ]);
  } catch (err) {
    console.error("Failed to load initial data:", err);
  }
}

// ─── KPI Ribbon ───────────────────────────────────────────────────────────────
async function fetchKpis() {
  const res = await fetch("/api/kpis");
  const data = await res.json();

  document.getElementById("posture-text").innerText = data.status;
  const postureBadge = document.getElementById("grid-posture-badge");
  postureBadge.className = `posture-badge ${
    data.critical_count > 0 ? "posture-alert" : data.storm_alerts_count > 0 ? "posture-warning" : "posture-nominal"
  }`;

  document.getElementById("kpi-critical-high").innerText = data.critical_count + data.high_count;
  document.getElementById("kpi-critical-sub").innerText = `${data.critical_count} Critical, ${data.high_count} High priority`;
  document.getElementById("kpi-customers").innerText = data.customers_at_risk.toLocaleString();
  document.getElementById("kpi-liability").innerText = `$${(data.outage_liability_usd / 1_000_000).toFixed(2)}M`;
  document.getElementById("kpi-avoided").innerText = `$${(data.avoided_loss_potential_usd / 1_000_000).toFixed(2)}M`;

  document.getElementById("kpi-health").innerText = `${data.average_health_score}%`;
  document.getElementById("kpi-health-fill").style.width = `${data.average_health_score}%`;
}

// ─── Asset Matrix ─────────────────────────────────────────────────────────────
async function fetchAssets() {
  const res = await fetch("/api/assets");
  allAssets = await res.json();
  renderAssetsTable(allAssets);
}

function renderAssetsTable(assets) {
  const tbody = document.getElementById("asset-table-body");
  if (!assets || assets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="loading">No matching assets found.</td></tr>`;
    document.getElementById("asset-count-summary").innerText = "Showing 0 Assets";
    return;
  }

  tbody.innerHTML = assets
    .map((a, index) => {
      const severityClass = `badge-${a.grid_impact_severity}`;
      const rankClass = index < 3 ? `rank-${index + 1}` : "";

      return `
        <tr onclick="openAssetModal('${a.asset_id}')">
          <td><span class="rank-badge ${rankClass}">${index + 1}</span></td>
          <td>
            <strong>${a.asset_name}</strong><br/>
            <span class="modal-sub">${a.asset_id} • ${a.asset_type.toUpperCase()}</span>
          </td>
          <td>${a.region}</td>
          <td>
            <strong>${a.health_score}</strong>/100
          </td>
          <td>
            <strong>${(a.failure_probability_7d * 100).toFixed(1)}%</strong>
          </td>
          <td>
            <span class="${a.weather_risk_multiplier > 1.3 ? 'text-danger font-bold' : ''}">
              ×${a.weather_risk_multiplier.toFixed(2)}
            </span>
          </td>
          <td>${a.estimated_customers_at_risk.toLocaleString()}</td>
          <td>$${(a.estimated_outage_cost_usd / 1_000_000).toFixed(2)}M</td>
          <td>
            <span class="badge ${severityClass}">${formatAction(a.recommended_action)}</span>
          </td>
          <td>
            <strong class="${a.action_window_hours <= 4 ? 'text-danger' : ''}">${a.action_window_hours}h</strong>
          </td>
          <td>
            <button class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.72rem;">Inspect</button>
          </td>
        </tr>
      `;
    })
    .join("");

  document.getElementById("asset-count-summary").innerText = `Showing ${assets.length} of ${allAssets.length} Assets`;
}

function formatAction(action) {
  return action.replace(/_/g, " ").toUpperCase();
}

function filterAssets() {
  const region = document.getElementById("filter-region").value;
  const severity = document.getElementById("filter-severity").value;
  const search = document.getElementById("filter-search").value.toLowerCase();

  const filtered = allAssets.filter((a) => {
    const matchesRegion = !region || a.region === region;
    const matchesSeverity = !severity || a.grid_impact_severity === severity;
    const matchesSearch =
      !search ||
      a.asset_name.toLowerCase().includes(search) ||
      a.asset_id.toLowerCase().includes(search) ||
      a.region.toLowerCase().includes(search);
    return matchesRegion && matchesSeverity && matchesSearch;
  });

  renderAssetsTable(filtered);
}

// ─── Regional Posture & Weather ───────────────────────────────────────────────
async function fetchWeather() {
  const res = await fetch("/api/weather");
  allWeather = await res.json();
  renderRegionalOverview(allWeather);
}

function renderRegionalOverview(weatherList) {
  const container = document.getElementById("regions-cards-container");
  if (!weatherList || weatherList.length === 0) {
    container.innerHTML = `<p class="loading">No weather feeds available.</p>`;
    return;
  }

  container.innerHTML = weatherList
    .map((w) => {
      const regionAssets = allAssets.filter((a) => a.region === w.region);
      const critAssets = regionAssets.filter((a) => a.grid_impact_severity === "critical");
      const highAssets = regionAssets.filter((a) => a.grid_impact_severity === "high");
      const totalExposure = regionAssets.reduce((sum, a) => sum + a.estimated_outage_cost_usd, 0);

      const alertClass = w.storm_warning
        ? "badge-critical"
        : w.storm_watch
        ? "badge-high"
        : "badge-low";

      const alertText = w.storm_warning
        ? "⚠️ ACTIVE STORM WARNING"
        : w.storm_watch
        ? "⚡ STORM WATCH"
        : "NOMINAL CONDITIONS";

      return `
        <div class="region-card">
          <div class="region-card-header">
            <div>
              <h3>${w.region}</h3>
              <span class="modal-sub">${regionAssets.length} High-Voltage Assets</span>
            </div>
            <span class="badge ${alertClass}">${alertText}</span>
          </div>

          <div class="region-metrics-row">
            <div class="region-metric-item">
              <span class="val">${w.wind_speed_kmh} <small>km/h</small></span>
              <span class="lbl">Wind Velocity</span>
            </div>
            <div class="region-metric-item">
              <span class="val">${w.temperature_c}°C</span>
              <span class="lbl">Ambient Temp</span>
            </div>
            <div class="region-metric-item">
              <span class="val ${w.lightning_risk === 'high' || w.lightning_risk === 'extreme' ? 'text-danger' : ''}">
                ${w.lightning_risk.toUpperCase()}
              </span>
              <span class="lbl">Lightning Risk</span>
            </div>
            <div class="region-metric-item">
              <span class="val text-danger">${critAssets.length + highAssets.length}</span>
              <span class="lbl">At-Risk Assets</span>
            </div>
          </div>

          <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; justify-content: space-between;">
            <span>Total Regional Exposure:</span>
            <strong class="text-highlight">$${(totalExposure / 1_000_000).toFixed(2)}M</strong>
          </div>
        </div>
      `;
    })
    .join("");
}

// ─── Crew Dispatch Plan ───────────────────────────────────────────────────────
async function fetchPlan() {
  const res = await fetch("/api/plan?horizon=72");
  activePlan = await res.json();
  renderPlan(activePlan);
}

function renderPlan(plan) {
  if (!plan) return;

  document.getElementById("plan-executive-summary").innerText = plan.executive_summary;
  document.getElementById("plan-avoided-val").innerText = `$${(plan.total_avoided_losses_usd / 1_000_000).toFixed(2)}M`;
  document.getElementById("plan-cost-val").innerText = `$${(plan.total_estimated_repair_cost_usd / 1000).toFixed(0)}k`;
  document.getElementById("plan-rom-val").innerText = `${plan.return_on_maintenance_ratio}×`;

  // Pre-positioning zones
  const zonesContainer = document.getElementById("zones-container");
  if (!plan.pre_positioning_zones || plan.pre_positioning_zones.length === 0) {
    zonesContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">No storm pre-positioning zones triggered.</p>`;
  } else {
    zonesContainer.innerHTML = plan.pre_positioning_zones
      .map(
        (z) => `
        <div class="zone-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
            <strong>${z.zone_id}: ${z.region}</strong>
            <span class="badge badge-high">${z.crew_count} Crews</span>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">${z.reason}</p>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            <div><strong>Staging:</strong> ${z.staging_location}</div>
            <div><strong>Deploy By:</strong> ${new Date(z.deploy_by).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC</div>
            <div><strong>Key Equipment:</strong> ${z.equipment.slice(0, 3).join(", ")}</div>
          </div>
        </div>
      `
      )
      .join("");
  }

  // Work orders
  const tbody = document.getElementById("plan-assignments-body");
  tbody.innerHTML = plan.crew_assignments
    .map(
      (c) => `
      <tr>
        <td><strong>#${c.priority_rank}</strong></td>
        <td>
          <strong>${c.asset_name}</strong><br/>
          <span class="modal-sub">${c.asset_id} • ${c.region}</span>
        </td>
        <td><span class="badge badge-critical">${formatAction(c.action)}</span></td>
        <td>${c.crew_type.toUpperCase()}</td>
        <td>${c.estimated_crew_size} Technicians</td>
        <td><strong>${new Date(c.latest_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC</strong></td>
        <td style="font-size: 0.75rem; color: var(--text-secondary);">${c.required_certifications.join("<br/>")}</td>
        <td style="font-size: 0.75rem; color: #7dd3fc;">${c.switching_recommendation || "Standard LOTO Isolation"}</td>
      </tr>
    `
    )
    .join("");
}

// ─── Asset Deep-Dive Drawer ───────────────────────────────────────────────────
async function openAssetModal(assetId) {
  const res = await fetch(`/api/assets/${assetId}`);
  const data = await res.json();
  const { asset, reading, risk_evaluation } = data;

  document.getElementById("modal-asset-name").innerText = asset.name;
  document.getElementById("modal-asset-meta").innerText = `ID: ${asset.asset_id} | Region: ${asset.region} | Substation: ${asset.substation_id} | ${asset.voltage_kv} kV | ${asset.rated_mva} MVA | Age: ${asset.age_years} yrs`;

  const severityBadge = document.getElementById("modal-severity-badge");
  severityBadge.className = `badge badge-${risk_evaluation?.grid_impact_severity || "low"}`;
  severityBadge.innerText = (risk_evaluation?.grid_impact_severity || "NORMAL").toUpperCase();

  document.getElementById("modal-faa").innerText = risk_evaluation?.thermal_aging_factor_faa ? `${risk_evaluation.thermal_aging_factor_faa}×` : "1.0×";
  document.getElementById("modal-dga-class").innerText = risk_evaluation?.dga_fault_classification || "Normal Gas Profile";
  document.getElementById("modal-dga-detail").innerText = reading?.c2h2_ppm ? `Acetylene: ${reading.c2h2_ppm} ppm` : reading?.dissolved_gas_ppm ? `TCG: ${reading.dissolved_gas_ppm} ppm` : "Nominal";

  document.getElementById("modal-window").innerText = `${risk_evaluation?.action_window_hours || 168} Hours`;
  document.getElementById("modal-action").innerText = formatAction(risk_evaluation?.recommended_action || "monitor");

  const avoidedLoss = risk_evaluation?.avoided_loss_potential_usd || 0;
  document.getElementById("modal-avoided").innerText = `$${(avoidedLoss / 1_000_000).toFixed(2)}M`;

  // Telemetry table
  const tBody = document.getElementById("modal-telemetry-body");
  if (!reading) {
    tBody.innerHTML = `<tr><td colspan="4">No telemetry available</td></tr>`;
  } else {
    const params = [
      { name: "Winding / Top Oil Temperature", val: `${reading.temperature_c} °C`, limit: "Alarm: 85°C | Danger: 98°C", status: reading.temperature_c > 98 ? "DANGER" : reading.temperature_c > 85 ? "ALARM" : "NORMAL" },
      { name: "RMS Vibration Velocity", val: `${reading.vibration_mm_s} mm/s`, limit: "Alarm: 7.1 | Danger: 11.2", status: reading.vibration_mm_s > 11.2 ? "DANGER" : reading.vibration_mm_s > 7.1 ? "ALARM" : "NORMAL" },
      { name: "Partial Discharge (PD)", val: `${reading.partial_discharge_pC} pC`, limit: "Alarm: 500 | Danger: 1000", status: reading.partial_discharge_pC > 1000 ? "DANGER" : reading.partial_discharge_pC > 500 ? "ALARM" : "NORMAL" },
      { name: "Dielectric Oil Quality Index", val: `${reading.oil_quality_index} / 100`, limit: "Alarm: < 60 | Danger: < 40", status: reading.oil_quality_index < 40 ? "DANGER" : reading.oil_quality_index < 60 ? "ALARM" : "NORMAL" },
      { name: "Current Load", val: `${reading.load_percent}% MVA`, limit: "Continuous: 100% | Emergency: 110%", status: reading.load_percent > 110 ? "OVERLOAD" : "NORMAL" },
      { name: "Combustible Dissolved Gas (TCG)", val: `${reading.dissolved_gas_ppm || "N/A"} ppm`, limit: "Alarm: 200 | Danger: 500", status: (reading.dissolved_gas_ppm || 0) > 500 ? "DANGER" : "NORMAL" },
      { name: "Acetylene (C2H2) High Energy Arcing", val: `${reading.c2h2_ppm || 0} ppm`, limit: "Alarm: > 2.0 ppm", status: (reading.c2h2_ppm || 0) >= 2.0 ? "DANGER (ARCING)" : "NORMAL" },
    ];

    tBody.innerHTML = params
      .map((p) => {
        const statusBadge = p.status.includes("DANGER") || p.status.includes("OVERLOAD")
          ? "badge-critical"
          : p.status.includes("ALARM")
          ? "badge-high"
          : "badge-low";
        return `
          <tr>
            <td><strong>${p.name}</strong></td>
            <td>${p.val}</td>
            <td style="color: var(--text-muted); font-size: 0.75rem;">${p.limit}</td>
            <td><span class="badge ${statusBadge}">${p.status}</span></td>
          </tr>
        `;
      })
      .join("");
  }

  // Contingency Switching Plan
  const contingency = risk_evaluation?.contingency_plan;
  document.getElementById("modal-contingency-sub").innerText = contingency?.backup_substation ? `Backup Feed: ${contingency.backup_substation}` : "No Alternate Feeder";
  document.getElementById("modal-contingency-notes").innerText = contingency?.risk_mitigation_notes || "Standard operating posture.";

  const seqList = document.getElementById("modal-switching-sequence");
  if (!contingency || !contingency.switching_sequence) {
    seqList.innerHTML = `<li>No switching sequence required.</li>`;
  } else {
    seqList.innerHTML = contingency.switching_sequence.map((step) => `<li>${step}</li>`).join("");
  }

  // Risk drivers
  const driversList = document.getElementById("modal-risk-drivers");
  const drivers = risk_evaluation?.risk_drivers || ["No anomalous conditions detected."];
  driversList.innerHTML = drivers.map((d) => `<li>${d}</li>`).join("");

  document.getElementById("asset-modal").classList.add("active");
}

function closeAssetModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains("close-btn")) return;
  document.getElementById("asset-modal").classList.remove("active");
}

// ─── Weather Scenario Simulator ───────────────────────────────────────────────
async function runSimulation() {
  const title = document.getElementById("sim-title").value;
  const region = document.getElementById("sim-region").value;
  const wind = document.getElementById("sim-wind").value;
  const temp = document.getElementById("sim-temp").value;
  const lightning = document.getElementById("sim-lightning").value;
  const warning = document.getElementById("sim-warning").checked;

  const res = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario_name: title,
      target_region: region,
      wind_speed_kmh: wind,
      temperature_c: temp,
      lightning_risk: lightning,
      storm_warning: warning,
    }),
  });

  const sim = await res.json();
  renderSimulationResults(sim);
}

function renderSimulationResults(sim) {
  const container = document.getElementById("sim-results-pane");
  const deltaCrit = sim.scenario_critical_count - sim.baseline_critical_count;

  container.innerHTML = `
    <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
      <span class="badge badge-high">SIMULATION RESULTS</span>
      <h2 style="margin-top: 0.25rem;">${sim.scenario_name} (${sim.target_region})</h2>
    </div>

    <div class="diagnostic-grid" style="margin-bottom: 1.5rem;">
      <div class="diag-card">
        <div class="diag-label">CRITICAL ASSETS DELTA</div>
        <div class="diag-value ${deltaCrit > 0 ? 'text-danger' : 'text-success'}">
          ${sim.baseline_critical_count} → ${sim.scenario_critical_count} (${deltaCrit >= 0 ? '+' : ''}${deltaCrit})
        </div>
        <div class="diag-sub">Baseline vs. Scenario</div>
      </div>
      <div class="diag-card">
        <div class="diag-label">EXPOSURE LIABILITY DELTA</div>
        <div class="diag-value text-danger">+$${(sim.delta_exposure_usd / 1_000_000).toFixed(2)}M</div>
        <div class="diag-sub">New liability: $${(sim.scenario_exposure_usd / 1_000_000).toFixed(2)}M</div>
      </div>
    </div>

    <h3>⚠️ Immediate Advance Action Directives</h3>
    <ul class="risk-drivers-list" style="margin-bottom: 1.5rem; color: #fcd34d;">
      ${sim.recommended_preparations.map((p) => `<li>${p}</li>`).join("")}
    </ul>

    <h3>Top Assets at Imminent Risk in ${sim.target_region}</h3>
    <table class="grid-table mini-table">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Simulated Risk</th>
          <th>Failure Prob</th>
          <th>Recommended Action</th>
        </tr>
      </thead>
      <tbody>
        ${sim.highest_risk_assets
          .map(
            (a) => `
          <tr>
            <td><strong>${a.asset_name}</strong></td>
            <td><strong class="text-danger">${a.overall_risk_score}/100</strong></td>
            <td>${(a.failure_probability_7d * 100).toFixed(1)}%</td>
            <td><span class="badge badge-critical">${formatAction(a.recommended_action)}</span></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// ─── CSV Telemetry Modal ──────────────────────────────────────────────────────
function openCsvModal() {
  document.getElementById("csv-modal").classList.add("active");
}

function closeCsvModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains("close-btn")) return;
  document.getElementById("csv-modal").classList.remove("active");
}

async function submitCsv() {
  const content = document.getElementById("csv-input").value;
  if (!content.trim()) {
    alert("Please paste CSV data.");
    return;
  }

  const res = await fetch("/api/ingest-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv_content: content }),
  });

  const data = await res.json();
  alert(`Successfully ingested ${data.ingested_count} sensor reading(s)!`);
  closeCsvModal();
  loadAllData();
}

// ─── Quick Actions ────────────────────────────────────────────────────────────
async function seedSampleData() {
  const res = await fetch("/api/seed", { method: "POST" });
  await res.json();
  loadAllData();
}

function exportCsvPlan() {
  if (!activePlan || !activePlan.crew_assignments) {
    alert("No active plan to export.");
    return;
  }

  const header = "Priority,Asset ID,Asset Name,Region,Action,Crew Type,Crew Size,Deploy By (UTC),Certifications,Notes";
  const rows = activePlan.crew_assignments.map((c) =>
    [
      c.priority_rank,
      c.asset_id,
      `"${c.asset_name}"`,
      c.region,
      c.action,
      c.crew_type,
      c.estimated_crew_size,
      c.latest_start_time,
      `"${c.required_certifications.join("; ")}"`,
      `"${c.notes}"`,
    ].join(",")
  );

  const csvText = [header, ...rows].join("\n");
  const blob = new Blob([csvText], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `grid_resilience_plan_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));

  const targetPane = document.getElementById(`tab-${tabId}`);
  if (targetPane) targetPane.classList.add("active");

  const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (targetBtn) targetBtn.classList.add("active");
}
