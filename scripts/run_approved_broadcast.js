const targetDate = process.argv.find(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg))
  || new Date().toISOString().substring(0, 10);
const reservationId = process.env.GITHUB_RUN_ID;

if (process.env.TELEGRAM_LIVE_ENABLED !== 'true') {
  console.log('[LiveBroadcast] Disabled: set repository variable TELEGRAM_LIVE_ENABLED=true to publish.');
  process.exit(0);
}

if (!reservationId) {
  console.error('[LiveBroadcast] Approved publication requires GITHUB_RUN_ID.');
  process.exit(1);
}

const { TelegramBotService } = await import('../src/telegram/bot.js');
const result = await new TelegramBotService().sendDailyBroadcast(true, targetDate, reservationId);
console.log(`[LiveBroadcast] ${targetDate}: ${result.status}${result.http_status ? ` (HTTP ${result.http_status})` : ''}`);

if (!['PUBLISHED', 'ALREADY_PUBLISHED'].includes(result.status)) {
  if (['FAILED', 'SIMULATED', 'BLOCKED', 'REQUIRES_APPROVAL'].includes(result.status)) {
    const release = await new TelegramBotService().releaseDailyBroadcast(targetDate, reservationId);
    console.log(`[LiveBroadcast] ${targetDate} reservation cleanup: ${release.status}`);
  }
  console.error(`[LiveBroadcast] Publication did not complete: ${result.error || result.status}`);
  process.exit(1);
}
