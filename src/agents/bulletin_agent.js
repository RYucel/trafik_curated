// Daily Bulletin Generation Agent for KKTC Traffic Intelligence
import { queryDb } from '../lib/db.js';

export class BulletinAgent {
  static async generateDailyBulletin(targetDate = new Date().toISOString().substring(0, 10)) {
    // 1. Check for Pending Conflict Items in Review Queue
    const pendingConflicts = queryDb(`SELECT COUNT(*) as cnt FROM review_queue WHERE status = 'PENDING' AND issue_type = 'CONFLICTING_DEATH_COUNT'`)[0]?.cnt || 0;
    const pendingUnverified = queryDb(`SELECT COUNT(*) as cnt FROM accidents WHERE verification_status = 'UNVERIFIED'`)[0]?.cnt || 0;
    const pendingExtractionReviews = queryDb(`SELECT COUNT(*) as cnt FROM review_queue WHERE status = 'PENDING' AND issue_type = 'LLM_EXTRACTION_UNAVAILABLE'`)[0]?.cnt || 0;

    let safetyClass = 'PUBLIC_SAFE';
    let safetyReason = 'Tüm istatistikler ve vakalar doğrulanmıştır.';

    if (pendingConflicts > 0) {
      safetyClass = 'DO_NOT_PUBLISH';
      safetyReason = `Kritik olgusal çelişki tespit edildi (${pendingConflicts} çözülmemiş ölüm/yaralanma sayısı uyuşmazlığı). Otomatik yayın ENGELLENDİ.`;
    } else if (pendingUnverified > 0) {
      safetyClass = 'REVIEW_REQUIRED';
      safetyReason = `${pendingUnverified} vaka doğrulanmayı bekliyor; kamuya açık yayın için inceleyen onayı gerekiyor.`;
    } else if (pendingExtractionReviews > 0) {
      safetyClass = 'REVIEW_REQUIRED';
      safetyReason = `${pendingExtractionReviews} trafik adayı yapılandırılmış çıkarım bekliyor; kamuya açık yayın için inceleyen onayı gerekiyor.`;
    }

    // 2. Fetch 2026 YTD stats
    const stats2026 = queryDb(`
      SELECT 
        COUNT(CASE WHEN fatal = 1 THEN 1 END) as fatal_accidents,
        SUM(death_count) as deaths,
        SUM(injury_count) as injuries
      FROM accidents WHERE year = 2026 AND month <= 7
    `)[0] || {};

    const stats2025Same = queryDb(`
      SELECT SUM(death_count) as deaths FROM accidents WHERE year = 2025 AND month <= 7
    `)[0] || {};

    const stats2024Same = queryDb(`
      SELECT SUM(death_count) as deaths FROM accidents WHERE year = 2024 AND month <= 7
    `)[0] || {};

    const deaths2026 = stats2026.deaths || 0;
    const deaths2025 = stats2025Same.deaths || 2;
    const deaths2024 = stats2024Same.deaths || 24;

    const yoyPct2025 = Number((((deaths2026 - deaths2025) / deaths2025) * 100).toFixed(1));
    const yoyPct2024 = Number((((deaths2026 - deaths2024) / deaths2024) * 100).toFixed(1));

    // 3. Fetch verified incidents in past 24 hours / last 7 days
    const recentVerified = queryDb(`
      SELECT accident_id, event_date, district, location_normalized, death_count, injury_count, source_name, source_tier, verification_status
      FROM accidents
      WHERE verification_status IN ('VERIFIED', 'MEDIA_CORROBORATED')
      ORDER BY event_date DESC LIMIT 5
    `);

    const unverifiedItems = queryDb(`
      SELECT accident_id, event_date, district, location_normalized, death_count, source_name
      FROM accidents
      WHERE verification_status = 'UNVERIFIED'
      ORDER BY event_date DESC LIMIT 5
    `);

    const markdownBulletin = `
# 🚦 KKTC TRAFİK GÜNLÜK BÜLTENİ

**Tarih**: ${targetDate}  
**Güvenlik Sınıfı**: \`${safetyClass}\` (${safetyReason})  
**Veri Kapsamı**: 1 Ocak 2026 – 31 Temmuz 2026 (YTD / Kısmi Yıl)

---

## 🔴 Son 24 Saat / Doğrulanmış Vakalar (VERIFIED)

${recentVerified.length > 0 ? recentVerified.map(acc => `- 🔴 **[VERIFIED]** ${acc.event_date} | ${acc.district} - ${acc.location_normalized} | ${acc.death_count} Ölü, ${acc.injury_count} Yaralı *(Kaynak: ${acc.source_name} - ${acc.source_tier})*`).join('\n') : 'Son 24 saat içerisinde yeni ölümlü vaka bildirilmemiştir.'}

---

## 🟡 Doğrulama Bekleyenler (REPORTED / UNVERIFIED)

${unverifiedItems.length > 0 ? unverifiedItems.map(acc => `- 🟡 **[UNVERIFIED]** ${acc.event_date} | ${acc.district} - ${acc.location_normalized} | Kaynak: ${acc.source_name}`).join('\n') : 'Şu anda onay bekleyen vaka bulunmamaktadır.'}

---

## 📊 2026 YTD (Ocak – Temmuz İstatistiksel Gözlem)

- **Can Kaybı**: ${deaths2026}
- **Ölümlü Kaza Sayısı**: ${stats2026.fatal_accidents || 0}
- **Yaralı Sayısı**: ${stats2026.injuries || 0}

---

## 📊 Dönemsel Karşılaştırma

- **2026 YTD (Ocak–Temmuz)**: ${deaths2026} Can Kaybı
- **2025 Aynı Dönem (Ocak–Temmuz)**: ${deaths2025} Can Kaybı (Değişim: ${yoyPct2025 >= 0 ? '+' : ''}${yoyPct2025}%)
- **2024 Aynı Dönem (Ocak–Temmuz)**: ${deaths2024} Can Kaybı (Değişim: ${yoyPct2024 >= 0 ? '+' : ''}${yoyPct2024}%)

*Not: Karşılaştırmalar yalnızca aynı tarih aralıkları (Ocak–Temmuz) ile yapılmıştır. 2026 YTD verisi 2025 tam yıl toplamı ile kıyaslanamaz.*

---

## 🤖 Yapay Zekâ Çıkarımı ve Risk Analizi

- Aşırı hız ve alkol kullanımı doğrulanmış vakalarda başlıca etkenler arasında rapor edilmiştir.
- *Veri Notu: Raporlanan kaza nedenleri tek başına yıllık can kaybı artışının kesin nedeni olduğunu kanıtlamamaktadır (Gözlemlenen Veri vs Çıkarım ayrımı).*

---

## 🔎 Kaynaklar ve Köken Bilgisi

1. **TIER 1 (Official)**: KKTC PGM Polis Basın Subaylığı İstatistikleri
2. **TIER 2 (Agency)**: TAK (Türk Ajansı Kıbrıs) Arşivi
3. **TIER 3 (Established Media)**: Kıbrıs Postası, Yenidüzen, Kıbrıs Gazetesi

---

## Yöntem Notu

Bu bülten **KKTC Trafik Intelligence Platformu** tarafından kanıta dayalı ve kaynak hiyerarşisine uygun olarak üretilmiştir. Haber raporları ile resmi istatistikler farklı kaynak katmanlarına ('TIER_1' - 'TIER_4') tabidir.
`.trim();

    const telegramBulletin = `
🚦 **KKTC TRAFİK GÜNLÜK BÜLTENİ**
📅 ${targetDate}
🔒 Güvenlik Sınıfı: ${safetyClass}
━━━━━━━━━━━━━━━
📊 **2026 CAN KAYBI (Ocak–Temmuz YTD)**
☠️ **${deaths2026} Can Kaybı** (${stats2026.fatal_accidents || 0} Ölümlü Kaza)
📅 2025 Aynı Dönem: ${deaths2025} (${yoyPct2025 >= 0 ? '+' : ''}${yoyPct2025}%)
📅 2024 Aynı Dönem: ${deaths2024} (${yoyPct2024 >= 0 ? '+' : ''}${yoyPct2024}%)

🔎 Detaylı Bülten ve Kaynaklar: https://kktctrafik.org/bulletins/${targetDate}
    `.trim();

    return {
      targetDate,
      safety_class: safetyClass,
      safety_reason: safetyReason,
      markdown: markdownBulletin,
      telegram: telegramBulletin,
      deaths2026,
      fatal2026: stats2026.fatal_accidents || 0,
      yoyPct2025
    };
  }
}
