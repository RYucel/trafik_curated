# Model Cost & Routing Architecture
**KKTC Traffic Intelligence Platform (`KKTC Trafik Kazalarını Önleme Derneği Bilgi & Analiz Platformu`)**
**Document Date**: 2026-08-12

---

## 1. Provider Routing Architecture

```text
               Incoming Extraction / Classification Request
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │    LLMProvider Router         │
                   │    (src/lib/llm_provider.js)  │
                   └───────────────┬───────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
  [Gemini API]             [Cerebras API]            [Heuristic Fallback]
  gemini-1.5-flash         llama3.1-8b               Deterministic JSON /
  (Primary)                (Secondary)               Regex rules (Zero-cost)
```

---

## 2. Model & Operation Mapping

| Operation | Primary Provider | Fallback Provider | Target Model | Max Tokens | Cost per 1K Tokens |
|---|---|---|---|---|---|
| **Relevance Classifier** | Gemini | Cerebras | `gemini-1.5-flash` / `llama3.1-8b` | 50 | \$0.00 (Free Tier) |
| **Accident Extractor** | Gemini | Cerebras | `gemini-1.5-flash` / `llama3.1-8b` | 800 | \$0.00 (Free Tier) |
| **Natural Language Q&A** | Gemini | Heuristic | `gemini-1.5-flash` | 1000 | \$0.00 (Free Tier) |
| **Daily Bulletin Formatting** | Heuristic | Gemini | Heuristic Engine | - | \$0.00 |

---

## 3. Free Tier vs Subscription Distinction

> [!IMPORTANT]
> A **Gemini Advanced / Google One Web Subscription** does **NOT** apply to Gemini API endpoints. Gemini API requests use the Google AI Studio developer quota:

- **Free Tier Quota (Google AI Studio)**:
  - 15 Requests Per Minute (RPM)
  - 1,000,000 Tokens Per Minute (TPM)
  - 1,500 Requests Per Day (RPD)
- **Monthly API Cost for KKTC Traffic Intelligence**: **\$0.00 / month** (all daily RSS ingestion tasks fit comfortably within the free tier quota).

---

## 4. Fallback & Content-Hash Caching Strategy

1. **Content-Hash Caching**: Before triggering LLM classification or extraction, the pipeline computes MD5 hashes of article titles/urls. Previously processed articles return cached results instantly at **zero LLM cost**.
2. **Heuristic Fallback**: If Gemini or Cerebras API keys are absent or rate-limited, `LLMProvider` automatically engages local deterministic JSON fallback rules, ensuring zero downtime and 100% crash-free execution.
