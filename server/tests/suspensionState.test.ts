import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPreserveLocalSuspension } from '../services/suspensionState.js';

test('stale Firestore reactivation cannot undo a newer local suspension', () => {
  assert.equal(shouldPreserveLocalSuspension(
    'SUSPENDED',
    '2026-10-22 14:00:00',
    'REINSTATED',
    '2026-10-22T13:59:59.000Z',
  ), true);
});

test('missing incoming timestamp fails closed for an active local suspension', () => {
  assert.equal(shouldPreserveLocalSuspension('SUSPENDED', '2026-10-22 14:00:00', 'REINSTATED', null), true);
});

test('missing local status timestamp also fails closed rather than guessing that reinstatement is newer', () => {
  assert.equal(shouldPreserveLocalSuspension('SUSPENDED', null, 'REINSTATED', '2026-10-22T14:00:01.000Z'), true);
});

test('a newer explicit reactivation is not blocked', () => {
  assert.equal(shouldPreserveLocalSuspension(
    'SUSPENDED',
    '2026-10-22 14:00:00',
    'REINSTATED',
    '2026-10-22T14:00:01.000Z',
  ), false);
});

test('the helper never overrides an incoming active suspension', () => {
  assert.equal(shouldPreserveLocalSuspension(
    'SUSPENDED',
    '2026-10-22 14:00:00',
    'SUSPENDED',
    '2026-10-22T13:00:00.000Z',
  ), false);
});

test('inactive local records do not block a legitimate reactivation state', () => {
  assert.equal(shouldPreserveLocalSuspension(
    'REINSTATED',
    '2026-10-22 14:00:00',
    'REINSTATED',
    '2026-10-22T14:00:01.000Z',
  ), false);
});
