export const STUDENT_CA_LEVELS = ['FOUNDATION', 'INTERMEDIATE', 'FINAL'] as const;

export type StudentCaLevel = typeof STUDENT_CA_LEVELS[number];

export function normalizeStudentCaLevel(value: unknown): StudentCaLevel | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return (STUDENT_CA_LEVELS as readonly string[]).includes(normalized)
    ? normalized as StudentCaLevel
    : null;
}

export function getStudentCaLevelLabel(value: unknown): string {
  const level = normalizeStudentCaLevel(value);
  if (level === 'FOUNDATION') return 'CA Foundation';
  if (level === 'INTERMEDIATE') return 'CA Intermediate';
  if (level === 'FINAL') return 'CA Final';
  return 'a valid CA course';
}

export interface CourseAccessDecision {
  allowed: boolean;
  code?: 'INVALID_REQUESTED_COURSE' | 'STUDENT_COURSE_NOT_SET' | 'COURSE_LEVEL_MISMATCH' | 'COMBO_NOT_AVAILABLE_FOR_COURSE';
  accountCourseLevel: StudentCaLevel | null;
  requestedCourseLevel: StudentCaLevel | null;
  message?: string;
}

/**
 * The course saved on the student's profile is the current course scope for
 * personal/public answer-sheet evaluation. A profile update can change this
 * scope; credit balances are deliberately not altered by this policy.
 */
export function checkStudentEvaluationCourseAccess(
  accountCourseValue: unknown,
  requestedCourseValue: unknown,
): CourseAccessDecision {
  const accountCourseLevel = normalizeStudentCaLevel(accountCourseValue);
  const requestedCourseLevel = normalizeStudentCaLevel(requestedCourseValue);

  if (!requestedCourseLevel) {
    return {
      allowed: false,
      code: 'INVALID_REQUESTED_COURSE',
      accountCourseLevel,
      requestedCourseLevel: null,
      message: 'Select a valid CA course: Foundation, Intermediate, or Final.',
    };
  }

  if (!accountCourseLevel) {
    return {
      allowed: false,
      code: 'STUDENT_COURSE_NOT_SET',
      accountCourseLevel: null,
      requestedCourseLevel,
      message: 'Your CA course is not set on your student profile. Open Profile & Settings and save your Target CA Level before evaluating an answer sheet.',
    };
  }

  if (requestedCourseLevel !== accountCourseLevel) {
    return {
      allowed: false,
      code: 'COURSE_LEVEL_MISMATCH',
      accountCourseLevel,
      requestedCourseLevel,
      message: `Your account is currently set to ${getStudentCaLevelLabel(accountCourseLevel)}. You can evaluate answer sheets only for this course. To change course, open Profile & Settings → Target CA Level and save your selection. Any remaining paid evaluation credits will stay in your account.`,
    };
  }

  return { allowed: true, accountCourseLevel, requestedCourseLevel };
}

/**
 * Combo products are priced and marketed for a specific course. Only permit
 * checkout when the requested combo course matches the student's saved course.
 * Final is not currently offered as a combo product; custom credits remain available.
 */
export function checkComboPurchaseCourseAccess(
  accountCourseValue: unknown,
  requestedCourseValue: unknown,
): CourseAccessDecision {
  const accountCourseLevel = normalizeStudentCaLevel(accountCourseValue);
  const requestedCourseLevel = normalizeStudentCaLevel(requestedCourseValue);

  if (!accountCourseLevel) {
    return {
      allowed: false,
      code: 'STUDENT_COURSE_NOT_SET',
      accountCourseLevel: null,
      requestedCourseLevel,
      message: 'Your CA course is not set on your profile. Save your Target CA Level before purchasing a course-specific combo.',
    };
  }

  if (accountCourseLevel === 'FINAL') {
    return {
      allowed: false,
      code: 'COMBO_NOT_AVAILABLE_FOR_COURSE',
      accountCourseLevel,
      requestedCourseLevel,
      message: 'Course-specific combo plans are currently available for Foundation and Intermediate only. You can purchase Custom Evaluation credits for your active CA Final course.',
    };
  }

  if (requestedCourseLevel !== 'FOUNDATION' && requestedCourseLevel !== 'INTERMEDIATE') {
    return {
      allowed: false,
      code: 'INVALID_REQUESTED_COURSE',
      accountCourseLevel,
      requestedCourseLevel,
      message: 'Select a valid course-specific combo: CA Foundation or CA Intermediate.',
    };
  }

  if (requestedCourseLevel !== accountCourseLevel) {
    return {
      allowed: false,
      code: 'COURSE_LEVEL_MISMATCH',
      accountCourseLevel,
      requestedCourseLevel,
      message: `Your account is currently set to ${getStudentCaLevelLabel(accountCourseLevel)}. You can purchase only the ${getStudentCaLevelLabel(accountCourseLevel)} combo for this account. To change course, open Profile & Settings → Target CA Level and save your selection. Existing paid credits remain in your account.`,
    };
  }

  return { allowed: true, accountCourseLevel, requestedCourseLevel };
}
