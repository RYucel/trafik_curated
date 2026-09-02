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

async function testTelegramBulletinListsVerifiedTrafficNewsLinksForTargetDay() {
  const targetDate = '2099-12-24';
  const articleUrl = 'https://example.test/traffic-news-2099-12-24';
  const articleTitle = 'Lefkoşa çevre yolunda yaralanmalı trafik kazası';
  const verifiedAccidentId = 'ACC-20991224-TEST-VERIFIED';
  const unverifiedArticleUrl = 'https://example.test/unverified-traffic-news-2099-12-24';
  const unverifiedArticleTitle = 'Doğrulanmamış trafik haberi';
  const unverifiedAccidentId = 'ACC-20991224-TEST-UNVERIFIED';
  try {
    executeDb('DELETE FROM news_articles WHERE url = ?', [articleUrl]);
    executeDb('DELETE FROM news_articles WHERE url = ?', [unverifiedArticleUrl]);
    executeDb('DELETE FROM accidents WHERE accident_id IN (?, ?)', [verifiedAccidentId, unverifiedAccidentId]);
    executeDb(`
      INSERT INTO news_articles (
        source_id, source_name, title, url, published_at, content_hash,
        traffic_relevance, relevance_score, processing_status
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0.98, 'EXTRACTED')
    `, [
      'test-source',
      'Test Haber',
      articleTitle,
      articleUrl,
      'Thu, 24 Dec 2099 09:15:00 +0200',
      'test-traffic-news-2099-12-24'
    ]);
    executeDb(`
      INSERT INTO accidents (
        accident_id, event_date, year, month, district, location_normalized,
        fatal, death_count, injury_count, source_type, source_tier, source_name,
        source_url, record_type, verification_status, content_hash
      ) VALUES (?, ?, 2099, 12, 'Lefkoşa', 'Test konumu', 0, 0, 1, 'Established Media',
        'TIER_3_ESTABLISHED_MEDIA', 'Test Haber', ?, 'INDIVIDUAL_ACCIDENT', 'VERIFIED', ?)
    `, [verifiedAccidentId, targetDate, articleUrl, 'test-verified-accident-2099-12-24']);
    executeDb(`
      INSERT INTO news_articles (
        source_id, source_name, title, url, published_at, content_hash,
        traffic_relevance, relevance_score, processing_status
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0.98, 'EXTRACTED')
    `, [
      'test-source',
      'Test Haber',
      unverifiedArticleTitle,
      unverifiedArticleUrl,
      'Thu, 24 Dec 2099 08:15:00 +0200',
      'test-unverified-traffic-news-2099-12-24'
    ]);
    executeDb(`
      INSERT INTO accidents (
        accident_id, event_date, year, month, district, location_normalized,
        fatal, death_count, injury_count, source_type, source_tier, source_name,
        source_url, record_type, verification_status, content_hash
      ) VALUES (?, ?, 2099, 12, 'Lefkoşa', 'Test konumu', 0, 0, 1, 'Established Media',
        'TIER_3_ESTABLISHED_MEDIA', 'Test Haber', ?, 'INDIVIDUAL_ACCIDENT', 'UNVERIFIED', ?)
    `, [unverifiedAccidentId, targetDate, unverifiedArticleUrl, 'test-unverified-accident-2099-12-24']);
    const bulletin = await BulletinAgent.generateDailyBulletin(targetDate);
    assert.match(bulletin.telegram, /Günlük Trafik Haberleri \(Yerel Tarih\)/);
    assert.match(bulletin.telegram, new RegExp(articleTitle));
    assert.match(bulletin.telegram, new RegExp(articleUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(bulletin.markdown, new RegExp(articleUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(bulletin.telegram, new RegExp(unverifiedArticleTitle));
    assert.doesNotMatch(bulletin.telegram, new RegExp(unverifiedArticleUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    executeDb('DELETE FROM news_articles WHERE url = ?', [articleUrl]);
    executeDb('DELETE FROM news_articles WHERE url = ?', [unverifiedArticleUrl]);
    executeDb('DELETE FROM accidents WHERE accident_id IN (?, ?)', [verifiedAccidentId, unverifiedAccidentId]);
  }
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

  const reserve = workflow.indexOf('Reserve approved Telegram bulletin');
  const persistReservation = workflow.indexOf('Commit and Push Snapshot & Publication Reservation');
  const publish = workflow.indexOf('Publish approved Telegram bulletin');
  const persistPublication = workflow.indexOf('Commit successful Telegram publication state');
  assert.ok(reserve < persistReservation && persistReservation < publish && publish < persistPublication);
  assert.match(workflow, /if: \$\{\{ always\(\) && steps\.reserve_broadcast\.outcome == 'success'/);
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
await testTelegramBulletinListsVerifiedTrafficNewsLinksForTargetDay();
console.log('✓ Telegram bulletin lists verified traffic-news links for the target day');
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
