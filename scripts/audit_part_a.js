import { queryDb } from '../src/lib/db.js';

console.log('=== PART A: INDEPENDENT DATA INTEGRITY AUDIT ===\n');

// 1. 2026 Jan-Jul Records
const accs2026 = queryDb(`SELECT accident_id, event_date, district, location_normalized, fatal, death_count, injury_count, source_name, source_tier, source_url, record_type FROM accidents WHERE year = 2026 AND month <= 7 ORDER BY event_date ASC`);
const fatal2026 = accs2026.filter(a => a.fatal === 1);
const deaths2026 = accs2026.reduce((sum, a) => sum + a.death_count, 0);
const injuries2026 = accs2026.reduce((sum, a) => sum + a.injury_count, 0);

console.log('--- 2026 Jan 1 - Jul 31 AUDIT ---');
console.log('Total Canonical Accidents:', accs2026.length);
console.log('Fatal Accidents:', fatal2026.length);
console.log('Deaths Total:', deaths2026);
console.log('Injuries Total:', injuries2026);
console.log('Deaths per Fatal Accident:', (deaths2026 / (fatal2026.length || 1)).toFixed(2));

// 2. 2025 Jan-Jul Records
const accs2025 = queryDb(`SELECT accident_id, event_date, district, location_normalized, fatal, death_count, injury_count, source_name, source_tier, source_url, record_type FROM accidents WHERE year = 2025 AND month <= 7 ORDER BY event_date ASC`);
const fatal2025 = accs2025.filter(a => a.fatal === 1);
const deaths2025 = accs2025.reduce((sum, a) => sum + a.death_count, 0);
const injuries2025 = accs2025.reduce((sum, a) => sum + a.injury_count, 0);

console.log('\n--- 2025 Jan 1 - Jul 31 AUDIT ---');
console.log('Total Canonical Accidents:', accs2025.length);
console.log('Fatal Accidents:', fatal2025.length);
console.log('Deaths Total:', deaths2025);
console.log('Injuries Total:', injuries2025);
console.log('Deaths per Fatal Accident:', (deaths2025 / (fatal2025.length || 1)).toFixed(2));

// 3. 2024 Jan-Jul Records
const accs2024 = queryDb(`SELECT accident_id, event_date, district, location_normalized, fatal, death_count, injury_count, source_name, source_tier, source_url, record_type FROM accidents WHERE year = 2024 AND month <= 7 ORDER BY event_date ASC`);
const fatal2024 = accs2024.filter(a => a.fatal === 1);
const deaths2024 = accs2024.reduce((sum, a) => sum + a.death_count, 0);
const injuries2024 = accs2024.reduce((sum, a) => sum + a.injury_count, 0);

console.log('\n--- 2024 Jan 1 - Jul 31 AUDIT ---');
console.log('Total Canonical Accidents:', accs2024.length);
console.log('Fatal Accidents:', fatal2024.length);
console.log('Deaths Total:', deaths2024);
console.log('Injuries Total:', injuries2024);
console.log('Deaths per Fatal Accident:', (deaths2024 / (fatal2024.length || 1)).toFixed(2));

// Print 2025 Jan-Jul individual records details
console.log('\n--- 2025 JAN-JUL ALL UNDERLYING RECORDS ---');
console.table(accs2025);

// Print 2026 Jan-Jul fatal records details
console.log('\n--- 2026 JAN-JUL FATAL ACCIDENTS LIST ---');
console.table(fatal2026.map(a => ({
  id: a.accident_id,
  date: a.event_date,
  district: a.district,
  deaths: a.death_count,
  injuries: a.injury_count,
  source: a.source_name
})));
