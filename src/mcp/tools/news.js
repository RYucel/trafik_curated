// MCP News & Verification Tools
import { queryDb } from '../../lib/db.js';

export async function getRecentNews({ limit = 20, relevant_only = true }) {
  let sql = `SELECT * FROM news_articles`;
  const params = [];

  if (relevant_only) {
    sql += ` WHERE traffic_relevance = 1`;
  }

  sql += ` ORDER BY published_at DESC LIMIT ?`;
  params.push(limit);

  return queryDb(sql, params);
}

export async function searchNews({ query = '', source = '', limit = 20 }) {
  let sql = `SELECT * FROM news_articles WHERE 1=1`;
  const params = [];

  if (query) {
    sql += ` AND (title LIKE ? OR description LIKE ?)`;
    const searchPattern = `%${query}%`;
    params.push(searchPattern, searchPattern);
  }

  if (source) {
    sql += ` AND source_name LIKE ?`;
    params.push(`%${source}%`);
  }

  sql += ` ORDER BY published_at DESC LIMIT ?`;
  params.push(limit);

  return queryDb(sql, params);
}

export async function getUnverifiedAccidents({ limit = 20 }) {
  return queryDb(`
    SELECT * FROM accidents 
    WHERE verification_status IN ('REPORTED', 'UNVERIFIED', 'CONFLICT')
    ORDER BY event_date DESC LIMIT ?
  `, [limit]);
}

export async function getPendingVerifications() {
  return queryDb(`
    SELECT * FROM review_queue 
    WHERE status = 'PENDING'
    ORDER BY created_at DESC
  `);
}

export async function getSourceHealth() {
  const sources = [
    { id: 'kibrispostasi', name: 'Kıbrıs Postası', status: 'OK' },
    { id: 'yeniduzen', name: 'Yenidüzen', status: 'OK' },
    { id: 'kibrisgazetesi', name: 'Kıbrıs Gazetesi', status: 'CONFIG_REQUIRED' },
    { id: 'haberkibris', name: 'Haber Kıbrıs', status: 'CONFIG_REQUIRED' }
  ];

  return sources.map(s => {
    const total = queryDb("SELECT COUNT(*) as cnt FROM news_articles WHERE source_name LIKE ?", [`%${s.name}%`])[0]?.cnt || 0;
    return { ...s, total_articles_discovered: total };
  });
}

export async function getReviewQueueSummary() {
  const pending = queryDb("SELECT COUNT(*) as cnt FROM review_queue WHERE status = 'PENDING'")[0]?.cnt || 0;
  const resolved = queryDb("SELECT COUNT(*) as cnt FROM review_queue WHERE status != 'PENDING'")[0]?.cnt || 0;
  return { pending_conflicts: pending, resolved_conflicts: resolved };
}

export async function getDailyIngestionMetrics() {
  const totalArticles = queryDb("SELECT COUNT(*) as cnt FROM news_articles")[0]?.cnt || 0;
  const totalAccidents = queryDb("SELECT COUNT(*) as cnt FROM accidents")[0]?.cnt || 0;
  const totalSources = queryDb("SELECT COUNT(*) as cnt FROM accident_sources")[0]?.cnt || 0;
  return { total_news_articles: totalArticles, total_canonical_accidents: totalAccidents, total_source_records: totalSources };
}
