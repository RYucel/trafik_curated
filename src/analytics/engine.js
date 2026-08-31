// Analytics & Statistical Calculations Engine for KKTC Traffic Intelligence
import fs from 'node:fs';
import { queryDb } from '../lib/db.js';

const CURATED_PERIOD_STATS = JSON.parse(
  fs.readFileSync(new URL('../../data/curated/official_period_statistics.json', import.meta.url), 'utf8')
);

function getOfficial2026JulyStats() {
  return CURATED_PERIOD_STATS.find(item => item.year === 2026 && item.period_end === '2026-07-31');
}

export class AnalyticsEngine {
  // 1. Historical Trends (1975 - 2026)
  static async getYearlyTrends() {
    const hist = queryDb(`SELECT year, fatal_accidents, deaths, injury_accidents, injured, damage_accidents, total_accidents, deaths_per_fatal_accident FROM historical_statistics ORDER BY year ASC`);
    const official2026 = getOfficial2026JulyStats();
    if (!official2026) throw new Error('Missing official 2026-07-31 period statistics');

    const liveRec2026 = {
      year: 2026,
      fatal_accidents: official2026.fatal_accidents,
      deaths: official2026.deaths,
      injury_accidents: null,
      injured: null,
      damage_accidents: null,
      total_accidents: null,
      deaths_per_fatal_accident: Number((official2026.deaths / official2026.fatal_accidents).toFixed(2)),
      data_period: '2026-01-01 to 2026-07-31 (OFFICIAL)'
    };

    return [...hist.filter(r => r.year < 2026), liveRec2026];
  }

  // 2. 2026 Live Year Monitor with strict Partial-Year Comparison Logic (Jan-Jul 2026 vs Jan-Jul 2025)
  static async get2026Monitor() {
    const stats2026 = getOfficial2026JulyStats();
    if (!stats2026) throw new Error('Missing official 2026-07-31 period statistics');

    const stats2025SamePeriod = queryDb(`
      SELECT 
        COUNT(CASE WHEN fatal = 1 THEN 1 END) as fatal_accidents,
        SUM(death_count) as deaths,
        SUM(injury_count) as injuries,
        COUNT(*) as total_accidents
      FROM accidents WHERE year = 2025 AND month <= 7
    `)[0] || {};

    const stats2024SamePeriod = queryDb(`
      SELECT 
        COUNT(CASE WHEN fatal = 1 THEN 1 END) as fatal_accidents,
        SUM(death_count) as deaths,
        SUM(injury_count) as injuries,
        COUNT(*) as total_accidents
      FROM accidents WHERE year = 2024 AND month <= 7
    `)[0] || {};

    const deaths2026 = stats2026.deaths || 0;
    const deaths2025 = stats2026.comparison_2025_deaths;
    const yoyChangePct = Number((((deaths2026 - deaths2025) / deaths2025) * 100).toFixed(1));

    const daysElapsed = 212; // Jan 1 to July 31
    const deathsPerMonth = Number((deaths2026 / 7).toFixed(2));
    const deathsPer100Days = Number(((deaths2026 / daysElapsed) * 100).toFixed(1));

    return {
      cutoff_date: '2026-07-31',
      data_period_label: 'Ocak – Temmuz 2026 (7 Ay)',
      days_elapsed: daysElapsed,
      fatal_accidents: stats2026.fatal_accidents,
      deaths: deaths2026,
      injuries: stats2026.injuries,
      total_accidents: null,
      deaths_per_month: deathsPerMonth,
      deaths_per_100_days: deathsPer100Days,
      same_period_2025: {
        period_label: 'Ocak – Temmuz 2025',
        fatal_accidents: stats2025SamePeriod.fatal_accidents || 0,
        deaths: deaths2025,
        injuries: stats2025SamePeriod.injuries || 0
      },
      same_period_2024: {
        period_label: 'Ocak – Temmuz 2024',
        fatal_accidents: stats2024SamePeriod.fatal_accidents || 0,
        deaths: stats2026.comparison_2024_deaths,
        injuries: stats2024SamePeriod.injuries || 0
      },
      yoy_change_pct: yoyChangePct
    };
  }

  // 3. District Breakdown
  static async getDistrictStats() {
    // Current accident rows contain legacy fixtures and cannot support a
    // trustworthy public district breakdown until they are quarantined.
    return [];
  }

  // 4. Cause Category Distribution
  static async getCauseStats() {
    const rows = [];

    const causeLabels = {
      'SPEED': 'Aşırı Hız ve Dikkatsizlik',
      'DRUNK_DRIVING': 'Alkol Etkisinde Sürüş',
      'DISTRACTED_DRIVING': 'Dikkatsiz Sürüş / Cep Telefonu',
      'FAILURE_TO_GIVE_WAY': 'Kavşakta Yol Hakkına Uymama',
      'WRONG_SIDE': 'Şerit İhlali / Ters Yön',
      'LOSS_OF_CONTROL': 'Direksiyon Hakimiyeti Kaybı',
      'MOTORCYCLE': 'Motosiklet Kural İhlali',
      'PEDESTRIAN': 'Yaya Kural İhlali',
      'UNKNOWN': 'Bilinmiyor / İncelemede'
    };

    return rows.map(r => ({
      ...r,
      cause_label: causeLabels[r.cause_category] || r.cause_category
    }));
  }

  // 5. Monthly Seasonality Distribution
  static async getMonthlyDistribution() {
    const rows = [];

    return rows.map(r => ({
      month_number: r.month,
      month_name: months[r.month - 1],
      accidents: r.accidents,
      deaths: r.deaths,
      injuries: r.injuries
    }));
  }
}
