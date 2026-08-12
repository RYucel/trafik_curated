# LobeHub Agent Orchestration Architecture

**KKTC Traffic Intelligence Platform**

The architecture decouples the core database/API system of record from the AI agent orchestration layer (LobeHub).

```text
  LobeHub (AI Orchestrator)
             │
            MCP Server (http://localhost:3002/mcp)
             │
     Backend API / SQLite Database
             │
     ┌───────┴────────┐
     │                │
Public Dashboard   Telegram Bot
```

---

## Key Principles

1. **System of Record**: SQLite database (`db/kktc_traffic.db`) and Express REST API (`src/api/server.js`) are the source of truth.
2. **Resilience**: If LobeHub is offline, the website, API, statistics, accident archive, and Telegram bot continue working uninterrupted.
3. **Controlled Tool Access**: LobeHub agents interact with data exclusively through predefined, validated MCP tools (`src/mcp/tools/`). Arbitrary SQL execution is strictly forbidden.
4. **Human Authority**: Sensitive operations (publishing bulletins, resolving disputed records) require human approval in the Admin Review Queue (`/admin`).
