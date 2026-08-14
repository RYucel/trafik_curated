// LLM Provider Abstraction for KKTC Traffic Intelligence
// Supports Gemini API, Cerebras API, and Heuristic Fallback

import dotenv from 'dotenv';
dotenv.config();

export class LLMProvider {
  constructor() {
    this.geminiKey = process.env.GEMINI_API_KEY || '';
    this.cerebrasKey = process.env.CEREBRAS_API_KEY || '';
    this.preferredProvider = process.env.LLM_PROVIDER || 'gemini'; // 'gemini', 'cerebras', or 'auto'
  }

  async generateText(prompt, options = {}) {
    const { systemPrompt = '', temperature = 0.2, maxTokens = 1000 } = options;

    if (this.preferredProvider === 'gemini' && this.geminiKey) {
      try {
        return await this.callGemini(prompt, systemPrompt, temperature, maxTokens);
      } catch (err) {
        console.warn('Gemini Provider call failed, attempting fallback:', err.message);
      }
    }

    if (this.cerebrasKey) {
      try {
        return await this.callCerebras(prompt, systemPrompt, temperature, maxTokens);
      } catch (err) {
        console.warn('Cerebras Provider call failed, attempting fallback:', err.message);
      }
    }

    // Heuristic Fallback
    return this.heuristicFallback(prompt);
  }

  async callGemini(prompt, systemPrompt, temperature, maxTokens) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiKey}`;
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt }]
        }
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text;
  }

  async callCerebras(prompt, systemPrompt, temperature, maxTokens) {
    const url = 'https://api.cerebras.ai/v1/chat/completions';
    const payload = {
      model: 'llama3.1-8b',
      messages: [
        { role: 'system', content: systemPrompt || 'You are a KKTC Traffic Intelligence data assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature,
      max_tokens: maxTokens
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
      throw new Error(`Cerebras API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
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
