// MCP Reports Data Tool
import { AnalyticsEngine } from '../../analytics/engine.js';
import { BulletinAgent } from '../../agents/bulletin_agent.js';

export async function generateReportData({ report_type = 'Monthly', date_range = '2026-01-01 - 2026-07-31' }) {
  const monitor = await AnalyticsEngine.get2026Monitor();
  const causes = await AnalyticsEngine.getCauseStats();
  const districts = await AnalyticsEngine.getDistrictStats();
  const bulletin = await BulletinAgent.generateDailyBulletin();

  return {
    metadata: {
      report_title: `KKTC Trafik Güvenliği ${report_type} Analiz Raporu`,
      date_range,
      generated_at: new Date().toISOString(),
      institution: 'KKTC Trafik Kazalarını Önleme Derneği Bağımsız Veri Platformu'
    },
    executive_summary: {
      deaths_2026_ytd: monitor.deaths,
      fatal_accidents_2026_ytd: monitor.fatal_accidents,
      same_period_2025_deaths: monitor.same_period_2025.deaths,
      yoy_change_pct: monitor.yoy_change_pct
    },
    top_districts: districts.slice(0, 3),
    top_causes: causes.slice(0, 3),
    bulletin_preview: bulletin.telegram
  };
}
