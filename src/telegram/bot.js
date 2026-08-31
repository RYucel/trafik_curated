// Telegram Bot Service for KKTC Traffic Intelligence
import dotenv from 'dotenv';
import { BulletinAgent } from '../agents/bulletin_agent.js';
import { AnalyticsEngine } from '../analytics/engine.js';
import { executeDb, queryDb } from '../lib/db.js';

dotenv.config();

function telegramPlainText(bulletin) {
  return bulletin.telegram.replace(/\*\*/g, '');
}

function persistBulletinState(bulletin, publishedState, observation) {
  return executeDb(`
    INSERT INTO bulletins (
      bulletin_date, title, content_markdown, content_telegram, data_period,
      fatal_accidents_2026, deaths_2026, injuries_2026, yoy_change_pct,
      notable_observation, sources_list_json, published_telegram
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bulletin_date) DO UPDATE SET
      title = excluded.title,
      content_markdown = excluded.content_markdown,
      content_telegram = excluded.content_telegram,
      data_period = excluded.data_period,
      fatal_accidents_2026 = excluded.fatal_accidents_2026,
      deaths_2026 = excluded.deaths_2026,
      injuries_2026 = excluded.injuries_2026,
      yoy_change_pct = excluded.yoy_change_pct,
      notable_observation = excluded.notable_observation,
      sources_list_json = excluded.sources_list_json,
      published_telegram = excluded.published_telegram
  `, [
    bulletin.targetDate,
    'KKTC TRAFİK GÜNLÜK BÜLTENİ',
    bulletin.markdown,
    telegramPlainText(bulletin),
    bulletin.data_period,
    bulletin.fatal2026,
    bulletin.deaths2026,
    bulletin.injuries2026 ?? -1,
    bulletin.yoyPct2025,
    observation,
    '[]',
    publishedState
  ]);
}

export class TelegramBotService {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
  }

  async handleCommand(commandText) {
    const cmd = commandText.trim().toLowerCase().split(' ')[0];

    switch (cmd) {
      case '/start':
        return `🚦 **KKTC Traffic Intelligence Telegram Botu**\n\n1975'ten günümüze KKTC trafik güvenliği verileri, 2026 günlük bültenleri ve istatistiki analiz platformu.\n\nKomutlar:\n/2026 - 2026 Can Kaybı Bilanço\n/today - Günlük Bülten\n/week - Son 7 Gün\n/history - 1975-2026 Tarihsel Trend\n/districts - İlçe Dağılımı\n/causes - Kaza Nedenleri\n/hotspots - Riskli Yollar\n/sources - Kaynak Şeffaflığı`;

      case '/2026': {
        const m = await AnalyticsEngine.get2026Monitor();
        const sign = m.yoy_change_pct >= 0 ? '+' : '';
        return `🚦 **KKTC TRAFİK 2026 BİLANÇOSU**\n📅 Dönem: ${m.data_period_label}\n\n☠️ **Can Kaybı**: ${m.deaths}\n🚨 **Ölümlü Kaza**: ${m.fatal_accidents}\n🏥 **Yaralı**: ${m.injuries ?? 'Doğrulanmış toplu sayı yayımlanmadı'}\n\n📅 **2025 Aynı Dönem**: ${m.same_period_2025.deaths} Can Kaybı\n📈 **Değişim**: ${sign}${m.yoy_change_pct}%\n\n⏱️ **Geçen Gün**: ${m.days_elapsed} gün\n📊 **Aylık Ortalama**: ${m.deaths_per_month} ölüm/ay\n\n*Son Güncelleme: 31 Temmuz 2026*`;
      }

      case '/today': {
        const bulletin = await BulletinAgent.generateDailyBulletin();
        if (bulletin.safety_class === 'DO_NOT_PUBLISH') {
          return `⚠️ **GÜNLÜK BÜLTEN YAYIMLANAMAZ (DO_NOT_PUBLISH)**\n\n${bulletin.safety_reason}\nLütfen /admin panelinden çelişkili kayıtları inceleyiniz.`;
        }
        return bulletin.telegram;
      }

      case '/week': {
        return `📅 **SON 7 GÜN TRAFİK RAPORU**\n\nDoğrulanmış haftalık toplu veri henüz yayıma hazır değil.`;
      }

      case '/districts': {
        const dists = await AnalyticsEngine.getDistrictStats();
        if (dists.length === 0) return `📍 **İLÇELERE GÖRE KAZA DAĞILIMI**\n\nDoğrulanmış ilçe kırılımı henüz yayıma hazır değil.`;
        let msg = `📍 **İLÇELERE GÖRE KAZA DAĞILIMI**\n\n`;
        dists.forEach(d => {
          msg += `• **${d.district}**: ${d.total_deaths} Can Kaybı (${d.fatal_accidents} Ölümlü Kaza)\n`;
        });
        return msg;
      }

      case '/causes': {
        const causes = await AnalyticsEngine.getCauseStats();
        if (causes.length === 0) return `⚠️ **BİLDİRİLEN KAZA NEDENLERİ**\n\nDoğrulanmış neden kırılımı henüz yayıma hazır değil.`;
        let msg = `⚠️ **BİLDİRİLEN KAZA NEDENLERİ**\n\n`;
        causes.slice(0, 5).forEach(c => {
          msg += `• **${c.cause_label}**: ${c.accident_count} Vaka (${c.death_count} Ölü)\n`;
        });
        return msg;
      }

      case '/hotspots': {
        return `📍 **YÜKSEK RİSKLİ YOL SEGMENTLERİ**\n\nDoğrulanmış konum kırılımı henüz yayıma hazır değil.`;
      }

      case '/history': {
        return `📈 **KKTC TRAFİK TARİHÇESİ (1975 - 2026)**\n\n• 1975-1984: Yıllık Ortalama 35 Can Kaybı\n• 1985-1994: Yıllık Ortalama 47 Can Kaybı\n• 1995-2004: Yıllık Ortalama 50 Can Kaybı (Zirve: 2004 - 76 Can Kaybı)\n• 2005-2014: Yıllık Ortalama 38 Can Kaybı\n• 2015-2024: Yıllık Ortalama 33 Can Kaybı\n• 2026 YTD (Ocak-Temmuz): 23 Can Kaybı`;
      }

      case '/sources': {
        return `🔎 **VERİ KAYNAKLARI VE DOĞRULAMA**\n\n1. Tier 1 (Resmi): KKTC PGM Polis Basın Subaylığı\n2. Tier 2 (Kurumsal Basın): TAK (Türk Ajansı Kıbrıs)\n3. Tier 3 (İkincil): Haber Siteleri\n\n*Platform bağımsız bir veri araştırma projesidir.*`;
      }

      default:
        return `Bilinmeyen komut. Kullanılabilir komutlar: /2026, /today, /week, /districts, /causes, /hotspots, /history, /sources`;
    }
  }

  async reserveDailyBroadcast(targetDate, reservationId, allowCorrectionRepublish = false) {
    if (!reservationId) return { status: 'RESERVATION_FAILED', error: 'Reservation ID is required' };
    const bulletin = await BulletinAgent.generateDailyBulletin(targetDate);
    if (bulletin.safety_class === 'DO_NOT_PUBLISH') {
      return { status: 'BLOCKED', reason: bulletin.safety_reason };
    }

    const existing = queryDb(
      'SELECT published_telegram, notable_observation FROM bulletins WHERE bulletin_date = ? LIMIT 1',
      [bulletin.targetDate]
    )[0];
    if (existing?.published_telegram === 1 && !allowCorrectionRepublish) {
      return { status: 'ALREADY_PUBLISHED' };
    }

    if (existing?.published_telegram === 1 && allowCorrectionRepublish) {
      const correctionNote = `CORRECTION_RESERVATION:${reservationId}`;
      const saved = executeDb(
        'UPDATE bulletins SET notable_observation = ? WHERE bulletin_date = ? AND published_telegram = 1',
        [correctionNote, bulletin.targetDate]
      );
      return saved.success && saved.rows_affected === 1
        ? { status: 'RESERVED_CORRECTION' }
        : { status: 'RESERVATION_FAILED', error: saved.error || 'Could not persist correction reservation' };
    }

    const reservationNote = `RESERVATION:${reservationId}`;
    if (existing?.published_telegram === -1) {
      return { status: existing.notable_observation === reservationNote ? 'RESERVED' : 'ALREADY_RESERVED' };
    }

    const saved = persistBulletinState(bulletin, -1, reservationNote);
    return saved.success
      ? { status: 'RESERVED' }
      : { status: 'RESERVATION_FAILED', error: saved.error || 'Could not persist publication reservation' };
  }

  async releaseDailyBroadcast(targetDate, reservationId) {
    if (!reservationId) return { status: 'RELEASE_FAILED', error: 'Reservation ID is required' };
    const released = executeDb(
      'DELETE FROM bulletins WHERE bulletin_date = ? AND published_telegram = -1 AND notable_observation = ?',
      [targetDate, `RESERVATION:${reservationId}`]
    );
    if (released.success && released.rows_affected === 1) return { status: 'RELEASED' };

    const correctionReleased = executeDb(
      `UPDATE bulletins
       SET notable_observation = 'CORRECTION_RELEASED'
       WHERE bulletin_date = ? AND published_telegram = 1 AND notable_observation = ?`,
      [targetDate, `CORRECTION_RESERVATION:${reservationId}`]
    );
    return correctionReleased.success && correctionReleased.rows_affected === 1
      ? { status: 'RELEASED_CORRECTION' }
      : { status: 'RELEASE_FAILED', error: correctionReleased.error || released.error || 'Matching reservation was not found' };
  }

  async sendDailyBroadcast(isApprovedByHuman = false, targetDate = undefined, reservationId = undefined) {
    const bulletin = await BulletinAgent.generateDailyBulletin(targetDate);

    if (isApprovedByHuman) {
      const existing = queryDb(
        'SELECT published_telegram, notable_observation FROM bulletins WHERE bulletin_date = ? LIMIT 1',
        [bulletin.targetDate]
      )[0];
      const normalReservation = `RESERVATION:${reservationId}`;
      const correctionReservation = `CORRECTION_RESERVATION:${reservationId}`;
      const hasCorrectionReservation = existing?.published_telegram === 1
        && reservationId
        && existing.notable_observation === correctionReservation;
      if (existing?.published_telegram === 1 && !hasCorrectionReservation) {
        console.log(`[TelegramBot] ${bulletin.targetDate} bulletin already published; duplicate skipped.`);
        return { status: 'ALREADY_PUBLISHED' };
      }
      if (this.token && this.chatId && !reservationId) {
        return { status: 'RESERVATION_REQUIRED' };
      }
      if (reservationId) {
        const hasNormalReservation = existing?.published_telegram === -1
          && existing.notable_observation === normalReservation;
        if (!hasNormalReservation && !hasCorrectionReservation) {
          return { status: existing?.published_telegram === -1 ? 'ALREADY_RESERVED' : 'RESERVATION_REQUIRED' };
        }
      }
    }

    if (bulletin.safety_class === 'DO_NOT_PUBLISH') {
      console.warn(`[TelegramBot] BROADCAST BLOCKED: ${bulletin.safety_reason}`);
      return { status: 'BLOCKED', reason: bulletin.safety_reason };
    }

    if (!isApprovedByHuman && bulletin.safety_class !== 'PUBLIC_SAFE') {
      console.warn(`[TelegramBot] BROADCAST REQUIRES HUMAN APPROVAL: ${bulletin.safety_reason}`);
      return { status: 'REQUIRES_APPROVAL', reason: bulletin.safety_reason };
    }

    if (!this.token || !this.chatId) {
      console.log('[TelegramBot] BOT_TOKEN or CHAT_ID missing. Broadcast simulated locally.');
      console.log('--- TELEGRAM BROADCAST PAYLOAD ---');
      console.log(bulletin.telegram);
      return { status: 'SIMULATED', bulletin: bulletin.telegram };
    }

    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
      // Send public bulletins as plain text. Dynamic values such as
      // PUBLIC_SAFE contain Markdown control characters and must not be parsed.
      const telegramText = telegramPlainText(bulletin);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: telegramText
        })
      });
      const response = await res.json().catch(() => ({}));
      const result = {
        status: res.ok ? 'PUBLISHED' : 'FAILED',
        ok: res.ok,
        http_status: res.status,
        error: res.ok ? undefined : (response.description || 'Telegram API rejected the request')
      };
      if (res.ok) {
        const saved = persistBulletinState(bulletin, 1, bulletin.safety_reason);
        if (!saved.success) {
          return {
            status: 'PUBLISHED_UNTRACKED',
            ok: true,
            http_status: res.status,
            error: saved.error || 'Telegram accepted the message but publication state was not persisted'
          };
        }
      }
      return result;
    } catch (e) {
      console.error('Telegram broadcast error:', e);
      return { status: 'ERROR', error: e.message };
    }
  }
}
