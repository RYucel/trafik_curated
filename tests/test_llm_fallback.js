import assert from 'node:assert/strict';
import { LLMProvider } from '../src/lib/llm_provider.js';

const provider = new LLMProvider();

function relevancePrompt(title, snippet = title) {
  return `Analyze if the following news title and snippet report an ACTUAL, REAL KKTC TRAFFIC ACCIDENT EVENT.

Title: ${title}
Snippet: ${snippet}

Respond strictly in JSON format:
{
  "is_traffic_accident": true | false,
  "confidence": number,
  "reason": "short explanation",
  "requires_article_fetch": true | false
}`;
}

const accident = JSON.parse(provider.heuristicFallback(
  relevancePrompt('Girne’de iki araç çarpıştı, bir kişi yaralandı')
));
assert.equal(accident.is_traffic_accident, true);
assert.equal(accident.requires_article_fetch, true);

const aggregate = JSON.parse(provider.heuristicFallback(
  relevancePrompt('KKTC’de haftalık trafik raporu yayımlandı', 'Bir haftada 48 trafik kazası meydana geldi')
));
assert.equal(aggregate.is_traffic_accident, false);
assert.equal(aggregate.requires_article_fetch, false);

const extraction = JSON.parse(provider.heuristicFallback(`
Extract structured traffic accident details.
Return JSON with record_type, event_date, district and death_count.
`));
assert.equal(extraction.requires_llm_extraction, true);
assert.equal(extraction.event_date, null);
assert.equal(extraction.district, null);
assert.equal(extraction.death_count, 0);

const originalFetch = globalThis.fetch;
let capturedRequest;
globalThis.fetch = async (url, options) => {
  capturedRequest = { url, options };
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: '{"is_traffic_accident":false}' }] } }]
    })
  };
};

try {
  provider.geminiKey = 'test-secret-key';
  provider.preferredProvider = 'gemini';
  await provider.generateText(relevancePrompt('Test haberi'), { temperature: 0.1 });

  assert.match(capturedRequest.url, /gemini-3\.7-flash:generateContent$/);
  assert.equal(capturedRequest.url.includes('test-secret-key'), false);
  assert.equal(capturedRequest.options.headers['x-goog-api-key'], 'test-secret-key');

  const geminiPayload = JSON.parse(capturedRequest.options.body);
  assert.equal('temperature' in geminiPayload.generationConfig, false);
  assert.equal(geminiPayload.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.equal(provider.lastProvider, 'gemini');
} finally {
  globalThis.fetch = originalFetch;
}

provider.geminiKey = '';
provider.cerebrasKey = '';
await provider.generateText(relevancePrompt('Lefkoşa’da iki araç çarpıştı'));
assert.equal(provider.lastProvider, 'heuristic_fallback');

console.log('✓ LLM relevance fallback returns the expected classifier contract');
