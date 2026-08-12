// MCP Sources Tool
import { queryDb } from '../../lib/db.js';

export async function getSources({ accident_id = '' }) {
  let sql = `SELECT source_type, source_name, source_url, verification_status, confidence_score FROM accidents`;
  const params = [];
  if (accident_id) {
    sql += ` WHERE accident_id = ?`;
    params.push(accident_id);
  }
  sql += ` GROUP BY source_name LIMIT 30`;

  return queryDb(sql, params);
}
