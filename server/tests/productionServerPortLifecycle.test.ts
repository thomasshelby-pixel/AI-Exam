import { spawn, ChildProcess } from 'node:child_process';
import assert from 'node:assert';

function waitForPort(port: number, timeoutMs = 25000): Promise<{ child: ChildProcess; output: string }> {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn('node', ['dist/server.cjs'], {
      env: {
        ...process.env,
        ...(port > 0 ? { PORT: String(port) } : {}),
        NODE_ENV: 'production',
        K_SERVICE: 'ca-exam-checker-ai',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (port === 0) {
      delete (child as any).spawnargs;
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Server on port ${port} timed out after ${timeoutMs}ms.\nOutput:\n${output}`));
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      const s = d.toString();
      output += s;
      if (s.includes('successfully listening')) {
        clearTimeout(timer);
        resolve({ child, output });
      }
    });

    child.stderr?.on('data', (d) => {
      output += d.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      if (!output.includes('successfully listening')) {
        reject(new Error(`Server exited prematurely with code ${code}.\nOutput:\n${output}`));
      }
    });
  });
}

async function shutdownGracefully(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve();
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function runProductionPortTests() {
  console.log('========================================================================');
  console.log('--- PRODUCTION SERVER PORT & RUNTIME LIFECYCLE VERIFICATION ---');
  console.log('========================================================================\n');

  // Test 1: Injected PORT=8080 (Standard Firebase App Hosting / Cloud Run default)
  console.log('[TEST 1] Testing production server with injected PORT=8080...');
  const test1 = await waitForPort(8080);
  assert(test1.output.includes('port 8080'), 'Server must announce listening on port 8080');
  assert(test1.output.includes('http://0.0.0.0:8080'), 'Server must bind to 0.0.0.0:8080');

  const healthz8080 = await fetch('http://127.0.0.1:8080/healthz');
  assert.strictEqual(healthz8080.status, 200, '/healthz on 8080 must return 200 OK');
  const healthz8080Text = await healthz8080.text();
  assert.strictEqual(healthz8080Text, 'OK', '/healthz body must be OK');

  const apiHealth8080 = await fetch('http://127.0.0.1:8080/api/health');
  assert.strictEqual(apiHealth8080.status, 200, '/api/health on 8080 must return 200 OK');
  const apiHealth8080Json = await apiHealth8080.json() as any;
  assert.strictEqual(apiHealth8080Json.status, 'ok', 'API health status must be ok');

  const spa8080 = await fetch('http://127.0.0.1:8080/');
  assert.strictEqual(spa8080.status, 200, 'Root SPA delivery on 8080 must return 200 OK');
  const spa8080Text = await spa8080.text();
  assert(spa8080Text.includes('<div id="root"></div>'), 'Root SPA must serve index.html');

  await shutdownGracefully(test1.child);
  console.log('✅ [PASS] Test 1: Production server listens and serves on PORT=8080 cleanly.\n');

  // Test 2: Different Injected PORT=8089 (Dynamic Cloud Run port allocation)
  console.log('[TEST 2] Testing production server with arbitrary injected PORT=8089...');
  const test2 = await waitForPort(8089);
  assert(test2.output.includes('port 8089'), 'Server must announce listening on port 8089');
  assert(test2.output.includes('http://0.0.0.0:8089'), 'Server must bind to 0.0.0.0:8089');
  assert(!test2.output.includes('port 3000'), 'Server must NOT use 3000 when PORT=8089 is injected');

  const healthz8089 = await fetch('http://127.0.0.1:8089/healthz');
  assert.strictEqual(healthz8089.status, 200, '/healthz on 8089 must return 200 OK');

  const apiHealth8089 = await fetch('http://127.0.0.1:8089/api/health');
  assert.strictEqual(apiHealth8089.status, 200, '/api/health on 8089 must return 200 OK');

  // Verify port 3000 does NOT receive this traffic
  let port3000Failed = false;
  try {
    const res = await fetch('http://127.0.0.1:3000/healthz', { signal: AbortSignal.timeout(1000) });
    if (res.status !== 200) port3000Failed = true;
  } catch {
    port3000Failed = true;
  }
  assert(port3000Failed, 'Port 3000 must NOT be bound by this server instance');

  await shutdownGracefully(test2.child);
  console.log('✅ [PASS] Test 2: Production server dynamically respects injected PORT=8089.\n');

  // Test 3: Local execution without PORT -> defaults to safe 8080 fallback
  console.log('[TEST 3] Testing production server with absent PORT -> defaults to safe 8080...');
  const child3 = spawn('node', ['dist/server.cjs'], {
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'PORT')),
      NODE_ENV: 'production',
      K_SERVICE: 'ca-exam-checker-ai',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output3 = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child3.kill('SIGKILL');
      reject(new Error(`Timeout waiting for absent PORT test.\n${output3}`));
    }, 25000);

    child3.stdout?.on('data', (d) => {
      const s = d.toString();
      output3 += s;
      if (s.includes('successfully listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child3.stderr?.on('data', (d) => { output3 += d.toString(); });
  });

  assert(output3.includes('port 8080'), 'Server must announce default 8080 when PORT is absent');
  const healthzFallback = await fetch('http://127.0.0.1:8080/healthz');
  assert.strictEqual(healthzFallback.status, 200, '/healthz on default 8080 must return 200 OK');

  await shutdownGracefully(child3);
  console.log('✅ [PASS] Test 3: Production server defaults safely to 8080 when PORT is absent.\n');

  console.log('========================================================================');
  console.log('✅ ALL PRODUCTION SERVER PORT RUNTIME TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================\n');
}

runProductionPortTests().catch((err) => {
  console.error('❌ Production port test failed:', err);
  process.exit(1);
});
