import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ArticleFetcher } from '../src/ingestion/article_fetcher.js';

const pilotSource = fs.readFileSync(new URL('../scripts/run_shadow_pilot.js', import.meta.url), 'utf8');
const extractorSource = fs.readFileSync(new URL('../src/ingestion/accident_extractor.js', import.meta.url), 'utf8');
const workflowSource = fs.readFileSync(new URL('../.github/workflows/shadow-pilot.yml', import.meta.url), 'utf8');
const initDbSource = fs.readFileSync(new URL('../src/ingestion/init_db.py', import.meta.url), 'utf8');

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
assert.ok(
  pilotSource.includes('PILOT_INCOMPLETE_MISSED_DAYS') &&
    pilotSource.includes('missed_pilot_dates'),
  'Pilot status must report missed planned days instead of counting unrelated snapshot dates'
);
assert.ok(
  pilotSource.includes("process.argv.find(arg => /^\\d{4}-\\d{2}-\\d{2}$/.test(arg))"),
  'Pilot must accept the date forwarded by the manual workflow dispatch'
);
assert.ok(
  pilotSource.includes("runErrors.length === 0 && collectResult.feeds_failed === 0"),
  'A pilot run with failed feeds must not be marked VERIFIED_RUN'
);
assert.ok(
  workflowSource.includes('TARGET_DATE="${PILOT_TARGET_DATE:-$(date +\'%Y-%m-%d\')}"') &&
    workflowSource.includes('verification.json') &&
    workflowSource.includes('data/pilot/$TARGET_DATE/ingestion.json'),
  'Workflow must validate every requested snapshot artifact, not merely any status file'
);
assert.match(
  initDbSource,
  /if seed_fixture_data:\s+cursor\.execute\("DELETE FROM review_queue"\)/,
  'Default database initialization must not erase or seed the review queue'
);
assert.match(
  initDbSource,
  /if seed_fixture_data:\s+cursor\.execute\("""\s+INSERT INTO audit_log[\s\S]*?SYNTHETIC_TEST_FIXTURES/,
  'Synthetic initialization audit entries must require explicit fixture mode'
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
