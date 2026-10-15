// Re-evaluate an accident's verification status from all of its attached sources.
//
// Status used to be decided once, when the first article created the record. Every later
// article from another outlet was attached to accident_sources but the status was never
// revisited, so a fatal crash reported first by one site stayed UNVERIFIED for weeks even
// after a second site covered it — and was left out of the verified death count.
import { executeDb, queryDb } from '../lib/db.js';
import { evaluateVerificationStatus } from './verification_engine.js';

// Only promotions are automatic. CONFLICT and INCOMPLETE need a human, and a VERIFIED record
// never drops back to media corroboration.
const PROMOTION_RANK = { UNVERIFIED: 0, MEDIA_CORROBORATED: 1, VERIFIED: 2 };

export function evaluateAccidentSources(accidentId) {
  const [accident] = queryDb(
    'SELECT accident_id, event_date, district, verification_status FROM accidents WHERE accident_id = ?',
    [accidentId]
  );
  if (!accident) return null;

  const sources = queryDb(`
    SELECT source_name, source_url, published_at, extracted_death_count, extracted_injury_count
    FROM accident_sources WHERE accident_id = ?
  `, [accidentId]);

  // The same article can be linked more than once (re-processed feeds); count it once.
  const seen = new Set();
  const unique = sources.filter(s => {
    const key = s.source_url || `${s.source_name}|${s.published_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result = evaluateVerificationStatus(accident, unique);
  const from = accident.verification_status;
  const promote = from in PROMOTION_RANK
    && result.status in PROMOTION_RANK
    && PROMOTION_RANK[result.status] > PROMOTION_RANK[from];

  return { accident_id: accidentId, from, to: promote ? result.status : from, promote, reason: result.reason };
}

export function refreshVerificationStatus(accidentId, { apply = true } = {}) {
  const outcome = evaluateAccidentSources(accidentId);
  if (outcome?.promote && apply) {
    executeDb('UPDATE accidents SET verification_status = ? WHERE accident_id = ? AND verification_status = ?',
      [outcome.to, accidentId, outcome.from]);
  }
  return outcome;
}

// Idempotent sweep over every record still waiting for corroboration that already has more
// than one source. Safe to run on every pilot run; it also backfills records attached before
// the extractor re-evaluated on attach.
export function promoteCorroboratedAccidents({ apply = true } = {}) {
  const candidates = queryDb(`
    SELECT a.accident_id
    FROM accidents a
    WHERE a.verification_status = 'UNVERIFIED'
      AND (SELECT COUNT(DISTINCT s.source_name) FROM accident_sources s
           WHERE s.accident_id = a.accident_id) > 1
    ORDER BY a.event_date, a.accident_id
  `);
  return candidates
    .map(c => refreshVerificationStatus(c.accident_id, { apply }))
    .filter(o => o?.promote);
}
