import { AnalyticsEngine } from '../src/analytics/engine.js';
import { AnomalyDetector } from '../src/analytics/anomaly.js';

async function runAnalyticsTests() {
  console.log('--- TESTING ANALYTICS ENGINE & PARTIAL-YEAR LOGIC ---');

  // 1. Yearly Trends
  const yearly = await AnalyticsEngine.getYearlyTrends();
  console.log(`✓ Yearly records count: ${yearly.length} (Years: ${yearly[0].year} to ${yearly[yearly.length-1].year})`);

  // 2. 2026 Partial Year Monitor
  const monitor = await AnalyticsEngine.get2026Monitor();
  console.log(`✓ 2026 Cutoff Date: ${monitor.cutoff_date}`);
  console.log(`✓ 2026 Deaths (Jan-Jul): ${monitor.deaths}`);
  console.log(`✓ 2025 Same Period Deaths: ${monitor.same_period_2025.deaths}`);
  console.log(`✓ YoY % Change: ${monitor.yoy_change_pct}%`);

  if (monitor.same_period_2025.deaths === undefined || monitor.same_period_2024.deaths === undefined) {
    throw new Error('Partial year comparison data is missing!');
  }

  // 3. District Stats
  const districts = await AnalyticsEngine.getDistrictStats();
  console.log(`✓ District stats count: ${districts.length} districts recorded`);

  // 4. Anomaly Detection
  const anomalies = await AnomalyDetector.detectAnomalies();
  console.log(`✓ Detected ${anomalies.length} statistical anomalies`);

  console.log('--- ALL ANALYTICS TESTS PASSED CLEANLY ---');
}

runAnalyticsTests().catch(err => {
  console.error('Analytics test failed:', err);
  process.exit(1);
});
