# ⚡ GridGuard AI — Predictive Power Grid Resilience & Crew Pre-positioning Platform

> **An autonomous intelligence platform for power grid predictive maintenance and extreme weather resilience, powered by IBM Bob and the Model Context Protocol (MCP).**

---

## 👥 Team

| Field | Value |
|---|---|
| **Team Name** | CltAltElite |
| **Track** | Sustainability |
| **Team Lead** | Bumtariya Dev Dilipkumar (25ce009@charusat.edu.in) |
| **Members** | Divyarajsinh Balvantsinh Parmar (25ce068@charusat.edu.in), Sahil Manoj Pardhi (25ce067@charusat.edu.in) , Tirth Rigeshkumar Darji (25ce020@charusat.edu.in) |

---

## 🎯 Problem Statement

Over 70% of high-voltage power transformers and substation assets in modern distribution grids exceed their 25-year design lifespan, operating in an increasingly fragile state. When severe meteorological events (hurricanes, heatwaves, or ice storms) strike, utility operators and grid dispatchers are inundated with fragmented SCADA alarms and cannot predict which degraded assets will suffer catastrophic failure. The resulting power outages cost an estimated $18 per customer-hour in direct economic losses, strand emergency services, and cause cascading blackout damages across communities.

---

## 💡 Solution

GridGuard AI bridges real-time physical telemetry and meteorological forecasting through an autonomous Model Context Protocol (MCP) server designed natively for IBM Bob. By coupling IEEE C57.91 Arrhenius thermal aging and IEC 60599 multi-gas Dissolved Gas Analysis (DGA) with dynamic meteorological risk multipliers, GridGuard computes precise failure probabilities and contingency feeder switching sequences. IBM Bob autonomously orchestrates the entire response lifecycle: ranking degraded transformers, simulating extreme weather scenarios, and dispatching OSHA-certified pre-positioning crew plans before power lines fail.

---

## ✨ Key Features

- **Physics-Informed Transformer Degradation Scoring:** Fuses IEEE C57.91 Arrhenius thermal acceleration ($F_{AA}$), IEC 60599 / IEEE C57.104 multi-gas DGA ratios (evaluating acetylene, ethylene, methane, hydrogen), dielectric breakdown oil quality, and mechanical vibration.
- **Dynamic Weather Risk Compounding Engine:** Continuously applies meteorological risk multipliers based on active storm warnings, ice accretion hazards, extreme heat index (>42°C), and high wind gusts (>100 km/h) up to a 3.0× compounding cap.
- **Automated Crew Pre-Positioning & Work Order Generator:** Formulates prioritized repair plans with precise required OSHA certifications (OSHA 1910.269 high-voltage qualified), equipment requirements, and mandatory safety precautions.
- **Contingency Feeder Load Transfer:** Automatically devises step-by-step switching sequences to offload critical customers (hospitals, industrial parks) to alternate feeds before de-energizing high-risk transformers.
- **Native IBM Bob MCP Integration:** Exposes 12 domain-specific tools, 4 live queryable resources (`grid://kpis`, `grid://assets`, `grid://weather`, `grid://plans/latest`), and 3 standardized prompt templates for operations command centers.
- **Real-Time Web Operations Dashboard:** Interactive geospatial monitoring center visualizing asset health heatmaps, active weather alerts, financial outage exposure, and what-if scenario simulations.

---

## 🛠️ Tech Stack

| Category | Technologies |
|---|---|
| **Languages** | TypeScript, JavaScript, HTML5, CSS3 |
| **Frameworks & Runtimes** | Node.js (v20+), Express.js, @modelcontextprotocol/sdk, Zod |
| **IBM Technologies** | IBM Bob, Model Context Protocol (MCP), watsonx.ai ready |
| **Standards & Protocols** | IEEE C57.91 (Thermal Aging), IEC 60599 (DGA), ASTM D1816, OSHA 1910.269 |
| **Databases** | Atomic JSON Store / GridStore (Persistent transaction engine) |
| **DevOps & Testing** | Node.js Test Runner, GitHub Actions CI Validator, Docker ready |

---

## 📁 Repository Structure

```
├── submission.yaml          # Evaluators read this first — structured metadata
├── README.md                # Human-readable front page
├── CONTRIBUTING.md          # Submission instructions and guidelines
├── .gitignore               # Pre-configured ignore rules
│
├── .github/
│   └── workflows/
│       └── validate.yml     # Automated hackathon submission validator
│
├── docs/                    # Complete architectural & operational documentation
│   ├── problem-statement.md # In-depth problem analysis and market impact
│   ├── solution-overview.md # Technical breakdown of multi-modal risk fusion
│   ├── architecture.md      # System architecture diagram & component details
│   ├── setup-guide.md       # Exact step-by-step instructions to run locally
│   └── template-guide.md    # Hackathon template reference
│
├── demo/                    # Proof of execution & demonstration artifacts
│   ├── demo-video-link.txt  # Video walkthrough link
│   ├── live-demo-url.txt    # Local dashboard execution instructions
│   └── screenshots/         # Dashboard & MCP execution screenshots
│       └── README.md
│
├── presentation/            # Hackathon presentation deck
│   └── README.md            # Slide-by-slide script and talking points
│
├── .bob/                    # IBM Bob configuration
│   ├── mcp.json             # MCP server registry pointing to build/index.js
│   └── skills/
│       └── grid-resilience/ # Autonomous grid maintenance skill definition
│
└── src/                     # All source code
    ├── .env.example         # Environment variables template
    ├── README.md            # Source code layout overview
    ├── package.json         # Project manifests and scripts
    ├── tsconfig.json        # TypeScript configuration
    ├── src/                 # Core server, algorithms, and tests
    ├── data/                # GridStore seed data (transformers, substations)
    └── public/              # Real-time Web Operations Center UI
```

---

## ⚡ How to Run

Follow these exact steps from [docs/setup-guide.md](docs/setup-guide.md):

```bash
# 1. Clone the repository
git clone https://github.com/your-org/bob-ai-hackathon-CltAltElite.git
cd bob-ai-hackathon-CltAltElite

# 2. Navigate to source directory and install dependencies
cd src
npm install

# 3. Compile TypeScript and run automated test suite
npm test

# 4. Launch the Web Operations Center
npm run web
# Dashboard will be active at: http://localhost:3000

# 5. Connect with IBM Bob
# IBM Bob automatically discovers the MCP server and skill via .bob/mcp.json
```

---

## 🖥️ Demo

| Artifact | Link |
|---|---|
| 📹 Demo Video | [See demo/demo-video-link.txt](demo/demo-video-link.txt) |
| 🌐 Live Demo | [See demo/live-demo-url.txt](demo/live-demo-url.txt) (`http://localhost:3000`) |
| 🖼️ Screenshots | [See demo/screenshots/](demo/screenshots/) |
| 📊 Presentation | [See presentation/README.md](presentation/README.md) |

---

## ⚠️ Known Limitations

- **Telemetry Storage Backend:** Currently backed by an atomic file-based JSON store (`data/grid_store.json`) with safe locks, rather than a clustered SCADA time-series database (such as InfluxDB, TimescaleDB, or OSIsoft PI).
- **Weather Feed Integration:** Weather forecasts and storm alert levels are ingested via REST payloads and scenario simulators; direct real-time radar ingestion from the NOAA Open API is designed but not live-streamed in this build.
- **Two-Way SCADA Actuation:** Feeder switching sequences and breaker trip signals are calculated as operator recommendations rather than closed-loop automated DNP3/IEC 61850 control commands to prioritize utility human-in-the-loop safety.

---

## 🏅 What We're Most Proud Of

We take immense pride in the **physical fidelity and real-world rigor of the risk fusion engine**. Rather than relying on black-box heuristics or toy prompt wrappers, GridGuard AI implements exact IEEE C57.91 Arrhenius thermal acceleration equations and IEC 60599 multi-gas DGA fault diagnostic ratios. By seamlessly exposing these physical models through 12 Model Context Protocol (MCP) tools and native IBM Bob skills, an AI agent can reason about complex grid topology, simulate hurricane-force wind impacts, and deliver field-ready, OSHA-compliant dispatch orders that directly safeguard human lives and multimillion-dollar critical assets.

---
