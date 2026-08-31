const targetDate = process.argv.find(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg))
  || new Date().toISOString().substring(0, 10);

if (process.env.TELEGRAM_LIVE_ENABLED !== 'true') {
  console.log('[LiveBroadcast] Disabled: set repository variable TELEGRAM_LIVE_ENABLED=true to publish.');
  process.exit(0);
}

const { TelegramBotService } = await import('../src/telegram/bot.js');
const result = await new TelegramBotService().sendDailyBroadcast(true, targetDate);
console.log(`[LiveBroadcast] ${targetDate}: ${result.status}`);

if (result.status !== 'PUBLISHED') {
  console.error(`[LiveBroadcast] Publication did not complete: ${result.status}`);
  process.exit(1);
}
