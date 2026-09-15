import assert from 'assert';
import fs from 'fs';
import { BulletinAgent } from '../src/agents/bulletin_agent.js';
import { AnalyticsEngine } from '../src/analytics/engine.js';
import { executeDb, queryDb } from '../src/lib/db.js';
import { TelegramBotService } from '../src/telegram/bot.js';

async function testBulletinUsesTargetDatePeriod() {
  const targetDate = '2026-08-31';
  const bulletin = await BulletinAgent.generateDailyBulletin(targetDate);
  assert.strictEqual(bulletin.deaths2026, 27);
  assert.strictEqual(bulletin.fatal2026, 22);
  assert.strictEqual(bulletin.injuries2026, null);
  assert.match(bulletin.telegram, /Ocak–Ağustos YTD/);
  assert.match(bulletin.markdown, /1 Ocak 2026 – 31 Ağustos 2026/);
  assert.doesNotMatch(bulletin.telegram, /32 Can Kaybı/);
  assert.match(bulletin.markdown, /23 can kaybı \/ 19 ölümlü kaza/);
  assert.match(bulletin.markdown, /Türetilmiş 31 Ağustos toplamı: 27 can kaybı \/ 22 ölümlü kaza/);
}

async function testTelegramBulletinUsesDefaultPagesLink() {
  const originalBaseUrl = process.env.PUBLIC_BULLETIN_BASE_URL;
  delete process.env.PUBLIC_BULLETIN_BASE_URL;
  try {
    const bulletin = await BulletinAgent.generateDailyBulletin('2026-08-31');
    assert.match(
      bulletin.telegram,
      /https:\/\/ryucel\.github\.io\/trafik_curated\/bulletins\/2026-08-31\//
    );
    assert.doesNotMatch(bulletin.telegram, /kktctrafik\.org\/bulletins/);
  } finally {
    if (originalBaseUrl === undefined) delete process.env.PUBLIC_BULLETIN_BASE_URL;
    else process.env.PUBLIC_BULLETIN_BASE_URL = originalBaseUrl;
  }
}

async function testTelegramBulletinUsesConfiguredPagesUrl() {
  const originalBaseUrl = process.env.PUBLIC_BULLETIN_BASE_URL;
  process.env.PUBLIC_BULLETIN_BASE_URL = 'https://ryucel.github.io/trafik_curated';
  try {
    const bulletin = await BulletinAgent.generateDailyBulletin('2026-08-31');
    assert.match(
      bulletin.telegram,
      /https:\/\/ryucel\.github\.io\/trafik_curated\/bulletins\/2026-08-31\//
    );
  } finally {
    if (originalBaseUrl === undefined) delete process.env.PUBLIC_BULLETIN_BASE_URL;
    else process.env.PUBLIC_BULLETIN_BASE_URL = originalBaseUrl;
  }
}

async function testBulletinListsTheReportDayAccidents() {
  const targetDate = '2099-12-24';
  const reportDay = '2099-12-23';
  const verifiedId = 'ACC-20991223-TEST-VERIFIED';
  const unverifiedId = 'ACC-20991223-TEST-UNVERIFIED';
  const sameDayId = 'ACC-20991224-TEST-SAMEDAY';
  const verifiedUrl = 'https://example.test/verified-2099-12-23';
  const unverifiedUrl = 'https://example.test/unverified-2099-12-23';
  const ids = [verifiedId, unverifiedId, sameDayId];

  const insertAccident = (id, eventDate, district, road, deaths, injuries, cause, status, url) =>
    executeDb(`
      INSERT INTO accidents (
        accident_id, event_date, event_time, year, month, district, location_normalized,
        road_normalized, fatal, death_count, injury_count, cause_category, source_type,
        source_tier, source_name, source_url, record_type, verification_status, content_hash
      ) VALUES (?, ?, '08:30', 2099, 12, ?, ?, ?, ?, ?, ?, ?, 'Established Media',
        'TIER_3_ESTABLISHED_MEDIA', 'Test Haber', ?, 'INDIVIDUAL_ACCIDENT', ?, ?)
    `, [id, eventDate, district, road, road, deaths > 0 ? 1 : 0, deaths, injuries, cause,
        url, status, `content-${id}`]);

  try {
    executeDb(`DELETE FROM accidents WHERE accident_id IN (?, ?, ?)`, ids);
    insertAccident(verifiedId, reportDay, 'Lefkoşa', 'Test Caddesi', 0, 1,
      'SPEED', 'VERIFIED', verifiedUrl);
    insertAccident(unverifiedId, reportDay, 'Girne', 'Tek Kaynak Sokak', 0, 2,
      'ALCOHOL', 'UNVERIFIED', unverifiedUrl);
    insertAccident(sameDayId, targetDate, 'Gazimağusa', 'Ayni Gun Sokak', 0, 1,
      'SPEED', 'VERIFIED', 'https://example.test/same-day');

    const bulletin = await BulletinAgent.generateDailyBulletin(targetDate);

    // The bulletin reports the previous day, because at 06:00 the current day has barely
    // been reported on yet. An accident dated the bulletin's own day must not appear.
    assert.ok(bulletin.telegram.includes('23 Aralık 2099 KAZALARI (2)'));
    assert.ok(!bulletin.telegram.includes('Ayni Gun Sokak'));

    // Single-source records are listed and badged; excluding them emptied the section.
    assert.ok(bulletin.telegram.includes('🟢 Lefkoşa, Test Caddesi'));
    assert.ok(bulletin.telegram.includes('🟡 Girne, Tek Kaynak Sokak'));
    assert.ok(bulletin.telegram.includes(verifiedUrl));
    assert.ok(bulletin.telegram.includes(unverifiedUrl));

    // Free-form LLM cause labels are normalised to Turkish for publication.
    assert.ok(bulletin.telegram.includes('Aşırı hız'));
    assert.ok(bulletin.telegram.includes('Alkol/madde etkisi'));

    // Casualty counts must survive into the published line.
    assert.ok(bulletin.telegram.includes('2 yaralı'));

    // The rolling summary gives the bulletin substance on days with no crash at all.
    assert.ok(bulletin.telegram.includes('SON 7 GÜN'));
    assert.ok(bulletin.markdown.includes('Son 7 Gün'));
    assert.ok(bulletin.markdown.includes(verifiedUrl));
  } finally {
    executeDb(`DELETE FROM accidents WHERE accident_id IN (?, ?, ?)`, ids);
  }
}

function testBulletinDoesNotFabricateAnalysis() {
  const agent = fs.readFileSync('src/agents/bulletin_agent.js', 'utf8');

  // The bulletin used to carry a hardcoded "AI inference and risk analysis" section that
  // printed the same two sentences every day regardless of the data.
  assert.doesNotMatch(agent, /Yapay Zekâ Çıkarımı ve Risk Analizi/);
  assert.doesNotMatch(agent, /Aşırı hız ve alkol kullanımı doğrulanmış vakalarda/);
}

async function testPublishedDateIsNotSentTwice() {
  const targetDate = '2099-12-31';
  executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  executeDb(`
    INSERT INTO bulletins (
      bulletin_date, title, content_markdown, content_telegram, data_period,
      fatal_accidents_2026, deaths_2026, injuries_2026, published_telegram
    ) VALUES (?, 'Test', 'Test', 'Test', 'Test', 0, 0, 0, 1)
  `, [targetDate]);

  try {
    const result = await new TelegramBotService().sendDailyBroadcast(true, targetDate);
    assert.strictEqual(result.status, 'ALREADY_PUBLISHED');
  } finally {
    executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  }
}

async function testApprovedCorrectionCanRepublishWithPagesLink() {
  const targetDate = '2099-12-26';
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;
  const originalBaseUrl = process.env.PUBLIC_BULLETIN_BASE_URL;
  let sentPayload;
  executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  executeDb(`
    INSERT INTO bulletins (
      bulletin_date, title, content_markdown, content_telegram, data_period,
      fatal_accidents_2026, deaths_2026, injuries_2026, published_telegram
    ) VALUES (?, 'Old bulletin', 'Old', 'Old', 'Old', 0, 0, 0, 1)
  `, [targetDate]);

  globalThis.fetch = async (_url, options) => {
    sentPayload = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = 'test-chat';
  process.env.PUBLIC_BULLETIN_BASE_URL = 'https://ryucel.github.io/trafik_curated';

  try {
    const bot = new TelegramBotService();
    const reservation = await bot.reserveDailyBroadcast(targetDate, 'correction-run', true);
    const publication = await bot.sendDailyBroadcast(true, targetDate, 'correction-run');
    const persisted = queryDb(
      'SELECT injuries_2026 FROM bulletins WHERE bulletin_date = ?',
      [targetDate]
    )[0];

    assert.strictEqual(reservation.status, 'RESERVED_CORRECTION');
    assert.strictEqual(publication.status, 'PUBLISHED');
    assert.strictEqual(persisted.injuries_2026, -1);
    assert.match(sentPayload.text, /ryucel\.github\.io\/trafik_curated\/bulletins\/2099-12-26\//);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = originalChatId;
    if (originalBaseUrl === undefined) delete process.env.PUBLIC_BULLETIN_BASE_URL;
    else process.env.PUBLIC_BULLETIN_BASE_URL = originalBaseUrl;
    executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  }
}

async function testFailedCorrectionKeepsPublishedStateAndCanBeRetried() {
  const targetDate = '2099-12-25';
  executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  executeDb(`
    INSERT INTO bulletins (
      bulletin_date, title, content_markdown, content_telegram, data_period,
      fatal_accidents_2026, deaths_2026, injuries_2026, published_telegram
    ) VALUES (?, 'Published bulletin', 'Published', 'Published', 'Published', 0, 0, 0, 1)
  `, [targetDate]);

  try {
    const bot = new TelegramBotService();
    const first = await bot.reserveDailyBroadcast(targetDate, 'cancelled-correction', true);
    const second = await bot.reserveDailyBroadcast(targetDate, 'retry-correction', true);
    const staleAttempt = await bot.sendDailyBroadcast(true, targetDate, 'cancelled-correction');
    const released = await bot.releaseDailyBroadcast(targetDate, 'retry-correction');
    const row = queryDb(
      'SELECT published_telegram, notable_observation FROM bulletins WHERE bulletin_date = ?',
      [targetDate]
    )[0];
    const ordinaryRetry = await bot.reserveDailyBroadcast(targetDate, 'ordinary-retry');

    assert.strictEqual(first.status, 'RESERVED_CORRECTION');
    assert.strictEqual(second.status, 'RESERVED_CORRECTION');
    assert.strictEqual(staleAttempt.status, 'ALREADY_PUBLISHED');
    assert.strictEqual(released.status, 'RELEASED_CORRECTION');
    assert.strictEqual(row.published_telegram, 1);
    assert.strictEqual(row.notable_observation, 'CORRECTION_RELEASED');
    assert.strictEqual(ordinaryRetry.status, 'ALREADY_PUBLISHED');
  } finally {
    executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  }
}

async function testSuccessfulPublicationIsPersisted() {
  const targetDate = '2099-12-30';
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;
  let sendCount = 0;
  executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);

  globalThis.fetch = async () => {
    sendCount += 1;
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = 'test-chat';

  try {
    const bot = new TelegramBotService();
    const reservation = await bot.reserveDailyBroadcast(targetDate, 'persist-run');
    const first = await bot.sendDailyBroadcast(true, targetDate, 'persist-run');
    const second = await bot.sendDailyBroadcast(true, targetDate, 'persist-run');
    const saved = queryDb(
      'SELECT published_telegram FROM bulletins WHERE bulletin_date = ?',
      [targetDate]
    )[0];

    assert.strictEqual(reservation.status, 'RESERVED');
    assert.strictEqual(first.status, 'PUBLISHED');
    assert.strictEqual(second.status, 'ALREADY_PUBLISHED');
    assert.strictEqual(saved.published_telegram, 1);
    assert.strictEqual(sendCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = originalChatId;
    executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  }
}

function testWorkflowPassesTargetDateToEveryDateSensitiveStep() {
  const workflow = fs.readFileSync('.github/workflows/shadow-pilot.yml', 'utf8');
  const bindings = workflow.match(/PILOT_TARGET_DATE: \$\{\{ inputs\.target_date \}\}/g) || [];
  const publicUrlBindings = workflow.match(/PUBLIC_BULLETIN_BASE_URL: \$\{\{ vars\.PUBLIC_BULLETIN_BASE_URL \}\}/g) || [];
  assert.strictEqual(bindings.length, 4);
  assert.strictEqual(publicUrlBindings.length, 2);
  assert.match(workflow, /correction_republish:\s+[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(workflow, /ALLOW_CORRECTION_REPUBLISH: \$\{\{ inputs\.correction_republish \}\}/);
  assert.match(
    workflow,
    /- name: Execute Daily Shadow Production Pilot\s+if: \$\{\{ !\(github\.event_name == 'workflow_dispatch' && inputs\.correction_republish == true\) \}\}/
  );

  const reserve = workflow.indexOf('Reserve daily Telegram bulletin');
  const persistReservation = workflow.indexOf('Commit and Push Snapshot & Publication Reservation');
  const publish = workflow.indexOf('Publish daily Telegram bulletin');
  const persistPublication = workflow.indexOf('Commit successful Telegram publication state');
  assert.ok(reserve !== -1 && publish !== -1);
  assert.ok(reserve < persistReservation && persistReservation < publish && publish < persistPublication);
  assert.match(workflow, /if: \$\{\{ always\(\) && steps\.reserve_broadcast\.outcome == 'success'/);
}

function testScheduledRunPublishesWithoutManualDispatch() {
  const workflow = fs.readFileSync('.github/workflows/shadow-pilot.yml', 'utf8');

  // The daily cron must reach both broadcast steps on its own; requiring a manual dispatch
  // is what silently stopped the bulletin from going out.
  const scheduledGuards = workflow.match(
    /github\.event_name == 'schedule' && vars\.TELEGRAM_AUTO_PUBLISH != 'false'/g
  ) || [];
  assert.strictEqual(scheduledGuards.length, 2, 'both reserve and publish steps must run on schedule');

  // A scheduled run carries no human approval, so it must not claim one.
  assert.match(
    workflow,
    /TELEGRAM_APPROVAL_SOURCE: \$\{\{ github\.event_name == 'workflow_dispatch' && 'HUMAN' \|\| 'SCHEDULED' \}\}/
  );
}

function testSnapshotCommitDoesNotSuppressThePagesBuild() {
  const workflow = fs.readFileSync('.github/workflows/shadow-pilot.yml', 'utf8');
  const pages = fs.readFileSync('.github/workflows/pages.yml', 'utf8');

  // pages.yml builds the public bulletin that the Telegram message links to, and it only
  // triggers on a push touching a bulletin. A [skip ci] marker on the snapshot commit
  // silently stops that build and every published link 404s.
  assert.match(pages, /paths:[\s\S]*?data\/pilot\/\*\*\/bulletin\.md/);
  const snapshotCommit = workflow.match(
    /commit_message: "chore\(pilot\): automated daily shadow pilot snapshot[^"]*"/
  );
  assert.ok(snapshotCommit, 'snapshot commit message must be present');
  assert.doesNotMatch(snapshotCommit[0], /\[skip ci\]/);

  // The snapshot must be committed before the broadcast, so the page exists by the time
  // the link is sent.
  assert.ok(
    workflow.indexOf('Commit and Push Snapshot & Publication Reservation')
      < workflow.indexOf('Publish daily Telegram bulletin')
  );
}

function testUnattendedRunPublishesReviewRequiredButNeverDoNotPublish() {
  const bot = fs.readFileSync('src/telegram/bot.js', 'utf8');

  // REVIEW_REQUIRED items already travel through the bulletin labelled UNVERIFIED, so an
  // unattended run may publish them; only a death-count contradiction stops the broadcast.
  assert.match(bot, /AUTO_PUBLISHABLE_SAFETY_CLASSES = \['PUBLIC_SAFE', 'REVIEW_REQUIRED'\]/);
  assert.match(bot, /!AUTO_PUBLISHABLE_SAFETY_CLASSES\.includes\(bulletin\.safety_class\)/);
  assert.match(bot, /if \(bulletin\.safety_class === 'DO_NOT_PUBLISH'\)/);

  // Duplicate protection must cover unattended runs, which never set isApprovedByHuman.
  assert.match(bot, /if \(isApprovedByHuman \|\| reservationId\) \{/);
}

function testInjuryOnlyConflictDoesNotBlockPublication() {
  const extractor = fs.readFileSync('src/ingestion/accident_extractor.js', 'utf8');
  const agent = fs.readFileSync('src/agents/bulletin_agent.js', 'utf8');

  // A discrepancy in injury counts must not be filed as a death-count conflict, because
  // only death-count conflicts contradict the published fatality statistics.
  assert.match(extractor, /const deathsConflict = matchedAccident\.death_count !== deathCount;/);
  assert.match(extractor, /deathsConflict \? 'CONFLICTING_DEATH_COUNT' : 'CONFLICTING_INJURY_COUNT'/);

  // The bulletin blocks on death conflicts only; injury conflicts downgrade to REVIEW_REQUIRED.
  const blockingQuery = /issue_type = 'CONFLICTING_DEATH_COUNT'`\)\[0\]\?\.cnt \|\| 0;/;
  assert.match(agent, blockingQuery);
  assert.match(agent, /pendingInjuryConflicts[\s\S]*?'CONFLICTING_INJURY_COUNT'/);
  assert.match(agent, /pendingInjuryConflicts > 0\) \{\s*safetyClass = 'REVIEW_REQUIRED';/);
}

function testProjectDoesNotAdvertiseNonexistentDomain() {
  const fetcher = fs.readFileSync('src/ingestion/article_fetcher.js', 'utf8');
  assert.doesNotMatch(fetcher, /kktctrafik\.org/);
}

async function testPublicBotCommandsUseOfficialJulyTotals() {
  const bot = new TelegramBotService();
  const monitor = await bot.handleCommand('/2026');
  const history = await bot.handleCommand('/history');

  assert.match(monitor, /Can Kaybı\*\*: 23/);
  assert.match(monitor, /Ölümlü Kaza\*\*: 19/);
  assert.doesNotMatch(monitor, /Can Kaybı\*\*: (?:29|31|32)/);
  assert.match(history, /Ocak-Temmuz\): 23 Can Kaybı/);
}

async function testPublicAnalyticsDoNotExposePollutedBreakdowns() {
  const trends = await AnalyticsEngine.getYearlyTrends();
  const current = trends.find(item => item.year === 2026);
  const bot = new TelegramBotService();

  assert.strictEqual(current.deaths, 23);
  assert.strictEqual(current.fatal_accidents, 19);
  assert.deepStrictEqual(await AnalyticsEngine.getDistrictStats(), []);
  assert.deepStrictEqual(await AnalyticsEngine.getCauseStats(), []);
  assert.deepStrictEqual(await AnalyticsEngine.getMonthlyDistribution(), []);
  assert.match(await bot.handleCommand('/week'), /henüz yayıma hazır değil/);
  assert.match(await bot.handleCommand('/districts'), /henüz yayıma hazır değil/);
  assert.match(await bot.handleCommand('/causes'), /henüz yayıma hazır değil/);
  assert.match(await bot.handleCommand('/hotspots'), /henüz yayıma hazır değil/);
}

async function testImpossibleTargetDateIsRejected() {
  await assert.rejects(
    () => BulletinAgent.generateDailyBulletin('2026-02-31'),
    /Invalid bulletin target date/
  );
}

async function testPublicationReservationBlocksAnotherRun() {
  const targetDate = '2099-12-29';
  executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  try {
    const bot = new TelegramBotService();
    const first = await bot.reserveDailyBroadcast(targetDate, 'run-one');
    const second = await bot.reserveDailyBroadcast(targetDate, 'run-two');
    assert.strictEqual(first.status, 'RESERVED');
    assert.strictEqual(second.status, 'ALREADY_RESERVED');
  } finally {
    executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  }
}

async function testLivePublicationRequiresReservation() {
  const targetDate = '2099-12-28';
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;
  let sendCount = 0;
  executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  globalThis.fetch = async () => {
    sendCount += 1;
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = 'test-chat';

  try {
    const result = await new TelegramBotService().sendDailyBroadcast(true, targetDate);
    assert.strictEqual(result.status, 'RESERVATION_REQUIRED');
    assert.strictEqual(sendCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = originalChatId;
    executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  }
}

async function testFailedAttemptCanReleaseItsReservation() {
  const targetDate = '2099-12-27';
  executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  try {
    const bot = new TelegramBotService();
    assert.strictEqual((await bot.reserveDailyBroadcast(targetDate, 'failed-run')).status, 'RESERVED');
    assert.strictEqual((await bot.releaseDailyBroadcast(targetDate, 'failed-run')).status, 'RELEASED');
    assert.strictEqual((await bot.reserveDailyBroadcast(targetDate, 'retry-run')).status, 'RESERVED');
  } finally {
    executeDb('DELETE FROM bulletins WHERE bulletin_date = ?', [targetDate]);
  }
}

await testBulletinUsesTargetDatePeriod();
console.log('✓ Live bulletin uses the requested target-date period');
await testTelegramBulletinUsesDefaultPagesLink();
console.log('✓ Telegram bulletin uses the default GitHub Pages link');
await testTelegramBulletinUsesConfiguredPagesUrl();
console.log('✓ Telegram bulletin uses the configured GitHub Pages URL');
await testBulletinListsTheReportDayAccidents();
console.log('✓ Bulletin lists the report day accidents, badged by verification status');
testBulletinDoesNotFabricateAnalysis();
console.log('✓ Bulletin no longer carries a fabricated analysis section');
await testPublishedDateIsNotSentTwice();
console.log('✓ A published date cannot be sent twice');
await testApprovedCorrectionCanRepublishWithPagesLink();
console.log('✓ An explicitly approved correction can be republished with its Pages link');
await testFailedCorrectionKeepsPublishedStateAndCanBeRetried();
console.log('✓ A failed or cancelled correction preserves duplicate protection');
await testSuccessfulPublicationIsPersisted();
console.log('✓ A successful publication is persisted before a retry');
testWorkflowPassesTargetDateToEveryDateSensitiveStep();
console.log('✓ Workflow passes target_date to every date-sensitive step');
testScheduledRunPublishesWithoutManualDispatch();
console.log('✓ The daily scheduled run publishes without a manual dispatch');
testSnapshotCommitDoesNotSuppressThePagesBuild();
console.log('✓ The snapshot commit does not suppress the public bulletin build');
testUnattendedRunPublishesReviewRequiredButNeverDoNotPublish();
console.log('✓ An unattended run publishes REVIEW_REQUIRED but never DO_NOT_PUBLISH');
testInjuryOnlyConflictDoesNotBlockPublication();
console.log('✓ An injury-only discrepancy does not block publication');
testProjectDoesNotAdvertiseNonexistentDomain();
console.log('✓ The fetcher does not advertise the nonexistent domain');
await testPublicBotCommandsUseOfficialJulyTotals();
console.log('✓ Public bot commands use the official July totals');
await testPublicAnalyticsDoNotExposePollutedBreakdowns();
console.log('✓ Public analytics hide polluted raw breakdowns');
await testImpossibleTargetDateIsRejected();
console.log('✓ Impossible target dates are rejected');
await testPublicationReservationBlocksAnotherRun();
console.log('✓ A durable reservation blocks a second workflow run');
await testLivePublicationRequiresReservation();
console.log('✓ Live publication cannot bypass its reservation');
await testFailedAttemptCanReleaseItsReservation();
console.log('✓ A definitive failed attempt can release its reservation');
