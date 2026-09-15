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

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

function formatDayLabel(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${Number(day)} ${TURKISH_MONTHS[Number(month) - 1]} ${year}`;
}

// The extractor writes cause_category as free-form LLM output, so the same cause arrives
// spelled several ways ("ALCOHOL", "Drunk Driving / Loss of Control", "careless_driving").
// Matching is done on keywords, most specific first, so a compound label lands on its
// primary cause rather than whichever branch happens to be checked first.
const CAUSE_RULES = [
  [/ALCOHOL|DRUNK|SUBSTANCE|IMPAIRED|DRUG/, 'Alkol/madde etkisi'],
  [/SPEED/, 'Aşırı hız'],
  [/DISTRACT|CARELESS|INATTENT/, 'Dikkatsiz sürüş'],
  [/LOSS_OF_CONTROL/, 'Direksiyon hakimiyetini kaybetme'],
  [/GIVE_WAY|RIGHT_OF_WAY|PRIORITY/, 'Geçiş önceliği ihlali'],
  [/WRONG_SIDE|WRONG_WAY/, 'Ters şeride girme'],
  [/PEDESTRIAN|MICRO_MOBILITY/, 'Yaya/mikro-mobilite'],
  [/MOTORCYCLE|MOPED/, 'Motosiklet kaynaklı'],
  [/HEALTH|MEDICAL/, 'Sağlık sorunu'],
  [/CLOSE_FOLLOW|TAILGAT/, 'Yakın takip']
];

function normalizeCause(rawCause) {
  if (!rawCause) return null;
  const key = rawCause.toUpperCase().replace(/[^A-Z]+/g, '_');
  if (/^_?(UNKNOWN|OTHER|NONE)_?$/.test(key)) return null;
  for (const [pattern, label] of CAUSE_RULES) {
    if (pattern.test(key)) return label;
  }
  return null;
}

const VERIFICATION_BADGES = {
  VERIFIED: '🟢',
  MEDIA_CORROBORATED: '🟢',
  UNVERIFIED: '🟡',
  REPORTED: '🟡',
  CONFLICT: '🟠'
};

// Accidents that happened on the report day, regardless of when the news reporting them was
// published. Single-source records are included and badged, because excluding them left the
// section empty on almost every day.
function getDayAccidents(reportDay) {
  return queryDb(`
    SELECT accident_id, event_time, district, location_normalized, road_normalized,
           death_count, injury_count, cause_category, verification_status,
           source_name, source_url
    FROM accidents
    WHERE event_date = ? AND record_type = 'INDIVIDUAL_ACCIDENT'
    ORDER BY death_count DESC, injury_count DESC, event_time
  `, [reportDay]);
}

function getWeekSummary(reportDay) {
  const windowStart = shiftDate(reportDay, -6);
  const totals = queryDb(`
    SELECT COUNT(*) AS accidents,
           COALESCE(SUM(death_count), 0) AS deaths,
           COALESCE(SUM(injury_count), 0) AS injuries
    FROM accidents
    WHERE event_date BETWEEN ? AND ? AND record_type = 'INDIVIDUAL_ACCIDENT'
  `, [windowStart, reportDay])[0] || { accidents: 0, deaths: 0, injuries: 0 };

  const districts = queryDb(`
    SELECT district, COUNT(*) AS accidents
    FROM accidents
    WHERE event_date BETWEEN ? AND ? AND record_type = 'INDIVIDUAL_ACCIDENT'
      AND district IS NOT NULL AND district != ''
    GROUP BY district ORDER BY accidents DESC, district
  `, [windowStart, reportDay]);

  const causeRows = queryDb(`
    SELECT cause_category
    FROM accidents
    WHERE event_date BETWEEN ? AND ? AND record_type = 'INDIVIDUAL_ACCIDENT'
  `, [windowStart, reportDay]);

  const causeCounts = new Map();
  for (const row of causeRows) {
    const label = normalizeCause(row.cause_category);
    if (label) causeCounts.set(label, (causeCounts.get(label) || 0) + 1);
  }
  const causes = [...causeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
    .slice(0, 3);

  return { windowStart, reportDay, totals, districts, causes };
}

function describeAccident(accident) {
  const place = [accident.district, accident.road_normalized || accident.location_normalized]
    .filter(Boolean).join(', ');
  const casualties = [];
  if (accident.death_count > 0) casualties.push(`${accident.death_count} ölü`);
  if (accident.injury_count > 0) casualties.push(`${accident.injury_count} yaralı`);
  const cause = normalizeCause(accident.cause_category);
  return {
    badge: VERIFICATION_BADGES[accident.verification_status] || '🟡',
    place: place || 'Konum belirtilmedi',
    time: accident.event_time || null,
    casualties: casualties.length > 0 ? casualties.join(', ') : 'Can kaybı/yaralı bildirilmedi',
    cause,
    sourceName: accident.source_name,
    sourceUrl: accident.source_url
  };
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
    const pendingInjuryConflicts = queryDb(`SELECT COUNT(*) as cnt FROM review_queue WHERE status = 'PENDING' AND issue_type = 'CONFLICTING_INJURY_COUNT'`)[0]?.cnt || 0;

    // Only a death-count discrepancy contradicts the published fatality statistics, so only
    // that blocks publication outright. Every other open item downgrades the bulletin to
    // REVIEW_REQUIRED: it still publishes, but the caveat travels with it and the affected
    // records stay labelled UNVERIFIED in the body.
    let safetyClass = 'PUBLIC_SAFE';
    let safetyReason = 'Tüm istatistikler ve vakalar doğrulanmıştır.';

    if (pendingConflicts > 0) {
      safetyClass = 'DO_NOT_PUBLISH';
      safetyReason = `Kritik olgusal çelişki tespit edildi (${pendingConflicts} çözülmemiş can kaybı sayısı uyuşmazlığı). Otomatik yayın ENGELLENDİ.`;
    } else if (pendingUnverified > 0) {
      safetyClass = 'REVIEW_REQUIRED';
      safetyReason = `${pendingUnverified} vaka tek kaynaklı olarak doğrulanmayı bekliyor; bültende UNVERIFIED olarak işaretlenmiştir.`;
    } else if (pendingInjuryConflicts > 0) {
      safetyClass = 'REVIEW_REQUIRED';
      safetyReason = `${pendingInjuryConflicts} yaralı sayısı uyuşmazlığı inceleme bekliyor; resmî can kaybı istatistiklerini etkilememektedir.`;
    } else if (pendingExtractionReviews > 0) {
      safetyClass = 'REVIEW_REQUIRED';
      safetyReason = `${pendingExtractionReviews} trafik adayı yapılandırılmış çıkarım bekliyor; bülten istatistikleri etkilenmemiştir.`;
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
    // The bulletin goes out at 06:00 local, so the last fully reported day is the previous
    // one. Reporting on the run's own date is what kept this section permanently empty.
    const reportDay = shiftDate(targetDate, -1);
    const dayAccidents = getDayAccidents(reportDay).map(describeAccident);
    const week = getWeekSummary(reportDay);

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

## 🚨 ${formatDayLabel(reportDay)} Kazaları

${dayAccidents.length > 0 ? dayAccidents.map(a => [
  `- ${a.badge} **${a.place}**${a.time ? ` (${a.time})` : ''}`,
  `  - ${a.casualties}${a.cause ? ` — ${a.cause}` : ''}`,
  `  - Kaynak: ${a.sourceUrl ? `[${a.sourceName}](${a.sourceUrl})` : a.sourceName}`
].join('\n')).join('\n') : 'Bu gün için kayda geçmiş trafik kazası bulunmamaktadır.'}

*🟢 birden fazla kaynakla doğrulanmış · 🟡 tek kaynak, teyit bekliyor · 🟠 kaynaklar çelişiyor*

---

## 📈 Son 7 Gün (${formatDayLabel(week.windowStart)} – ${formatDayLabel(week.reportDay)})

- **Kaza**: ${week.totals.accidents} · **Can Kaybı**: ${week.totals.deaths} · **Yaralı**: ${week.totals.injuries}
${week.districts.length > 0 ? `- **İlçelere göre**: ${week.districts.map(d => `${d.district} ${d.accidents}`).join(' · ')}` : '- **İlçelere göre**: kayıt yok'}
${week.causes.length > 0 ? `- **Başlıca nedenler**: ${week.causes.map(([label, count]) => `${label} (${count})`).join(' · ')}` : '- **Başlıca nedenler**: bildirilmedi'}

*Not: Bu sayılar platformun derlediği kayıtlara dayanır; resmî haftalık polis bilançosu değildir.*

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

🚨 **${formatDayLabel(reportDay)} KAZALARI (${dayAccidents.length})**
${dayAccidents.length > 0 ? dayAccidents.map(a => [
  `${a.badge} ${a.place}${a.time ? ` (${a.time})` : ''}`,
  `   ${a.casualties}${a.cause ? ` — ${a.cause}` : ''}`,
  a.sourceUrl ? `   ${a.sourceUrl}` : `   Kaynak: ${a.sourceName}`
].join('\n')).join('\n') : 'Kayda geçmiş trafik kazası bulunmamaktadır.'}

📈 **SON 7 GÜN**
${week.totals.accidents} kaza · ${week.totals.deaths} can kaybı · ${week.totals.injuries} yaralı
${week.districts.length > 0 ? week.districts.map(d => `${d.district} ${d.accidents}`).join(' · ') : 'İlçe kaydı yok'}
${week.causes.length > 0 ? `Başlıca neden: ${week.causes.map(([label, count]) => `${label} (${count})`).join(' · ')}` : ''}

🟢 doğrulanmış · 🟡 tek kaynak · 🟠 çelişkili
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
