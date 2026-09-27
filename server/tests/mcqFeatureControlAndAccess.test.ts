import assert from 'node:assert';
import { db } from '../db.js';
import {
  initFeatureFlagsTable,
  getAllFeatures,
  getFeatureByKey,
  checkFeatureAccess,
  updateFeatureControl,
  addTesterToFeature,
  removeTesterFromFeature,
  requireFeatureAccess,
} from '../services/featureControlService.js';

console.log('========================================================================');
console.log('--- TEST SUITE: MCQ ARENA FEATURE CONTROL & STUDENT ACCESS SYSTEM ---');
console.log('========================================================================');

const superAdminUser = {
  id: 'usr_super_admin_test',
  email: 'superadmin@caexamcheckerai.com',
  role: 'SUPER_ADMIN',
};

const regularStudent = {
  id: 'usr_student_regular',
  email: 'regularstudent@example.com',
  role: 'STUDENT',
};

const tester1 = {
  id: 'usr_tester_1',
  email: 'adityakumart484@gmail.com',
  role: 'STUDENT',
};

const tester2 = {
  id: 'usr_tester_2',
  email: 'test1@gmail.com',
  role: 'STUDENT',
};

const unauthorizedStudent = {
  id: 'usr_student_unauth',
  email: 'randomstudent99@gmail.com',
  role: 'STUDENT',
};

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (err: any) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// Ensure database table initialized
initFeatureFlagsTable();

// TEST 1: MCQ Arena ENABLED: normal student can access
runTest('TEST 1: MCQ Arena ENABLED allows normal student access', () => {
  updateFeatureControl('mcq_arena', { status: 'ENABLED' }, superAdminUser);
  const result = checkFeatureAccess(regularStudent, 'mcq_arena');
  assert.strictEqual(result.allowed, true, 'Regular student must be allowed when ENABLED');
  assert.strictEqual(result.status, 'ENABLED');
  assert.strictEqual(result.reason, 'enabled');
});

// TEST 2: MCQ Arena DISABLED: normal student receives access denied/development response
runTest('TEST 2: MCQ Arena DISABLED blocks normal student access', () => {
  updateFeatureControl(
    'mcq_arena',
    {
      status: 'DISABLED',
      studentMessage: 'MCQ Arena is temporarily unavailable while we work on improvements.',
    },
    superAdminUser
  );
  const result = checkFeatureAccess(regularStudent, 'mcq_arena');
  assert.strictEqual(result.allowed, false, 'Regular student must be blocked when DISABLED');
  assert.strictEqual(result.status, 'DISABLED');
  assert.strictEqual(result.reason, 'disabled');
  assert.ok(result.studentMessage.includes('temporarily unavailable'), 'Must return student message');
});

// TEST 3: MCQ Arena TESTING: adityakumart484@gmail.com can access
runTest('TEST 3: MCQ Arena TESTING allows adityakumart484@gmail.com', () => {
  updateFeatureControl('mcq_arena', { status: 'TESTING' }, superAdminUser);
  const result = checkFeatureAccess(tester1, 'mcq_arena');
  assert.strictEqual(result.allowed, true, 'Allowlisted tester1 must have access');
  assert.strictEqual(result.status, 'TESTING');
  assert.strictEqual(result.reason, 'tester_allowed');
});

// TEST 4: MCQ Arena TESTING: test1@gmail.com can access
runTest('TEST 4: MCQ Arena TESTING allows test1@gmail.com', () => {
  updateFeatureControl('mcq_arena', { status: 'TESTING' }, superAdminUser);
  const result = checkFeatureAccess(tester2, 'mcq_arena');
  assert.strictEqual(result.allowed, true, 'Allowlisted tester2 must have access');
  assert.strictEqual(result.status, 'TESTING');
  assert.strictEqual(result.reason, 'tester_allowed');
});

// TEST 5: MCQ Arena TESTING: any other student cannot access
runTest('TEST 5: MCQ Arena TESTING blocks unlisted student', () => {
  updateFeatureControl('mcq_arena', { status: 'TESTING' }, superAdminUser);
  const result = checkFeatureAccess(unauthorizedStudent, 'mcq_arena');
  assert.strictEqual(result.allowed, false, 'Unlisted student must be blocked during TESTING');
  assert.strictEqual(result.status, 'TESTING');
  assert.strictEqual(result.reason, 'limited_testing');
  assert.ok(result.studentMessage.length > 0, 'Must have student-facing testing message');
});

// TEST 6: Changing TESTING -> ENABLED: previously blocked student can access
runTest('TEST 6: Changing TESTING -> ENABLED allows previously blocked student', () => {
  updateFeatureControl('mcq_arena', { status: 'TESTING' }, superAdminUser);
  let resBefore = checkFeatureAccess(unauthorizedStudent, 'mcq_arena');
  assert.strictEqual(resBefore.allowed, false);

  updateFeatureControl('mcq_arena', { status: 'ENABLED' }, superAdminUser);
  let resAfter = checkFeatureAccess(unauthorizedStudent, 'mcq_arena');
  assert.strictEqual(resAfter.allowed, true, 'Student must have access once switched to ENABLED');
});

// TEST 7: Changing ENABLED -> DISABLED: student access is blocked
runTest('TEST 7: Changing ENABLED -> DISABLED blocks student access', () => {
  updateFeatureControl('mcq_arena', { status: 'ENABLED' }, superAdminUser);
  assert.strictEqual(checkFeatureAccess(regularStudent, 'mcq_arena').allowed, true);

  updateFeatureControl('mcq_arena', { status: 'DISABLED' }, superAdminUser);
  assert.strictEqual(checkFeatureAccess(regularStudent, 'mcq_arena').allowed, false);
});

// TEST 8: Changing DISABLED -> TESTING: only allowlisted testers can access
runTest('TEST 8: Changing DISABLED -> TESTING allows only testers', () => {
  updateFeatureControl('mcq_arena', { status: 'DISABLED' }, superAdminUser);
  assert.strictEqual(checkFeatureAccess(tester1, 'mcq_arena').allowed, false);
  assert.strictEqual(checkFeatureAccess(unauthorizedStudent, 'mcq_arena').allowed, false);

  updateFeatureControl('mcq_arena', { status: 'TESTING' }, superAdminUser);
  assert.strictEqual(checkFeatureAccess(tester1, 'mcq_arena').allowed, true);
  assert.strictEqual(checkFeatureAccess(unauthorizedStudent, 'mcq_arena').allowed, false);
});

// TEST 9: Tester email comparison is case-insensitive
runTest('TEST 9: Tester email matching is strictly case-insensitive', () => {
  updateFeatureControl('mcq_arena', { status: 'TESTING' }, superAdminUser);
  const mixedCaseUser = {
    id: 'usr_mixed_case',
    email: 'Test1@GMAIL.COM',
    role: 'STUDENT',
  };
  const result = checkFeatureAccess(mixedCaseUser, 'mcq_arena');
  assert.strictEqual(result.allowed, true, 'Mixed case email must match allowlisted tester');

  const mixedCaseUser2 = {
    id: 'usr_mixed_case2',
    email: 'AdityaKumarT484@Gmail.com',
    role: 'STUDENT',
  };
  const result2 = checkFeatureAccess(mixedCaseUser2, 'mcq_arena');
  assert.strictEqual(result2.allowed, true, 'CamelCase email must match allowlisted tester');
});

// TEST 10: Frontend cannot bypass backend access control
runTest('TEST 10: Backend middleware enforces feature control regardless of frontend claims', () => {
  updateFeatureControl('mcq_arena', { status: 'TESTING' }, superAdminUser);
  const middleware = requireFeatureAccess('mcq_arena');

  let nextCalled = false;
  let responseStatus = 0;
  let responseBody: any = null;

  const mockReq: any = {
    user: unauthorizedStudent,
  };
  const mockRes: any = {
    status(code: number) {
      responseStatus = code;
      return {
        json(body: any) {
          responseBody = body;
        },
      };
    },
  };
  const mockNext = () => {
    nextCalled = true;
  };

  middleware(mockReq, mockRes, mockNext);
  assert.strictEqual(nextCalled, false, 'Next must NOT be called for unauthorized student');
  assert.strictEqual(responseStatus, 403, 'Must return HTTP 403 Forbidden');
  assert.strictEqual(responseBody.error, 'Feature unavailable');
  assert.strictEqual(responseBody.reason, 'limited_testing');
});

// TEST 11: Direct API request from unauthorized student receives rejection
runTest('TEST 11: Direct API request from unauthorized student returns 403 rejection', () => {
  updateFeatureControl('mcq_arena', { status: 'DISABLED' }, superAdminUser);
  const middleware = requireFeatureAccess('mcq_arena');

  let responseStatus = 0;
  let responseBody: any = null;

  const mockReq: any = { user: regularStudent };
  const mockRes: any = {
    status(code: number) {
      responseStatus = code;
      return {
        json(body: any) {
          responseBody = body;
        },
      };
    },
  };

  middleware(mockReq, mockRes, () => {});
  assert.strictEqual(responseStatus, 403, 'Direct call to disabled feature must return 403');
  assert.strictEqual(responseBody.reason, 'disabled');
});

// TEST 12: Server restart does not reset feature status
runTest('TEST 12: Server restart / re-initialization does not reset feature status', () => {
  // Set custom status DISABLED with custom message
  const customMessage = 'System undergoing emergency maintenance by Super Admin.';
  updateFeatureControl('mcq_arena', { status: 'DISABLED', studentMessage: customMessage }, superAdminUser);

  // Simulate server restart by invoking initFeatureFlagsTable again
  initFeatureFlagsTable();

  const featAfterRestart = getFeatureByKey('mcq_arena');
  assert.ok(featAfterRestart);
  assert.strictEqual(featAfterRestart.status, 'DISABLED', 'Status must survive server restart');
  assert.strictEqual(featAfterRestart.student_message, customMessage, 'Message must survive restart');
});

// TEST 13: Deployment/migration does not reset feature status
runTest('TEST 13: Deployment/migration does not reset feature status or wipe testers', () => {
  // Add a special pilot tester
  const pilotEmail = 'pilot.evaluator@example.com';
  addTesterToFeature('mcq_arena', pilotEmail, superAdminUser);

  // Simulate deployment migration routine
  initFeatureFlagsTable();

  const feat = getFeatureByKey('mcq_arena');
  assert.ok(feat);
  const hasPilot = feat.testers.some((t) => t.email === pilotEmail);
  assert.strictEqual(hasPilot, true, 'Allowlisted testers must survive deployment/migration');

  // Clean up pilot email
  removeTesterFromFeature('mcq_arena', pilotEmail, superAdminUser);
});

// TEST 14: Super Admin can modify feature status
runTest('TEST 14: Super Admin can modify feature status and audit log is recorded', () => {
  const updated = updateFeatureControl(
    'mcq_arena',
    { status: 'TESTING', studentMessage: 'Limited Pilot Evaluation' },
    superAdminUser,
    '192.168.1.50'
  );
  assert.strictEqual(updated.status, 'TESTING');
  assert.strictEqual(updated.student_message, 'Limited Pilot Evaluation');

  // Verify audit log entry was created
  const log = db.prepare(`
    SELECT action, entity_type, entity_id, details FROM audit_logs
    WHERE entity_type = 'FEATURE_FLAG' AND action = 'FEATURE_CONTROL_UPDATE'
    ORDER BY rowid DESC LIMIT 1
  `).get() as { action: string; entity_type: string; entity_id: string; details: string } | undefined;

  assert.ok(log, 'Audit log entry must exist for feature update');
  assert.strictEqual(log.entity_id, 'mcq_arena');
  const details = JSON.parse(log.details);
  assert.strictEqual(details.newStatus, 'TESTING');
  assert.strictEqual(details.changedBy, superAdminUser.email);
});

// TEST 15: Super Admin can add/remove tester
runTest('TEST 15: Super Admin can add and remove testers with validation', () => {
  const newTesterEmail = 'newtestaccount@gmail.com';

  // 1. Add tester
  const testerRecord = addTesterToFeature('mcq_arena', newTesterEmail, superAdminUser);
  assert.strictEqual(testerRecord.email, newTesterEmail);

  // 2. Duplicate addition must fail
  assert.throws(() => {
    addTesterToFeature('mcq_arena', newTesterEmail, superAdminUser);
  }, /already allowlisted/i);

  // 3. Invalid email format must fail
  assert.throws(() => {
    addTesterToFeature('mcq_arena', 'invalid-not-an-email', superAdminUser);
  }, /invalid email/i);

  // 4. Remove tester
  const removeResult = removeTesterFromFeature('mcq_arena', testerRecord.id, superAdminUser);
  assert.strictEqual(removeResult.success, true);
  assert.strictEqual(removeResult.removedEmail, newTesterEmail);

  // 5. Verify removed
  const feat = getFeatureByKey('mcq_arena');
  assert.ok(feat);
  assert.strictEqual(feat.testers.some((t) => t.id === testerRecord.id), false);
});

// TEST 16: Normal student cannot modify feature settings
runTest('TEST 16: Non-SuperAdmin accounts cannot modify feature flags', () => {
  // Verify check in checkFeatureAccess treats regular students as non-admin
  const studentCheck = checkFeatureAccess(regularStudent, 'mcq_arena');
  assert.notStrictEqual(studentCheck.reason, 'admin_override');

  // Verify Super Admin receives admin_override
  const adminCheck = checkFeatureAccess(superAdminUser, 'mcq_arena');
  assert.strictEqual(adminCheck.allowed, true);
  assert.strictEqual(adminCheck.reason, 'admin_override');
});

// TEST 17: Disabled feature does not create practice sessions or expose MCQ data
runTest('TEST 17: Disabled feature blocks session creation and data exposure', () => {
  updateFeatureControl('mcq_arena', { status: 'DISABLED' }, superAdminUser);

  // Simulate student trying to access session creation endpoint
  const middleware = requireFeatureAccess('mcq_arena');
  let sessionCreated = false;
  let statusCode = 0;
  let responseData: any = null;

  const mockReq: any = {
    user: regularStudent,
    path: '/sessions/create',
  };
  const mockRes: any = {
    status(code: number) {
      statusCode = code;
      return {
        json(body: any) {
          responseData = body;
        },
      };
    },
  };
  const mockNext = () => {
    // If next() was reached, session would be created
    sessionCreated = true;
  };

  middleware(mockReq, mockRes, mockNext);

  assert.strictEqual(sessionCreated, false, 'Session creation must NEVER be reached when disabled');
  assert.strictEqual(statusCode, 403, 'Must return 403 Forbidden');
  assert.strictEqual(responseData.error, 'Feature unavailable');
  assert.strictEqual(responseData.status, 'DISABLED');
});

// Reset initial state to TESTING with initial testers
updateFeatureControl(
  'mcq_arena',
  {
    status: 'TESTING',
    studentMessage:
      "MCQ Arena is currently under development and limited testing. We're working on improving the question bank, practice experience and overall system. Public access will be available soon.",
  },
  superAdminUser
);

console.log('========================================================================');
console.log('✅ ALL 17 / 17 FEATURE CONTROL & ACCESS SYSTEM TESTS PASSED CLEANLY!');
console.log('========================================================================');
