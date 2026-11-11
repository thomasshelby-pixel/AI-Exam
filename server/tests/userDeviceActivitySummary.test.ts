import assert from 'node:assert/strict';
import { normalizeUserDeviceActivityRecords } from '../services/userDeviceActivityService.js';

const normalized = normalizeUserDeviceActivityRecords([
  {
    id: 'web-device',
    user_id: 'student-1',
    platform: 'WEB',
    device_name: 'Chrome on Windows',
    first_seen_at: '2026-11-01T10:00:00.000Z',
    last_seen_at: '2026-11-10T10:00:00.000Z',
    last_login_at: '2026-11-10T10:00:00.000Z',
    login_count: '4',
    device_id: 'private-device-id',
    ip_address: '203.0.113.10',
    user_agent: 'private-user-agent',
  },
  {
    id: 'app-device',
    user_id: 'student-1',
    platform: 'APP',
    device_name: 'Android device',
    first_seen_at: '2026-11-08T10:00:00.000Z',
    last_seen_at: '2026-11-11T10:00:00.000Z',
    last_login_at: '2026-11-11T10:00:00.000Z',
    login_count: 2,
    device_id: 'another-private-device-id',
    ip_address: '198.51.100.7',
    user_agent: 'another-private-user-agent',
  },
  {
    id: 'other-student',
    user_id: 'student-2',
    platform: 'APP',
    device_name: 'Other account device',
    first_seen_at: '2026-11-01T10:00:00.000Z',
    last_seen_at: '2026-11-12T10:00:00.000Z',
    login_count: 100,
  },
], 'student-1');

assert.equal(normalized.length, 2, 'only activity for the requested student must be returned');
assert.equal(normalized[0].id, 'app-device', 'activity must be sorted newest first');
assert.equal(normalized[0].platform, 'APP');
assert.equal(normalized[0].login_count, 2);
assert.equal(normalized[1].platform, 'WEB');
assert.equal(normalized[1].login_count, 4);
assert.equal('device_id' in normalized[0], false, 'private device identifiers must not be exposed');
assert.equal('ip_address' in normalized[0], false, 'IP addresses must not be exposed in the activity summary');
assert.equal('user_agent' in normalized[0], false, 'raw user-agent strings must not be exposed');
assert.deepEqual(normalizeUserDeviceActivityRecords([], 'student-1'), []);
assert.deepEqual(normalizeUserDeviceActivityRecords([{ id: 'x', user_id: 'student-1' }], ''), []);

console.log('Student device activity privacy and platform summary regression passed.');
