import assert from 'node:assert/strict';
import { classifyGoogleAccountRecoveryState } from '../services/googleAccountRecoveryService.js';

const email = 'student@example.com';
const cloudUser = {
  id: 'usr_social_abc123',
  email,
  role: 'STUDENT',
  password_hash: 'GOOGLE_OAUTH',
  full_name: 'Google Student',
};
const cloudProfile = {
  user_id: cloudUser.id,
  icai_registration_number: 'CRO0123456',
  ca_level: 'INTERMEDIATE',
};

const firebaseOnly = classifyGoogleAccountRecoveryState({
  expectedEmail: email,
  cloudUsers: [],
});
assert.equal(firebaseOnly.status, 'FIREBASE_ONLY');

const recoverable = classifyGoogleAccountRecoveryState({
  expectedEmail: email,
  cloudUsers: [cloudUser],
  cloudProfile,
});
assert.equal(recoverable.status, 'CLOUD_RECORD_RECOVERABLE');

const tombstonedCloud = classifyGoogleAccountRecoveryState({
  expectedEmail: email,
  cloudUsers: [cloudUser],
  cloudProfile,
  cloudTombstoned: true,
});
assert.equal(tombstonedCloud.status, 'PREVIOUSLY_DELETED');

const tombstonedFirebaseIdentity = classifyGoogleAccountRecoveryState({
  expectedEmail: email,
  cloudUsers: [],
  firebaseIdentityTombstoned: true,
});
assert.equal(tombstonedFirebaseIdentity.status, 'PREVIOUSLY_DELETED');

const duplicateCloudRecords = classifyGoogleAccountRecoveryState({
  expectedEmail: email,
  cloudUsers: [cloudUser, { ...cloudUser, id: 'usr_duplicate' }],
});
assert.equal(duplicateCloudRecords.status, 'CLOUD_RECORD_INCOMPLETE');

const incompleteProfile = classifyGoogleAccountRecoveryState({
  expectedEmail: email,
  cloudUsers: [cloudUser],
  cloudProfile: { ...cloudProfile, icai_registration_number: 'REG-PENDING' },
});
assert.equal(incompleteProfile.status, 'CLOUD_RECORD_INCOMPLETE');

const mismatchedEmail = classifyGoogleAccountRecoveryState({
  expectedEmail: email,
  cloudUsers: [{ ...cloudUser, email: 'different@example.com' }],
  cloudProfile,
});
assert.equal(mismatchedEmail.status, 'CLOUD_RECORD_INCOMPLETE');

const roleConflict = classifyGoogleAccountRecoveryState({
  expectedEmail: email,
  localRole: 'SUPER_ADMIN',
  cloudUsers: [],
});
assert.equal(roleConflict.status, 'ROLE_CONFLICT');

const alreadyLinkedStudent = classifyGoogleAccountRecoveryState({
  expectedEmail: email,
  localRole: 'STUDENT',
  cloudUsers: [],
});
assert.equal(alreadyLinkedStudent.status, null);

console.log('✅ Google account recovery classification tests passed.');
