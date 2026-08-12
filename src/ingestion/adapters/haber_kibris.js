import crypto from 'crypto';

function generateHash(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

export class HaberKibrisAdapter {
  constructor() {
    this.sourceId = 'haberkibris';
    this.sourceName = 'Haber Kıbrıs';
    this.baseUrl = 'https://haberkibris.com';
    this.feedUrl = 'https://haberkibris.com/rss';
  }

  async discoverArticles() {
    console.log(`[Adapter: Haber Kıbrıs] Attempting article discovery via feed / sitemap...`);

    try {
      const res = await fetch(this.feedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KKTC-Traffic-Intelligence/1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        }
      });

      if (!res.ok) {
        console.warn(`[Adapter: Haber Kıbrıs] RSS endpoint returned ${res.status} ${res.statusText}. Marking status = CONFIG_REQUIRED.`);
        return { status: 'CONFIG_REQUIRED', reason: `HTTP ${res.status} ${res.statusText}`, articles: [] };
      }

      const text = await res.text();
      return { status: 'OK', articles: [] };
    } catch (err) {
      console.warn(`[Adapter: Haber Kıbrıs] Machine-readable feed unavailable: ${err.message}. Documented as CONFIG_REQUIRED.`);
      return { status: 'CONFIG_REQUIRED', reason: err.message, articles: [] };
    }
  }
}
