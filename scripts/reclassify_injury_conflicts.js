// One-off backfill for review_queue rows created before injury-only discrepancies were
// separated from death-count discrepancies.
//
// Every source conflict used to be filed as CONFLICTING_DEATH_COUNT, which the bulletin
// treats as DO_NOT_PUBLISH. Rows where both sources actually agree on the death count are
// injury-count disagreements and must not block publication, so they are relabelled
// CONFLICTING_INJURY_COUNT. Rows whose counts cannot be parsed are left untouched.
//
// Usage: node scripts/reclassify_injury_conflicts.js [--apply]
import { executeDb, queryDb } from '../src/lib/db.js';

const apply = process.argv.includes('--apply');

function parseDeathCount(sourceLabel) {
  const match = /\((\d+)\s*Ölü,\s*(\d+)\s*Yaralı\)/.exec(sourceLabel || '');
  return match ? Number(match[1]) : null;
}

const rows = queryDb(`
  SELECT review_id, accident_id, title, source_a, source_b
  FROM review_queue
  WHERE status = 'PENDING' AND issue_type = 'CONFLICTING_DEATH_COUNT'
`);

const reclassify = [];
const keep = [];
const unparsed = [];

for (const row of rows) {
  const deathsA = parseDeathCount(row.source_a);
  const deathsB = parseDeathCount(row.source_b);
  if (deathsA === null || deathsB === null) unparsed.push(row);
  else if (deathsA === deathsB) reclassify.push(row);
  else keep.push(row);
}

console.log(`Pending CONFLICTING_DEATH_COUNT rows: ${rows.length}`);
console.log(`  → injury-only (reclassify): ${reclassify.length}`);
console.log(`  → genuine death conflict (keep): ${keep.length}`);
console.log(`  → unparseable, left untouched: ${unparsed.length}`);

for (const row of reclassify) {
  console.log(`  #${row.review_id} ${row.accident_id}: ${row.source_a} vs ${row.source_b}`);
  if (apply) {
    executeDb(
      `UPDATE review_queue
       SET issue_type = 'CONFLICTING_INJURY_COUNT',
           title = REPLACE(title, 'Can Kaybı / Yaralı Sayısı Çelişkisi', 'Yaralı Sayısı Çelişkisi')
       WHERE review_id = ?`,
      [row.review_id]
    );
  }
}

if (!apply) console.log('\nDry run. Re-run with --apply to persist.');
