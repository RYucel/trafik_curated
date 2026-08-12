// MCP Accidents Tools
import { queryDb } from '../../lib/db.js';

export async function getLatestAccidents({ hours = 24, limit = 20, include_unverified = false }) {
  let sql = `SELECT * FROM accidents WHERE 1=1`;
  const params = [];

  if (!include_unverified) {
    sql += ` AND verification_status = 'VERIFIED'`;
  }
  sql += ` ORDER BY event_date DESC, accident_id DESC LIMIT ?`;
  params.push(Number(limit));

  const rows = queryDb(sql, params);
  return rows.map(r => ({
    ...r,
    vehicle_types: JSON.parse(r.vehicle_types || '[]'),
    victim_information: JSON.parse(r.victim_information || '[]')
  }));
}

export async function searchAccidents({ query = '', district = '', from = '', to = '', limit = 20 }) {
  let sql = `SELECT * FROM accidents WHERE 1=1`;
  const params = [];

  if (district) {
    sql += ` AND district = ?`;
    params.push(district);
  }
  if (from) {
    sql += ` AND event_date >= ?`;
    params.push(from);
  }
  if (to) {
    sql += ` AND event_date <= ?`;
    params.push(to);
  }
  if (query) {
    sql += ` AND (description_raw LIKE ? OR road_raw LIKE ? OR title LIKE ?)`;
    const p = `%${query}%`;
    params.push(p, p, p);
  }

  sql += ` ORDER BY event_date DESC LIMIT ?`;
  params.push(Number(limit));

  const rows = queryDb(sql, params);
  return rows.map(r => ({
    ...r,
    vehicle_types: JSON.parse(r.vehicle_types || '[]'),
    victim_information: JSON.parse(r.victim_information || '[]')
  }));
}

export async function getAccident({ accident_id }) {
  const accs = queryDb(`SELECT * FROM accidents WHERE accident_id = ?`, [accident_id]);
  if (!accs || accs.length === 0) return null;

  const acc = accs[0];
  const sources = queryDb(`SELECT * FROM accident_sources WHERE accident_id = ?`, [accident_id]);

  return {
    ...acc,
    vehicle_types: JSON.parse(acc.vehicle_types || '[]'),
    victim_information: JSON.parse(acc.victim_information || '[]'),
    sources: sources || []
  };
}
