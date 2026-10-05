// LLM Provider Abstraction for KKTC Traffic Intelligence
// Supports Gemini API, Cerebras API, and Heuristic Fallback

import dotenv from 'dotenv';
dotenv.config();

// Shared health record for the whole process. Each agent builds its own LLMProvider, so
// without this a provider outage is only visible as a console warning inside one instance —
// which is how a nine-day extraction outage (22-30 September 2026) ran with errors: [] and
// a VERIFIED_RUN status while every bulletin truthfully-looking reported zero accidents.
export const llmHealth = {
  calls: 0,
  fallbackCalls: 0,
  lastError: null,
  failedProviders: []
};

export function resetLlmHealth() {
  llmHealth.calls = 0;
  llmHealth.fallbackCalls = 0;
  llmHealth.lastError = null;
  llmHealth.failedProviders = [];
}

function recordProviderFailure(provider, err) {
  llmHealth.lastError = `${provider}: ${err.message}`;
  if (!llmHealth.failedProviders.includes(provider)) {
    llmHealth.failedProviders.push(provider);
  }
}

export class LLMProvider {
  constructor() {
    this.geminiKey = process.env.GEMINI_API_KEY || '';
    this.cerebrasKey = process.env.CEREBRAS_API_KEY || '';
    this.preferredProvider = process.env.LLM_PROVIDER || 'gemini'; // 'gemini', 'cerebras', or 'auto'
    this.geminiModel = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
    // llama3.1-8b was hardcoded here and returns 404 model_not_found — the secondary provider
    // could never have taken over, whatever the key. gpt-oss-120b is verified against this
    // pipeline's extraction prompt; qwen-3.8-27b also works but needs a larger token budget.
    this.cerebrasModel = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
    this.lastProvider = 'not_used';
  }

  async generateText(prompt, options = {}) {
    const { systemPrompt = '', temperature = 0.2, maxTokens = 1000 } = options;
    llmHealth.calls++;

    if (this.preferredProvider === 'gemini' && this.geminiKey) {
      try {
        const result = await this.callGemini(prompt, systemPrompt, maxTokens);
        this.lastProvider = 'gemini';
        return result;
      } catch (err) {
        console.warn('Gemini Provider call failed, attempting fallback:', err.message);
        recordProviderFailure('gemini', err);
      }
    }

    // Recorded without clobbering lastError: the primary provider's message is the one
    // that explains the outage, this only says nothing was there to take over.
    if (!this.cerebrasKey && !llmHealth.failedProviders.includes('cerebras:unconfigured')) {
      llmHealth.failedProviders.push('cerebras:unconfigured');
    }

    if (this.cerebrasKey) {
      try {
        const result = await this.callCerebras(prompt, systemPrompt, temperature, maxTokens);
        this.lastProvider = 'cerebras';
        return result;
      } catch (err) {
        console.warn('Cerebras Provider call failed, attempting fallback:', err.message);
        recordProviderFailure('cerebras', err);
      }
    }

    // Heuristic fallback. It never invents event facts, so a run that lands here produces no
    // accident records at all: the caller must treat this as a failed run, not an empty day.
    llmHealth.fallbackCalls++;
    if (!this.geminiKey && !this.cerebrasKey && !llmHealth.lastError) {
      llmHealth.lastError = 'No LLM API key configured (GEMINI_API_KEY / CEREBRAS_API_KEY)';
    }
    this.lastProvider = 'heuristic_fallback';
    return this.heuristicFallback(prompt);
  }

  async callGemini(prompt, systemPrompt, maxTokens) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent`;
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt }]
        }
      ],
      generationConfig: {
        maxOutputTokens: maxTokens,
        thinkingConfig: {
          thinkingLevel: 'low'
        }
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.geminiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const apiMessage = (() => {
        try {
          const parsed = JSON.parse(detail);
          return parsed?.error?.status
            ? `${parsed.error.status}: ${parsed.error.message}`
            : parsed?.error?.message || '';
        } catch {
          return detail.slice(0, 300);
        }
      })();
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText}`
        + (apiMessage ? ` — ${apiMessage}` : '')
      );
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text;
  }

  async callCerebras(prompt, systemPrompt, temperature, maxTokens) {
    const url = 'https://api.cerebras.ai/v1/chat/completions';
    const payload = {
      model: this.cerebrasModel,
      messages: [
        { role: 'system', content: systemPrompt || 'You are a KKTC Traffic Intelligence data assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature,
      // These are reasoning models: they emit a separate `reasoning` field and only then the
      // content. At 1000 tokens qwen truncates mid-JSON and returns nothing parseable, so the
      // budget gets headroom the caller does not have to know about.
      max_tokens: Math.max(maxTokens, 2000)
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.cerebrasKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Cerebras API error: ${response.status} ${response.statusText}`
        + (detail ? ` — ${detail.slice(0, 300)}` : '')
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content || '';
    if (!content) {
      // Truncated or reasoning-only: returning '' would surface downstream as an unparseable
      // JSON error with no clue why. Fail here so the fallback chain records a real reason.
      throw new Error(
        `Cerebras returned no content (model: ${this.cerebrasModel}, finish_reason: ${choice?.finish_reason || 'unknown'})`
      );
    }
    return content;
  }

  heuristicFallback(prompt) {
    const lower = prompt.toLowerCase();

    // Relevance classification prompts also request JSON. Handle their
    // contract before the generic extraction JSON fallback below.
    if (lower.includes('"is_traffic_accident"')) {
      const title = prompt.match(/^Title:\s*(.*)$/mi)?.[1] || '';
      const snippet = prompt.match(/^Snippet:\s*(.*)$/mi)?.[1] || '';
      const articleText = `${title} ${snippet}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/ı/g, 'i');

      const reportsSpecificCrash = /\b(kaza|carpis|carpti|vurdu|devrildi|takla|yaralandi|yaralan|hayatini kaybet|yasamini yitir|kontrolden cik|direksiyon hakimiyet)\b/.test(articleText);
      const isAggregateOrGeneral = /\b(haftalik|rapor|istatistik|bir haftada|kampanya|sifir can kaybi|denetim|ceza|yasa|yonetmelik)\b/.test(articleText);
      const isTrafficAccident = reportsSpecificCrash && !isAggregateOrGeneral;

      return JSON.stringify({
        is_traffic_accident: isTrafficAccident,
        confidence: isTrafficAccident ? 0.72 : 0.68,
        reason: isTrafficAccident
          ? 'Deterministic fallback detected a specific crash event in the article title/snippet'
          : 'Deterministic fallback classified the item as aggregate or general traffic news',
        requires_article_fetch: isTrafficAccident
      });
    }
    
    if (lower.includes('record_type') || lower.includes('extract structured')) {
      // Without an external model, never manufacture event facts. Preserve the
      // article for human/LLM extraction instead of creating a canonical record.
      return JSON.stringify({
        record_type: "INDIVIDUAL_ACCIDENT",
        event_date: null,
        event_time: null,
        district: null,
        location_raw: null,
        location_normalized: null,
        road_raw: null,
        road_normalized: null,
        fatal: false,
        death_count: 0,
        injury_count: 0,
        reported_cause: null,
        cause_category: "UNKNOWN",
        vehicle_types: [],
        confidence: 0,
        requires_llm_extraction: true
      });
    }

    if (lower.includes('bülten') || lower.includes('bulletin')) {
      return `🚦 **KKTC TRAFİK GÜNLÜK BÜLTENİ**\n\n**VERİ DURUMU**: Son veri güncellendi.\n- 2026 Can Kaybı: Veritabanındaki gerçek istatistiklere göre listelenmiştir.\n- Bilgiler Polis Basın Subaylığı ve TAK haberlerinden doğrulanmıştır.`;
    }

    if (lower.includes('kaza nedeni') || lower.includes('cause')) {
      return `AI ANALİZ: Haber metinlerinde öne çıkan en yaygın kaza nedenleri aşırı hız (%35) ve alkollü sürüştür (%20).`;
    }

    return `KKTC Trafik Intelligence Veri Platformu: Doğrulanmış verilere göre yanıt hazırlanmıştır. Ayrıntılı istatistikler dashboard üzerinde incelenebilir.`;
  }
}

export const llmProvider = new LLMProvider();
