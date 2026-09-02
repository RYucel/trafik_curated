import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PAGE_STYLE = `
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#020617;color:#e2e8f0}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#020617,#0f172a);min-height:100vh}
a{color:#67e8f9}.shell{width:min(920px,calc(100% - 32px));margin:auto;padding:32px 0 64px}
.brand{display:flex;align-items:center;gap:12px;color:#f8fafc;text-decoration:none;font-weight:800;margin-bottom:28px}
.mark{display:grid;place-items:center;width:40px;height:40px;border:1px solid #be123c;border-radius:12px;background:#4c0519}
.panel{background:rgba(15,23,42,.88);border:1px solid #334155;border-radius:18px;padding:clamp(20px,4vw,40px);box-shadow:0 24px 80px rgba(0,0,0,.3)}
h1{font-size:clamp(28px,5vw,48px);line-height:1.1;color:#f8fafc}h2{margin-top:32px;color:#f8fafc}
p,li{line-height:1.75}hr{border:0;border-top:1px solid #334155;margin:30px 0}code{background:#1e293b;padding:2px 6px;border-radius:6px}
.meta{color:#94a3b8}.list{display:grid;gap:12px;margin-top:24px}.card{display:flex;justify-content:space-between;gap:16px;padding:18px 20px;border:1px solid #334155;border-radius:14px;background:#0f172a;text-decoration:none;color:#e2e8f0}.card:hover{border-color:#06b6d4}.badge{color:#67e8f9;font-family:monospace}
footer{margin-top:28px;color:#64748b;font-size:13px;text-align:center}
`;

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToHtml(markdown) {
  const output = [];
  let listType = null;
  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = null;
  };

  for (const rawLine of markdown.replaceAll('\r\n', '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (/^---+$/.test(line)) {
      closeList();
      output.push('<hr>');
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    const unordered = /^-\s+(.+)$/.exec(line);
    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const nextType = unordered ? 'ul' : 'ol';
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        output.push(`<${listType}>`);
      }
      output.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
      continue;
    }
    closeList();
    output.push(`<p>${renderInline(line)}</p>`);
  }
  closeList();
  return output.join('\n');
}

function pageTemplate({ title, body, basePath }) {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="KKTC trafik kazaları için doğrulanmış günlük bülten arşivi">
<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>
<body><div class="shell"><a class="brand" href="${basePath}"><span class="mark">🚦</span><span>KKTC Trafik Bültenleri</span></a>
${body}<footer>Bağımsız, kaynak odaklı trafik güvenliği veri çalışması · Ücretsiz GitHub Pages yayını</footer></div></body></html>`;
}

function normalizeBasePath(basePath) {
  const value = `/${String(basePath || '/').replace(/^\/+|\/+$/g, '')}/`;
  return value === '//' ? '/' : value;
}

export function buildBulletinSite({ sourceRoot, outputRoot, basePath = '/' }) {
  const normalizedBase = normalizeBasePath(basePath);
  const bulletins = fs.readdirSync(sourceRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map(entry => ({ date: entry.name, file: path.join(sourceRoot, entry.name, 'bulletin.md') }))
    .filter(entry => fs.existsSync(entry.file))
    .filter(entry => fs.readFileSync(entry.file, 'utf8').includes('**İstatistik Niteliği**'))
    .sort((a, b) => b.date.localeCompare(a.date));

  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, '.nojekyll'), '');

  for (const bulletin of bulletins) {
    const markdown = fs.readFileSync(bulletin.file, 'utf8');
    const targetDir = path.join(outputRoot, 'bulletins', bulletin.date);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'index.html'), pageTemplate({
      title: `${bulletin.date} · KKTC Trafik Bülteni`,
      basePath: normalizedBase,
      body: `<article class="panel">${markdownToHtml(markdown)}</article>`
    }));
  }

  const cards = bulletins.map(({ date }) =>
    `<a class="card" href="${normalizedBase}bulletins/${date}/"><span>${date} günlük bülteni</span><span class="badge">PUBLIC RECORD →</span></a>`
  ).join('\n');
  fs.writeFileSync(path.join(outputRoot, 'index.html'), pageTemplate({
    title: 'KKTC Trafik Bültenleri',
    basePath: normalizedBase,
    body: `<main class="panel"><h1>Günlük Trafik Bültenleri</h1><p class="meta">Doğrulanmış kayıtlar, dönemsel karşılaştırmalar ve kaynak şeffaflığı.</p><div class="list">${cards || '<p>Henüz bülten bulunmuyor.</p>'}</div></main>`
  }));

  return { bulletinCount: bulletins.length, outputRoot };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const result = buildBulletinSite({
    sourceRoot: path.resolve('data/pilot'),
    outputRoot: path.resolve(process.env.PAGES_OUTPUT_DIR || '_site'),
    basePath: process.env.PAGES_BASE_PATH || '/trafik_curated/'
  });
  console.log(`Built ${result.bulletinCount} bulletin pages in ${result.outputRoot}`);
}
