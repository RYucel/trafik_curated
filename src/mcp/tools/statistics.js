// MCP Statistics Tools
import { AnalyticsEngine } from '../../analytics/engine.js';
import { AnomalyDetector } from '../../analytics/anomaly.js';

export async function getHistoricalStatistics({ from_year = 1975, to_year = 2026 }) {
  const trends = await AnalyticsEngine.getYearlyTrends();
  return trends.filter(r => r.year >= from_year && r.year <= to_year);
}

export async function getYearStatistics({ year = 2026, from_month = 1, to_month = 7 }) {
  if (year === 2026) {
    return await AnalyticsEngine.get2026Monitor();
  }
  const trends = await AnalyticsEngine.getYearlyTrends();
  return trends.find(r => r.year === year) || null;
}

export async function comparePeriods({ period_a, period_b }) {
  const monitor = await AnalyticsEngine.get2026Monitor();
  return {
    period_a: { label: 'Ocak-Temmuz 2026', deaths: monitor.deaths, fatal_accidents: monitor.fatal_accidents, year: 2026 },
    period_b: { label: 'Ocak-Temmuz 2025', deaths: monitor.same_period_2025.deaths, fatal_accidents: monitor.same_period_2025.fatal_accidents, year: 2025 },
    comparison: {
      death_difference: monitor.deaths - monitor.same_period_2025.deaths,
      percentage_change: monitor.yoy_change_pct,
      denominator_note: 'Gözlemlenen ilk 7 aylık dönem (212 gün)'
    }
  };
}

export async function getDistrictStatistics({ district = '' }) {
  const dists = await AnalyticsEngine.getDistrictStats();
  if (district) {
    return dists.filter(d => d.district.toLowerCase() === district.toLowerCase());
  }
  return dists;
}

export async function getCauseStatistics({ include_unknown = true }) {
  const causes = await AnalyticsEngine.getCauseStats();
  if (!include_unknown) {
    return causes.filter(c => c.cause_category !== 'UNKNOWN');
  }
  return causes;
}

export async function getAnomalies({ minimum_confidence = 'medium' }) {
  return await AnomalyDetector.detectAnomalies();
}
