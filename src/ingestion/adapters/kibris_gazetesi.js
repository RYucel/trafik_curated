import crypto from 'crypto';
import zlib from 'zlib';

function generateHash(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

export class KibrisGazetesiAdapter {
  constructor() {
    this.sourceId = 'kibrisgazetesi';
    this.sourceName = 'Kıbrıs Gazetesi';
    this.baseUrl = 'https://www.kibrisgazetesi.com';
    this.sitemapUrl = 'https://www.kibrisgazetesi.com/sitemap.xml';
  }

  async fetchWithDecompression(url) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KKTC-Traffic-Intelligence/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status} ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try { return zlib.gunzipSync(buffer).toString('utf-8'); } catch (e) { return zlib.inflateSync(buffer).toString('utf-8'); }
    }
    try { return zlib.brotliDecompressSync(buffer).toString('utf-8'); } catch (e) { return buffer.toString('utf-8'); }
  }

  async discoverArticles() {
    console.log(`[Adapter: Kıbrıs Gazetesi] Attempting article discovery via XML sitemap / controlled fetch...`);
    const articles = [];

    try {
      // 1. Try sitemap XML discovery
      const xmlText = await this.fetchWithDecompression(this.sitemapUrl);
      const locMatches = xmlText.match(/<loc>(https:\/\/www\.kibrisgazetesi\.com\/[^<]+)<\/loc>/g) || [];

      for (const locStr of locMatches.slice(0, 10)) {
        const url = locStr.replace(/<\/?loc>/g, '');
        if (url.includes('kaza') || url.includes('adli') || url.includes('kibris')) {
          const hash = generateHash(url);
          articles.push({
            source_id: this.sourceId,
            source_name: this.sourceName,
            url,
            title: url.split('/').pop().replace(/-/g, ' '),
            published_at: new Date().toISOString(),
            discovered_at: new Date().toISOString(),
            content: 'Kıbrıs Gazetesi sitemap discovered article',
            content_hash: hash
          });
        }
      }

      console.log(`[Adapter: Kıbrıs Gazetesi] Successfully discovered ${articles.length} candidates.`);
      return { status: 'OK', articles };
    } catch (err) {
      console.warn(`[Adapter: Kıbrıs Gazetesi] Discovery warning (Sitemap returned HTML/404): ${err.message}. Defaulting to CONFIG_REQUIRED state.`);
      return { status: 'CONFIG_REQUIRED', reason: err.message, articles: [] };
    }
  }
}
