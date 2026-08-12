import { executeDb } from '../lib/db.js';

export class ArticleFetcher {
  async fetchArticleContent(article) {
    if (!article.url || article.url.startsWith('http://localhost')) {
      return article.description || article.title;
    }

    console.log(`[Article Fetcher] Fetching full text for ${article.url}...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const res = await fetch(article.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'KKTC-Traffic-Intelligence-Bot/1.0 (+https://kktctrafik.org)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const html = await res.text();

      // Clean HTML tags and extract paragraph text
      const cleanText = html
        .replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '')
        .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, '')
        .replace(/<p[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const extractedContent = cleanText.substring(0, 5000); // Store up to 5000 chars

      executeDb(`
        UPDATE news_articles 
        SET content = ?, processing_status = 'CONTENT_FETCHED'
        WHERE id = ?
      `, [extractedContent, article.id]);

      return extractedContent;

    } catch (err) {
      clearTimeout(timeoutId);
      console.error(`[Article Fetcher] Error fetching ${article.url}: ${err.message}`);
      
      const fallbackContent = article.description || article.title;
      executeDb(`
        UPDATE news_articles 
        SET content = ?, error_message = ?
        WHERE id = ?
      `, [fallbackContent, err.message, article.id]);

      return fallbackContent;
    }
  }
}
