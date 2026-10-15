// Promote UNVERIFIED accidents that already have sources from more than one outlet.
//
// The shadow pilot runs the same sweep on every run; this script shows what it would change.
//
// Usage: node scripts/promote_corroborated_accidents.js [--apply]
import { promoteCorroboratedAccidents } from '../src/ingestion/corroboration.js';

const apply = process.argv.includes('--apply');
const promoted = promoteCorroboratedAccidents({ apply });

if (promoted.length === 0) {
  console.log('Terfi edilecek kayıt bulunamadı.');
  process.exit(0);
}
for (const p of promoted) {
  console.log(`${p.accident_id}  ${p.from} -> ${p.to}  (${p.reason})`);
}
console.log(apply
  ? `\n${promoted.length} kayıt terfi ettirildi.`
  : '\nDeneme çalışması. Kalıcı hale getirmek için --apply ile tekrar çalıştırın.');
