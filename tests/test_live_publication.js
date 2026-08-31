import assert from 'assert';
import fs from 'fs';
import { BulletinAgent } from '../src/agents/bulletin_agent.js';
import { executeDb, queryDb } from '../src/lib/db.js';
import { TelegramBotService } from '../src/telegram/bot.js';

async function testBulletinUsesTargetDatePeriod() {
  const targetDate = '2026-08-31';
  const bulletin = await BulletinAgent.generateDailyBulletin(targetDate);
  const expected = queryDb(`
    SELECT COALESCE(SUM(death_count), 0) AS deaths
    FROM accidents
    WHERE event_date BETWEEN '2026-01-01' AND ?
  `, [targetDate])[0].deaths;

  assert.strictEqual(bulletin.deaths2026, expected);
  assert.match(bulletin.telegram, /Ocak–Ağustos YTD/);
  assert.match(bulletin.markdown, /1 Ocak 2026 – 31 Ağustos 2026/);
}

async function testTelegramBulletinOmitsUndeployedPublicLink() {
  const bulletin = await BulletinAgent.generateDailyBulletin('2026-08-31');
  assert.doesNotMatch(bulletin.telegram, /kktctrafik\.org\/bulletins/);
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
    const first = await bot.sendDailyBroadcast(true, targetDate);
    const second = await bot.sendDailyBroadcast(true, targetDate);
    const saved = queryDb(
      'SELECT published_telegram FROM bulletins WHERE bulletin_date = ?',
      [targetDate]
    )[0];

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
  assert.strictEqual(bindings.length, 4);

  const reserve = workflow.indexOf('Reserve approved Telegram bulletin');
  const persistReservation = workflow.indexOf('Commit and Push Snapshot & Publication Reservation');
  const publish = workflow.indexOf('Publish approved Telegram bulletin');
  const persistPublication = workflow.indexOf('Commit successful Telegram publication state');
  assert.ok(reserve < persistReservation && persistReservation < publish && publish < persistPublication);
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

await testBulletinUsesTargetDatePeriod();
console.log('✓ Live bulletin uses the requested target-date period');
await testTelegramBulletinOmitsUndeployedPublicLink();
console.log('✓ Telegram bulletin omits the undeployed public link');
await testPublishedDateIsNotSentTwice();
console.log('✓ A published date cannot be sent twice');
await testSuccessfulPublicationIsPersisted();
console.log('✓ A successful publication is persisted before a retry');
testWorkflowPassesTargetDateToEveryDateSensitiveStep();
console.log('✓ Workflow passes target_date to every date-sensitive step');
await testImpossibleTargetDateIsRejected();
console.log('✓ Impossible target dates are rejected');
await testPublicationReservationBlocksAnotherRun();
console.log('✓ A durable reservation blocks a second workflow run');
