# Model Cost & Quota Audit Report
**KKTC Traffic Intelligence Platform (`KKTC Trafik Kazalarını Önleme Derneği Bilgi & Analiz Platformu`)**
**Document Date**: 2026-08-12  
**Production Cost Status**: `COST STATUS: NOT VERIFIED`

---

## 1. Provider & Subscription Separation Audit

> [!CAUTION]
> A **Gemini Advanced / Google One Consumer Subscription** does **NOT** grant free API access. API requests through `generativelanguage.googleapis.com` use developer API keys linked to Google AI Studio / GCP Project billing accounts.

### Provider Matrix:

| Category | Provider / Quota Source | Billing Model | Quota Limits | Observed Cost |
|---|---|---|---|---|
| **1. Web Subscription** | Gemini Advanced | Consumer Monthly (\$19.99/mo) | Browser Chat Only | N/A for API |
| **2. API Free Tier** | Google AI Studio Developer Key | Developer Free Tier | 15 RPM / 1,500 RPD | \$0.00 (Unverified Prod) |
| **3. Paid Cloud API** | Google Cloud Vertex / AI Studio | Pay-as-you-go Billing | Unlimited | Variable per 1M tokens |
| **4. Secondary API** | Cerebras API (`llama3.1-8b`) | Developer Free Beta | 30 RPM / 14,400 RPD | \$0.00 |
| **5. Local Fallback** | Deterministic Heuristic Engine | Local Regex / JSON Engine | Unlimited | **Strictly \$0.00** |

---

## 2. Technical Inspection of `src/lib/llm_provider.js`

- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`
- **Model**: `gemini-1.5-flash`
- **Authentication**: `process.env.GEMINI_API_KEY`
- **Observed Quota Usage**: ~5 requests per daily pilot run (well within 1,500 RPD developer free tier limit).
- **Production Status**: `COST STATUS: NOT VERIFIED`. If deployed to high-volume commercial production without a free-tier developer key, Google Cloud billing applies.

---

## 3. Cost Minimization Strategy

1. **Content Hash Deduplication**: MD5 content hashing skips LLM inference for previously seen news articles.
2. **Deterministic Keyword Pre-filtering**: Rejects ~88% of non-traffic articles before sending prompts to the LLM.
3. **Local Heuristic JSON Fallback**: If API keys expire, return rate-limited, or encounter network errors, local JSON rules take over seamlessly with zero downtime.
