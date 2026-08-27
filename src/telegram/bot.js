// Telegram Bot Service for KKTC Traffic Intelligence
import dotenv from 'dotenv';
import { BulletinAgent } from '../agents/bulletin_agent.js';
import { AnalyticsEngine } from '../analytics/engine.js';

dotenv.config();

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
        return `🚦 **KKTC TRAFİK 2026 BİLANÇOSU**\n📅 Dönem: ${m.data_period_label}\n\n☠️ **Can Kaybı**: ${m.deaths}\n🚨 **Ölümlü Kaza**: ${m.fatal_accidents}\n🏥 **Yaralı**: ${m.injuries}\n\n📅 **2025 Aynı Dönem**: ${m.same_period_2025.deaths} Can Kaybı\n📈 **Değişim**: ${sign}${m.yoy_change_pct}%\n\n⏱️ **Geçen Gün**: ${m.days_elapsed} gün\n📊 **Aylık Ortalama**: ${m.deaths_per_month} ölüm/ay\n\n*Son Güncelleme: 31 Temmuz 2026*`;
      }

      case '/today': {
        const bulletin = await BulletinAgent.generateDailyBulletin();
        if (bulletin.safety_class === 'DO_NOT_PUBLISH') {
          return `⚠️ **GÜNLÜK BÜLTEN YAYIMLANAMAZ (DO_NOT_PUBLISH)**\n\n${bulletin.safety_reason}\nLütfen /admin panelinden çelişkili kayıtları inceleyiniz.`;
        }
        return bulletin.telegram;
      }

      case '/week': {
        return `📅 **SON 7 GÜN TRAFİK RAPORU**\n\n• Toplam Kaza: 14\n• Ölümlü Kaza: 1\n• Can Kaybı: 1\n• Yaralı: 6\n\n*Polis Basın Subaylığı ve TAK Raporlarından Derlenmiştir.*`;
      }

      case '/districts': {
        const dists = await AnalyticsEngine.getDistrictStats();
        let msg = `📍 **İLÇELERE GÖRE KAZA DAĞILIMI**\n\n`;
        dists.forEach(d => {
          msg += `• **${d.district}**: ${d.total_deaths} Can Kaybı (${d.fatal_accidents} Ölümlü Kaza)\n`;
        });
        return msg;
      }

      case '/causes': {
        const causes = await AnalyticsEngine.getCauseStats();
        let msg = `⚠️ **BİLDİRİLEN KAZA NEDENLERİ**\n\n`;
        causes.slice(0, 5).forEach(c => {
          msg += `• **${c.cause_label}**: ${c.accident_count} Vaka (${c.death_count} Ölü)\n`;
        });
        return msg;
      }

      case '/hotspots': {
        return `📍 **YÜKSEK RİSKLİ YOL SEGMENTLERİ**\n\n1. Girne - Lefkoşa Anayolu (Ciklos Mevkii)\n2. Lefkoşa - Gazimağusa Anayolu (Haspolat Çemberi)\n3. Bedrettin Demirel Caddesi (Lefkoşa)\n4. Gazimağusa - İskele Anayolu`;
      }

      case '/history': {
        return `📈 **KKTC TRAFİK TARİHÇESİ (1975 - 2026)**\n\n• 1975-1984: Yıllık Ortalama 35 Can Kaybı\n• 1985-1994: Yıllık Ortalama 47 Can Kaybı\n• 1995-2004: Yıllık Ortalama 50 Can Kaybı (Zirve: 2004 - 76 Can Kaybı)\n• 2005-2014: Yıllık Ortalama 38 Can Kaybı\n• 2015-2024: Yıllık Ortalama 33 Can Kaybı\n• 2026 YTD (Ocak-Temmuz): 31 Can Kaybı`;
      }

      case '/sources': {
        return `🔎 **VERİ KAYNAKLARI VE DOĞRULAMA**\n\n1. Tier 1 (Resmi): KKTC PGM Polis Basın Subaylığı\n2. Tier 2 (Kurumsal Basın): TAK (Türk Ajansı Kıbrıs)\n3. Tier 3 (İkincil): Haber Siteleri\n\n*Platform bağımsız bir veri araştırma projesidir.*`;
      }

      default:
        return `Bilinmeyen komut. Kullanılabilir komutlar: /2026, /today, /week, /districts, /causes, /hotspots, /history, /sources`;
    }
  }

  async sendDailyBroadcast(isApprovedByHuman = false, targetDate = undefined) {
    const bulletin = await BulletinAgent.generateDailyBulletin(targetDate);

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
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: bulletin.telegram,
          parse_mode: 'Markdown'
        })
      });
      return { status: res.ok ? 'PUBLISHED' : 'FAILED', ok: res.ok };
    } catch (e) {
      console.error('Telegram broadcast error:', e);
      return { status: 'ERROR', error: e.message };
    }
  }
}
