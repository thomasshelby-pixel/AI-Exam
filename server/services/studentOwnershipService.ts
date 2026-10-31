/**
 * Builds the SQL predicate used by student-facing evaluation history and report routes.
 *
 * Ownership is intentionally limited to the authenticated user ID and legacy rows
 * associated with the same normalized email. Do not add shared/demo account
 * exceptions here: each student's evaluations and reports are private.
 */
export function buildStudentOwnershipSql(alias: string = 'e', userAlias: string = 'u'): string {
  return `(
    ${alias}.student_id = ?
    OR (${userAlias}.email IS NOT NULL AND LOWER(${userAlias}.email) = ?)
    OR ${alias}.student_id IN (SELECT id FROM users WHERE LOWER(email) = ?)
  )`;
}

export function getStudentOwnershipParams(studentId: string, studentEmail: string): string[] {
  const normEmail = (studentEmail || '').toLowerCase().trim();
  return [studentId, normEmail, normEmail];
}
