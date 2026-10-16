export interface MultiDayPriority {
  subject: string;
  chapter: string;
  strength: string;
  priority_score: number;
}

export interface MultiDaySession {
  order: number;
  date: string;
  start_time: string;
  end_time: string;
  subject: string;
  chapter: string;
  activity: 'CONCEPT_REVIEW' | 'QUESTION_PRACTICE' | 'ACTIVE_RECALL';
  label: string;
  minutes: number;
  instruction: string;
  priority_score: number;
}

export interface ClassBlock { day_of_week: number; start_time: string; end_time: string; label?: string; }

export interface MultiDayStudyPlan {
  start_date: string;
  end_date: string;
  attempt: string;
  exact_exam_date: string | null;
  daily_study_minutes: number;
  study_start_time: string;
  preferred_end_time: string;
  class_mode: 'none' | 'fixed' | 'flexible';
  sessions: MultiDaySession[];
  assumptions: string[];
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function parseClock(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
function formatClock(value: number): string {
  const wrapped = ((value % 1440) + 1440) % 1440;
  return String(Math.floor(wrapped / 60)).padStart(2, '0') + ':' + String(wrapped % 60).padStart(2, '0');
}
function addDaysISO(value: string, days: number): string {
  const date = new Date(value + 'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Builds a 7-day, API-free study timetable. Rated chapters are distributed across
 * days and subjects; no unrated curriculum is invented. Attempt dates are optional.
 */
export function createMultiDayStudyPlan(input: {
  start_date: string;
  daily_study_hours: number;
  study_start_time: string;
  preferred_end_time: string;
  attempt: string;
  exact_exam_date?: string | null;
  class_mode?: 'none' | 'fixed' | 'flexible';
  class_blocks?: ClassBlock[];
  priorities: MultiDayPriority[];
}): MultiDayStudyPlan {
  if (!isValidISODate(input.start_date)) throw new Error('start_date must be a valid YYYY-MM-DD date');
  if (!Number.isFinite(input.daily_study_hours) || input.daily_study_hours < 1 || input.daily_study_hours > 12) {
    throw new Error('daily_study_hours must be between 1 and 12');
  }
  const start = parseClock(input.study_start_time);
  const end = parseClock(input.preferred_end_time);
  if (start === null || end === null || end <= start) throw new Error('Choose a valid study start and end time; end must be later than start.');
  const attempt = String(input.attempt || '').trim();
  if (!/^(January|May|September) \d{4}$/.test(attempt)) throw new Error('Choose a supported CA attempt, for example May 2027.');
  const examDate = input.exact_exam_date ? String(input.exact_exam_date) : null;
  if (examDate && (!isValidISODate(examDate) || examDate < input.start_date)) {
    throw new Error('Exact exam date must be a valid date on or after the plan start date.');
  }
  const classMode = input.class_mode || 'none';
  if (!['none', 'fixed', 'flexible'].includes(classMode)) throw new Error('Choose no classes, fixed class times, or flexible class hours.');
  const classBlocks = (input.class_blocks || []).map((block) => {
    const blockStart = parseClock(block.start_time);
    const blockEnd = parseClock(block.end_time);
    if (!Number.isInteger(block.day_of_week) || block.day_of_week < 0 || block.day_of_week > 6 || blockStart === null || blockEnd === null || blockEnd <= blockStart) {
      throw new Error('Each class block needs a valid weekday and an end time after its start time.');
    }
    return { day_of_week: block.day_of_week, start: blockStart, end: blockEnd, label: String(block.label || 'Class').slice(0, 100) };
  });
  if (classMode === 'fixed' && classBlocks.length === 0) throw new Error('Add at least one fixed weekly class time, or choose no classes / flexible class hours.');
  const dailyMinutes = Math.round(input.daily_study_hours * 60);
  if (dailyMinutes > end - start) throw new Error('Your daily study hours do not fit between the chosen start and end times.');
  const unique = new Map<string, MultiDayPriority>();
  for (const item of input.priorities || []) {
    const subject = String(item.subject || '').trim();
    const chapter = String(item.chapter || '').trim();
    if (!subject || !chapter || chapter === '__SUBJECT_LEVEL__') continue;
    const key = subject.toLowerCase() + '::' + chapter.toLowerCase();
    const score = Number.isFinite(Number(item.priority_score)) ? Math.max(0, Math.min(100, Number(item.priority_score))) : 50;
    const previous = unique.get(key);
    if (!previous || score > previous.priority_score) unique.set(key, { subject, chapter, strength: String(item.strength || 'MODERATE'), priority_score: score });
  }
  const chapters = [...unique.values()].sort((a,b) => b.priority_score - a.priority_score || a.subject.localeCompare(b.subject) || a.chapter.localeCompare(b.chapter));
  const endDate = addDaysISO(input.start_date, 6);
  if (examDate && examDate < endDate) {
    // The requested window is shortened to avoid scheduling beyond the exact exam date.
  }
  const lastDate = examDate && examDate < endDate ? examDate : endDate;
  const sessions: MultiDaySession[] = [];
  const activityList = [
    { activity: 'CONCEPT_REVIEW' as const, label: 'Concept review', instruction: 'Review notes and understand the core rule, provision or formula.' },
    { activity: 'QUESTION_PRACTICE' as const, label: 'Question practice', instruction: 'Solve module, RTP or MTP questions before checking the solution.' },
    { activity: 'ACTIVE_RECALL' as const, label: 'Active recall', instruction: 'Recall key points without notes and record mistakes for revision.' },
  ];
  let chapterCursor = 0;
  for (let day = 0; day < 7; day++) {
    const date = addDaysISO(input.start_date, day);
    if (date > lastDate) break;
    if (!chapters.length) continue;
    const weekday = new Date(date + 'T00:00:00.000Z').getUTCDay();
    const unavailable = classMode === 'fixed' ? classBlocks.filter((block) => block.day_of_week === weekday).sort((a,b) => a.start - b.start) : [];
    const windows: Array<{ start: number; end: number }> = [];
    let windowStart = start;
    for (const block of unavailable) {
      if (block.end <= windowStart || block.start >= end) continue;
      if (block.start > windowStart) windows.push({ start: windowStart, end: Math.min(block.start, end) });
      windowStart = Math.max(windowStart, block.end);
    }
    if (windowStart < end) windows.push({ start: windowStart, end });
    let remaining = dailyMinutes;
    let clock = start;
    let activityCursor = day % activityList.length;
    let dayOrder = 1;
    for (const window of windows) {
      clock = Math.max(clock, window.start);
      while (remaining > 0 && clock + Math.min(45, remaining) <= window.end) {
      const minutes = Math.min(45, remaining);
      const chapter = chapters[chapterCursor % chapters.length];
      const activity = activityList[activityCursor % activityList.length];
      sessions.push({
        order: dayOrder++, date, start_time: formatClock(clock), end_time: formatClock(clock + minutes),
        subject: chapter.subject, chapter: chapter.chapter, activity: activity.activity, label: activity.label,
        minutes, instruction: activity.instruction, priority_score: chapter.priority_score,
      });
      chapterCursor += 1;
      activityCursor += 1;
      remaining -= minutes;
      clock += minutes + (remaining > 0 ? 10 : 0);
      }
      if (remaining <= 0) break;
    }
  }
  return {
    start_date: input.start_date, end_date: lastDate, attempt, exact_exam_date: examDate,
    daily_study_minutes: dailyMinutes, study_start_time: input.study_start_time, preferred_end_time: input.preferred_end_time,
    sessions,
    assumptions: chapters.length
      ? ['This is a rolling 7-day timetable toward the selected attempt; regenerate it weekly as progress changes.', 'Only saved chapter ratings and available performance data are used; unrated chapters are not guessed.', 'Subjects and chapters rotate across days; a 10-minute break is inserted between sessions and does not count as study time.',
        classMode === 'none' ? 'No class time was supplied; all selected study windows are treated as available.' : classMode === 'fixed' ? 'Recurring fixed class blocks are excluded from study windows.' : 'Flexible class hours selected: enter your actual unavailable windows by adjusting start/end times before following the plan.', 'Exact exam date is optional. Without it, the selected attempt month is a target label, not an assumed exam date.']
      : ['Rate at least one chapter first. The planner will not guess which chapters are weak.'],
  };
}
