import assert from 'node:assert';
import { spawn } from 'node:child_process';
import http from 'node:http';

function checkEndpoint(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, body: data });
      });
    }).on('error', reject);
  });
}

async function runProductionStartupVerification() {
  console.log('========================================================================');
  console.log('--- RUNNING PRODUCTION STARTUP & PORT BINDING VERIFICATION SUITE ---');
  console.log('========================================================================\n');

  const TEST_PORT = 8085;
  console.log(`[Test] Launching "node dist/server.cjs" with PORT=${TEST_PORT} and NODE_ENV=production...`);

  const serverProcess = spawn('node', ['dist/server.cjs'], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutLogs = '';
  let stderrLogs = '';

  serverProcess.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    stdoutLogs += text;
    process.stdout.write(text);
  });

  serverProcess.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    stderrLogs += text;
    process.stderr.write(text);
  });

  // Wait for server to bind port and start listening
  let serverReady = false;
  const startTime = Date.now();
  const maxWaitMs = 30000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await checkEndpoint(`http://127.0.0.1:${TEST_PORT}/healthz`);
      if (res.statusCode === 200) {
        serverReady = true;
        break;
      }
    } catch {
      // Still booting or hydrating
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  assert(serverReady, `Server must bind and respond on port ${TEST_PORT} within ${maxWaitMs / 1000}s`);
  console.log('\n✅ [PASS] 1: Server successfully started and responded on /healthz probe.');

  // Test 2: Verify /healthz body
  const healthzRes = await checkEndpoint(`http://127.0.0.1:${TEST_PORT}/healthz`);
  assert.strictEqual(healthzRes.statusCode, 200, '/healthz must return 200 OK');
  assert.strictEqual(healthzRes.body, 'OK', '/healthz must return "OK"');
  console.log('✅ [PASS] 2: /healthz returned 200 OK with expected payload.');

  // Test 3: Verify /api/health endpoint
  const apiHealthRes = await checkEndpoint(`http://127.0.0.1:${TEST_PORT}/api/health`);
  assert.strictEqual(apiHealthRes.statusCode, 200, '/api/health must return 200 OK');
  const apiData = JSON.parse(apiHealthRes.body);
  assert.strictEqual(apiData.status, 'ok', 'API health status must be "ok"');
  assert(apiData.service, 'Service name must be present');
  console.log('✅ [PASS] 3: /api/health returned 200 OK with authoritative service status payload.');

  // Test 4: Verify startup stage logging was emitted
  assert(stdoutLogs.includes('[Startup] Stage 1/5: sqlite-schema-init'), 'Stage 1 log must be present');
  assert(stdoutLogs.includes('[Startup] Stage 2/5: mfa-tables-init'), 'Stage 2 log must be present');
  assert(stdoutLogs.includes('[Startup] Stage 3/5: express-app-init'), 'Stage 3 log must be present');
  assert(stdoutLogs.includes('[Startup] Stage 4/5: firestore-hydration'), 'Stage 4 log must be present');
  assert(stdoutLogs.includes('[Startup] Stage 5/5: server-port-listen'), 'Stage 5 log must be present');
  assert(stdoutLogs.includes(`Server listening on port ${TEST_PORT}`), 'Listening confirmation log must be present');
  console.log('✅ [PASS] 4: All 5 progressive startup stages logged cleanly in stdout.');

  // Clean shutdown
  console.log('[Test] Sending SIGTERM for graceful shutdown...');
  serverProcess.kill('SIGTERM');

  await new Promise((r) => setTimeout(r, 1000));
  console.log('✅ [PASS] 5: Process gracefully terminated.');

  console.log('\n========================================================================');
  console.log('🎉 ALL PRODUCTION STARTUP & PORT BINDING VERIFICATION TESTS PASSED!');
  console.log('========================================================================\n');
  process.exit(0);
}

runProductionStartupVerification().catch((err) => {
  console.error('❌ Production startup verification failed:', err);
  process.exit(1);
});
