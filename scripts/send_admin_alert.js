// Operational health alert for the daily run.
//
// The 22-30 September outage was invisible for nine days: the run reported VERIFIED_RUN with
// no errors and the bulletin went out stating there were no accidents. The run is now recorded
// as degraded, but someone still has to read the bulletin to notice. This pushes the problem
// out instead.
//
// Goes to TELEGRAM_ADMIN_CHAT_ID, never to the public channel — subscribers should not receive
// provider errors. Without that secret the alert is skipped rather than redirected.
//
// Usage:
//   node scripts/send_admin_alert.js [YYYY-MM-DD]        # health-check the day's snapshot
//   node scripts/send_admin_alert.js --failure "reason"  # the workflow itself failed
//   node scripts/send_admin_alert.js --test             # prove delivery works
//
// --test exists because a real alert only fires when something is broken: without it the
// first proof that TELEGRAM_ADMIN_CHAT_ID is correct would be a morning it was needed.
import fs from 'node:fs';
import path from 'node:path';

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || '';
const publicChatId = process.env.TELEGRAM_CHAT_ID || '';
// Overridable so the delivery path itself can be exercised against a stub.
const apiBase = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';

const targetDate = process.argv.find(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg))
  || process.env.PILOT_TARGET_DATE
  || new Date().toISOString().substring(0, 10);

const testMode = process.argv.includes('--test');
const failureIndex = process.argv.indexOf('--failure');
const workflowFailure = failureIndex !== -1
  ? (process.argv[failureIndex + 1] || 'Workflow step failed')
  : null;

function runUrl() {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  return server && repo && runId ? `${server}/${repo}/actions/runs/${runId}` : null;
}

function buildReport() {
  if (testMode) {
    return {
      alert: true,
      title: 'Yönetici uyarı kanalı testi',
      lines: [
        'Bu bir testtir — sistemde bir sorun yok.',
        'Bu mesajı gördüysen bozulma uyarıları sana ulaşıyor demektir.'
      ]
    };
  }

  if (workflowFailure) {
    return {
      alert: true,
      title: 'Günlük koşu BAŞARISIZ',
      lines: [`Hata: ${workflowFailure}`, 'Bugün için anlık görüntü üretilmemiş olabilir.']
    };
  }

  const snapshotDir = path.join(process.cwd(), 'data', 'pilot', targetDate);
  const ingestionPath = path.join(snapshotDir, 'ingestion.json');

  if (!fs.existsSync(ingestionPath)) {
    return {
      alert: true,
      title: 'Günlük anlık görüntü ÜRETİLMEDİ',
      lines: [`${targetDate} için ingestion.json bulunamadı.`, 'Toplama adımı çalışmamış olabilir.']
    };
  }

  const metrics = JSON.parse(fs.readFileSync(ingestionPath, 'utf8'));
  const llm = metrics.llm_usage || {};
  const errorsPath = path.join(snapshotDir, 'errors.json');
  let errors = [];
  if (fs.existsSync(errorsPath)) {
    try {
      errors = JSON.parse(fs.readFileSync(errorsPath, 'utf8'));
    } catch {
      errors = [{ error: 'errors.json okunamadı' }];
    }
  }

  // Two signals, because extraction_degraded only exists on snapshots written after this
  // outage was fixed. A provider string of heuristic_fallback means the same thing and is
  // what the September snapshots actually recorded.
  const degraded = llm.extraction_degraded === true
    || String(llm.provider || '').includes('heuristic_fallback');
  const feedsFailed = metrics.feeds_failed || 0;
  if (!degraded && feedsFailed === 0 && errors.length === 0) {
    return { alert: false };
  }

  const lines = [];
  if (degraded) {
    lines.push('⛔ Yapılandırılmış çıkarım DEVRE DIŞI — bugün hiçbir kaza kaydı çıkarılamadı.');
    if (llm.total_calls) lines.push(`Çağrı: ${llm.fallback_calls || 0}/${llm.total_calls} heuristiğe düştü`);
    const deferred = metrics.extraction_review_required_this_run || 0;
    if (deferred > 0) lines.push(`İşlenemeyen trafik haberi: ${deferred}`);
    if (llm.last_provider_error) lines.push(`Sağlayıcı hatası: ${llm.last_provider_error}`);
  }
  if (feedsFailed > 0) lines.push(`Başarısız RSS kaynağı: ${feedsFailed}/${metrics.feeds_checked || 0}`);
  if (errors.length > 0 && !degraded) lines.push(`Koşu hatası: ${errors.length}`);

  lines.push(`Toplanan haber: ${metrics.articles_seen || 0} · yeni kaza: ${metrics.new_canonical_accidents_this_run || 0}`);

  return {
    alert: true,
    title: degraded ? 'Çıkarım servisi kullanılamıyor' : 'Günlük koşu uyarı üretti',
    lines
  };
}

const report = buildReport();

if (!report.alert) {
  console.log(`[AdminAlert] ${targetDate}: sorun yok, uyarı gönderilmedi.`);
  process.exit(0);
}

const url = runUrl();
const message = [
  `⚠️ KKTC TRAFİK — ${report.title}`,
  `📅 ${targetDate}`,
  '',
  ...report.lines,
  ...(url ? ['', `🔗 ${url}`] : [])
].join('\n');

if (!token || !adminChatId) {
  // Name the variable that is actually missing. Blaming the wrong one sends someone looking
  // in the wrong place, which is the habit this whole alerting change exists to break.
  const missing = [
    !token ? 'TELEGRAM_BOT_TOKEN' : null,
    !adminChatId ? 'TELEGRAM_ADMIN_CHAT_ID' : null
  ].filter(Boolean);
  // Deliberately not falling back to the public channel.
  console.log(`[AdminAlert] Eksik secret: ${missing.join(', ')} — uyarı gönderilmedi. İçerik:`);
  console.log(message);
  process.exit(testMode ? 1 : 0);
}

// A chat id does not say whether it is a person, a group or a channel, and the sign of the
// number is a convention, not an answer. Ask Telegram instead of guessing.
async function getChat(id) {
  if (!id) return null;
  try {
    const res = await fetch(
      `${apiBase}/bot${token}/getChat?chat_id=${encodeURIComponent(id)}`
    );
    const body = await res.json().catch(() => ({}));
    return body.ok ? body.result : null;
  } catch {
    return null;
  }
}

function describeChat(chat) {
  if (!chat) return 'sorgulanamadı';
  const name = chat.title
    || (chat.username ? '@' + chat.username : null)
    || [chat.first_name, chat.last_name].filter(Boolean).join(' ')
    || '(isimsiz)';
  const typeLabel = {
    private: 'ÖZEL SOHBET (tek kişi)',
    group: 'GRUP',
    supergroup: 'SÜPER GRUP',
    channel: 'KANAL'
  }[chat.type] || chat.type;
  return `${typeLabel} — "${name}"`;
}

if (testMode) {
  console.log('[AdminAlert] Hedef sohbetlerin gerçek türü:');
  console.log(`  TELEGRAM_CHAT_ID       (bülten): ${describeChat(await getChat(publicChatId))}`);
  console.log(`  TELEGRAM_ADMIN_CHAT_ID (uyarı) : ${describeChat(await getChat(adminChatId))}`);
}

if (adminChatId === publicChatId) {
  // The rule being protected is "subscribers must not receive provider errors". A private
  // chat has no subscribers — it is the operator talking to their own bot — so the alert is
  // allowed through with a warning. Once the bulletin moves to a real channel or group this
  // starts refusing again on its own, with no flag anyone has to remember to unset.
  const shared = await getChat(adminChatId);
  if (shared && shared.type === 'private') {
    console.warn('[AdminAlert] Uyarı bültenle aynı özel sohbete gidiyor. '
      + 'Burada abone olmadığı için izin verildi; bülten bir kanala taşındığında bu engellenecek.');
  } else {
    console.error(`[AdminAlert] TELEGRAM_ADMIN_CHAT_ID bültenin gittiği yerle aynı (${describeChat(shared)}); `
      + 'aboneler operasyonel hata görmemeli, uyarı gönderilmedi.');
    // A test that reports success while nothing was delivered is the failure it exists to catch.
    process.exit(testMode ? 1 : 0);
  }
}

const response = await fetch(`${apiBase}/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: adminChatId, text: message })
});

if (response.ok) {
  console.log(`[AdminAlert] ${targetDate}: uyarı gönderildi.`);
} else {
  const detail = await response.text().catch(() => '');
  console.error(`[AdminAlert] Gönderilemedi (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  if (response.status === 403) {
    console.error('[AdminAlert] 403 genellikle botun sana henüz yazamadığı anlamına gelir: '
      + 'Telegram\'da bota /start gönder, sonra tekrar dene.');
  }
  // A real alert must never fail the pipeline; a deliberate test must report the failure.
  if (testMode) process.exit(1);
}
