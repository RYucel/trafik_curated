// Daily Bulletin Generation Agent for KKTC Traffic Intelligence
import fs from 'node:fs';
import { queryDb } from '../lib/db.js';

const CURATED_PERIOD_STATS = JSON.parse(
  fs.readFileSync(new URL('../../data/curated/official_period_statistics.json', import.meta.url), 'utf8')
);

const TURKISH_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];
const DEFAULT_PUBLIC_BULLETIN_BASE_URL = 'https://ryucel.github.io/trafik_curated';

function getPeriod(targetDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate);
  if (!match) throw new Error(`Invalid bulletin target date: ${targetDate}`);

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const monthName = TURKISH_MONTHS[month - 1];
  const parsedDate = new Date(`${targetDate}T00:00:00Z`);
  if (!monthName || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().substring(0, 10) !== targetDate) {
    throw new Error(`Invalid bulletin target date: ${targetDate}`);
  }

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

function getPublicBulletinUrl(targetDate) {
  const configuredBase = process.env.PUBLIC_BULLETIN_BASE_URL?.trim() || DEFAULT_PUBLIC_BULLETIN_BASE_URL;
  try {
    const base = new URL(configuredBase);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Unsupported public bulletin protocol');
    return `${base.toString().replace(/\/$/, '')}/bulletins/${targetDate}/`;
  } catch {
    return `${DEFAULT_PUBLIC_BULLETIN_BASE_URL}/bulletins/${targetDate}/`;
  }
}

function getNicosiaDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Nicosia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getTargetDayTrafficNews(targetDate) {
  const candidates = queryDb(`
    SELECT DISTINCT news.title, news.url, news.source_name, news.published_at
    FROM news_articles AS news
    INNER JOIN (
      SELECT source_url
      FROM accidents
      WHERE verification_status IN ('VERIFIED', 'MEDIA_CORROBORATED')

      UNION

      SELECT sources.source_url
      FROM accident_sources AS sources
      INNER JOIN accidents AS accidents ON accidents.accident_id = sources.accident_id
      WHERE accidents.verification_status IN ('VERIFIED', 'MEDIA_CORROBORATED')
        AND sources.verification_status IN ('VERIFIED', 'MEDIA_CORROBORATED')
    ) AS verified_sources ON verified_sources.source_url = news.url
    WHERE news.traffic_relevance = 1
      AND news.processing_status = 'EXTRACTED'
  `);

  const seenUrls = new Set();
  return candidates
    .filter(article => getNicosiaDate(article.published_at) === targetDate)
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
    .filter(article => {
      if (!article.url || seenUrls.has(article.url)) return false;
      seenUrls.add(article.url);
      return true;
    })
    .slice(0, 5);
}

function getCuratedPeriodStats(targetDate, year) {
  return CURATED_PERIOD_STATS
    .filter(item => item.year === year && item.period_end <= targetDate)
    .sort((a, b) => b.period_end.localeCompare(a.period_end))[0] || null;
}

export class BulletinAgent {
  static async generateDailyBulletin(targetDate = new Date().toISOString().substring(0, 10)) {
    const period = getPeriod(targetDate);
    const curatedStats = getCuratedPeriodStats(targetDate, period.year);
    const statisticsPeriod = curatedStats ? getPeriod(curatedStats.period_end) : period;
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
    const rawStats2026 = queryDb(`
      SELECT 
        COUNT(CASE WHEN fatal = 1 THEN 1 END) as fatal_accidents,
        SUM(death_count) as deaths,
        SUM(injury_count) as injuries
      FROM accidents WHERE event_date BETWEEN ? AND ?
    `, [period.startDate, period.endDate])[0] || {};

    const rawStats2025Same = queryDb(`
      SELECT COALESCE(SUM(death_count), 0) as deaths FROM accidents WHERE event_date BETWEEN ? AND ?
    `, [period.previousYearStart, period.previousYearEnd])[0] || {};

    const rawStats2024Same = queryDb(`
      SELECT COALESCE(SUM(death_count), 0) as deaths FROM accidents WHERE event_date BETWEEN ? AND ?
    `, [period.twoYearsAgoStart, period.twoYearsAgoEnd])[0] || {};

    const stats2026 = curatedStats ? {
      fatal_accidents: curatedStats.fatal_accidents,
      deaths: curatedStats.deaths,
      injuries: curatedStats.injuries
    } : rawStats2026;
    const deaths2026 = stats2026.deaths || 0;
    const comparisonDeaths2026 = curatedStats?.comparison_current_deaths ?? deaths2026;
    const deaths2025 = curatedStats?.comparison_2025_deaths ?? rawStats2025Same.deaths ?? 0;
    const deaths2024 = curatedStats?.comparison_2024_deaths ?? rawStats2024Same.deaths ?? 0;

    const yoyPct2025 = deaths2025 > 0 ? Number((((comparisonDeaths2026 - deaths2025) / deaths2025) * 100).toFixed(1)) : null;
    const yoyPct2024 = deaths2024 > 0 ? Number((((comparisonDeaths2026 - deaths2024) / deaths2024) * 100).toFixed(1)) : null;
    const formatChange = value => value === null ? 'karşılaştırılamıyor' : `${value >= 0 ? '+' : ''}${value}%`;
    const publicBulletinUrl = getPublicBulletinUrl(targetDate);
    const targetDayTrafficNews = getTargetDayTrafficNews(targetDate);

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
**Veri Kapsamı**: ${statisticsPeriod.rangeLabel} (YTD / Kısmi Yıl)
**İstatistik Niteliği**: ${curatedStats ? `${curatedStats.classification} — olay kayıtlarının ham toplamı değildir` : 'CANONICAL_EVENT_SUM'}

---

## 📰 Günlük Trafik Haberleri (Yerel Tarih)

${targetDayTrafficNews.length > 0 ? targetDayTrafficNews.map(article => `- [${article.title}](${article.url}) *(${article.source_name})*`).join('\n') : 'Bu raporlama günü için doğrulanmış trafik haberi bulunmamaktadır.'}

---

## 🟡 Doğrulama Bekleyenler (REPORTED / UNVERIFIED)

${unverifiedItems.length > 0 ? unverifiedItems.map(acc => `- 🟡 **[UNVERIFIED]** ${acc.event_date} | ${acc.district} - ${acc.location_normalized} | Kaynak: ${acc.source_name}`).join('\n') : 'Şu anda onay bekleyen vaka bulunmamaktadır.'}

---

## 📊 ${period.year} YTD (${statisticsPeriod.shortLabel} İstatistiksel Gözlem)

- **Can Kaybı**: ${deaths2026}
- **Ölümlü Kaza Sayısı**: ${stats2026.fatal_accidents || 0}
${stats2026.injuries === null ? '- **Yaralı Sayısı**: Bu dönem için doğrulanmış toplu sayı yayımlanmadı.' : `- **Yaralı Sayısı**: ${stats2026.injuries || 0}`}

---

## 📊 Dönemsel Karşılaştırma

- **${period.year} Karşılaştırma Tabanı (${curatedStats?.comparison_period_label || statisticsPeriod.shortLabel})**: ${comparisonDeaths2026} Can Kaybı
- **${period.year - 1} Aynı Dönem (${curatedStats?.comparison_period_label || statisticsPeriod.shortLabel})**: ${deaths2025} Can Kaybı (Değişim: ${formatChange(yoyPct2025)})
- **${period.year - 2} Aynı Dönem (${curatedStats?.comparison_period_label || statisticsPeriod.shortLabel})**: ${deaths2024} Can Kaybı (Değişim: ${formatChange(yoyPct2024)})

*Not: Karşılaştırmalar yalnızca aynı tarih aralıkları (${curatedStats?.comparison_period_label || statisticsPeriod.shortLabel}) ile yapılmıştır. Kısmi yıl verisi tam yıl toplamı ile kıyaslanamaz.*

---

## 🤖 Yapay Zekâ Çıkarımı ve Risk Analizi

- Aşırı hız ve alkol kullanımı doğrulanmış vakalarda başlıca etkenler arasında rapor edilmiştir.
- *Veri Notu: Raporlanan kaza nedenleri tek başına yıllık can kaybı artışının kesin nedeni olduğunu kanıtlamamaktadır (Gözlemlenen Veri vs Çıkarım ayrımı).*

---

## 🔎 Kaynaklar ve Köken Bilgisi

1. **TIER 1 (Official)**: KKTC PGM Polis Basın Subaylığı İstatistikleri
2. **TIER 2 (Agency)**: TAK (Türk Ajansı Kıbrıs) Arşivi
3. **TIER 3 (Established Media)**: Kıbrıs Postası, Yenidüzen, Kıbrıs Gazetesi
${curatedStats ? `\nDönem toplamı kaynakları:\n${curatedStats.sources.map(source => `- ${source}`).join('\n')}` : ''}
${curatedStats?.derivation ? `\nTüretilmiş toplam hesabı:\n${curatedStats.derivation.map(item => `- ${item}`).join('\n')}` : ''}

---

## Yöntem Notu

Bu bülten **KKTC Trafik Intelligence Platformu** tarafından kanıta dayalı ve kaynak hiyerarşisine uygun olarak üretilmiştir. Haber raporları ile resmi istatistikler farklı kaynak katmanlarına ('TIER_1' - 'TIER_4') tabidir.
`.trim();

    const telegramBulletin = `
🚦 **KKTC TRAFİK GÜNLÜK BÜLTENİ**
📅 ${targetDate}
🔒 Güvenlik Sınıfı: ${safetyClass}
━━━━━━━━━━━━━━━
📊 **${period.year} CAN KAYBI (${statisticsPeriod.shortLabel} YTD)**
☠️ **${deaths2026} Can Kaybı** (${stats2026.fatal_accidents || 0} Ölümlü Kaza)
📅 ${curatedStats?.comparison_period_label || statisticsPeriod.shortLabel} karşılaştırması: ${period.year} ${comparisonDeaths2026}, ${period.year - 1} ${deaths2025} (${formatChange(yoyPct2025)}), ${period.year - 2} ${deaths2024} (${formatChange(yoyPct2024)})

📰 Günlük Trafik Haberleri (Yerel Tarih)
${targetDayTrafficNews.length > 0 ? targetDayTrafficNews.map(article => `• ${article.title}\n${article.url}`).join('\n') : 'Doğrulanmış trafik haberi bulunmamaktadır.'}

🔎 Kaynaklar: Resmî açıklamalar ve doğrulanmış medya kayıtları.
🌐 Ayrıntılı bülten: ${publicBulletinUrl}
    `.trim();

    return {
      targetDate,
      safety_class: safetyClass,
      safety_reason: safetyReason,
      markdown: markdownBulletin,
      telegram: telegramBulletin,
      deaths2026,
      fatal2026: stats2026.fatal_accidents || 0,
      injuries2026: stats2026.injuries,
      data_period: statisticsPeriod.rangeLabel,
      yoyPct2025
    };
  }
}
