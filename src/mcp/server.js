// KKTC Traffic Intelligence MCP Server
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { getLatestAccidents, searchAccidents, getAccident } from './tools/accidents.js';
import { 
  getHistoricalStatistics, getYearStatistics, comparePeriods, 
  getDistrictStatistics, getCauseStatistics, getAnomalies 
} from './tools/statistics.js';
import { getSources } from './tools/sources.js';
import { getLatestBulletin } from './tools/bulletins.js';
import { generateReportData } from './tools/reports.js';
import { getRecentNews, searchNews, getUnverifiedAccidents, getPendingVerifications } from './tools/news.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const TOOLS_MANIFEST = [
  {
    name: 'get_latest_accidents',
    description: 'Fetch latest verified structured accident records',
    parameters: { hours: 'number', limit: 'number', include_unverified: 'boolean' }
  },
  {
    name: 'search_accidents',
    description: 'Search detailed accidents by keyword, district, date range',
    parameters: { query: 'string', district: 'string', from: 'string', to: 'string', limit: 'number' }
  },
  {
    name: 'get_accident',
    description: 'Fetch accident details by ID including source provenance',
    parameters: { accident_id: 'string' }
  },
  {
    name: 'get_historical_statistics',
    description: 'Fetch 50-year official historical traffic statistics (1975-2026)',
    parameters: { from_year: 'number', to_year: 'number' }
  },
  {
    name: 'get_year_statistics',
    description: 'Fetch year statistics with partial-year comparison support',
    parameters: { year: 'number', from_month: 'number', to_month: 'number' }
  },
  {
    name: 'compare_periods',
    description: 'Compare two time periods with partial-year normalization',
    parameters: { period_a: 'object', period_b: 'object' }
  },
  {
    name: 'get_district_statistics',
    description: 'Fetch kaza ve can kaybı ilçe dağılım istatistikleri',
    parameters: { district: 'string' }
  },
  {
    name: 'get_cause_statistics',
    description: 'Fetch kaza nedenleri istatistikleri',
    parameters: { include_unknown: 'boolean' }
  },
  {
    name: 'get_anomalies',
    description: 'Fetch detected statistical anomalies and risk spikes',
    parameters: { minimum_confidence: 'string' }
  },
  {
    name: 'get_sources',
    description: 'Fetch source provenance records and verification tiers',
    parameters: { accident_id: 'string' }
  },
  {
    name: 'get_latest_bulletin',
    description: 'Generate daily Turkish traffic bulletin (KKTC TRAFİK GÜNLÜK BÜLTENİ)',
    parameters: { date: 'string' }
  },
  {
    name: 'generate_report_data',
    description: 'Generate structured data for research reports',
    parameters: { report_type: 'string', date_range: 'string' }
  },
  {
    name: 'get_recent_news',
    description: 'Fetch recent raw news articles with relevance scores',
    parameters: { limit: 'number', relevant_only: 'boolean' }
  },
  {
    name: 'search_news',
    description: 'Search news articles by keyword and source name',
    parameters: { query: 'string', source: 'string', limit: 'number' }
  },
  {
    name: 'get_unverified_accidents',
    description: 'Fetch candidate accidents awaiting verification or having conflicts',
    parameters: { limit: 'number' }
  },
  {
    name: 'get_pending_verifications',
    description: 'Fetch pending items in human review queue',
    parameters: {}
  }
];

// Tool discovery endpoint
app.get('/mcp/tools', (req, res) => {
  res.json({ tools: TOOLS_MANIFEST });
});

// Tool execution endpoint
app.post('/mcp/call', async (req, res) => {
  const { tool, arguments: args = {} } = req.body;

  try {
    let result;
    switch (tool) {
      case 'get_latest_accidents':
        result = await getLatestAccidents(args);
        break;
      case 'search_accidents':
        result = await searchAccidents(args);
        break;
      case 'get_accident':
        result = await getAccident(args);
        break;
      case 'get_historical_statistics':
        result = await getHistoricalStatistics(args);
        break;
      case 'get_year_statistics':
        result = await getYearStatistics(args);
        break;
      case 'compare_periods':
        result = await comparePeriods(args);
        break;
      case 'get_district_statistics':
        result = await getDistrictStatistics(args);
        break;
      case 'get_cause_statistics':
        result = await getCauseStatistics(args);
        break;
      case 'get_anomalies':
        result = await getAnomalies(args);
        break;
      case 'get_sources':
        result = await getSources(args);
        break;
      case 'get_latest_bulletin':
        result = await getLatestBulletin(args);
        break;
      case 'generate_report_data':
        result = await generateReportData(args);
        break;
      case 'get_recent_news':
        result = await getRecentNews(args);
        break;
      case 'search_news':
        result = await searchNews(args);
        break;
      case 'get_unverified_accidents':
        result = await getUnverifiedAccidents(args);
        break;
      case 'get_pending_verifications':
        result = await getPendingVerifications(args);
        break;
      default:
        return res.status(404).json({ error: `Tool '${tool}' not found` });
    }

    res.json({ status: 'success', tool, result });
  } catch (err) {
    res.status(500).json({ status: 'error', tool, error: err.message });
  }
});

const MCP_PORT = process.env.MCP_PORT || 3002;
app.listen(MCP_PORT, () => {
  console.log(`KKTC Traffic Intelligence MCP Server running on port ${MCP_PORT}`);
});
