import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ArticleFetcher } from '../src/ingestion/article_fetcher.js';

const pilotSource = fs.readFileSync(new URL('../scripts/run_shadow_pilot.js', import.meta.url), 'utf8');
const extractorSource = fs.readFileSync(new URL('../src/ingestion/accident_extractor.js', import.meta.url), 'utf8');

assert.ok(
  pilotSource.includes('fetcher.fetchArticleContent(article)'),
  'Shadow pilot must call the ArticleFetcher.fetchArticleContent(article) API'
);
assert.ok(
  !pilotSource.includes('fetcher.fetchArticleText('),
  'Shadow pilot must not call the removed fetchArticleText API'
);
assert.ok(
  pilotSource.includes("processing_status IN ('DISCOVERED', 'REVIEW_REQUIRED')"),
  'Shadow pilot must retry real articles deferred before an LLM key was configured'
);
assert.ok(
  extractorSource.includes("recordType === 'GENERAL_TRAFFIC_NEWS'") &&
    extractorSource.includes("status: 'NOT_ACCIDENT'"),
  'Structured extraction must not turn general or non-traffic news into canonical accidents'
);

const fetcher = new ArticleFetcher();
const fixtureText = await fetcher.fetchArticleContent({
  id: -1,
  url: 'http://localhost/shadow-pilot-contract',
  title: 'Fixture article',
  description: 'Fixture article content'
});

assert.equal(fixtureText, 'Fixture article content');

console.log('✓ Shadow pilot ArticleFetcher contract is valid');
