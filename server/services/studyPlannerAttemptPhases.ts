export type AttemptPhaseKey = 'SYLLABUS_COMPLETION' | 'FIRST_REVISION' | 'RTP_MTP_PRACTICE' | 'MOCK_TESTS' | 'FINAL_REVISION';

export interface AttemptPhase {
  key: AttemptPhaseKey;
  title: string;
  start_date: string;
  end_date: string;
  percentage: number;
  goals: string[];
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(value: string, days: number): string {
  const date = new Date(value + 'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end + 'T00:00:00.000Z') - Date.parse(start + 'T00:00:00.000Z')) / 86_400_000);
}

/**
 * Deterministic attempt-wide roadmap, separate from the rolling 7-day timetable.
 * It never guesses an exam date: callers must supply an exact date to get phases.
 */
export function createAttemptStudyPhases(input: {
  start_date: string;
  exact_exam_date: string;
  syllabus_completion_percent?: number;
}): AttemptPhase[] {
  if (!validDate(input.start_date) || !validDate(input.exact_exam_date)) {
    throw new Error('A valid start date and exact exam date are required for an attempt-wide plan.');
  }
  const totalDays = daysBetween(input.start_date, input.exact_exam_date) + 1;
  if (totalDays < 14) throw new Error('Attempt-wide planning needs at least 14 days before the exact exam date.');
  const completion = input.syllabus_completion_percent ?? 0;
  if (!Number.isFinite(completion) || completion < 0 || completion > 100) {
    throw new Error('Syllabus completion must be between 0 and 100.');
  }

  // Rebalance remaining time without changing the final revision and mock-test priorities.
  const remaining = 100 - completion;
  const weights = completion >= 90
    ? [0, 15, 25, 25, 35]
    : completion >= 70
      ? [10, 20, 25, 20, 25]
      : [30, 20, 20, 15, 15];
  const activeWeights = weights.map((weight, index) => index === 0 ? Math.max(5, weight * remaining / 100) : weight);
  const weightTotal = activeWeights.reduce((sum, value) => sum + value, 0);
  const durations = activeWeights.map((weight) => Math.max(0, Math.floor(totalDays * weight / weightTotal)));
  let allocated = durations.reduce((sum, value) => sum + value, 0);
  for (let i = durations.length - 1; allocated < totalDays; i = (i + durations.length - 1) % durations.length) {
    durations[i] += 1;
    allocated += 1;
  }

  const definitions: Array<Omit<AttemptPhase, 'start_date' | 'end_date' | 'percentage'>> = [
    { key: 'SYLLABUS_COMPLETION', title: 'Syllabus completion', goals: ['Finish pending chapters in priority order', 'Mark each chapter complete only after a question-practice check'] },
    { key: 'FIRST_REVISION', title: 'First revision', goals: ['Revise notes, provisions and formulas', 'Maintain a short list of mistakes and weak areas'] },
    { key: 'RTP_MTP_PRACTICE', title: 'RTP / MTP practice', goals: ['Solve applicable ICAI RTP and MTP questions', 'Review every incorrect or skipped answer'] },
    { key: 'MOCK_TESTS', title: 'Mock tests', goals: ['Attempt timed full-length papers', 'Analyse marks, time management and recurring errors'] },
    { key: 'FINAL_REVISION', title: 'Final revision', goals: ['Revise marked weak areas and concise notes', 'Avoid starting large new topics unless essential'] },
  ];

  let cursor = input.start_date;
  const phases = definitions.map((definition, index) => {
    const length = durations[index];
    const end_date = addDays(cursor, Math.max(0, length - 1));
    const phase: AttemptPhase = {
      ...definition,
      start_date: cursor,
      end_date,
      percentage: Math.round(length * 100 / totalDays),
    };
    cursor = addDays(end_date, 1);
    return phase;
  });
  const priorPercentages = phases.slice(0, -1).reduce((sum, phase) => sum + phase.percentage, 0);
  phases[phases.length - 1].percentage = 100 - priorPercentages;
  return phases;
}
