// Regression tests for single-source fatal records that never left UNVERIFIED.
//
// ACC-20260923-9537 and ACC-20261003-6350 were reported first by Yenidüzen and then by Haber
// Kıbrıs. The second article matched and was attached to accident_sources, but the status was
// only ever evaluated when the record was created, so both stayed UNVERIFIED for weeks and the
// deaths were left out of the verified count.
import assert from 'node:assert';
import { AccidentExtractor } from '../src/ingestion/accident_extractor.js';
import { evaluateVerificationStatus } from '../src/ingestion/verification_engine.js';
import { promoteCorroboratedAccidents } from '../src/ingestion/corroboration.js';
import { executeDb, queryDb } from '../src/lib/db.js';

const TEST_DATE = '2099-12-07';
let nextArticleId = 990000;

function extractorReturning(fields) {
  const extractor = new AccidentExtractor();
  extractor.llm = {
    generateText: async () => JSON.stringify({
      record_type: 'INDIVIDUAL_ACCIDENT',
      event_date: TEST_DATE,
      fatal: true,
      death_count: 1,
      injury_count: 0,
      road_normalized: 'Test Yolu',
      cause_category: 'UNKNOWN',
      confidence: 0.9,
      ...fields
    })
  };
  return extractor;
}

function article(sourceName, slug) {
  return {
    id: nextArticleId++,
    title: `Test kazası ${slug}`,
    source_name: sourceName,
    url: `https://test.invalid/${slug}`,
    published_at: `${TEST_DATE}T10:00:00Z`
  };
}

function cleanup() {
  const ids = queryDb('SELECT accident_id FROM accidents WHERE event_date = ?', [TEST_DATE]).map(r => r.accident_id);
  for (const id of ids) {
    executeDb('DELETE FROM accident_sources WHERE accident_id = ?', [id]);
    executeDb('DELETE FROM review_queue WHERE accident_id IN (?, ?)', [id, `DUP-${id}`]);
  }
  executeDb('DELETE FROM accidents WHERE event_date = ?', [TEST_DATE]);
  executeDb("DELETE FROM accident_sources WHERE source_url LIKE 'https://test.invalid/%'");
}

function statusOf(accidentId) {
  return queryDb('SELECT verification_status FROM accidents WHERE accident_id = ?', [accidentId])[0]?.verification_status;
}

function testEngineCountsOutletsNotArticles() {
  const accident = { event_date: TEST_DATE, district: 'Girne' };
  const twoArticlesOneSite = evaluateVerificationStatus(accident, [
    { source_name: 'Yenidüzen', extracted_death_count: 1, extracted_injury_count: 0 },
    { source_name: 'Yenidüzen', extracted_death_count: 1, extracted_injury_count: 0 }
  ]);
  assert.strictEqual(twoArticlesOneSite.status, 'UNVERIFIED', 'a follow-up on the same site is not corroboration');

  const twoSites = evaluateVerificationStatus(accident, [
    { source_name: 'Yenidüzen', extracted_death_count: 1, extracted_injury_count: 0 },
    { source_name: 'Haber Kıbrıs', extracted_death_count: 1, extracted_injury_count: 0 }
  ]);
  assert.strictEqual(twoSites.status, 'MEDIA_CORROBORATED');
}

async function testSecondOutletPromotesOnAttach() {
  const first = await extractorReturning({ district: 'Girne' })
    .extractAccidentFromArticle(article('Yenidüzen', 'girne-yd'), 'metin');
  assert.strictEqual(first.status, 'NEW_RECORD');
  assert.strictEqual(statusOf(first.accident_id), 'UNVERIFIED');

  const second = await extractorReturning({ district: 'Girne', road_normalized: 'Başka Yol' })
    .extractAccidentFromArticle(article('Haber Kıbrıs', 'girne-hk'), 'metin');
  assert.strictEqual(second.status, 'ATTACHED_EXISTING');
  assert.strictEqual(second.accident_id, first.accident_id);
  assert.strictEqual(statusOf(first.accident_id), 'MEDIA_CORROBORATED');
}

async function testSameOutletFollowUpStaysUnverified() {
  const first = await extractorReturning({ district: 'Lefke' })
    .extractAccidentFromArticle(article('Yenidüzen', 'lefke-1'), 'metin');
  const followUp = await extractorReturning({ district: 'Lefke' })
    .extractAccidentFromArticle(article('Yenidüzen', 'lefke-2'), 'metin');
  assert.strictEqual(followUp.accident_id, first.accident_id);
  assert.strictEqual(statusOf(first.accident_id), 'UNVERIFIED');
}

async function testReprocessedArticleIsLinkedOnce() {
  const first = await extractorReturning({ district: 'İskele' })
    .extractAccidentFromArticle(article('Yenidüzen', 'iskele-yd'), 'metin');
  const hk = article('Haber Kıbrıs', 'iskele-hk');
  await extractorReturning({ district: 'İskele' }).extractAccidentFromArticle(hk, 'metin');
  await extractorReturning({ district: 'İskele' }).extractAccidentFromArticle({ ...hk, id: nextArticleId++ }, 'metin');

  const links = queryDb('SELECT COUNT(*) AS cnt FROM accident_sources WHERE accident_id = ? AND source_url = ?',
    [first.accident_id, hk.url])[0].cnt;
  assert.strictEqual(links, 1, 'the same article must not be attached twice');
}

async function testInjuryDisagreementIsNotPromoted() {
  const first = await extractorReturning({ district: 'Güzelyurt' })
    .extractAccidentFromArticle(article('Yenidüzen', 'guzelyurt-yd'), 'metin');
  const second = await extractorReturning({ district: 'Güzelyurt', injury_count: 2 })
    .extractAccidentFromArticle(article('Haber Kıbrıs', 'guzelyurt-hk'), 'metin');
  assert.strictEqual(second.accident_id, first.accident_id);
  assert.strictEqual(statusOf(first.accident_id), 'CONFLICT', 'a disagreement must stay with a human');
}

async function testSweepBackfillsRecordsAttachedBeforeTheFix() {
  // Reproduce the pre-fix state: two outlets attached, status still UNVERIFIED.
  const first = await extractorReturning({ district: 'Gazimağusa' })
    .extractAccidentFromArticle(article('Yenidüzen', 'sweep-yd'), 'metin');
  const id = first.accident_id;
  executeDb(`
    INSERT INTO accident_sources (accident_id, source_tier, source_name, source_url, published_at,
      extracted_death_count, extracted_injury_count)
    VALUES (?, 'TIER_3_ESTABLISHED_MEDIA', 'Haber Kıbrıs', 'https://test.invalid/sweep-hk', ?, 1, 0)
  `, [id, TEST_DATE]);
  assert.strictEqual(statusOf(id), 'UNVERIFIED');

  const dryRun = promoteCorroboratedAccidents({ apply: false }).find(p => p.accident_id === id);
  assert.strictEqual(dryRun?.to, 'MEDIA_CORROBORATED');
  assert.strictEqual(statusOf(id), 'UNVERIFIED', 'a dry run must not write');

  promoteCorroboratedAccidents();
  assert.strictEqual(statusOf(id), 'MEDIA_CORROBORATED');
  assert.ok(!promoteCorroboratedAccidents().some(p => p.accident_id === id), 'the sweep must be idempotent');
}

async function run() {
  cleanup();
  try {
    testEngineCountsOutletsNotArticles();
    console.log('✓ Media corroboration counts distinct outlets');
    await testSecondOutletPromotesOnAttach();
    console.log('✓ A second outlet promotes the record when it is attached');
    await testSameOutletFollowUpStaysUnverified();
    console.log('✓ A follow-up from the same outlet does not corroborate');
    await testReprocessedArticleIsLinkedOnce();
    console.log('✓ A re-processed article is linked once');
    await testInjuryDisagreementIsNotPromoted();
    console.log('✓ A disagreeing second source leaves the record in CONFLICT');
    await testSweepBackfillsRecordsAttachedBeforeTheFix();
    console.log('✓ The sweep promotes records attached before the fix');
  } finally {
    cleanup();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
