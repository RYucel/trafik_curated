import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildBulletinSite } from '../scripts/build_bulletin_site.js';

const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'traffic-bulletins-'));

try {
  const result = buildBulletinSite({
    sourceRoot: path.resolve('data/pilot'),
    outputRoot,
    basePath: '/trafik_curated/'
  });

  assert.strictEqual(result.bulletinCount, 1);
  const indexHtml = fs.readFileSync(path.join(outputRoot, 'index.html'), 'utf8');
  const bulletinHtml = fs.readFileSync(
    path.join(outputRoot, 'bulletins', '2026-08-31', 'index.html'),
    'utf8'
  );

  assert.match(indexHtml, /\/trafik_curated\/bulletins\/2026-08-31\//);
  assert.doesNotMatch(indexHtml, /\/trafik_curated\/bulletins\/2026-08-30\//);
  assert.ok(!fs.existsSync(path.join(outputRoot, 'bulletins', '2026-08-30', 'index.html')));
  assert.match(bulletinHtml, /KKTC TRAFİK GÜNLÜK BÜLTENİ/);
  assert.match(bulletinHtml, /PUBLIC_SAFE/);
  assert.match(bulletinHtml, /Ocak–Ağustos/);
  assert.match(bulletinHtml, /<strong>Can Kaybı<\/strong>: 27/);
  assert.match(bulletinHtml, /<strong>Ölümlü Kaza Sayısı<\/strong>: 22/);
  assert.match(bulletinHtml, /Türetilmiş 31 Ağustos toplamı: 27 can kaybı \/ 22 ölümlü kaza/);
  assert.doesNotMatch(bulletinHtml, /32 Can Kaybı/);
  assert.doesNotMatch(bulletinHtml, /kktctrafik\.org/);
  assert.ok(fs.existsSync(path.join(outputRoot, '.nojekyll')));

  const workflow = fs.readFileSync('.github/workflows/pages.yml', 'utf8');
  assert.match(workflow, /pages:\s+write/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /node scripts\/build_bulletin_site\.js/);
} finally {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}

console.log('✓ Bulletin Markdown files build into a GitHub Pages site');
