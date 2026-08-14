import { LLMProvider } from '../lib/llm_provider.js';
import { executeDb, queryDb } from '../lib/db.js';

export class RelevanceClassifier {
  constructor() {
    this.llm = new LLMProvider();
  }

  async classifyArticle(article) {
    // Check if article was already classified
    const existing = queryDb("SELECT traffic_relevance, relevance_score, processing_status FROM news_articles WHERE id = ?", [article.id]);
    if (existing.length > 0 && existing[0].processing_status !== 'DISCOVERED') {
      return {
        is_traffic_accident: existing[0].traffic_relevance === 1,
        confidence: existing[0].relevance_score,
        reason: 'Cached classification result',
        requires_article_fetch: existing[0].traffic_relevance === 1
      };
    }

    const prompt = `Analyze if the following news title and snippet report an ACTUAL, REAL KKTC TRAFFIC ACCIDENT EVENT.

Title: ${article.title}
Snippet: ${article.description || article.title}

Rules:
- MUST BE A SPECIFIC TRAFFIC ACCIDENT EVENT (e.g. car crash, pedestrian hit, motorcycle accident).
- MUST NOT be: traffic law changes, road construction, traffic fines, general statistics, political statements, safety campaigns, opinion articles.

Respond strictly in JSON format:
{
  "is_traffic_accident": true | false,
  "confidence": number (0.0 to 1.0),
  "reason": "short explanation",
  "requires_article_fetch": true | false
}`;

    try {
      const responseText = await this.llm.generateText(prompt, { temperature: 0.1 });
      
      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const res = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        is_traffic_accident: article.title.toLowerCase().includes('kaza'),
        confidence: 0.7,
        reason: 'Fallback keyword heuristic',
        requires_article_fetch: true
      };

      const isRelevant = res.is_traffic_accident ? 1 : 0;
      const status = isRelevant ? 'RELEVANT' : 'REJECTED';

      executeDb(`
        UPDATE news_articles 
        SET traffic_relevance = ?, relevance_score = ?, processing_status = ?, processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [isRelevant, res.confidence || 0.8, status, article.id]);

      return res;
    } catch (err) {
      console.error(`[RelevanceClassifier] Classification error for article ${article.id}: ${err.message}`);
      
      // Heuristic fallback if LLM call fails
      const isRelevant = article.title.toLowerCase().includes('kaza') ? 1 : 0;
      executeDb(`
        UPDATE news_articles 
        SET traffic_relevance = ?, relevance_score = 0.6, processing_status = ?, error_message = ?
        WHERE id = ?
      `, [isRelevant, isRelevant ? 'RELEVANT' : 'REJECTED', err.message, article.id]);

      return {
        is_traffic_accident: isRelevant === 1,
        confidence: 0.6,
        reason: 'Fallback heuristic on API error',
        requires_article_fetch: isRelevant === 1
      };
    }
  }
}
