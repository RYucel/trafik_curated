import fs from 'fs';
import path from 'path';

function inspectPilotStatus() {
  console.log('===========================================================');
  console.log('📊 KKTC TRAFFIC INTELLIGENCE — SHADOW PILOT STATUS INSPECTOR');
  console.log('===========================================================');

  const pilotDir = path.join(process.cwd(), 'data', 'pilot');
  const statusFile = path.join(pilotDir, 'pilot_status.json');

  let globalStatus = {};
  if (fs.existsSync(statusFile)) {
    try {
      globalStatus = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    } catch (e) {
      console.warn('Warning: pilot_status.json corrupt or unreadable');
    }
  }

  console.log(`\n📌 Pilot Start Date: ${globalStatus.pilot_start_date || '2026-08-12'}`);
  console.log(`📌 Telegram Mode:    ${globalStatus.telegram_mode || 'SHADOW_MODE_GATED'}`);
  console.log(`📌 Days Completed:   ${globalStatus.days_completed || 0} / ${globalStatus.total_days || 7}`);
  console.log(`📌 Latest Status:    ${globalStatus.latest_run_status || 'NOT_RUN'}\n`);

  const startDate = new Date('2026-08-12');
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = d.toISOString().substring(0, 10);
    const snapshotPath = path.join(pilotDir, dateStr, 'ingestion.json');

    let dayStatus = 'PENDING_RUN';
    let articlesSeen = '-';
    let newAccidents = '-';
    let totalAccidents = '-';
    let errors = '-';

    if (fs.existsSync(snapshotPath)) {
      try {
        const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
        dayStatus = 'COMPLETED';
        articlesSeen = snap.articles_seen ?? snap.articles_discovered ?? 0;
        newAccidents = snap.new_canonical_accidents_this_run ?? snap.new_canonical_accidents ?? 0;
        totalAccidents = snap.total_canonical_accidents ?? 513;
        errors = snap.errors ? snap.errors.length : 0;
      } catch (e) {
        dayStatus = 'FAILED';
      }
    } else {
      const todayStr = new Date().toISOString().substring(0, 10);
      if (dateStr < todayStr) {
        dayStatus = 'MISSED';
      } else {
        dayStatus = 'NOT_RUN';
      }
    }

    days.push({
      day: i + 1,
      date: dateStr,
      status: dayStatus,
      articles: articlesSeen,
      new_accidents: newAccidents,
      total_db_accidents: totalAccidents,
      errors: errors
    });
  }

  console.table(days);

  console.log('\n✓ Pilot Status Inspection Complete.');
}

inspectPilotStatus();
