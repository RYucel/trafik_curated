// Regression tests for the 22-30 September 2026 extraction outage.
//
// For nine days every LLM call fell back to heuristics. The extractor correctly refused to
// invent facts, so it produced zero accident records — but the run reported errors: [] and
// VERIFIED_RUN, and each bulletin stated "no accidents recorded" with full confidence while
// crashes were happening. When the provider recovered, the backlog was extracted with event
// dates already in the past, so those crashes were never announced in any bulletin.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BulletinAgent } from '../src/agents/bulletin_agent.js';
import { LLMProvider, llmHealth, resetLlmHealth } from '../src/lib/llm_provider.js';
import { executeDb, queryDb } from '../src/lib/db.js';

async function testFallbackIsRecordedAsAFailure() {
  const savedGemini = process.env.GEMINI_API_KEY;
  const savedCerebras = process.env.CEREBRAS_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.CEREBRAS_API_KEY;
    resetLlmHealth();

    const provider = new LLMProvider();
    await provider.generateText('extract structured record_type from this article');

    assert.strictEqual(provider.lastProvider, 'heuristic_fallback');
    assert.strictEqual(llmHealth.calls, 1);
    assert.strictEqual(llmHealth.fallbackCalls, 1, 'a heuristic fallback must be counted');
    assert.ok(llmHealth.lastError, 'the reason for the fallback must be recorded');
  } finally {
    resetLlmHealth();
    if (savedGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedGemini;
    if (savedCerebras === undefined) delete process.env.CEREBRAS_API_KEY;
    else process.env.CEREBRAS_API_KEY = savedCerebras;
  }
}

function testPilotTreatsAFallbackRunAsDegraded() {
  const pilot = fs.readFileSync('scripts/run_shadow_pilot.js', 'utf8');

  // A run that extracted nothing because the provider was unreachable must not be able to
  // report itself as verified.
  assert.match(pilot, /if \(llmHealth\.fallbackCalls > 0\) \{\s*runErrors\.push\(/);
  assert.match(pilot, /latest_run_status: llmHealth\.fallbackCalls > 0\s*\?\s*'DEGRADED_NO_LLM_EXTRACTION'/);
  assert.match(pilot, /extraction_degraded: llmHealth\.fallbackCalls > 0/);

  // And the deferred queue must drain once the articles have been processed.
  assert.match(pilot, /SET status = 'RESOLVED'[\s\S]*?LLM_EXTRACTION_UNAVAILABLE/);
}

async function testBulletinDoesNotClaimAQuietDayWhileExtractionIsDown() {
  const targetDate = '2099-11-10';
  const reviewId = 'NEWS-TEST-DEGRADED';
  try {
    executeDb('DELETE FROM review_queue WHERE accident_id = ?', [reviewId]);
    executeDb(`
      INSERT INTO review_queue (
        accident_id, issue_type, title, description, status, match_confidence,
        source_a, source_b, details_json, created_at
      ) VALUES (?, 'LLM_EXTRACTION_UNAVAILABLE', 'Test', 'Test', 'PENDING', 'HIGH',
        'Test Haber', '', '{}', ?)
    `, [reviewId, '2099-11-09 08:00:00']);

    const bulletin = await BulletinAgent.generateDailyBulletin(targetDate);

    // The empty list means "not extracted yet", and the bulletin has to say that.
    assert.ok(!bulletin.telegram.includes('Kayda geçmiş trafik kazası bulunmamaktadır.'),
      'a degraded run must not report a quiet day');
    assert.ok(bulletin.telegram.includes('Cikarim servisi kullanilamadi'));
    assert.strictEqual(bulletin.safety_class, 'REVIEW_REQUIRED');
    assert.match(bulletin.safety_reason, /cikarim servisi kullanilamadi/i);
  } finally {
    executeDb('DELETE FROM review_queue WHERE accident_id = ?', [reviewId]);
  }
}

async function testLateAddedAccidentsAreAnnounced() {
  const targetDate = '2099-11-20';
  const accidentId = 'ACC-20991115-TEST-LATE';
  try {
    executeDb('DELETE FROM accidents WHERE accident_id = ?', [accidentId]);
    executeDb(`
      INSERT INTO accidents (
        accident_id, event_date, event_time, year, month, district, location_normalized,
        road_normalized, fatal, death_count, injury_count, cause_category, source_type,
        source_tier, source_name, source_url, record_type, verification_status,
        content_hash, created_at
      ) VALUES (?, '2099-11-15', '09:00', 2099, 11, 'Girne', 'Gec Tespit', 'Gec Tespit Yolu',
        0, 0, 1, 'SPEED', 'Established Media', 'TIER_3_ESTABLISHED_MEDIA', 'Test Haber',
        'https://example.test/late', 'INDIVIDUAL_ACCIDENT', 'UNVERIFIED', 'hash-late', ?)
    `, [accidentId, targetDate + ' 07:30:00']);

    const bulletin = await BulletinAgent.generateDailyBulletin(targetDate);

    // Keyed on event_date, a backfilled crash is older than the reporting day and would
    // otherwise never surface in any bulletin at all.
    assert.ok(bulletin.telegram.includes('SONRADAN EKLENEN'));
    assert.ok(bulletin.telegram.includes('2099-11-15'));
    assert.ok(bulletin.markdown.includes('Sonradan Eklenen Kazalar'));
  } finally {
    executeDb('DELETE FROM accidents WHERE accident_id = ?', [accidentId]);
  }
}

function testFatalFollowUpCoverageDoesNotCreateASecondRecord() {
  const extractor = fs.readFileSync('src/ingestion/accident_extractor.js', 'utf8');

  // Same day, same district, same single death, different road name: the follow-up story
  // scored 0.5 + 0 + 0.15 + 0.05 = 0.70, below the 0.85 threshold, so the death was counted
  // twice. Weighting a matching non-zero death count at 0.3 brings it to exactly 0.85.
  assert.match(extractor, /score \+= deathCount > 0 \? 0\.3 : 0\.15;/);
  assert.match(extractor, /let matchedOnRoad = false;/);

  // Merging on that signal is a judgement call, so it is flagged rather than assumed.
  assert.match(extractor, /POSSIBLE_DUPLICATE_FATAL/);
  assert.match(extractor, /if \(deathCount > 0 && !matchedOnRoad\)/);
}

function testNoDuplicateFatalRecordsRemainInTheDatabase() {
  const dupes = queryDb(`
    SELECT event_date, district, death_count, COUNT(*) AS cnt
    FROM accidents
    WHERE death_count > 0 AND record_type = 'INDIVIDUAL_ACCIDENT'
    GROUP BY event_date, district, death_count
    HAVING COUNT(*) > 1
  `);
  assert.deepStrictEqual(dupes, [],
    'same-day same-district fatal records with an identical death count are double counts');
}

async function testQuotaExhaustionIsReadableAfterTheFact() {
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.GEMINI_API_KEY;
  try {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.CEREBRAS_API_KEY;
    resetLlmHealth();

    // What Gemini actually returns once a quota is gone. "429 Too Many Requests" on its own
    // cannot be told apart from a per-minute burst, which is why the September outage had to
    // be diagnosed by guesswork.
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => JSON.stringify({
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          message: 'You exceeded your current quota. Limit: 200 requests per day per project.'
        }
      })
    });

    const provider = new LLMProvider();
    await provider.generateText('extract structured record_type');

    assert.strictEqual(provider.lastProvider, 'heuristic_fallback');
    assert.match(llmHealth.lastError, /RESOURCE_EXHAUSTED/);
    assert.match(llmHealth.lastError, /exceeded your current quota/);

    // And it must be visible that nothing was configured to take over.
    assert.ok(llmHealth.failedProviders.includes('cerebras:unconfigured'));
  } finally {
    globalThis.fetch = savedFetch;
    resetLlmHealth();
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedKey;
  }
}

function runAlert(args, env = {}) {
  return execFileSync(process.execPath, ['scripts/send_admin_alert.js', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

function testAlertFiresOnADegradedSnapshot() {
  const day = '2099-10-26';
  const dir = path.join(process.cwd(), 'data', 'pilot', day);
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Shaped like the real September snapshots, which predate extraction_degraded: the
    // provider string is the only signal they carry.
    fs.writeFileSync(path.join(dir, 'ingestion.json'), JSON.stringify({
      date: day,
      articles_seen: 80,
      feeds_checked: 3,
      feeds_failed: 0,
      new_canonical_accidents_this_run: 0,
      extraction_review_required_this_run: 26,
      llm_usage: { provider: 'heuristic_fallback', model: null }
    }));
    fs.writeFileSync(path.join(dir, 'errors.json'), '[]');

    const out = runAlert([day], { TELEGRAM_BOT_TOKEN: '', TELEGRAM_ADMIN_CHAT_ID: '' });
    assert.match(out, /Çıkarım servisi kullanılamıyor/);
    assert.match(out, /İşlenemeyen trafik haberi: 26/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testAlertStaysQuietOnAHealthyRun() {
  const day = '2099-10-27';
  const dir = path.join(process.cwd(), 'data', 'pilot', day);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ingestion.json'), JSON.stringify({
      date: day,
      articles_seen: 80,
      feeds_checked: 3,
      feeds_failed: 0,
      new_canonical_accidents_this_run: 2,
      extraction_review_required_this_run: 0,
      llm_usage: { provider: 'gemini', model: 'gemini-3.7-flash', extraction_degraded: false }
    }));
    fs.writeFileSync(path.join(dir, 'errors.json'), '[]');

    const out = runAlert([day], { TELEGRAM_BOT_TOKEN: '', TELEGRAM_ADMIN_CHAT_ID: '' });
    assert.match(out, /sorun yok/);
    assert.ok(!out.includes('⚠️'), 'a healthy run must not produce an alert');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testAlertNeverTargetsThePublicChannel() {
  const alert = fs.readFileSync('scripts/send_admin_alert.js', 'utf8');

  // Subscribers of the public bulletin must never receive provider errors, so a missing admin
  // chat id skips the alert instead of falling back to TELEGRAM_CHAT_ID.
  assert.match(alert, /if \(adminChatId === publicChatId\)/);
  assert.doesNotMatch(alert, /chat_id: publicChatId/);
  assert.match(alert, /chat_id: adminChatId/);

  const workflow = fs.readFileSync('.github/workflows/shadow-pilot.yml', 'utf8');
  // Must run even when the pilot step crashed, and must never fail the job itself.
  assert.match(workflow, /- name: Alert admin on a degraded run\s+if: \$\{\{ always\(\) \}\}\s+continue-on-error: true/);
  assert.match(workflow, /- name: Alert admin if the workflow itself failed\s+if: \$\{\{ failure\(\) \}\}/);
  assert.match(workflow, /TELEGRAM_ADMIN_CHAT_ID: \$\{\{ secrets\.TELEGRAM_ADMIN_CHAT_ID \}\}/);
}

await testFallbackIsRecordedAsAFailure();
console.log('✓ A heuristic fallback is recorded as a provider failure');
await testQuotaExhaustionIsReadableAfterTheFact();
console.log('✓ A quota exhaustion is readable after the fact, with no provider to take over');
testPilotTreatsAFallbackRunAsDegraded();
console.log('✓ A fallback run is reported as degraded, and the deferred queue drains');
await testBulletinDoesNotClaimAQuietDayWhileExtractionIsDown();
console.log('✓ The bulletin does not claim a quiet day while extraction is down');
await testLateAddedAccidentsAreAnnounced();
console.log('✓ Backfilled accidents are announced instead of silently landing in the database');
testFatalFollowUpCoverageDoesNotCreateASecondRecord();
console.log('✓ Follow-up coverage of a fatal crash does not create a second record');
testNoDuplicateFatalRecordsRemainInTheDatabase();
console.log('✓ No duplicate fatal records remain in the database');
testAlertFiresOnADegradedSnapshot();
console.log('✓ A degraded run raises an admin alert');
testAlertStaysQuietOnAHealthyRun();
console.log('✓ A healthy run raises nothing');
testAlertNeverTargetsThePublicChannel();
console.log('✓ Operational alerts never reach the public channel');
