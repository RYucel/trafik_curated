import { RSSCollector } from '../src/ingestion/rss_collector.js';

const testSources = [
  { id: 'kibrispostasi', name: 'Kıbrıs Postası', feed_url: 'https://www.kibrispostasi.com/rss.xml' },
  { id: 'yeniduzen', name: 'Yenidüzen', feed_url: 'https://www.yeniduzen.com/rss' },
  { id: 'kibrisgazetesi', name: 'Kıbrıs Gazetesi', feed_url: 'https://www.kibrisgazetesi.com/rss/genel' },
  { id: 'haberkibris', name: 'Haber Kıbrıs', feed_url: 'https://haberkibris.com/rss' }
];

async function test() {
  const collector = new RSSCollector();
  console.log('--- TESTING LIVE RSS FEEDS ---');
  for (const s of testSources) {
    const res = await collector.collectFeed(s);
    console.log(`${s.name} | Status: ${res.status} | Articles Seen: ${res.articles_seen} | New: ${res.new_articles} | Error: ${res.error || 'None'}`);
  }
}

test();
