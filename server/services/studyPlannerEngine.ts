export type PlannerCourse = 'CA_FOUNDATION' | 'CA_INTERMEDIATE' | 'CA_FINAL' | null;
export type PlannerIntent =
  | 'create_study_plan'
  | 'update_class_schedule'
  | 'prioritize_chapters'
  | 'log_study_progress'
  | 'general_guidance'
  | 'clarify'
  | 'out_of_scope';
export type PlannerScheduleMode = 'none' | 'one_time' | 'weekly_recurring' | 'date_override';

export interface PlannerPerformanceEntry {
  subject: string;
  score: number;
  max_score: number;
}

export interface ParsedStudyPlannerRequest {
  intent: PlannerIntent;
  course: PlannerCourse;
  subjects: string[];
  duration_minutes: number | null;
  focus_text: string;
  date_text: string | null;
  schedule_mode: PlannerScheduleMode;
  class_time_text: string | null;
  performance_data: PlannerPerformanceEntry[];
  missing_info: string[];
  should_call_planner: boolean;
}

export interface StudyPlanSession {
  order: number;
  subject: string;
  label: string;
  minutes: number;
  instruction: string;
}

export interface StudyPlanDraft {
  title: string;
  total_minutes: number;
  subjects: string[];
  sessions: StudyPlanSession[];
  saved: false;
  note: string;
}

export const STUDY_PLANNER_SUBJECTS: Record<'CA_FOUNDATION' | 'CA_INTERMEDIATE', string[]> = {
  CA_FOUNDATION: [
    'Accounting',
    'Business Laws',
    'Quantitative Aptitude',
    'Business Economics',
  ],
  CA_INTERMEDIATE: [
    'Advanced Accounting',
    'Corporate and Other Laws',
    'Taxation',
    'Cost and Management Accounting',
    'Auditing and Ethics',
    'Financial Management and Strategic Management',
  ],
};

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

function emptyResult(course: PlannerCourse = null): ParsedStudyPlannerRequest {
  return {
    intent: 'clarify',
    course,
    subjects: [],
    duration_minutes: null,
    focus_text: '',
    date_text: null,
    schedule_mode: 'none',
    class_time_text: null,
    performance_data: [],
    missing_info: [],
    should_call_planner: false,
  };
}

function normalizeCourse(value: unknown): PlannerCourse {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['ca_foundation', 'foundation', 'found'].includes(normalized)) return 'CA_FOUNDATION';
  if (['ca_intermediate', 'intermediate', 'inter', 'ca_inter'].includes(normalized)) return 'CA_INTERMEDIATE';
  if (['ca_final', 'final'].includes(normalized)) return 'CA_FINAL';
  return null;
}

function detectExplicitCourse(text: string): PlannerCourse {
  if (/\bca\s*final\b|\bca final preparation\b/i.test(text)) return 'CA_FINAL';
  if (/\bca\s*foundation\b|\bfoundation student\b|\bfoundation exam\b/i.test(text)) return 'CA_FOUNDATION';
  if (/\bca\s*(?:intermediate|inter)\b|\bintermediate student\b|\bintermediate exam\b/i.test(text)) return 'CA_INTERMEDIATE';
  return null;
}

function detectDateText(message: string): string | null {
  const exactDate = message.match(new RegExp('\\b(\\d{1,2})\\s+(' + MONTHS + ')\\b', 'i'));
  if (exactDate) {
    return String(Number(exactDate[1])) + ' ' + exactDate[2][0].toUpperCase() + exactDate[2].slice(1).toLowerCase();
  }
  if (/\btoday\b/i.test(message)) return 'today';
  if (/\btomorrow\b/i.test(message)) return 'tomorrow';
  if (/\bnext week\b/i.test(message)) return 'next week';
  const month = message.match(new RegExp('\\b(' + MONTHS + ')\\b', 'i'));
  if (month) return month[1][0].toUpperCase() + month[1].slice(1).toLowerCase();
  return null;
}

function toMinutes(hour: string | number, minute: string | number | null | undefined, period: string): number {
  let normalizedHour = Number(hour) % 12;
  if (String(period).toUpperCase() === 'PM') normalizedHour += 12;
  return normalizedHour * 60 + Number(minute || 0);
}

function formatClock(hour: string, minute: string | undefined, period: string): string {
  if (minute !== undefined && minute !== '') {
    return String(Number(hour)) + ':' + String(Number(minute)).padStart(2, '0') + ' ' + period.toUpperCase();
  }
  return String(Number(hour)) + ' ' + period.toUpperCase();
}

interface TimeRange {
  duration: number;
  startText: string;
  endText: string;
}

function detectTimeRange(message: string): TimeRange | null {
  const match = message.match(/\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s+(?:to|until|–|-)\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  if (!match) return null;

  const start = toMinutes(match[1], match[2], match[3]);
  let end = toMinutes(match[4], match[5], match[6]);
  if (end <= start) end += 24 * 60;

  return {
    duration: end - start,
    startText: formatClock(match[1], match[2], match[3]),
    endText: formatClock(match[4], match[5], match[6]),
  };
}

function detectDurationMinutes(message: string): number | null {
  const explicit = message.match(/\b(\d+(?:\.\d+)?)\s*-?\s*(minutes?|mins?|hours?|hrs?|hr|h)\b/i);
  if (explicit) {
    const amount = Number(explicit[1]);
    return Math.round(amount * (explicit[2].toLowerCase().startsWith('m') ? 1 : 60));
  }

  const wordValues: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  };
  const wordMatch = message.match(/\b(one|two|three|four|five|six|seven|eight)\s*-?\s*hours?\b/i);
  if (wordMatch) return wordValues[wordMatch[1].toLowerCase()] * 60;
  if (/\bhalf an hour\b/i.test(message)) return 30;

  const range = detectTimeRange(message);
  return range ? range.duration : null;
}

interface SubjectAlias {
  pattern: string;
  subject: string;
}

const SUBJECT_ALIASES: Record<'CA_FOUNDATION' | 'CA_INTERMEDIATE', SubjectAlias[]> = {
  CA_FOUNDATION: [
    { pattern: '\\bquantitative aptitude\\b', subject: 'Quantitative Aptitude' },
    { pattern: '\\bratio and proportion(?:s)?\\b', subject: 'Quantitative Aptitude' },
    { pattern: '\\bstatistics\\b', subject: 'Quantitative Aptitude' },
    { pattern: '\\bbusiness laws?\\b', subject: 'Business Laws' },
    { pattern: '\\bbusiness economics\\b', subject: 'Business Economics' },
    { pattern: '\\baccounting\\b', subject: 'Accounting' },
  ],
  CA_INTERMEDIATE: [
    { pattern: '\\bfinancial management and strategic management\\b', subject: 'Financial Management and Strategic Management' },
    { pattern: '\\bfinancial management\\b|\\bstrategic management\\b|\\bfm\\b|\\bsm\\b', subject: 'Financial Management and Strategic Management' },
    { pattern: '\\badvanced accounting\\b', subject: 'Advanced Accounting' },
    { pattern: '\\bcost and management accounting\\b|\\bcosting\\b', subject: 'Cost and Management Accounting' },
    { pattern: '\\bcorporate and other laws?\\b|\\bbusiness laws?\\b|\\blaw\\b', subject: 'Corporate and Other Laws' },
    { pattern: '\\bauditing and ethics\\b|\\bauditing\\b|\\baudit\\b', subject: 'Auditing and Ethics' },
    { pattern: '\\btaxation\\b|\\btax\\b|\\bgst\\b', subject: 'Taxation' },
    { pattern: '\\baccounting\\b', subject: 'Advanced Accounting' },
  ],
};

function detectSubjectMentions(text: string, course: PlannerCourse): string[] {
  if (course !== 'CA_FOUNDATION' && course !== 'CA_INTERMEDIATE') return [];
  const matches: Array<{ start: number; end: number; subject: string }> = [];

  for (const alias of SUBJECT_ALIASES[course]) {
    const regex = new RegExp(alias.pattern, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length, subject: alias.subject });
      if (match[0].length === 0) regex.lastIndex += 1;
    }
  }

  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const subjects: string[] = [];
  let occupiedUntil = -1;
  for (const match of matches) {
    if (match.start < occupiedUntil) continue;
    occupiedUntil = match.end;
    if (!subjects.includes(match.subject)) subjects.push(match.subject);
  }
  return subjects;
}

function detectDays(message: string): string[] {
  const days = message.match(/\bMonday\b|\bTuesday\b|\bWednesday\b|\bThursday\b|\bFriday\b|\bSaturday\b|\bSunday\b/gi) || [];
  return Array.from(new Set(days.map((day) => day[0].toUpperCase() + day.slice(1).toLowerCase())));
}

function detectPerformanceData(message: string, subjects: string[]): PlannerPerformanceEntry[] {
  const score = message.match(/\b(?:scored|score)\s+(\d{1,3})\s+out of\s+(\d{1,3})\b/i)
    || message.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/);
  if (!score || subjects.length === 0) return [];

  const value = Number(score[1]);
  const max = Number(score[2]);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value > max) return [];
  return [{ subject: subjects[0], score: value, max_score: max }];
}

function detectWeakTopics(message: string): string[] {
  const topics = ['Ratio and Proportion', 'Statistics', 'House Property', 'Capital Gains', 'Salary', 'Marginal Costing'];
  return topics.filter((topic) => {
    return new RegExp('\\b' + topic + '\\b', 'i').test(message)
      && /\bweak\b|\bstruggling\b|\bdifficult\b/i.test(message);
  });
}

function detectInvalidFoundationSubject(message: string): string | null {
  const match = message.match(/\b(Costing|GST|Taxation|Audit|Auditing|Advanced Accounting)\b/i);
  return match ? match[1] : null;
}

function isPlannerNegated(message: string): boolean {
  return /\b(?:don't|do not|without)\b.{0,70}\b(?:create|make|need|want)\b.{0,35}\b(?:timetable|study schedule|study plan)\b/i.test(message);
}

export function parseStudyPlannerRequest(message: string, selectedCourse?: unknown): ParsedStudyPlannerRequest {
  const raw = String(message || '').trim();
  const text = raw.toLowerCase();
  if (!raw) {
    const empty = emptyResult(normalizeCourse(selectedCourse));
    empty.missing_info = ['study goal'];
    return empty;
  }

  const explicitCourse = detectExplicitCourse(raw);
  const selected = normalizeCourse(selectedCourse);

  if (explicitCourse === 'CA_FINAL' || selected === 'CA_FINAL') {
    const result = emptyResult('CA_FINAL');
    result.intent = 'out_of_scope';
    return result;
  }

  if (explicitCourse && selected && explicitCourse !== selected) {
    const result = emptyResult(explicitCourse);
    result.missing_info = ['confirm the selected CA course'];
    return result;
  }

  const course = explicitCourse || selected;
  const result = emptyResult(course);
  result.date_text = detectDateText(raw);
  result.duration_minutes = detectDurationMinutes(raw);
  result.subjects = detectSubjectMentions(raw, course);

  const weakTopics = detectWeakTopics(raw);
  if (weakTopics.length) {
    result.focus_text = weakTopics.map((topic) => 'weak chapter: ' + topic).join('; ');
  }

  const invalidFoundationSubject = course === 'CA_FOUNDATION' ? detectInvalidFoundationSubject(raw) : null;
  if (invalidFoundationSubject) {
    result.subjects = [];
    result.focus_text = invalidFoundationSubject;
  }

  const classMention = /\bclass(?:es)?\b/i.test(raw);
  const recurringDay = /\bevery\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i.test(raw);
  const classAction = /\b(schedule|move|reschedule|change|put my|set up|add)\b/i.test(raw);
  const classNegated = /\b(?:don't|do not|without)\b.{0,60}\b(?:schedule|move|reschedule|change)\b/i.test(raw);
  const classRequest = classMention && !classNegated && (classAction || recurringDay);
  const progressRequest = /\b(log|record|track|save)\b.{0,40}\b(progress|study time|revision)\b/i.test(raw);
  const priorityAction = /\b(prioriti[sz]e|rank my|which subject should i revise first|what should i study first)\b/i.test(raw);
  const generalAdvice = /\bgeneral advice\b/i.test(raw) || (/\bspaced revision\b/i.test(raw) && isPlannerNegated(raw));
  const revisionAction = /\b(study|studying|revision|revise|review|timetable|study plan|study schedule|plan my study|plan my revision)\b/i.test(raw);

  if (classRequest) {
    result.intent = 'update_class_schedule';
    const timeRange = detectTimeRange(raw);
    const moveTime = raw.match(/\bto\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
    if (/\b(move|reschedule|change)\b/i.test(raw) && result.date_text && moveTime) {
      result.schedule_mode = 'date_override';
      result.class_time_text = formatClock(moveTime[1], moveTime[2], moveTime[3]);
    } else if (recurringDay && timeRange) {
      result.schedule_mode = 'weekly_recurring';
      result.class_time_text = detectDays(raw).join(' and ') + ', ' + timeRange.startText + ' to ' + timeRange.endText;
      result.duration_minutes = timeRange.duration;
    }

    if (!course || !STUDY_PLANNER_SUBJECTS[course as 'CA_FOUNDATION' | 'CA_INTERMEDIATE']) result.missing_info.push('CA course');
    if (!result.subjects.length) result.missing_info.push('class subject');
    if (!result.class_time_text || result.schedule_mode === 'none') result.missing_info.push('class days and time');
    result.should_call_planner = Boolean(
      course && STUDY_PLANNER_SUBJECTS[course as 'CA_FOUNDATION' | 'CA_INTERMEDIATE']
      && result.subjects.length && result.class_time_text && result.schedule_mode !== 'none'
    );
    if (!result.should_call_planner) result.intent = 'clarify';
    return result;
  }

  if (generalAdvice && isPlannerNegated(raw)) {
    result.intent = 'general_guidance';
    result.subjects = [];
    return result;
  }

  if (progressRequest) {
    result.intent = 'log_study_progress';
    if (!course || !STUDY_PLANNER_SUBJECTS[course as 'CA_FOUNDATION' | 'CA_INTERMEDIATE']) result.missing_info.push('CA course');
    if (!result.subjects.length) result.missing_info.push('subject');
    if (!result.duration_minutes) result.missing_info.push('study duration');
    result.should_call_planner = result.missing_info.length === 0;
    if (!result.should_call_planner) result.intent = 'clarify';
    return result;
  }

  if (priorityAction) {
    result.intent = 'prioritize_chapters';
    result.performance_data = detectPerformanceData(raw, result.subjects);
    if (!course || !STUDY_PLANNER_SUBJECTS[course as 'CA_FOUNDATION' | 'CA_INTERMEDIATE']) result.missing_info.push('CA course');
    if (!result.subjects.length) result.missing_info.push('subject');
    if (!result.performance_data.length && !result.focus_text) result.missing_info.push('mock score or self-assessed weak chapters');
    result.should_call_planner = result.missing_info.length === 0;
    if (!result.should_call_planner) result.intent = 'clarify';
    return result;
  }

  if (revisionAction || /\bplan\b/i.test(raw)) {
    if (!course || !STUDY_PLANNER_SUBJECTS[course as 'CA_FOUNDATION' | 'CA_INTERMEDIATE']) {
      result.missing_info = ['CA course', 'subject or study goal'];
      return result;
    }
    if (invalidFoundationSubject) {
      result.missing_info = ['a valid CA Foundation subject'];
      return result;
    }
    if (!result.subjects.length) {
      result.missing_info = ['subject or study goal'];
      return result;
    }
    if (!result.duration_minutes) {
      result.schedule_mode = result.date_text ? 'one_time' : 'none';
      result.missing_info = ['available study time'];
      return result;
    }

    result.intent = 'create_study_plan';
    result.schedule_mode = 'one_time';
    result.missing_info = [];
    result.should_call_planner = true;
    return result;
  }

  result.intent = 'clarify';
  if (!course) result.missing_info.push('CA course');
  if (!result.subjects.length) result.missing_info.push('subject or study goal');
  return result;
}

function splitMinutes(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_unused, index) => base + (index < remainder ? 1 : 0));
}

export function createStudyPlanDraft(parsed: ParsedStudyPlannerRequest): StudyPlanDraft | null {
  if (
    parsed.intent !== 'create_study_plan'
    || parsed.should_call_planner !== true
    || !Number.isInteger(parsed.duration_minutes)
    || (parsed.duration_minutes || 0) <= 0
    || parsed.subjects.length === 0
  ) {
    return null;
  }

  const totalMinutes = parsed.duration_minutes as number;
  const subjectMinutes = splitMinutes(totalMinutes, parsed.subjects.length);
  const sessions: StudyPlanSession[] = [];
  let order = 1;

  parsed.subjects.forEach((subject, index) => {
    const subjectTotal = subjectMinutes[index];
    const conceptMinutes = Math.floor(subjectTotal * 0.5);
    const practiceMinutes = Math.floor(subjectTotal / 3);
    const recallMinutes = subjectTotal - conceptMinutes - practiceMinutes;
    const activities = [
      { label: 'Concept review and theory', minutes: conceptMinutes, instruction: 'Review key concepts and class notes for ' + subject + '.' },
      { label: 'Practice questions', minutes: practiceMinutes, instruction: 'Solve relevant module and practice questions for ' + subject + '.' },
      { label: 'Active recall and recap', minutes: recallMinutes, instruction: 'Recall key rules, formulas, provisions and summaries for ' + subject + '.' },
    ];

    for (const activity of activities) {
      if (activity.minutes <= 0) continue;
      sessions.push({ order: order++, subject, ...activity });
    }
  });

  return {
    title: parsed.date_text ? 'Study plan for ' + parsed.date_text : 'Study plan draft',
    total_minutes: totalMinutes,
    subjects: [...parsed.subjects],
    sessions,
    saved: false,
    note: 'Draft only. It has not been saved to your student account or calendar.',
  };
}
