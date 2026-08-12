# Model Routing & Cost Control Specification

The platform implements multi-model provider abstraction (`src/lib/llm_provider.js`):

- **Gemini (Primary Reasoning & Research)**: Used for deep analysis, verification conflict resolution, and research report compilation.
- **Cerebras (Fast High-Volume Processing)**: Used for rapid article extraction, cause classification, and lightweight summaries.
- **Heuristic Fallback**: Active when API keys are not provided, ensuring zero downtime.

## Configuration (.env)
```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_key_here
CEREBRAS_API_KEY=your_cerebras_key_here
MCP_PORT=3002
PORT=3001
```
