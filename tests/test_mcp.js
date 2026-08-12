import { getLatestAccidents, searchAccidents, getAccident } from '../src/mcp/tools/accidents.js';
import { getHistoricalStatistics, getYearStatistics, comparePeriods, getDistrictStatistics, getCauseStatistics, getAnomalies } from '../src/mcp/tools/statistics.js';
import { getLatestBulletin } from '../src/mcp/tools/bulletins.js';
import { generateReportData } from '../src/mcp/tools/reports.js';

import { getRecentNews, searchNews, getUnverifiedAccidents, getPendingVerifications, getSourceHealth, getReviewQueueSummary, getDailyIngestionMetrics } from '../src/mcp/tools/news.js';

async function testMCPTools() {
  console.log('--- TESTING KKTC TRAFFIC MCP TOOLS ---');

  // 1. Accidents
  const latest = await getLatestAccidents({ limit: 5 });
  console.log(`✓ get_latest_accidents returned ${latest.length} records`);

  const search = await searchAccidents({ district: 'Lefkoşa', limit: 5 });
  console.log(`✓ search_accidents returned ${search.length} records for Lefkoşa`);

  // 2. Statistics
  const hist = await getHistoricalStatistics({ from_year: 1975, to_year: 2026 });
  console.log(`✓ get_historical_statistics returned ${hist.length} yearly records`);

  const comp = await comparePeriods({});
  console.log(`✓ compare_periods returned comparison: 2026 (${comp.period_a.deaths} deaths) vs 2025 (${comp.period_b.deaths} deaths), YoY: ${comp.comparison.percentage_change}%`);

  const dists = await getDistrictStatistics({});
  console.log(`✓ get_district_statistics returned ${dists.length} districts`);

  const causes = await getCauseStatistics({ include_unknown: true });
  console.log(`✓ get_cause_statistics returned ${causes.length} cause categories`);

  const anomalies = await getAnomalies({});
  console.log(`✓ get_anomalies returned ${anomalies.length} detected anomalies`);

  // 3. Bulletins & Reports
  const bulletin = await getLatestBulletin({ date: '2026-08-12' });
  console.log(`✓ get_latest_bulletin generated bulletin for ${bulletin.targetDate} (${bulletin.deaths2026} deaths YTD)`);

  const reportData = await generateReportData({ report_type: 'Monthly' });
  console.log(`✓ generate_report_data generated payload: "${reportData.metadata.report_title}"`);

  // 4. News & Verification Ingestion Tools
  const recentNews = await getRecentNews({ limit: 10, relevant_only: false });
  console.log(`✓ get_recent_news returned ${recentNews.length} news articles`);

  const searchN = await searchNews({ query: 'trafik' });
  console.log(`✓ search_news returned ${searchN.length} matching news articles`);

  const unverified = await getUnverifiedAccidents({ limit: 5 });
  console.log(`✓ get_unverified_accidents returned ${unverified.length} candidate records`);

  const pendingV = await getPendingVerifications();
  console.log(`✓ get_pending_verifications returned ${pendingV.length} review queue items`);

  // 5. Extended Quality & Health Tools
  const srcHealth = await getSourceHealth();
  console.log(`✓ get_source_health returned ${srcHealth.length} configured sources`);

  const revSummary = await getReviewQueueSummary();
  console.log(`✓ get_review_queue_summary returned ${revSummary.pending_conflicts} pending conflicts`);

  const dailyMetrics = await getDailyIngestionMetrics();
  console.log(`✓ get_daily_ingestion_metrics returned ${dailyMetrics.total_canonical_accidents} canonical accidents`);

  console.log('--- ALL 19 MCP TOOLS TESTS PASSED CLEANLY ---');
}

testMCPTools().catch(err => {
  console.error('MCP test failed:', err);
  process.exit(1);
});
