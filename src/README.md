# Source Code — Grid Intelligence Platform

This directory contains the full implementation of the **Grid Intelligence MCP Server & Web Operations Center**.

## Directory Layout

```
src/
├── package.json           # Project dependencies, build, test, and run scripts
├── tsconfig.json          # TypeScript compiler configuration (ES2022, Node16 modules)
├── .env.example           # Environment configuration template
├── README.md              # This file
│
├── src/                   # TypeScript source code
│   ├── index.ts           # Model Context Protocol (MCP) server entry point
│   ├── server.ts          # Express Web Operations Center & REST API
│   ├── risk-engine.ts     # IEEE C57.91 & IEC 60599 asset risk calculation engine
│   ├── plan-builder.ts    # Maintenance planning & crew pre-positioning optimizer
│   ├── storage.ts         # Atomic JSON GridStore persistence layer
│   ├── types.ts           # Core TypeScript types, interfaces, and Zod schemas
│   ├── express.d.ts       # Express TypeScript declarations
│   └── tests/             # Automated test suite (Node.js test runner)
│       ├── plan-builder.test.ts
│       ├── risk-engine.test.ts
│       └── storage.test.ts
│
├── data/
│   └── grid_store.json    # Seed dataset with transmission & distribution grid topology
│
└── public/                # Web Operations Center UI
    ├── index.html         # Real-time grid monitoring dashboard
    ├── style.css          # Cyber-resilient grid operations styling
    └── app.js             # Interactive telemetry visualization & crew dispatch UI
```

## Core Modules & Engineering Standards

- **`risk-engine.ts`**:
  - **IEEE C57.91**: Arrhenius thermal aging acceleration factor ($F_{AA} = \exp(15000/383 - 15000/(\theta_H + 273))$)
  - **IEC 60599 / IEEE C57.104**: Dissolved Gas Analysis (DGA) for thermal faults, low-energy arcing, and corona partial discharge
  - **IEC 60034-14 / ASTM D1816**: Mechanical vibration velocity & dielectric breakdown oil quality monitoring
  - **Dynamic Weather Multiplier**: Combines regional wind gusts, storm warnings, lightning risk, and ice accretion (scaled up to 3.0×)
  - **Contingency Feeder Routing**: Automatic switching sequences to transfer critical loads before de-energizing degraded assets

- **`plan-builder.ts`**:
  - Prioritizes work orders by severity, urgency window, and outage exposure
  - Allocates crew sizes and matches mandatory OSHA certifications (OSHA 1910.269, IEEE Substation Entry)
  - Computes EPRI-benchmarked avoided outage costs ($18/customer-hr) and Return on Maintenance (ROM)

- **`index.ts` (MCP Server)**:
  - Exposes 12 MCP Tools (`rank_grid_assets`, `assess_asset_risk`, `generate_maintenance_plan`, `simulate_weather_scenario`, `ingest_sensor_readings`, etc.)
  - Exposes 4 MCP Resources (`grid://kpis`, `grid://assets`, `grid://weather`, `grid://plans/latest`)
  - Exposes 3 MCP Prompts (`pre-storm-briefing`, `asset-deep-dive`, `shift-handoff-report`)

- **`server.ts` (Web Dashboard & API)**:
  - REST API exposing all telemetry, risk scores, scenario simulations, and crew plans
  - Serves the real-time operational dashboard on port 3000

## Quick Commands

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Run automated tests
npm test

# Launch Web Operations Center
npm run web
```
