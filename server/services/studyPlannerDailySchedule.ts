export type DailyStudyActivity = 'CONCEPT_REVIEW' | 'QUESTION_PRACTICE' | 'ACTIVE_RECALL';

export interface DailyStudyPriority {
  subject: string;
  chapter: string;
  strength: string;
  priority_score: number;
}

export interface DailyStudySession {
  order: number;
  subject: string;
  chapter: string;
  activity: DailyStudyActivity;
  label: string;
  minutes: number;
  instruction: string;
  priority_score: number;
}

export interface DailyStudySchedule {
  date: string;
  available_minutes: number;
  scheduled_minutes: number;
  unscheduled_minutes: number;
  sessions: DailyStudySession[];
  assumptions: string[];
}

const MIN_AVAILABLE_MINUTES = 30;
const MAX_AVAILABLE_MINUTES = 720;
const SESSION_CAP_MINUTES = 50;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizePriority(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 50;
  return Math.max(0, Math.min(100, score));
}

/**
 * Builds a deterministic, API-free daily study schedule from already-rated chapters.
 * Only chapters supplied by the caller are used; this function never invents curriculum.
 */
export function createDailyStudySchedule(input: {
  date: string;
  available_minutes: number;
  priorities: DailyStudyPriority[];
}): DailyStudySchedule {
  if (!validDate(input.date)) throw new Error('date must be a valid YYYY-MM-DD date');

  const available = Number(input.available_minutes);
  if (!Number.isInteger(available) || available < MIN_AVAILABLE_MINUTES || available > MAX_AVAILABLE_MINUTES) {
    throw new Error('available_minutes must be an integer between 30 and 720');
  }

  const unique = new Map<string, DailyStudyPriority>();
  for (const item of input.priorities || []) {
    const subject = String(item.subject || '').trim();
    const chapter = String(item.chapter || '').trim();
    if (!subject || !chapter || chapter === '__SUBJECT_LEVEL__') continue;
    const key = subject.toLowerCase() + '::' + chapter.toLowerCase();
    const current = unique.get(key);
    const normalized = { subject, chapter, strength: String(item.strength || 'MODERATE').toUpperCase(), priority_score: normalizePriority(item.priority_score) };
    if (!current || normalized.priority_score > normalizePriority(current.priority_score)) unique.set(key, normalized);
  }

  const chapters = [...unique.values()].sort((a, b) =>
    normalizePriority(b.priority_score) - normalizePriority(a.priority_score)
    || a.subject.localeCompare(b.subject)
    || a.chapter.localeCompare(b.chapter)
  );

  if (chapters.length === 0) {
    return {
      date: input.date,
      available_minutes: available,
      scheduled_minutes: 0,
      unscheduled_minutes: available,
      sessions: [],
      assumptions: ['Rate at least one chapter first. The planner will not guess which chapters are weak.'],
    };
  }

  // Divide available time into small, actionable sessions; give higher-priority chapters
  // the first slots, while rotating subjects where possible.
  const slots: Array<{ chapter: DailyStudyPriority; minutes: number }> = [];
  let remaining = available;
  let cursor = 0;
  while (remaining > 0) {
    const chapter = chapters[cursor % chapters.length];
    const minutes = Math.min(SESSION_CAP_MINUTES, remaining);
    slots.push({ chapter, minutes });
    remaining -= minutes;
    cursor += 1;
  }

  const activities: Array<{ activity: DailyStudyActivity; label: string; share: number; instruction: string }> = [
    { activity: 'CONCEPT_REVIEW', label: 'Concept review', share: 0.4, instruction: 'Review class notes and core concepts; identify the rule, provision or formula.' },
    { activity: 'QUESTION_PRACTICE', label: 'Question practice', share: 0.4, instruction: 'Solve module/RTP/MTP questions without looking at the solution first.' },
    { activity: 'ACTIVE_RECALL', label: 'Active recall', share: 0.2, instruction: 'Close the material and recall key points; note errors for the next revision.' },
  ];

  const sessions: DailyStudySession[] = [];
  let order = 1;
  for (const slot of slots) {
    let activityMinutes = activities.map((activity) => Math.floor(slot.minutes * activity.share));
    activityMinutes[activityMinutes.length - 1] += slot.minutes - activityMinutes.reduce((sum, value) => sum + value, 0);
    activities.forEach((activity, index) => {
      const minutes = activityMinutes[index];
      if (minutes <= 0) return;
      sessions.push({
        order: order++,
        subject: slot.chapter.subject,
        chapter: slot.chapter.chapter,
        activity: activity.activity,
        label: activity.label,
        minutes,
        instruction: activity.instruction,
        priority_score: normalizePriority(slot.chapter.priority_score),
      });
    });
  }

  const scheduled = sessions.reduce((sum, session) => sum + session.minutes, 0);
  return {
    date: input.date,
    available_minutes: available,
    scheduled_minutes: scheduled,
    unscheduled_minutes: available - scheduled,
    sessions,
    assumptions: [
      'Chapter priority comes from saved self-ratings and, when available, mock performance.',
      'The schedule uses only chapters already rated by the student.',
      'Breaks are not counted as study minutes; take a 5–10 minute break between focused blocks.',
      'This schedule is a draft and is not saved to a calendar automatically.',
    ],
  };
}
