# Cloud-Scheduled Shadow Production Pilot Architecture
**KKTC Traffic Intelligence Platform (`KKTC Trafik Kazalarını Önleme Derneği Bilgi & Analiz Platformu`)**
**Document Date**: 2026-08-12  
**Execution Model**: GitHub Actions Autonomous Scheduled Workflow (`.github/workflows/shadow-pilot.yml`)

---

## 1. Architecture Overview

The **KKTC Traffic Intelligence Platform** executes daily traffic news ingestion, extraction, deduplication, verification, and bulletin generation autonomously via GitHub Actions.

```text
GitHub Actions Runner (Ubuntu Latest)
  ├── 1. Checkout Repository & Setup Node 20 / Python 3.11
  ├── 2. Run: node scripts/run_shadow_pilot.js
  │      ├── Fetch RSS & Custom Adapters
  │      ├── Process & Deduplicate in db/kktc_traffic.db
  │      └── Generate Snapshot in data/pilot/YYYY-MM-DD/
  ├── 3. Git Auto-Commit: Commit updated DB & snapshot artifacts back to repository
  └── 4. Artifact Upload: Upload snapshot files to GitHub Actions Run Summary
```

---

## 2. Schedule & Timezone Configuration

- **Workflow File**: `.github/workflows/shadow-pilot.yml`
- **Cron Schedule**: `0 3 * * *`
- **Timezone Alignment**: `03:00 UTC` corresponds strictly to `06:00 AM KKTC Cyprus Local Time` (UTC+3).

---

## 3. Required Secrets Configuration

The workflow operates safely with or without secrets:

| Secret Name | Purpose | Optional / Required | Behavior if Missing |
|---|---|---|---|
| `GEMINI_API_KEY` | Primary LLM Classification | Optional | Heuristic Fallback Engine takes over with 0 cost |
| `CEREBRAS_API_KEY` | Secondary LLM Classifier | Optional | Heuristic Fallback Engine takes over |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | Optional | `telegram_mode = DISABLED_NOT_CONFIGURED` |
| `TELEGRAM_CHAT_ID` | Telegram Target Chat | Optional | `telegram_mode = DISABLED_NOT_CONFIGURED` |

---

## 4. SQLite Persistence Strategy

GitHub Actions runners are ephemeral. Application persistence is achieved without external database migration via:

1. **Persistent SQLite File**: The canonical SQLite database is tracked in git at `db/kktc_traffic.db`.
2. **Git Auto-Commit Step**: Uses `stefanzweifel/git-auto-commit-action@v5` at the end of each daily cloud execution to commit updated `db/kktc_traffic.db` and `data/pilot/` snapshots back to the repository.
3. **Artifact Backup**: Each run uploads build artifacts (`data/pilot/`, `db/kktc_traffic.db`) with a 30-day retention window.

---

## 5. System Deployment & Status Declarations

### Telegram Broadcast Status
- **Mode**: Approval-Gated `SHADOW MODE`.
- **Public Broadcasts**: Strictly **0** automated public broadcasts. If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is missing, the pilot logs `status = REQUIRES_APPROVAL` or `SIMULATED` locally without failing the workflow.

### LobeHub Integration Status
> **Deployment Note**: *MCP/LobeHub compatibility tested; LobeHub runtime deployment not verified.*  
> The 19 MCP tools are verified 100% via stdio JSON-RPC transport (`node tests/test_lobehub_mcp.js`), but a full LobeHub web server deployment is not hosted in GitHub Actions.

---

## 6. Manual Triggering Instructions

### A. Manual Cloud Execution (GitHub UI)
1. Go to the **Actions** tab in the GitHub repository.
2. Select **KKTC Traffic Intelligence — Autonomous Daily Shadow Pilot**.
3. Click **Run workflow** (`workflow_dispatch`).

### B. Manual Local Execution
```bash
# Execute daily shadow pilot locally
node scripts/run_shadow_pilot.js

# Inspect pilot status across all 7 days
node scripts/pilot_status.js
```
