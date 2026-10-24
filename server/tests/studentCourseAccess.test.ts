import assert from 'node:assert/strict';
import {
  normalizeStudentCaLevel,
  checkStudentEvaluationCourseAccess,
  checkComboPurchaseCourseAccess,
} from '../services/studentCourseAccessService.js';

assert.equal(normalizeStudentCaLevel(' foundation '), 'FOUNDATION');
assert.equal(normalizeStudentCaLevel('INTERMEDIATE'), 'INTERMEDIATE');
assert.equal(normalizeStudentCaLevel('Final'), 'FINAL');
assert.equal(normalizeStudentCaLevel('CS'), null);
assert.equal(normalizeStudentCaLevel(null), null);

// Public evaluation is limited to the saved course.
for (const level of ['FOUNDATION', 'INTERMEDIATE', 'FINAL'] as const) {
  const allowed = checkStudentEvaluationCourseAccess(level, level);
  assert.equal(allowed.allowed, true, `${level} must evaluate its saved course`);
  for (const other of (['FOUNDATION', 'INTERMEDIATE', 'FINAL'] as const).filter((candidate) => candidate !== level)) {
    const blocked = checkStudentEvaluationCourseAccess(level, other);
    assert.equal(blocked.allowed, false, `${level} must not evaluate ${other}`);
    assert.equal(blocked.code, 'COURSE_LEVEL_MISMATCH');
    assert.ok(blocked.message?.includes('paid evaluation credits will stay in your account'));
  }
}

const missingCourse = checkStudentEvaluationCourseAccess(undefined, 'FOUNDATION');
assert.equal(missingCourse.allowed, false);
assert.equal(missingCourse.code, 'STUDENT_COURSE_NOT_SET');

const invalidRequestedCourse = checkStudentEvaluationCourseAccess('FOUNDATION', 'CS');
assert.equal(invalidRequestedCourse.allowed, false);
assert.equal(invalidRequestedCourse.code, 'INVALID_REQUESTED_COURSE');

// Combo purchases are restricted to the saved Foundation/Intermediate course.
// Final combo is intentionally unavailable; Final students can purchase Custom credits.
assert.equal(checkComboPurchaseCourseAccess('FOUNDATION', 'FOUNDATION').allowed, true);
assert.equal(checkComboPurchaseCourseAccess('INTERMEDIATE', 'INTERMEDIATE').allowed, true);
assert.equal(checkComboPurchaseCourseAccess('FOUNDATION', 'INTERMEDIATE').code, 'COURSE_LEVEL_MISMATCH');
assert.equal(checkComboPurchaseCourseAccess('INTERMEDIATE', 'FOUNDATION').code, 'COURSE_LEVEL_MISMATCH');
assert.equal(checkComboPurchaseCourseAccess('FINAL', 'INTERMEDIATE').code, 'COMBO_NOT_AVAILABLE_FOR_COURSE');
assert.equal(checkComboPurchaseCourseAccess('FINAL', 'FINAL').code, 'COMBO_NOT_AVAILABLE_FOR_COURSE');
assert.equal(checkComboPurchaseCourseAccess(undefined, 'FOUNDATION').code, 'STUDENT_COURSE_NOT_SET');

console.log('Student course access policy tests: passed.');
