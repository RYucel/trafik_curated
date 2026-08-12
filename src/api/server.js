// Express REST API Server for KKTC Traffic Intelligence
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { queryDb, executeDb } from '../lib/db.js';
import { AnalyticsEngine } from '../analytics/engine.js';
import { AnomalyDetector } from '../analytics/anomaly.js';
import { BulletinAgent } from '../agents/bulletin_agent.js';
import { TelegramBotService } from '../telegram/bot.js';
import { llmProvider } from '../lib/llm_provider.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const telegramBot = new TelegramBotService();

// 1. Accidents list endpoint with search, filter, pagination
app.get('/api/accidents', (req, res) => {
  const { year, district, cause, verification, search, page = 1, limit = 20 } = req.query;

  let sql = `SELECT * FROM accidents WHERE 1=1`;
  const params = [];

  if (year) {
    sql += ` AND year = ?`;
    params.push(Number(year));
  }
  if (district) {
    sql += ` AND district = ?`;
    params.push(district);
  }
  if (cause) {
    sql += ` AND cause_category = ?`;
    params.push(cause);
  }
  if (verification) {
    sql += ` AND verification_status = ?`;
    params.push(verification);
  }
  if (search) {
    sql += ` AND (title LIKE ? OR description_raw LIKE ? OR road_raw LIKE ?)`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  const countRow = queryDb(`SELECT COUNT(*) as total FROM (${sql})`, params)[0] || { total: 0 };
  const totalRecords = countRow.total;
  const offset = (Number(page) - 1) * Number(limit);

  sql += ` ORDER BY event_date DESC, accident_id DESC LIMIT ? OFFSET ?`;
  const pageParams = [...params, Number(limit), offset];

  const rows = queryDb(sql, pageParams);

  res.json({
    total: totalRecords,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(totalRecords / Number(limit)) || 1,
    data: rows.map(r => ({
      ...r,
      vehicle_types: JSON.parse(r.vehicle_types || '[]'),
      victim_information: JSON.parse(r.victim_information || '[]')
    }))
  });
});

// 2. Accident Detail
app.get('/api/accidents/:id', (req, res) => {
  const { id } = req.params;
  const accs = queryDb(`SELECT * FROM accidents WHERE accident_id = ?`, [id]);
  if (!accs || accs.length === 0) {
    return res.status(404).json({ error: 'Accident record not found' });
  }

  const acc = accs[0];
  const sources = queryDb(`SELECT * FROM accident_sources WHERE accident_id = ?`, [id]);

  res.json({
    ...acc,
    vehicle_types: JSON.parse(acc.vehicle_types || '[]'),
    victim_information: JSON.parse(acc.victim_information || '[]'),
    sources: sources || []
  });
});

// 3. Analytics endpoints
app.get('/api/statistics/yearly', async (req, res) => {
  try {
    const data = await AnalyticsEngine.getYearlyTrends();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/statistics/2026', async (req, res) => {
  try {
    const data = await AnalyticsEngine.get2026Monitor();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/statistics/districts', async (req, res) => {
  try {
    const data = await AnalyticsEngine.getDistrictStats();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/statistics/causes', async (req, res) => {
  try {
    const data = await AnalyticsEngine.getCauseStats();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/statistics/monthly', async (req, res) => {
  try {
    const data = await AnalyticsEngine.getMonthlyDistribution();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/statistics/anomalies', async (req, res) => {
  try {
    const data = await AnomalyDetector.detectAnomalies();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bulletins/latest', async (req, res) => {
  try {
    const bulletin = await BulletinAgent.generateDailyBulletin();
    res.json(bulletin);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Human Review Queue
app.get('/api/review-queue', (req, res) => {
  const rows = queryDb(`SELECT * FROM review_queue ORDER BY created_at DESC`);
  res.json(rows);
});

app.post('/api/review-queue/:id/action', (req, res) => {
  const { id } = req.params;
  const { action, reviewer = 'Admin Reviewer', comments } = req.body;

  executeDb(
    `UPDATE review_queue SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE review_id = ?`,
    [action.toUpperCase(), reviewer, id]
  );

  executeDb(
    `INSERT INTO audit_log (user_action, entity_type, entity_id, new_state, action_by) VALUES (?, 'REVIEW_QUEUE', ?, ?, ?)`,
    [`REVIEW_ACTION_${action.toUpperCase()}`, String(id), comments || action, reviewer]
  );

  res.json({ success: true, review_id: id, status: action.toUpperCase() });
});

// 5. Evidence-based Natural Language Q&A Assistant
app.post('/api/qa', async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Question is required' });

  try {
    const monitor = await AnalyticsEngine.get2026Monitor();
    const causes = await AnalyticsEngine.getCauseStats();
    const dists = await AnalyticsEngine.getDistrictStats();

    const contextPrompt = `
Sen KKTC Trafik Kazalarını Önleme Derneği veritabanına bağlı bağımsız bir Trafik Veri Araştırmacısısın.
Yanıtların strictly kanıta ve veriye dayalı olmalıdır. Asla kaza detayı, kişi ismi veya uydurma rakam sunma.

GÜNCEL DOĞRULANMIŞ VERİ KÜMESİ ÖZETİ:
- 2026 Ocak-Temmuz Can Kaybı: ${monitor.deaths} ölüm (${monitor.fatal_accidents} ölümlü kaza)
- 2025 Aynı Dönem (Ocak-Temmuz): ${monitor.same_period_2025.deaths} ölüm
- Değişim Oranı: ${monitor.yoy_change_pct}%
- En Çok Kaza Bildirilen İlçeler: ${dists.map(d => d.district + ': ' + d.total_deaths + ' ölü').join(', ')}
- Öne Çıkan Bildirilen Nedenler: ${causes.slice(0, 4).map(c => c.cause_label + ': ' + c.accident_count + ' vaka').join(', ')}

KULLANICI SORUSU: "${question}"

Yanıt Formatı:
1. Doğrudan Veri Yanıtı
2. Veri Dönemi ve Hesaplama Detayı
3. Destekleyen Kaynaklar (PGM Polis Raporu, TAK Arşivi)
4. Güven Düzeyi (Doğrulanmış Fact / Reported Info / AI Inference)
    `.trim();

    const answer = await llmProvider.generateText(contextPrompt, { temperature: 0.1 });
    res.json({
      question,
      answer,
      data_period: '1975 - Temmuz 2026 (Doğrulanmış Arşiv)',
      sources: ['KKTC PGM Polis Basın Subaylığı', 'TAK Ajansı', 'DPÖ Trafik İstatistikleri'],
      confidence: 'VERIFIED_DATA'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Ingestion Status & Observability Endpoint
app.get('/api/ingestion/status', (req, res) => {
  try {
    const totalArticles = queryDb("SELECT COUNT(*) as cnt FROM news_articles")[0]?.cnt || 0;
    const relevantArticles = queryDb("SELECT COUNT(*) as cnt FROM news_articles WHERE traffic_relevance = 1")[0]?.cnt || 0;
    const pendingArticles = queryDb("SELECT COUNT(*) as cnt FROM news_articles WHERE processing_status = 'DISCOVERED'")[0]?.cnt || 0;
    const extractedArticles = queryDb("SELECT COUNT(*) as cnt FROM news_articles WHERE processing_status = 'EXTRACTED'")[0]?.cnt || 0;
    const pendingConflicts = queryDb("SELECT COUNT(*) as cnt FROM review_queue WHERE status = 'PENDING'")[0]?.cnt || 0;
    const totalAccidents = queryDb("SELECT COUNT(*) as cnt FROM accidents")[0]?.cnt || 0;
    const totalSources = queryDb("SELECT COUNT(*) as cnt FROM accident_sources")[0]?.cnt || 0;

    res.json({
      status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      metrics: {
        total_news_articles_seen: totalArticles,
        relevant_traffic_articles: relevantArticles,
        pending_relevance_classification: pendingArticles,
        extracted_accidents_articles: extractedArticles,
        pending_review_conflicts: pendingConflicts,
        total_canonical_accidents: totalAccidents,
        total_source_provenance_records: totalSources
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', error: err.message });
  }
});

// 6b. Per-Source Quality Metrics Endpoint
app.get('/api/ingestion/sources', (req, res) => {
  try {
    const sources = [
      { id: 'kibrispostasi', name: 'Kıbrıs Postası', status: 'OK' },
      { id: 'yeniduzen', name: 'Yenidüzen', status: 'OK' },
      { id: 'kibrisgazetesi', name: 'Kıbrıs Gazetesi', status: 'CONFIG_REQUIRED' },
      { id: 'haberkibris', name: 'Haber Kıbrıs', status: 'CONFIG_REQUIRED' }
    ];

    const sourceMetrics = {};
    for (const src of sources) {
      const articlesDiscovered = queryDb("SELECT COUNT(*) as cnt FROM news_articles WHERE source_name LIKE ?", [`%${src.name}%`])[0]?.cnt || 0;
      const relevantArticles = queryDb("SELECT COUNT(*) as cnt FROM news_articles WHERE source_name LIKE ? AND traffic_relevance = 1", [`%${src.name}%`])[0]?.cnt || 0;
      const accidentsExtracted = queryDb("SELECT COUNT(*) as cnt FROM accident_sources WHERE source_name LIKE ?", [`%${src.name}%`])[0]?.cnt || 0;

      sourceMetrics[src.id] = {
        source_name: src.name,
        status: src.status,
        articles_discovered: articlesDiscovered,
        relevant_traffic_articles: relevantArticles,
        accidents_extracted: accidentsExtracted,
        conflicts_flagged: 0
      };
    }

    res.json(sourceMetrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Telegram Bot Command Handler Endpoint
app.post('/api/telegram/webhook', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.text) return res.sendStatus(200);

  try {
    const responseText = await telegramBot.handleCommand(message.text);
    res.json({ reply: responseText });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`KKTC Traffic Intelligence API Server running on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    app.listen(3002, () => console.log(`KKTC Traffic Intelligence API Server running on fallback port 3002`));
  }
});
