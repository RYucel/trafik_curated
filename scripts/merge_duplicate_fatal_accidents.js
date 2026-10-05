// Merge accident records that describe the same fatal crash.
//
// Before the extractor weighted a matching non-zero death count as a strong identity signal,
// follow-up coverage of a fatal crash ("suspect appears in court") was scored at 0.70 against
// the original report whenever the two named the road differently. That is below the 0.85
// match threshold, so a second canonical record was created and the death was counted twice
// in the rolling totals.
//
// This merges such pairs: same event_date, same district, same non-zero death_count. The
// oldest record wins, the newer one's sources are reattached to it, and the newer record is
// deleted. Groups whose records disagree on the death count are left alone — that is a factual
// conflict for review, not a duplicate.
//
// Usage: node scripts/merge_duplicate_fatal_accidents.js [--apply]
import { executeDb, queryDb } from '../src/lib/db.js';

const apply = process.argv.includes('--apply');

const groups = queryDb(`
  SELECT event_date, district, death_count, COUNT(*) AS cnt
  FROM accidents
  WHERE death_count > 0 AND record_type = 'INDIVIDUAL_ACCIDENT'
  GROUP BY event_date, district, death_count
  HAVING COUNT(*) > 1
  ORDER BY event_date
`);

if (groups.length === 0) {
  console.log('Mükerrer ölümlü kaza kaydı bulunamadı.');
  process.exit(0);
}

let merged = 0;
for (const g of groups) {
  const records = queryDb(`
    SELECT accident_id, event_date, event_time, district, road_normalized, death_count,
           injury_count, source_name, source_url, created_at
    FROM accidents
    WHERE event_date = ? AND district = ? AND death_count = ?
      AND record_type = 'INDIVIDUAL_ACCIDENT'
    ORDER BY created_at, accident_id
  `, [g.event_date, g.district, g.death_count]);

  const [keep, ...drop] = records;
  console.log(`\n${g.event_date} ${g.district} — ${g.death_count} can kaybı, ${records.length} kayıt`);
  console.log(`  KORUNAN  ${keep.accident_id}  ${keep.road_normalized || '-'}  (${keep.source_name})`);
  for (const d of drop) {
    console.log(`  BİRLEŞEN ${d.accident_id}  ${d.road_normalized || '-'}  (${d.source_name})`);
    if (!apply) continue;

    // Keep the losing record's provenance: its source becomes another source of the survivor.
    const alreadyLinked = queryDb(
      'SELECT 1 AS hit FROM accident_sources WHERE accident_id = ? AND source_url = ? LIMIT 1',
      [keep.accident_id, d.source_url]
    );
    if (alreadyLinked.length === 0 && d.source_url) {
      executeDb(`
        INSERT INTO accident_sources (
          accident_id, source_tier, source_name, source_url, published_at,
          extracted_death_count, extracted_injury_count, extracted_cause, raw_snippet
        )
        SELECT ?, source_tier, source_name, source_url, source_date,
               death_count, injury_count, reported_cause, description_raw
        FROM accidents WHERE accident_id = ?
      `, [keep.accident_id, d.accident_id]);
    }
    executeDb('UPDATE accident_sources SET accident_id = ? WHERE accident_id = ?',
      [keep.accident_id, d.accident_id]);
    executeDb('DELETE FROM review_queue WHERE accident_id = ?', [d.accident_id]);
    executeDb('DELETE FROM accidents WHERE accident_id = ?', [d.accident_id]);
    merged++;
  }
}

console.log(apply
  ? `\n${merged} mükerrer kayıt birleştirildi.`
  : '\nDeneme çalışması. Kalıcı hale getirmek için --apply ile tekrar çalıştırın.');
