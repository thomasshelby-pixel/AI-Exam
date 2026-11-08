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
  return (input.course === 'CA_INTERMEDIATE' || input.course === 'CA_FOUNDATION')
    && input.hasTarget
    && !input.priorScopeQuestion
    && /\b(?:revision|revise|study|plan|prepare|preparation|detailed|effective|repeat|round|practice)\b/i.test(input.conversationText);
}


/** Keep CA Final chat explicitly gated until its planner curriculum is ready. */
export function getCourseUnderDevelopmentReply(course: PlannerChatCourse): string | null {
  if (course !== 'CA_FINAL') return null;
  return 'Coming soon for CA Final — under development. The CA Final AI Study Planner is being built and will be available in a future release.';
}


/**
 * The client sends role-tagged turns ("Student:" / "Planner:").
 * Only student turns may influence intent, subject parsing, or knowledge follow-ups.
 * Keep untagged legacy histories working as user-supplied context.
 */
export function extractStudentConversationHistory(history: string[]): string[] {
  const entries = history.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  const hasRoleTags = entries.some((item) => /^(?:Student|Planner):\s*/i.test(item));
  if (!hasRoleTags) return entries;
  return entries.flatMap((item) => {
    const match = item.match(/^Student:\s*(.*)$/i);
    return match && match[1].trim() ? [match[1].trim()] : [];
  });
}

/** A subject-only message is not consent to start a chapter-rating workflow. */
export function shouldAskTopicIntentClarification(input: { message: string; hasTarget: boolean }): boolean {
  if (!input.hasTarget) return false;
  return !/\b(?:explain|teach|what|why|how|difference|meaning|revision|revise|study|plan|timetable|schedule|practice|question|doubt|concept|formula|strategy|tips|prepare|preparation|chapter|tell me|help me|batao|btao|kaise|samjhao|padhai)\b/i.test(String(input.message || ''));
}
