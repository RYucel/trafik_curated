const targetDate = process.argv.find(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg))
  || new Date().toISOString().substring(0, 10);

if (process.env.TELEGRAM_LIVE_ENABLED !== 'true') {
  console.log('[LiveBroadcast] Disabled: set repository variable TELEGRAM_LIVE_ENABLED=true to publish.');
  process.exit(0);
}

const { TelegramBotService } = await import('../src/telegram/bot.js');
const result = await new TelegramBotService().sendDailyBroadcast(true, targetDate);
console.log(`[LiveBroadcast] ${targetDate}: ${result.status}${result.http_status ? ` (HTTP ${result.http_status})` : ''}`);

if (!['PUBLISHED', 'ALREADY_PUBLISHED'].includes(result.status)) {
  console.error(`[LiveBroadcast] Publication did not complete: ${result.error || result.status}`);
  process.exit(1);
}
