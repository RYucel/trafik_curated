const targetDate = process.argv.find(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg))
  || new Date().toISOString().substring(0, 10);
const reservationId = process.env.GITHUB_RUN_ID;

if (process.env.TELEGRAM_LIVE_ENABLED !== 'true') {
  console.log('[LiveBroadcast] Reservation disabled because live publication is disabled.');
  process.exit(0);
}

if (!reservationId) {
  console.error('[LiveBroadcast] Publication reservation requires GITHUB_RUN_ID.');
  process.exit(1);
}

const { TelegramBotService } = await import('../src/telegram/bot.js');
const allowCorrectionRepublish = process.env.ALLOW_CORRECTION_REPUBLISH === 'true';
const result = await new TelegramBotService().reserveDailyBroadcast(
  targetDate,
  reservationId,
  allowCorrectionRepublish
);
console.log(`[LiveBroadcast] ${targetDate} reservation: ${result.status}`);

if (!['RESERVED', 'RESERVED_CORRECTION', 'ALREADY_PUBLISHED'].includes(result.status)) {
  console.error(`[LiveBroadcast] Reservation did not complete: ${result.error || result.status}`);
  process.exit(1);
}
