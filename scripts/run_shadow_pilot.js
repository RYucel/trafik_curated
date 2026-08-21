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

const TOTAL_PILOT_DAYS = 7;

function resolveTargetDate(targetDate = null) {
  const dateStr = targetDate || process.env.PILOT_TARGET_DATE || new Date().toISOString().substring(0, 10);
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  const today = new Date().toISOString().substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().substring(0, 10) !== dateStr) {
    throw new Error(`Invalid pilot date "${dateStr}". Use YYYY-MM-DD.`);
  }
  if (dateStr < today) {
    throw new Error(`Historical pilot date "${dateStr}" is not allowed: it would label live sources as historical evidence.`);
  }
  if (dateStr > today) {
    throw new Error(`Future pilot date "${dateStr}" is not allowed.`);
  }
  return dateStr;
}

function getPlannedPilotDates(pilotStartDate) {
  const start = new Date(`${pilotStartDate}T00:00:00Z`);
  return Array.from({ length: TOTAL_PILOT_DAYS }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day.toISOString().substring(0, 10);
  });
}

function isCompleteSnapshot(pilotRoot, date) {
  const snapshotDir = path.join(pilotRoot, date);
  return ['ingestion.json', 'verification.json', 'statistics.json', 'bulletin.md', 'REVIEW_QUEUE.md', 'errors.json']
    .every(file => fs.existsSync(path.join(snapshotDir, file)));
}

async function executeDailyShadowPilot(targetDate = null) {
  const dateStr = resolveTargetDate(targetDate);
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

  // Recover articles rejected by the former malformed JSON fallback. That
  // fallback returned extraction confidence (0.95) instead of a relevance
  // decision, causing valid traffic candidates to be marked REJECTED.
  executeDb(`
    UPDATE news_articles
    SET processing_status = 'DISCOVERED', relevance_score = 0, processed_at = NULL, error_message = NULL
    WHERE processing_status = 'REJECTED'
      AND traffic_relevance = 0
      AND relevance_score >= 0.9
  `);

  // 2. Discover unprocessed articles and retry real articles that were safely
  // deferred while no external extraction provider was configured.
  const discoveredArticles = queryDb(`
    SELECT * FROM news_articles
    WHERE processing_status IN ('DISCOVERED', 'REVIEW_REQUIRED')
  `);

  let newCanonicalCount = 0;
  let attachedExistingCount = 0;
  let aggregateReportCount = 0;
  let extractionReviewRequiredCount = 0;
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
      } else if (extractRes.status === 'REVIEW_REQUIRED') {
        extractionReviewRequiredCount++;
      } else if (extractRes.status === 'NOT_ACCIDENT') {
        relevantArticleCount--;
        rejectedCandidates.push({ title: article.title, url: article.url, reason: 'LLM_CONFIRMED_NOT_ACCIDENT' });
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
  const llmProviderStates = [...new Set([
    classifier.llm.lastProvider,
    extractor.llm.lastProvider
  ].filter(provider => provider && provider !== 'not_used'))];
  const usedExternalLlm = llmProviderStates.some(provider => provider === 'gemini' || provider === 'cerebras');

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
    extraction_review_required_this_run: extractionReviewRequiredCount,
    duplicates_detected_this_run: attachedExistingCount,
    new_canonical_accidents_this_run: newCanonicalCount,
    total_canonical_accidents: queryDb("SELECT COUNT(*) as cnt FROM accidents")[0]?.cnt || 0,
    multi_source_matches: queryDb("SELECT COUNT(*) as cnt FROM accident_sources")[0]?.cnt || 0,
    conflicts: queryDb("SELECT COUNT(*) as cnt FROM review_queue WHERE status = 'PENDING'")[0]?.cnt || 0,
    unverified_records: queryDb("SELECT COUNT(*) as cnt FROM accidents WHERE verification_status = 'UNVERIFIED'")[0]?.cnt || 0,
    review_required: queryDb("SELECT COUNT(*) as cnt FROM review_queue WHERE status = 'PENDING'")[0]?.cnt || 0,
    llm_usage: {
      provider: llmProviderStates.length > 0 ? llmProviderStates.join(',') : 'not_used',
      model: llmProviderStates.includes('gemini')
        ? classifier.llm.geminiModel
        : (llmProviderStates.includes('cerebras') ? 'llama3.1-8b' : null),
      estimated_api_cost_usd: usedExternalLlm ? 'UNKNOWN' : '0.00'
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
  const restartPilot = process.argv.includes('--restart') || process.env.PILOT_RESTART === 'true';
  const completedSnapshotDates = fs.readdirSync(pilotRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .filter(entry => isCompleteSnapshot(pilotRoot, entry.name))
    .map(entry => entry.name)
    .sort();
  const previousStatusPath = path.join(pilotRoot, 'pilot_status.json');
  const previousStatus = fs.existsSync(previousStatusPath)
    ? JSON.parse(fs.readFileSync(previousStatusPath, 'utf8'))
    : {};
  const pilotStartDate = restartPilot ? dateStr : (previousStatus.pilot_start_date || dateStr);
  const plannedPilotDates = getPlannedPilotDates(pilotStartDate);
  const completedPilotDates = plannedPilotDates.filter(day => completedSnapshotDates.includes(day));
  const today = new Date().toISOString().substring(0, 10);
  const missedPilotDates = plannedPilotDates.filter(day => day < today && !completedPilotDates.includes(day));
  const daysCompleted = completedPilotDates.length;
  const pilotState = daysCompleted === TOTAL_PILOT_DAYS
    ? 'PILOT_COMPLETED'
    : (missedPilotDates.length > 0 ? 'PILOT_INCOMPLETE_MISSED_DAYS' : 'PILOT_IN_PROGRESS');
  const pilotStatus = {
    ...previousStatus,
    pilot_start_date: pilotStartDate,
    ...(restartPilot && previousStatus.pilot_start_date ? {
      previous_pilot: {
        pilot_start_date: previousStatus.pilot_start_date,
        pilot_state: previousStatus.pilot_state || 'PILOT_INCOMPLETE_MISSED_DAYS',
        days_completed: previousStatus.days_completed || 0,
        missed_pilot_dates: previousStatus.missed_pilot_dates || []
      }
    } : {}),
    current_day: daysCompleted,
    days_completed: daysCompleted,
    days_pending: Math.max(0, TOTAL_PILOT_DAYS - daysCompleted),
    total_days: TOTAL_PILOT_DAYS,
    pilot_state: pilotState,
    planned_pilot_dates: plannedPilotDates,
    missed_pilot_dates: missedPilotDates,
    latest_run_status: runErrors.length === 0 && collectResult.feeds_failed === 0
      ? 'VERIFIED_RUN'
      : 'COMPLETED_WITH_ERRORS',
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

executeDailyShadowPilot(process.argv.find(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg))).catch(err => {
  console.error('Shadow Pilot Execution error:', err);
  process.exit(1);
});
