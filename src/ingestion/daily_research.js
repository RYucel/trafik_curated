import { RSSCollector } from './rss_collector.js';
import { isCandidateTrafficArticle } from './relevance_filter.js';
import { RelevanceClassifier } from './relevance_classifier.js';
import { ArticleFetcher } from './article_fetcher.js';
import { AccidentExtractor } from './accident_extractor.js';
import { queryDb } from '../lib/db.js';

export async function runDailyResearch() {
  console.log('--- STARTING KKTC DAILY TRAFFIC NEWS RESEARCH PIPELINE ---');
  const startTime = new Date();

  const metrics = {
    started_at: startTime.toISOString(),
    completed_at: null,
    feeds_checked: 0,
    feeds_failed: 0,
    articles_seen: 0,
    new_articles: 0,
    traffic_candidates: 0,
    llm_classified_relevant: 0,
    accidents_extracted: 0,
    attached_to_existing: 0,
    conflicts_flagged: 0,
    errors: []
  };

  try {
    // 1. RSS Collection
    const collector = new RSSCollector();
    const rssSummary = await collector.collectAll();
    metrics.feeds_checked = rssSummary.feeds_checked;
    metrics.feeds_failed = rssSummary.feeds_failed;
    metrics.articles_seen = rssSummary.total_articles_seen;
    metrics.new_articles = rssSummary.total_new_articles;

    // 2. Fetch pending articles for traffic relevance evaluation
    const pendingArticles = queryDb(`
      SELECT * FROM news_articles 
      WHERE processing_status = 'DISCOVERED'
      ORDER BY id ASC
    `);

    console.log(`[DailyResearch] Processing ${pendingArticles.length} newly discovered articles...`);

    const classifier = new RelevanceClassifier();
    const fetcher = new ArticleFetcher();
    const extractor = new AccidentExtractor();

    for (const article of pendingArticles) {
      // 2a. Deterministic Keyword Filter
      const preFilterRes = isCandidateTrafficArticle(article.title, article.description);

      if (!preFilterRes.is_candidate) {
        // Skip calling LLM if no traffic keywords present
        continue;
      }

      metrics.traffic_candidates++;
      console.log(`[DailyResearch] Candidate traffic article found: "${article.title}"`);

      // 2b. LLM Relevance Classification
      const classRes = await classifier.classifyArticle(article);

      if (classRes.is_traffic_accident) {
        metrics.llm_classified_relevant++;

        // 2c. Fetch Full Article Text
        const fullContent = await fetcher.fetchArticleContent(article);

        // 2d. Extract Canonical Accident
        const extractRes = await extractor.extractAccidentFromArticle(article, fullContent);

        if (extractRes.status === 'NEW_RECORD') {
          metrics.accidents_extracted++;
        } else if (extractRes.status === 'ATTACHED_EXISTING') {
          metrics.attached_to_existing++;
        }
      }
    }

    // Count conflicts in review queue
    const conflicts = queryDb("SELECT COUNT(*) as cnt FROM review_queue WHERE status = 'PENDING'");
    metrics.conflicts_flagged = conflicts[0]?.cnt || 0;

  } catch (err) {
    console.error(`[DailyResearch] Pipeline error: ${err.message}`);
    metrics.errors.push(err.message);
  }

  metrics.completed_at = new Date().toISOString();
  console.log('--- DAILY TRAFFIC NEWS RESEARCH PIPELINE COMPLETED ---');
  console.log(JSON.stringify(metrics, null, 2));

  return metrics;
}

if (process.argv[1] && process.argv[1].endsWith('daily_research.js')) {
  runDailyResearch();
}
