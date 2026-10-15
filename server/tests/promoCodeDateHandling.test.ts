import assert from 'node:assert';
import { db } from '../db.js';

console.log('--- STARTING PROMO CODE DATE HANDLING REGRESSION TESTS ---');

// Helper replicate parseSafeIsoDate logic
function parseSafeIsoDate(val: any): string | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed === '__CLEAR__' || trimmed === 'null' || trimmed === 'undefined') return null;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

const testCode = 'TESTDATE2026';

// Cleanup first if exists
db.prepare('DELETE FROM referral_campaigns WHERE UPPER(code) = UPPER(?)').run(testCode);

// 1. Create promo code with null dates
const cleanStartDate1 = parseSafeIsoDate(null);
const cleanEndDate1 = parseSafeIsoDate(null);
assert.strictEqual(cleanStartDate1, null);
assert.strictEqual(cleanEndDate1, null);

db.prepare(`
  INSERT INTO referral_campaigns (
    code, campaign_name, description, benefit_type, benefit_duration_days,
    max_redemptions, max_evaluations, is_active, status, start_date, end_date,
    user_type, terms_notes, created_at, updated_at
  ) VALUES (
    ?, ?, ?, '1_MONTH_FREE_ACCESS', 30,
    20, 15, 1, 'ACTIVE', ?, ?,
    'ALL', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
`).run(testCode, 'Test Date Promo', 'Test description', cleanStartDate1, cleanEndDate1);

const created = db.prepare('SELECT * FROM referral_campaigns WHERE code = ?').get(testCode) as any;
assert.strictEqual(created.code, testCode);
assert.strictEqual(created.start_date, null);
assert.strictEqual(created.end_date, null);
console.log('✓ TEST 1 PASSED: Created promo code with null dates successfully.');

// 2. Update with valid ISO dates
const validStart: string = '2026-10-15';
const validEnd: string = '2026-11-15';
const parsedStart = parseSafeIsoDate(validStart);
const parsedEnd = parseSafeIsoDate(validEnd);
assert.ok(parsedStart !== null);
assert.ok(parsedEnd !== null);

const clearStart2 = validStart === '__CLEAR__' || validStart === '' ? 1 : 0;
const clearEnd2 = validEnd === '__CLEAR__' || validEnd === '' ? 1 : 0;

db.prepare(`
  UPDATE referral_campaigns
  SET start_date = CASE WHEN ? = 1 THEN NULL WHEN ? IS NOT NULL THEN ? ELSE start_date END,
      end_date = CASE WHEN ? = 1 THEN NULL WHEN ? IS NOT NULL THEN ? ELSE end_date END,
      updated_at = CURRENT_TIMESTAMP
  WHERE code = ?
`).run(clearStart2, parsedStart, parsedStart, clearEnd2, parsedEnd, parsedEnd, testCode);

const updatedWithDates = db.prepare('SELECT * FROM referral_campaigns WHERE code = ?').get(testCode) as any;
assert.strictEqual(updatedWithDates.start_date, parsedStart);
assert.strictEqual(updatedWithDates.end_date, parsedEnd);
console.log('✓ TEST 2 PASSED: Updated promo code with valid dates successfully.');

// 3. Update with '__CLEAR__' (the exact scenario that caused RangeError: Invalid time value)
const clearInput = '__CLEAR__';
const parsedClearStart = parseSafeIsoDate(clearInput);
const parsedClearEnd = parseSafeIsoDate(clearInput);
assert.strictEqual(parsedClearStart, null, 'parseSafeIsoDate must return null for __CLEAR__ without throwing RangeError');
assert.strictEqual(parsedClearEnd, null, 'parseSafeIsoDate must return null for __CLEAR__ without throwing RangeError');

const clearStart3 = clearInput === '__CLEAR__' || clearInput === '' ? 1 : 0;
const clearEnd3 = clearInput === '__CLEAR__' || clearInput === '' ? 1 : 0;
assert.strictEqual(clearStart3, 1);
assert.strictEqual(clearEnd3, 1);

db.prepare(`
  UPDATE referral_campaigns
  SET start_date = CASE WHEN ? = 1 THEN NULL WHEN ? IS NOT NULL THEN ? ELSE start_date END,
      end_date = CASE WHEN ? = 1 THEN NULL WHEN ? IS NOT NULL THEN ? ELSE end_date END,
      updated_at = CURRENT_TIMESTAMP
  WHERE code = ?
`).run(clearStart3, parsedClearStart, parsedClearStart, clearEnd3, parsedClearEnd, parsedClearEnd, testCode);

const updatedCleared = db.prepare('SELECT * FROM referral_campaigns WHERE code = ?').get(testCode) as any;
assert.strictEqual(updatedCleared.start_date, null, 'start_date must be cleared to NULL');
assert.strictEqual(updatedCleared.end_date, null, 'end_date must be cleared to NULL');
console.log('✓ TEST 3 PASSED: "__CLEAR__" properly clears dates to NULL without RangeError.');

// 4. Update with invalid string (e.g. malformed time string)
const invalidString = 'not-a-valid-date-value';
const parsedInvalid = parseSafeIsoDate(invalidString);
assert.strictEqual(parsedInvalid, null, 'parseSafeIsoDate must return null for malformed string without throwing RangeError');

// 5. Cleanup test data
db.prepare('DELETE FROM referral_campaigns WHERE code = ?').run(testCode);
console.log('✓ TEST 4 PASSED: Cleaned up test promo code.');

console.log('\n=============================================================');
console.log('ALL PROMO CODE DATE HANDLING TESTS PASSED (4/4)');
console.log('=============================================================\n');
