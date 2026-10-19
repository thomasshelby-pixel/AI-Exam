export type PlannerChatCourse = 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL' | string;

export type BareTopicClarification = 'INTERMEDIATE_SM' | 'FINAL_SM_MISMATCH' | null;

/**
 * A bare abbreviation is not a complete request, but it is enough to make a
 * useful follow-up. Keep course boundaries explicit rather than silently
 * reinterpreting the student's enrolled course.
 */
export function resolveBareTopicClarification(course: PlannerChatCourse, message: string): BareTopicClarification {
  const value = String(message || '').trim();
  if (!/^(?:sm|strategic management|fm\s*[-&/]\s*sm)$/i.test(value)) return null;
  if (course === 'CA_FINAL') return 'FINAL_SM_MISMATCH';
  if (course === 'CA_INTERMEDIATE') return 'INTERMEDIATE_SM';
  return null;
}

/**
 * Chapter-specific revision assessment must run before generic plan-scope
 * prompts, except when the student is answering a scope prompt already shown.
 */
export function shouldPrioritizeChapterAssessment(input: {
  course: PlannerChatCourse;
  hasTarget: boolean;
  conversationText: string;
  priorScopeQuestion: boolean;
}): boolean {
  return input.course === 'CA_INTERMEDIATE'
    && input.hasTarget
    && !input.priorScopeQuestion
    && /\b(?:revision|revise|study|plan|prepare|preparation|detailed|effective|repeat|round|practice)\b/i.test(input.conversationText);
}


/** Keep CA Final chat explicitly gated until its planner curriculum is ready. */
export function getCourseUnderDevelopmentReply(course: PlannerChatCourse): string | null {
  if (course !== 'CA_FINAL') return null;
  return 'Coming soon for CA Final — under development. The CA Final AI Study Planner is being built and will be available in a future release.';
}
