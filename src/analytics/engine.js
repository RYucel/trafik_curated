// Analytics & Statistical Calculations Engine for KKTC Traffic Intelligence
import { queryDb } from '../lib/db.js';

export class AnalyticsEngine {
  // 1. Historical Trends (1975 - 2026)
  static async getYearlyTrends() {
    const hist = queryDb(`SELECT year, fatal_accidents, deaths, injury_accidents, injured, damage_accidents, total_accidents, deaths_per_fatal_accident FROM historical_statistics ORDER BY year ASC`);
    
    // Calculate 2026 live YTD statistics from accidents table
    const live2026 = queryDb(`
      SELECT 
        COUNT(CASE WHEN fatal = 1 THEN 1 END) as fatal_accidents,
        SUM(death_count) as deaths,
        COUNT(CASE WHEN fatal = 0 AND injury_count > 0 THEN 1 END) as injury_accidents,
        SUM(injury_count) as injured,
        COUNT(*) as total_accidents
      FROM accidents WHERE year = 2026
    `)[0] || {};

    const liveRec2026 = {
      year: 2026,
      fatal_accidents: live2026.fatal_accidents || 0,
      deaths: live2026.deaths || 0,
      injury_accidents: live2026.injury_accidents || 0,
      injured: live2026.injured || 0,
      damage_accidents: Math.max(0, (live2026.total_accidents || 0) - (live2026.fatal_accidents || 0) - (live2026.injury_accidents || 0)),
      total_accidents: live2026.total_accidents || 0,
      deaths_per_fatal_accident: live2026.fatal_accidents > 0 ? Number((live2026.deaths / live2026.fatal_accidents).toFixed(2)) : 0.0,
      data_period: '2026-01 to 2026-07-31 (YTD)'
    };

    return [...hist.filter(r => r.year < 2026), liveRec2026];
  }

  // 2. 2026 Live Year Monitor with strict Partial-Year Comparison Logic (Jan-Jul 2026 vs Jan-Jul 2025)
  static async get2026Monitor() {
    const stats2026 = queryDb(`
      SELECT 
        COUNT(CASE WHEN fatal = 1 THEN 1 END) as fatal_accidents,
        SUM(death_count) as deaths,
        SUM(injury_count) as injuries,
        COUNT(*) as total_accidents
      FROM accidents WHERE year = 2026 AND month <= 7
    `)[0] || {};

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
    const deaths2025 = stats2025SamePeriod.deaths || 1;
    const yoyChangePct = Number((((deaths2026 - deaths2025) / deaths2025) * 100).toFixed(1));

    const daysElapsed = 212; // Jan 1 to July 31
    const deathsPerMonth = Number((deaths2026 / 7).toFixed(2));
    const deathsPer100Days = Number(((deaths2026 / daysElapsed) * 100).toFixed(1));

    return {
      cutoff_date: '2026-07-31',
      data_period_label: 'Ocak – Temmuz 2026 (7 Ay)',
      days_elapsed: daysElapsed,
      fatal_accidents: stats2026.fatal_accidents || 0,
      deaths: deaths2026,
      injuries: stats2026.injuries || 0,
      total_accidents: stats2026.total_accidents || 0,
      deaths_per_month: deathsPerMonth,
      deaths_per_100_days: deathsPer100Days,
      same_period_2025: {
        period_label: 'Ocak – Temmuz 2025',
        fatal_accidents: stats2025SamePeriod.fatal_accidents || 0,
        deaths: stats2025SamePeriod.deaths || 0,
        injuries: stats2025SamePeriod.injuries || 0
      },
      same_period_2024: {
        period_label: 'Ocak – Temmuz 2024',
        fatal_accidents: stats2024SamePeriod.fatal_accidents || 0,
        deaths: stats2024SamePeriod.deaths || 0,
        injuries: stats2024SamePeriod.injuries || 0
      },
      yoy_change_pct: yoyChangePct
    };
  }

  // 3. District Breakdown
  static async getDistrictStats() {
    return queryDb(`
      SELECT 
        district,
        COUNT(*) as total_accidents,
        COUNT(CASE WHEN fatal = 1 THEN 1 END) as fatal_accidents,
        SUM(death_count) as total_deaths,
        SUM(injury_count) as total_injured
      FROM accidents
      GROUP BY district
      ORDER BY total_deaths DESC
    `);
  }

  // 4. Cause Category Distribution
  static async getCauseStats() {
    const rows = queryDb(`
      SELECT 
        cause_category,
        COUNT(*) as accident_count,
        SUM(death_count) as death_count,
        SUM(injury_count) as injury_count
      FROM accidents
      GROUP BY cause_category
      ORDER BY accident_count DESC
    `);

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
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const rows = queryDb(`
      SELECT 
        month,
        COUNT(*) as accidents,
        SUM(death_count) as deaths,
        SUM(injury_count) as injuries
      FROM accidents
      GROUP BY month
      ORDER BY month ASC
    `);

    return rows.map(r => ({
      month_number: r.month,
      month_name: months[r.month - 1],
      accidents: r.accidents,
      deaths: r.deaths,
      injuries: r.injuries
    }));
  }
}
