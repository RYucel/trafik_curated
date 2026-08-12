// KKTC Traffic Intelligence MCP Server (Stdio Transport for LobeHub / Claude / Cursor)
import readline from 'readline';
import { getLatestAccidents, searchAccidents, getAccident } from './tools/accidents.js';
import { 
  getHistoricalStatistics, getYearStatistics, comparePeriods, 
  getDistrictStatistics, getCauseStatistics, getAnomalies 
} from './tools/statistics.js';
import { getSources } from './tools/sources.js';
import { getLatestBulletin } from './tools/bulletins.js';
import { generateReportData } from './tools/reports.js';
import { getRecentNews, searchNews, getUnverifiedAccidents, getPendingVerifications, getSourceHealth, getReviewQueueSummary, getDailyIngestionMetrics } from './tools/news.js';

const TOOLS_MANIFEST = [
  {
    name: 'get_latest_accidents',
    description: 'Fetch latest verified structured accident records',
    inputSchema: {
      type: 'object',
      properties: {
        hours: { type: 'number', description: 'Hours limit' },
        limit: { type: 'number', description: 'Record limit' },
        include_unverified: { type: 'boolean', description: 'Include unverified records' }
      }
    }
  },
  {
    name: 'search_accidents',
    description: 'Search detailed accidents by keyword, district, date range',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        district: { type: 'string', description: 'District name (e.g. Lefkoşa, Girne)' },
        from: { type: 'string', description: 'Start date YYYY-MM-DD' },
        to: { type: 'string', description: 'End date YYYY-MM-DD' },
        limit: { type: 'number', description: 'Limit' }
      }
    }
  },
  {
    name: 'get_accident',
    description: 'Fetch accident details by ID including source provenance',
    inputSchema: {
      type: 'object',
      properties: {
        accident_id: { type: 'string', description: 'Accident ID' }
      },
      required: ['accident_id']
    }
  },
  {
    name: 'get_historical_statistics',
    description: 'Fetch 50-year official historical traffic statistics (1975-2026)',
    inputSchema: {
      type: 'object',
      properties: {
        from_year: { type: 'number', description: 'Start year' },
        to_year: { type: 'number', description: 'End year' }
      }
    }
  },
  {
    name: 'get_year_statistics',
    description: 'Fetch year statistics with partial-year comparison support',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'number', description: 'Target year (e.g. 2026)' },
        from_month: { type: 'number' },
        to_month: { type: 'number' }
      }
    }
  },
  {
    name: 'compare_periods',
    description: 'Compare two time periods with partial-year normalization',
    inputSchema: {
      type: 'object',
      properties: {
        period_a: { type: 'object' },
        period_b: { type: 'object' }
      }
    }
  },
  {
    name: 'get_district_statistics',
    description: 'Fetch kaza ve can kaybı ilçe dağılım istatistikleri',
    inputSchema: {
      type: 'object',
      properties: {
        district: { type: 'string', description: 'District filter' }
      }
    }
  },
  {
    name: 'get_cause_statistics',
    description: 'Fetch kaza nedenleri istatistikleri',
    inputSchema: {
      type: 'object',
      properties: {
        include_unknown: { type: 'boolean' }
      }
    }
  },
  {
    name: 'get_anomalies',
    description: 'Fetch detected statistical anomalies and risk spikes',
    inputSchema: {
      type: 'object',
      properties: {
        minimum_confidence: { type: 'string' }
      }
    }
  },
  {
    name: 'get_sources',
    description: 'Fetch source provenance records and verification tiers',
    inputSchema: {
      type: 'object',
      properties: {
        accident_id: { type: 'string' }
      }
    }
  },
  {
    name: 'get_latest_bulletin',
    description: 'Generate daily Turkish traffic bulletin (KKTC TRAFİK GÜNLÜK BÜLTENİ)',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Target date YYYY-MM-DD' }
      }
    }
  },
  {
    name: 'generate_report_data',
    description: 'Generate structured data for research reports',
    inputSchema: {
      type: 'object',
      properties: {
        report_type: { type: 'string' },
        date_range: { type: 'string' }
      }
    }
  },
  {
    name: 'get_recent_news',
    description: 'Fetch recent raw news articles with relevance scores',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        relevant_only: { type: 'boolean' }
      }
    }
  },
  {
    name: 'search_news',
    description: 'Search news articles by keyword and source name',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        source: { type: 'string' },
        limit: { type: 'number' }
      }
    }
  },
  {
    name: 'get_unverified_accidents',
    description: 'Fetch candidate accidents awaiting verification or having conflicts',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' }
      }
    }
  },
  {
    name: 'get_pending_verifications',
    description: 'Fetch pending items in human review queue',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_source_health',
    description: 'Fetch health metrics for configured news sources',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_review_queue_summary',
    description: 'Fetch summary of pending and resolved human review queue items',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_daily_ingestion_metrics',
    description: 'Fetch total metrics for daily news ingestion and canonical records',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'get_latest_accidents':
      return await getLatestAccidents(args);
    case 'search_accidents':
      return await searchAccidents(args);
    case 'get_accident':
      return await getAccident(args);
    case 'get_historical_statistics':
      return await getHistoricalStatistics(args);
    case 'get_year_statistics':
      return await getYearStatistics(args);
    case 'compare_periods':
      return await comparePeriods(args);
    case 'get_district_statistics':
      return await getDistrictStatistics(args);
    case 'get_cause_statistics':
      return await getCauseStatistics(args);
    case 'get_anomalies':
      return await getAnomalies(args);
    case 'get_sources':
      return await getSources(args);
    case 'get_latest_bulletin':
      return await getLatestBulletin(args);
    case 'generate_report_data':
      return await generateReportData(args);
    case 'get_recent_news':
      return await getRecentNews(args);
    case 'search_news':
      return await searchNews(args);
    case 'get_unverified_accidents':
      return await getUnverifiedAccidents(args);
    case 'get_pending_verifications':
      return await getPendingVerifications(args);
    case 'get_source_health':
      return await getSourceHealth(args);
    case 'get_review_queue_summary':
      return await getReviewQueueSummary(args);
    case 'get_daily_ingestion_metrics':
      return await getDailyIngestionMetrics(args);
    case 'get_pending_verifications':
      return await getPendingVerifications(args);
    default:
      throw new Error(`Tool ${name} not found`);
  }
}

function sendJsonRpc(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  if (!line.trim()) return;

  try {
    const req = JSON.parse(line);
    const { id, method, params } = req;

    if (method === 'initialize') {
      sendJsonRpc({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'kktc-traffic-mcp', version: '1.0.0' }
        }
      });
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'tools/list') {
      sendJsonRpc({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS_MANIFEST }
      });
      return;
    }

    if (method === 'tools/call') {
      const { name, arguments: args = {} } = params;
      try {
        const resultData = await handleToolCall(name, args);
        sendJsonRpc({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(resultData, null, 2)
              }
            ]
          }
        });
      } catch (err) {
        sendJsonRpc({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: err.message }
        });
      }
      return;
    }

    sendJsonRpc({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method '${method}' not supported` }
    });

  } catch (e) {
    // Malformed JSON
  }
});
