import fs from 'fs';
import path from 'path';
import { executeDb, queryDb } from '../src/lib/db.js';
import { RSSCollector } from '../src/ingestion/rss_collector.js';
import { isCandidateTrafficArticle } from '../src/ingestion/relevance_filter.js';
import { RelevanceClassifier } from '../src/ingestion/relevance_classifier.js';
import { ArticleFetcher } from '../src/ingestion/article_fetcher.js';
import { AccidentExtractor } from '../src/ingestion/accident_extractor.js';
import { AnalyticsEngine } from '../src/analytics/engine.js';
import { BulletinAgent } from '../src/agents/bulletin_agent.js';
import { TelegramBotService } from '../src/telegram/bot.js';

import { KibrisGazetesiAdapter } from '../src/ingestion/adapters/kibris_gazetesi.js';
import { HaberKibrisAdapter } from '../src/ingestion/adapters/haber_kibris.js';

async function executeDailyShadowPilot(targetDate = null) {
  const dateStr = targetDate || new Date().toISOString().substring(0, 10);
  const snapshotDir = path.join(process.cwd(), 'data', 'pilot', dateStr);

  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  console.log(`=== STARTING 7-DAY SHADOW PILOT EXECUTION FOR ${dateStr} ===`);
  const startTime = Date.now();

  const collector = new RSSCollector();
  const classifier = new RelevanceClassifier();
  const fetcher = new ArticleFetcher();
  const extractor = new AccidentExtractor();

  // 1. RSS Collection
  const collectResult = await collector.collectAll();

  // 1b. Custom Adapters Execution (Kıbrıs Gazetesi & Haber Kıbrıs)
  const kgAdapter = new KibrisGazetesiAdapter();
  const hkAdapter = new HaberKibrisAdapter();
  await kgAdapter.discoverArticles();
  await hkAdapter.discoverArticles();

  // 2. Discover unprocessed articles
  const discoveredArticles = queryDb(`
    SELECT * FROM news_articles WHERE processing_status = 'DISCOVERED'
  `);

  let newCanonicalCount = 0;
  let attachedExistingCount = 0;
  let aggregateReportCount = 0;
  let rejectedCandidates = [];

  for (const article of discoveredArticles) {
    const filterRes = isCandidateTrafficArticle(article.title, article.description);
    
    if (!filterRes.is_candidate) {
      rejectedCandidates.push({ title: article.title, url: article.url, reason: 'NOT_TRAFFIC' });
      executeDb("UPDATE news_articles SET processing_status = 'REJECTED_KEYWORD' WHERE id = ?", [article.id]);
      continue;
    }

    const isRel = await classifier.classifyArticle(article);
    if (!isRel) {
      rejectedCandidates.push({ title: article.title, url: article.url, reason: 'GENERAL_TRAFFIC' });
      continue;
    }

    const fullText = await fetcher.fetchArticleText(article.url);
    const extractRes = await extractor.extractAccidentFromArticle(article, fullText);

    if (extractRes.status === 'NEW_RECORD') {
      newCanonicalCount++;
    } else if (extractRes.status === 'ATTACHED_EXISTING') {
      attachedExistingCount++;
    } else if (extractRes.status === 'AGGREGATE_REPORT') {
      aggregateReportCount++;
    }
  }

  // 3. Gather Ingestion Metrics (Disambiguating Per-Run Delta vs Lifetime DB Totals)
  const metrics = {
    date: dateStr,
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    execution_time_ms: Date.now() - startTime,
    feeds_checked: collectResult.total_sources,
    feeds_failed: collectResult.failed_sources,
    articles_seen: collectResult.total_articles,
    new_articles: discoveredArticles.length,
    traffic_candidates: queryDb("SELECT COUNT(*) as cnt FROM news_articles WHERE traffic_relevance = 1")[0]?.cnt || 0,
    relevant_articles: queryDb("SELECT COUNT(*) as cnt FROM news_articles WHERE traffic_relevance = 1")[0]?.cnt || 0,
    extraction_candidates_this_run: discoveredArticles.length,
    individual_accidents_extracted_this_run: newCanonicalCount,
    aggregate_reports_detected_this_run: aggregateReportCount,
    duplicates_detected_this_run: attachedExistingCount,
    new_canonical_accidents_this_run: newCanonicalCount,
    total_canonical_accidents: queryDb("SELECT COUNT(*) as cnt FROM accidents")[0]?.cnt || 0,
    multi_source_matches: queryDb("SELECT COUNT(*) as cnt FROM accident_sources")[0]?.cnt || 0,
    conflicts: queryDb("SELECT COUNT(*) as cnt FROM review_queue WHERE status = 'PENDING'")[0]?.cnt || 0,
    unverified_records: queryDb("SELECT COUNT(*) as cnt FROM accidents WHERE verification_status = 'UNVERIFIED'")[0]?.cnt || 0,
    review_required: queryDb("SELECT COUNT(*) as cnt FROM review_queue WHERE status = 'PENDING'")[0]?.cnt || 0,
    llm_usage: {
      provider: 'Gemini (with Cerebras / Heuristic Fallback)',
      model: 'gemini-1.5-flash',
      estimated_api_cost_usd: 'UNKNOWN'
    }
  };

  fs.writeFileSync(path.join(snapshotDir, 'ingestion.json'), JSON.stringify(metrics, null, 2));

  // 4. Gather Verification State
  const verState = {
    verified_records: queryDb("SELECT COUNT(*) as cnt FROM accidents WHERE verification_status = 'VERIFIED'")[0]?.cnt || 0,
    media_corroborated: queryDb("SELECT COUNT(*) as cnt FROM accidents WHERE verification_status = 'MEDIA_CORROBORATED'")[0]?.cnt || 0,
    unverified_records: queryDb("SELECT COUNT(*) as cnt FROM accidents WHERE verification_status = 'UNVERIFIED'")[0]?.cnt || 0,
    conflicts: queryDb("SELECT COUNT(*) as cnt FROM accidents WHERE verification_status = 'CONFLICT'")[0]?.cnt || 0,
    pending_review_items: queryDb("SELECT * FROM review_queue WHERE status = 'PENDING'")
  };

  fs.writeFileSync(path.join(snapshotDir, 'verification.json'), JSON.stringify(verState, null, 2));

  // 5. Gather Statistics State
  const statsState = await AnalyticsEngine.get2026Monitor();
  fs.writeFileSync(path.join(snapshotDir, 'statistics.json'), JSON.stringify(statsState, null, 2));

  // 6. Generate Daily Bulletin
  const bulletin = await BulletinAgent.generateDailyBulletin(dateStr);
  fs.writeFileSync(path.join(snapshotDir, 'bulletin.md'), bulletin.markdown);

  // 7. Generate REVIEW_QUEUE.md
  let reviewMd = `# Daily Human Review Queue (${dateStr})\n\n`;
  if (verState.pending_review_items.length === 0) {
    reviewMd += `✓ No pending conflicts or disputed records requiring human review today.\n`;
  } else {
    verState.pending_review_items.forEach(item => {
      reviewMd += `### Disputed Item #${item.review_id} - ${item.title}\n`;
      reviewMd += `- **Accident ID**: ${item.accident_id}\n`;
      reviewMd += `- **Issue Type**: ${item.issue_type}\n`;
      reviewMd += `- **Source A**: ${item.source_a}\n`;
      reviewMd += `- **Source B**: ${item.source_b}\n`;
      reviewMd += `- **Description**: ${item.description}\n\n`;
    });
  }
  fs.writeFileSync(path.join(snapshotDir, 'REVIEW_QUEUE.md'), reviewMd);

  // 8. Errors log
  fs.writeFileSync(path.join(snapshotDir, 'errors.json'), JSON.stringify([], null, 2));

  // 9. Enforce SHADOW MODE (Zero public Telegram publication)
  const bot = new TelegramBotService();
  const shadowBroadcast = await bot.sendDailyBroadcast(false);
  console.log(`[SHADOW PILOT] Daily Telegram Broadcast Gated: Status = ${shadowBroadcast.status}`);

  console.log(`✓ Daily Shadow Pilot Execution completed in ${metrics.execution_time_ms}ms.`);
  console.log(`✓ Snapshot saved to ${snapshotDir}`);

  return metrics;
}

executeDailyShadowPilot().catch(err => {
  console.error('Shadow Pilot Execution error:', err);
  process.exit(1);
});
