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
  let trafficCandidateCount = 0;
  let relevantArticleCount = 0;
  let rejectedCandidates = [];
  const runErrors = [];

  for (const article of discoveredArticles) {
    const filterRes = isCandidateTrafficArticle(article.title, article.description);
    
    if (!filterRes.is_candidate) {
      rejectedCandidates.push({ title: article.title, url: article.url, reason: 'NOT_TRAFFIC' });
      executeDb("UPDATE news_articles SET processing_status = 'REJECTED_KEYWORD' WHERE id = ?", [article.id]);
      continue;
    }

    trafficCandidateCount++;

    const relevanceResult = await classifier.classifyArticle(article);
    if (!relevanceResult.is_traffic_accident) {
      rejectedCandidates.push({ title: article.title, url: article.url, reason: 'GENERAL_TRAFFIC' });
      continue;
    }

    relevantArticleCount++;

    try {
      const fullText = await fetcher.fetchArticleContent(article);
      const extractRes = await extractor.extractAccidentFromArticle(article, fullText);

      if (extractRes.status === 'NEW_RECORD') {
        newCanonicalCount++;
      } else if (extractRes.status === 'ATTACHED_EXISTING') {
        attachedExistingCount++;
      } else if (extractRes.status === 'AGGREGATE_REPORT') {
        aggregateReportCount++;
      }
    } catch (err) {
      runErrors.push({
        article_id: article.id,
        title: article.title,
        url: article.url,
        error: err.message
      });
      executeDb(
        "UPDATE news_articles SET processing_status = 'ERROR', error_message = ? WHERE id = ?",
        [err.message, article.id]
      );
    }
  }

  // 3. Gather Ingestion Metrics (Disambiguating Per-Run Delta vs Lifetime DB Totals)
  const metrics = {
    date: dateStr,
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    execution_time_ms: Date.now() - startTime,
    feeds_checked: collectResult.feeds_checked,
    feeds_failed: collectResult.feeds_failed,
    articles_seen: collectResult.total_articles_seen,
    new_articles: collectResult.total_new_articles,
    traffic_candidates: trafficCandidateCount,
    relevant_articles: relevantArticleCount,
    extraction_candidates_this_run: relevantArticleCount,
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
  fs.writeFileSync(path.join(snapshotDir, 'errors.json'), JSON.stringify(runErrors, null, 2));

  // 9. Enforce SHADOW MODE (Zero public Telegram publication)
  const bot = new TelegramBotService();
  const shadowBroadcast = await bot.sendDailyBroadcast(false);
  console.log(`[SHADOW PILOT] Daily Telegram Broadcast Gated: Status = ${shadowBroadcast.status}`);

  // 10. Advance the seven-day pilot from persisted daily snapshots.
  const pilotRoot = path.join(process.cwd(), 'data', 'pilot');
  const completedSnapshotDates = fs.readdirSync(pilotRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .filter(entry => fs.existsSync(path.join(pilotRoot, entry.name, 'ingestion.json')))
    .map(entry => entry.name)
    .sort();
  const totalPilotDays = 7;
  const daysCompleted = Math.min(totalPilotDays, completedSnapshotDates.length);
  const previousStatusPath = path.join(pilotRoot, 'pilot_status.json');
  const previousStatus = fs.existsSync(previousStatusPath)
    ? JSON.parse(fs.readFileSync(previousStatusPath, 'utf8'))
    : {};
  const pilotStatus = {
    ...previousStatus,
    pilot_start_date: completedSnapshotDates[0] || dateStr,
    current_day: daysCompleted,
    days_completed: daysCompleted,
    days_pending: Math.max(0, totalPilotDays - daysCompleted),
    total_days: totalPilotDays,
    latest_run_status: runErrors.length === 0 ? 'VERIFIED_RUN' : 'COMPLETED_WITH_ERRORS',
    telegram_mode: 'SHADOW_MODE_GATED',
    latest_new_canonical_accidents: newCanonicalCount,
    total_canonical_accidents_db: metrics.total_canonical_accidents,
    total_errors: runErrors.length,
    total_conflicts: metrics.conflicts,
    total_unverified: metrics.unverified_records,
    last_snapshot: `data/pilot/${dateStr}`
  };
  fs.writeFileSync(previousStatusPath, JSON.stringify(pilotStatus, null, 2));

  console.log(`✓ Daily Shadow Pilot Execution completed in ${metrics.execution_time_ms}ms.`);
  console.log(`✓ Snapshot saved to ${snapshotDir}`);

  return metrics;
}

executeDailyShadowPilot().catch(err => {
  console.error('Shadow Pilot Execution error:', err);
  process.exit(1);
});
