import assert from 'node:assert';
import { getServerPort, SERVER_HOST } from '../config/serverPort.js';

console.log('========================================================================');
console.log('--- RUNNING AUTHORITATIVE SERVER PORT UNIT & BEHAVIOR TESTS ---');
console.log('========================================================================\n');

// Save original environment
const originalPortEnv = process.env.PORT;

try {
  // Test 1: When PORT is unset or undefined, getServerPort defaults to 8080
  delete process.env.PORT;
  const defaultPort = getServerPort();
  assert.strictEqual(defaultPort, 8080, 'Port must default strictly to 8080 when PORT is not provided');
  console.log('[PASS] Test 1: When process.env.PORT is absent -> server defaults to 8080');

  // Test 2: When PORT is an empty string, getServerPort defaults to 8080
  process.env.PORT = '';
  const emptyPort = getServerPort();
  assert.strictEqual(emptyPort, 8080, 'Port must default to 8080 when PORT is empty string');
  console.log('[PASS] Test 2: When process.env.PORT is empty -> server defaults to 8080');

  // Test 3: When PORT is "8080", getServerPort returns 8080
  process.env.PORT = '8080';
  const custom8080 = getServerPort();
  assert.strictEqual(custom8080, 8080, 'Port must return 8080 when PORT is "8080"');
  console.log('[PASS] Test 3: When process.env.PORT = "8080" -> server uses 8080');

  // Test 4: When PORT is custom deployment port (e.g. "8081" or "9000"), getServerPort respects it
  process.env.PORT = '9000';
  const custom9000 = getServerPort();
  assert.strictEqual(custom9000, 9000, 'Port must respect custom environment PORT');
  console.log('[PASS] Test 4: When process.env.PORT = "9000" -> server respects 9000');

  // Test 5: Verify host binding address is 0.0.0.0
  assert.strictEqual(SERVER_HOST, '0.0.0.0', 'Server bind host must strictly be 0.0.0.0');
  console.log('[PASS] Test 5: Authoritative SERVER_HOST is 0.0.0.0 (not localhost/127.0.0.1 only)');

  console.log('\n========================================================================');
  console.log('✅ ALL SERVER PORT UNIT TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================\n');
} finally {
  // Restore original environment
  if (originalPortEnv !== undefined) {
    process.env.PORT = originalPortEnv;
  } else {
    delete process.env.PORT;
  }
}
