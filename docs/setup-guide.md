# Setup Guide: Running GridGuard AI

> **This file is read by the automated evaluation pipeline and judges. Follow these verified instructions to run the project locally.**

---

## 1. Prerequisites

Before you begin, ensure you have the following installed on your workstation:

- [x] **Node.js**: Version 20.x or higher (`node --version`)
- [x] **npm**: Version 9.x or higher (`npm --version`)
- [x] **Git**: Version 2.x or higher (`git --version`)
- [x] Optional: **IBM Bob CLI** or any Model Context Protocol (MCP) compliant client

---

## 2. Environment Variables

The project works out-of-the-box with default configuration. If you wish to customize ports or logging, copy `.env.example` in `src/`:

```bash
cd src
cp .env.example .env
```

| Variable | Description | Default | Required |
|---|---|---|---|
| `PORT` | HTTP port for the Web Operations Center & REST API | `3000` | No |
| `NODE_ENV` | Runtime environment mode | `development` | No |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | `info` | No |
| `WATSONX_API_KEY` | IBM watsonx.ai API key (for optional LLM enrichment) | `""` | No |

---

## 3. Installation

From the repository root:

```bash
# 1. Enter the source directory
cd src

# 2. Install all dependencies
npm install
```

---

## 4. Running Tests

Run the automated test suite to verify the risk calculation equations (IEEE C57.91, IEC 60599), scenario simulation, and storage layers:

```bash
npm test
```

Expected output:
```
TAP version 13
# Subtest: buildMaintenancePlan generates prioritized crew assignments with OSHA certifications and ROM metrics
ok 1 - buildMaintenancePlan generates prioritized crew assignments with OSHA certifications and ROM metrics
# Subtest: IEEE C57.91 Arrhenius thermal aging factor
ok 2 - IEEE C57.91 Arrhenius thermal aging factor
# Subtest: IEC 60599 / IEEE C57.104 DGA fault diagnosis
ok 3 - IEC 60599 / IEEE C57.104 DGA fault diagnosis
# Subtest: Health scoring handles severe degradation
ok 4 - Health scoring handles severe degradation
# Subtest: Weather multiplier scales with storm warning and high winds
ok 5 - Weather multiplier scales with storm warning and high winds
# Subtest: Complete asset scoring generates contingency plan and avoided loss
ok 6 - Complete asset scoring generates contingency plan and avoided loss
# Subtest: Scenario simulation detects elevated risk under hurricane conditions
ok 7 - Scenario simulation detects elevated risk under hurricane conditions
# Subtest: GridStore persists and reloads data atomically
ok 8 - GridStore persists and reloads data atomically
1..8
# tests 8
# pass 8
# fail 0
```

---

## 5. Running the Application

### Option A: Launch the Web Operations Center (Recommended)

To launch the interactive dashboard and REST API:

```bash
npm run web
```

- Open your browser to: **`http://localhost:3000`**
- The dashboard will display:
  - **Live Asset Health Heatmap**: Transformers and substations colored by IEEE risk severity.
  - **Weather Risk Radar**: Active storm watches, wind gusts, and lightning warnings.
  - **What-If Hurricane Simulator**: Test how a 120 km/h storm impacts high-risk units.
  - **Crew Pre-Positioning Dispatch Board**: Certified work orders with OSHA compliance.

### Option B: Run as a Standalone Model Context Protocol (MCP) Server

To run the MCP server over stdio for IBM Bob or Claude Desktop:

```bash
# Compile TypeScript to JavaScript
npm run build

# Run the MCP server
node build/index.js
```

---

## 6. Connecting to IBM Bob

The repository is pre-configured for IBM Bob!

1. Inspect `.bob/mcp.json` at the root of this repository:
   ```json
   {
     "mcpServers": {
       "grid-intelligence": {
         "command": "node",
         "args": ["src/build/index.js"]
       }
     }
   }
   ```
2. In your terminal where IBM Bob is active, IBM Bob will detect the MCP tools and the `grid-resilience` skill located at `.bob/skills/grid-resilience/SKILL.md`.
3. Try asking IBM Bob:
   - *"Rank the top at-risk transformers across our grid."*
   - *"Simulate a category 2 windstorm in the North Bay region and generate a crew pre-positioning plan."*
   - *"Generate a pre-storm executive briefing for the operations command center."*

---

## 7. Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| `Port 3000 already in use` | Another process is using port 3000 | Set `PORT=3001` in `src/.env` or run `PORT=3001 npm run web` |
| `Cannot find module './build/index.js'` | TypeScript has not been compiled | Run `npm run build` inside `src/` before launching the MCP server |
| `Permission denied writing to grid_store.json` | File permissions on data directory | Ensure `src/data/` has write permissions for the current user |
| Tests fail with Node version error | Using legacy Node.js (< v20) | Upgrade to Node.js v20+ to support native `node --test` runner |
