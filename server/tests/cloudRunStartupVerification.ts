import { spawn } from 'node:child_process';
import path from 'node:path';

async function verifyCloudRunProductionStartup() {
  const TEST_PORT = '8089';
  console.log(`[Test] Launching production server bundle (dist/server.cjs) on PORT=${TEST_PORT}...`);

  const serverProcess = spawn('node', ['dist/server.cjs'], {
    env: {
      ...process.env,
      PORT: TEST_PORT,
      NODE_ENV: 'production',
      K_SERVICE: 'ca-exam-checker-ai',
      K_REVISION: 'ca-exam-checker-ai-00001-abc',
    },
    stdio: 'pipe',
  });

  let serverStarted = false;
  let serverOutput = '';

  serverProcess.stdout?.on('data', (data) => {
    const text = data.toString();
    serverOutput += text;
    process.stdout.write(`[Server stdout] ${text}`);
    if (text.includes('successfully listening')) {
      serverStarted = true;
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    const text = data.toString();
    serverOutput += text;
    process.stderr.write(`[Server stderr] ${text}`);
  });

  // Wait for server to finish Firestore hydration and start listening
  const startTime = Date.now();
  while (!serverStarted && Date.now() - startTime < 35000) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!serverStarted) {
    serverProcess.kill('SIGKILL');
    throw new Error(`Server failed to start and listen on port ${TEST_PORT} within 35s.\nOutput: ${serverOutput}`);
  }

  console.log(`\n[Test] Server is listening! Sending verification probes...`);

  // Probe 1: Cloud Run Liveness / Health Check endpoint
  const healthzRes = await fetch(`http://127.0.0.1:${TEST_PORT}/healthz`);
  if (healthzRes.status !== 200) {
    throw new Error(`/healthz returned status ${healthzRes.status}, expected 200 OK`);
  }
  const healthzText = await healthzRes.text();
  console.log(`[Probe 1: /healthz] Status: ${healthzRes.status}, Body: ${healthzText}`);

  // Probe 2: Production API Health endpoint
  const apiHealthRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`);
  if (apiHealthRes.status !== 200) {
    throw new Error(`/api/health returned status ${apiHealthRes.status}, expected 200 OK`);
  }
  const apiHealthJson = await apiHealthRes.json();
  console.log(`[Probe 2: /api/health] Status: ${apiHealthRes.status}, Data:`, apiHealthJson);

  // Probe 3: SPA Root HTML / Static Delivery
  const spaRes = await fetch(`http://127.0.0.1:${TEST_PORT}/`);
  if (spaRes.status !== 200) {
    throw new Error(`/ returned status ${spaRes.status}, expected 200 OK`);
  }
  const contentType = spaRes.headers.get('content-type') || '';
  console.log(`[Probe 3: / (SPA)] Status: ${spaRes.status}, Content-Type: ${contentType}`);

  // Probe 4: Clean graceful shutdown on SIGTERM (Cloud Run scale-to-zero / revision swap requirement)
  console.log(`[Test] Emitting SIGTERM to test clean Cloud Run graceful shutdown...`);
  const shutdownPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      serverProcess.kill('SIGKILL');
      reject(new Error('Server did not shut down cleanly within 10s of SIGTERM'));
    }, 10000);

    serverProcess.on('exit', (code, signal) => {
      clearTimeout(timer);
      console.log(`[Test] Server process exited with code ${code}, signal ${signal}.`);
      if (code === 0 || signal === 'SIGTERM') {
        resolve();
      } else {
        reject(new Error(`Unexpected exit code ${code}`));
      }
    });
  });

  serverProcess.kill('SIGTERM');
  await shutdownPromise;

  console.log('\n[PASS] Cloud Run container startup and operational verification PASSED perfectly!\n');
}

verifyCloudRunProductionStartup().catch((err) => {
  console.error('\n[FAIL] Cloud Run verification error:', err);
  process.exit(1);
});
