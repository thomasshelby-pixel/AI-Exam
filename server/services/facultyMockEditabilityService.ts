export interface FacultyMockEditabilityInput {
  verified?: boolean;
  hasEvaluation?: boolean;
  hasFreeCopyClaim?: boolean;
  hasPaidCopyEntitlement?: boolean;
  hasActivePaymentOrder?: boolean;
  evaluationInProgress?: boolean;
}

export interface FacultyMockEditabilityState {
  verified: boolean;
  hasEvaluation: boolean;
  hasIssuedStudentEntitlement: boolean;
  scoringInputsLocked: boolean;
  accessTypeLocked: boolean;
  evaluationInProgress: boolean;
}

/**
 * Keep the UI editability preview and the server-side update guard on the same
 * rule. Any uncertainty is fail-closed: protected scoring inputs remain locked.
 */
export function deriveFacultyMockEditability(
  input: FacultyMockEditabilityInput,
): FacultyMockEditabilityState {
  const verified = input.verified !== false;
  const hasEvaluation = Boolean(input.hasEvaluation);
  const hasIssuedStudentEntitlement = Boolean(
    input.hasFreeCopyClaim ||
    input.hasPaidCopyEntitlement ||
    input.hasActivePaymentOrder
  );
  const locked = !verified || hasEvaluation || hasIssuedStudentEntitlement;

  return {
    verified,
    hasEvaluation,
    hasIssuedStudentEntitlement,
    scoringInputsLocked: locked,
    accessTypeLocked: locked,
    evaluationInProgress: Boolean(input.evaluationInProgress),
  };
}
