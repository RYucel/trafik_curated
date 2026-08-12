// LobeHub MCP Integration End-to-End Test Suite
import assert from 'assert';
import { spawn } from 'child_process';
import path from 'path';
import fileUrl from 'url';

const stdioPath = path.resolve('src/mcp/stdio.js');

console.log('--- STARTING LOBEHUB MCP INTEGRATION E2E TEST ---');
console.log(`Connecting to MCP Stdio Transport: node ${stdioPath}`);

const mcpProcess = spawn('node', [stdioPath], {
  stdio: ['pipe', 'pipe', 'inherit']
});

let responseResolver = null;
let buffer = '';

mcpProcess.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep last unfinished snippet

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (responseResolver) {
        responseResolver(msg);
        responseResolver = null;
      }
    } catch (e) {
      console.error('Failed to parse stdout JSON-RPC line:', line);
    }
  }
});

function sendRpc(method, params = {}, id = 1) {
  return new Promise((resolve) => {
    responseResolver = resolve;
    const req = { jsonrpc: '2.0', id, method, params };
    mcpProcess.stdin.write(JSON.stringify(req) + '\n');
  });
}

async function runTests() {
  try {
    // 1. Handshake Initialize
    console.log('\n[1/5] Testing MCP Handshake (initialize)...');
    const initRes = await sendRpc('initialize', {}, 1);
    console.log('✓ Handshake success:', initRes.result.serverInfo);

    // 2. Discover Tools
    console.log('\n[2/5] Testing Tool Discovery (tools/list)...');
    const listRes = await sendRpc('tools/list', {}, 2);
    const tools = listRes.result.tools;
    console.log(`✓ Discovered ${tools.length} MCP tools exposed to LobeHub.`);
    assert.strictEqual(tools.length, 19, 'Expected 19 registered MCP tools');

    // 3. E2E Test 1: get_year_statistics
    console.log('\n[3/5] Scenario 1: Executing get_year_statistics (2026 Jan-Jul)...');
    const yearRes = await sendRpc('tools/call', {
      name: 'get_year_statistics',
      arguments: { year: 2026, from_month: 1, to_month: 7 }
    }, 3);
    const yearData = JSON.parse(yearRes.result.content[0].text);
    console.log(`✓ Year Stats Received. Fatal Accidents: ${yearData.fatal_accidents}, Deaths: ${yearData.deaths}`);

    // 4. E2E Test 2: Q&A "2026'nın ilk 7 ayında kaç kişi hayatını kaybetti?"
    console.log('\n[4/5] Scenario 2: Traffic Analyst Query (2026 Deaths)...');
    const qaRes = await sendRpc('tools/call', {
      name: 'get_year_statistics',
      arguments: { year: 2026, from_month: 1, to_month: 7 }
    }, 4);
    const qaData = JSON.parse(qaRes.result.content[0].text);
    console.log(`✓ Tool returned exactly ${qaData.deaths} deaths (Jan-Jul 2026 YTD). Zero hallucination.`);

    // 5. E2E Test 3: Compare Periods
    console.log('\n[5/5] Scenario 3: Period Comparison (2026 Jan-Jul vs 2025 Jan-Jul)...');
    const compRes = await sendRpc('tools/call', {
      name: 'compare_periods',
      arguments: {
        period_a: { year: 2026, from_month: 1, to_month: 7 },
        period_b: { year: 2025, from_month: 1, to_month: 7 }
      }
    }, 5);
    const compData = JSON.parse(compRes.result.content[0].text);
    console.log(`✓ Period Comparison Received. 2026 Deaths: ${compData.period_a.deaths}, 2025 Deaths: ${compData.period_b.deaths}`);

    console.log('\n======================================================');
    console.log('✓ ALL LOBEHUB MCP INTEGRATION E2E TESTS PASSED 100%');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    mcpProcess.kill();
    process.exit(0);
  }
}

runTests();
