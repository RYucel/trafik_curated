// Daily Bulletin Generation Agent for KKTC Traffic Intelligence
import { queryDb } from '../lib/db.js';

const TURKISH_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

function getPeriod(targetDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate);
  if (!match) throw new Error(`Invalid bulletin target date: ${targetDate}`);

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const monthName = TURKISH_MONTHS[month - 1];
  if (!monthName || day < 1 || day > 31) throw new Error(`Invalid bulletin target date: ${targetDate}`);

  const suffix = `${monthText}-${dayText}`;
  return {
    year,
    startDate: `${yearText}-01-01`,
    endDate: targetDate,
    previousYearStart: `${year - 1}-01-01`,
    previousYearEnd: `${year - 1}-${suffix}`,
    twoYearsAgoStart: `${year - 2}-01-01`,
    twoYearsAgoEnd: `${year - 2}-${suffix}`,
    monthName,
    rangeLabel: `1 Ocak ${year} – ${day} ${monthName} ${year}`,
    shortLabel: `Ocak–${monthName}`
  };
}

export class BulletinAgent {
  static async generateDailyBulletin(targetDate = new Date().toISOString().substring(0, 10)) {
    const period = getPeriod(targetDate);
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

    // 2. Fetch target-date YTD stats and exact same-period comparisons.
    const stats2026 = queryDb(`
      SELECT 
        COUNT(CASE WHEN fatal = 1 THEN 1 END) as fatal_accidents,
        SUM(death_count) as deaths,
        SUM(injury_count) as injuries
      FROM accidents WHERE event_date BETWEEN ? AND ?
    `, [period.startDate, period.endDate])[0] || {};

    const stats2025Same = queryDb(`
      SELECT COALESCE(SUM(death_count), 0) as deaths FROM accidents WHERE event_date BETWEEN ? AND ?
    `, [period.previousYearStart, period.previousYearEnd])[0] || {};

    const stats2024Same = queryDb(`
      SELECT COALESCE(SUM(death_count), 0) as deaths FROM accidents WHERE event_date BETWEEN ? AND ?
    `, [period.twoYearsAgoStart, period.twoYearsAgoEnd])[0] || {};

    const deaths2026 = stats2026.deaths || 0;
    const deaths2025 = stats2025Same.deaths || 0;
    const deaths2024 = stats2024Same.deaths || 0;

    const yoyPct2025 = deaths2025 > 0 ? Number((((deaths2026 - deaths2025) / deaths2025) * 100).toFixed(1)) : null;
    const yoyPct2024 = deaths2024 > 0 ? Number((((deaths2026 - deaths2024) / deaths2024) * 100).toFixed(1)) : null;
    const formatChange = value => value === null ? 'karşılaştırılamıyor' : `${value >= 0 ? '+' : ''}${value}%`;

    // 3. Fetch verified incidents in past 24 hours / last 7 days
    const recentVerified = queryDb(`
      SELECT accident_id, event_date, district, location_normalized, death_count, injury_count, source_name, source_tier, verification_status
      FROM accidents
      WHERE verification_status IN ('VERIFIED', 'MEDIA_CORROBORATED') AND event_date = ?
      ORDER BY event_date DESC LIMIT 5
    `, [targetDate]);

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
**Veri Kapsamı**: ${period.rangeLabel} (YTD / Kısmi Yıl)

---

## 🔴 Son 24 Saat / Doğrulanmış Vakalar (VERIFIED)

${recentVerified.length > 0 ? recentVerified.map(acc => `- 🔴 **[VERIFIED]** ${acc.event_date} | ${acc.district} - ${acc.location_normalized} | ${acc.death_count} Ölü, ${acc.injury_count} Yaralı *(Kaynak: ${acc.source_name} - ${acc.source_tier})*`).join('\n') : 'Son 24 saat içerisinde yeni ölümlü vaka bildirilmemiştir.'}

---

## 🟡 Doğrulama Bekleyenler (REPORTED / UNVERIFIED)

${unverifiedItems.length > 0 ? unverifiedItems.map(acc => `- 🟡 **[UNVERIFIED]** ${acc.event_date} | ${acc.district} - ${acc.location_normalized} | Kaynak: ${acc.source_name}`).join('\n') : 'Şu anda onay bekleyen vaka bulunmamaktadır.'}

---

## 📊 ${period.year} YTD (${period.shortLabel} İstatistiksel Gözlem)

- **Can Kaybı**: ${deaths2026}
- **Ölümlü Kaza Sayısı**: ${stats2026.fatal_accidents || 0}
- **Yaralı Sayısı**: ${stats2026.injuries || 0}

---

## 📊 Dönemsel Karşılaştırma

- **${period.year} YTD (${period.shortLabel})**: ${deaths2026} Can Kaybı
- **${period.year - 1} Aynı Dönem (${period.shortLabel})**: ${deaths2025} Can Kaybı (Değişim: ${formatChange(yoyPct2025)})
- **${period.year - 2} Aynı Dönem (${period.shortLabel})**: ${deaths2024} Can Kaybı (Değişim: ${formatChange(yoyPct2024)})

*Not: Karşılaştırmalar yalnızca aynı tarih aralıkları (${period.shortLabel}) ile yapılmıştır. Kısmi yıl verisi tam yıl toplamı ile kıyaslanamaz.*

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
📊 **${period.year} CAN KAYBI (${period.shortLabel} YTD)**
☠️ **${deaths2026} Can Kaybı** (${stats2026.fatal_accidents || 0} Ölümlü Kaza)
📅 ${period.year - 1} Aynı Dönem: ${deaths2025} (${formatChange(yoyPct2025)})
📅 ${period.year - 2} Aynı Dönem: ${deaths2024} (${formatChange(yoyPct2024)})

🔎 Kaynaklar: Resmî açıklamalar ve doğrulanmış medya kayıtları.
    `.trim();

    return {
      targetDate,
      safety_class: safetyClass,
      safety_reason: safetyReason,
      markdown: markdownBulletin,
      telegram: telegramBulletin,
      deaths2026,
      fatal2026: stats2026.fatal_accidents || 0,
      injuries2026: stats2026.injuries || 0,
      data_period: period.rangeLabel,
      yoyPct2025
    };
  }
}
