import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { XMLParser } from 'fast-xml-parser';
import { executeDb, queryDb } from '../lib/db.js';

const SOURCES_PATH = path.resolve('src/ingestion/news_sources.json');

function hashContent(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Encoding': 'gzip, deflate',
        ...(options.headers || {})
      }
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status} ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try {
        return zlib.gunzipSync(buffer).toString('utf-8');
      } catch (e) {
        return zlib.inflateSync(buffer).toString('utf-8');
      }
    }

    try {
      return zlib.brotliDecompressSync(buffer).toString('utf-8');
    } catch (e) {
      return buffer.toString('utf-8');
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (retries > 0) {
      await new Promise(r => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}

export class RSSCollector {
  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      maxNestedTags: 500
    });
  }

  loadSources() {
    if (!fs.existsSync(SOURCES_PATH)) {
      throw new Error(`News sources file not found at ${SOURCES_PATH}`);
    }
    const raw = fs.readFileSync(SOURCES_PATH, 'utf-8');
    return JSON.parse(raw).filter(s => s.enabled);
  }

  parseFeedXml(xmlText, source) {
    const parsed = this.parser.parse(xmlText);
    const items = [];

    // Handle RSS 2.0 / Atom formats
    const channel = parsed.rss?.channel || parsed.feed;
    if (!channel) return items;

    const rawItems = channel.item || channel.entry || [];
    const itemArray = Array.isArray(rawItems) ? rawItems : [rawItems];

    for (const item of itemArray) {
      const title = item.title ? (typeof item.title === 'string' ? item.title : item.title['#text'] || '') : '';
      let url = '';
      if (typeof item.link === 'string') {
        url = item.link;
      } else if (item.link && item.link['@_href']) {
        url = item.link['@_href'];
      } else if (item.guid && typeof item.guid === 'string' && item.guid.startsWith('http')) {
        url = item.guid;
      }

      const published_at = item.pubDate || item.published || item.updated || new Date().toISOString();
      const description = item.description || item.summary || item['content:encoded'] || '';

      if (title && url) {
        items.push({
          source_id: source.id,
          source_name: source.name,
          title: title.trim(),
          url: url.trim(),
          published_at: typeof published_at === 'string' ? published_at.trim() : new Date().toISOString(),
          description: typeof description === 'string' ? description.trim() : '',
          content_hash: hashContent(`${source.id}_${url.trim()}_${title.trim()}`)
        });
      }
    }

    return items;
  }

  async collectFeed(source) {
    console.log(`[RSS Collector] Fetching ${source.name} (${source.feed_url})...`);
    const metrics = {
      source: source.name,
      status: 'OK',
      articles_seen: 0,
      new_articles: 0,
      duplicate_articles: 0,
      error: null
    };

    try {
      const xmlText = await fetchWithRetry(source.feed_url);
      const articles = this.parseFeedXml(xmlText, source);
      metrics.articles_seen = articles.length;

      for (const article of articles) {
        const existing = queryDb(
          "SELECT id FROM news_articles WHERE url = ? OR content_hash = ?",
          [article.url, article.content_hash]
        );

        if (existing.length > 0) {
          metrics.duplicate_articles++;
        } else {
          executeDb(`
            INSERT INTO news_articles (
              source_id, source_name, title, url, published_at, description, content_hash, processing_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DISCOVERED')
          `, [
            article.source_id, article.source_name, article.title, article.url,
            article.published_at, article.description, article.content_hash
          ]);
          metrics.new_articles++;
        }
      }
    } catch (err) {
      metrics.status = 'FAILED';
      metrics.error = err.message;
      console.error(`[RSS Collector] Error collecting ${source.name}: ${err.message}`);
    }

    return metrics;
  }

  async collectAll() {
    const sources = this.loadSources();
    const summary = {
      timestamp: new Date().toISOString(),
      feeds_checked: sources.length,
      feeds_failed: 0,
      total_articles_seen: 0,
      total_new_articles: 0,
      total_duplicates: 0,
      source_metrics: []
    };

    for (const source of sources) {
      const res = await this.collectFeed(source);
      summary.source_metrics.push(res);
      summary.total_articles_seen += res.articles_seen;
      summary.total_new_articles += res.new_articles;
      summary.total_duplicates += res.duplicate_articles;
      if (res.status === 'FAILED') summary.feeds_failed++;

      await new Promise(r => setTimeout(r, 1000));
    }

    return summary;
  }
}
