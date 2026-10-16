export interface ChapterDifficulty {
  subject: string;
  chapter: string;
  strength: string;
  priority_score?: number;
}

export interface RevisionRound {
  key: string;
  title: string;
  start_date: string;
  end_date: string;
  days: number;
  focus: string;
  chapters: Array<{ subject: string; chapter: string; strength: string; priority_score: number }>;
}

/** Deterministic round planner. Difficulty controls priority and time pressure; dates are never guessed. */
export function createAdaptiveRevisionRounds(input: {
  start_date: string;
  exact_exam_date: string;
  daily_study_hours: number;
  chapters: ChapterDifficulty[];
}): RevisionRound[] {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(value + 'T00:00:00.000Z').getTime()) &&
    new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
  if (!valid(input.start_date) || !valid(input.exact_exam_date)) throw new Error('A valid start date and exact exam date are required.');
  if (!Number.isFinite(input.daily_study_hours) || input.daily_study_hours < 1 || input.daily_study_hours > 12) throw new Error('Daily study hours must be between 1 and 12.');
  const totalDays = Math.floor((Date.parse(input.exact_exam_date + 'T00:00:00.000Z') - Date.parse(input.start_date + 'T00:00:00.000Z')) / 86400000) + 1;
  if (totalDays < 14) throw new Error('At least 14 days are required to build revision rounds.');
  const chapters = input.chapters.map((item) => {
    const strength = String(item.strength || 'MODERATE').toUpperCase();
    const difficulty = strength === 'WEAK' ? 3 : strength === 'STRONG' ? 1 : 2;
    const score = Number.isFinite(item.priority_score) ? Number(item.priority_score) : difficulty * 25;
    return { subject: item.subject, chapter: item.chapter, strength, priority_score: score + difficulty * 10 };
  }).sort((a, b) => b.priority_score - a.priority_score);
  const weakRatio = chapters.length ? chapters.filter((c) => c.strength === 'WEAK').length / chapters.length : 0.34;
  const roundCount = totalDays >= 84 ? 4 : totalDays >= 42 ? 3 : totalDays >= 21 ? 2 : 1;
  const weights = roundCount === 4 ? [0.38, 0.27, 0.20, 0.15] : roundCount === 3 ? [0.45, 0.32, 0.23] : roundCount === 2 ? [0.58, 0.42] : [1];
  // Weak chapters need more of the available revision window, while every round spans all rated chapters.
  const adjusted = weights.map((w, i) => w * (i === 0 ? 1 + weakRatio * 0.35 : 1));
  const totalWeight = adjusted.reduce((a, b) => a + b, 0);
  const durations = adjusted.map((w) => Math.max(1, Math.floor(totalDays * w / totalWeight)));
  let allocated = durations.reduce((a, b) => a + b, 0);
  while (allocated > totalDays) { const idx = durations.findIndex((d) => d > 1); if (idx < 0) break; durations[idx]--; allocated--; }
  while (allocated < totalDays) { durations[durations.length - 1]++; allocated++; }
  const focuses = [
    'R1 · Detailed revision: concepts, notes, provisions/formulas, then chapter questions.',
    'R2 · Active recall and exam-style questions; prioritise weak chapters first.',
    'R3 · RTP/MTP/PYQ practice and targeted repair of errors.',
    'R4 · Rapid recall, mock-test mistakes and high-priority weak areas.',
  ];
  let cursor = input.start_date;
  return durations.map((days, index) => {
    const start_date = cursor;
    const end = new Date(start_date + 'T00:00:00.000Z');
    end.setUTCDate(end.getUTCDate() + days - 1);
    const end_date = end.toISOString().slice(0, 10);
    const next = new Date(end_date + 'T00:00:00.000Z');
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
    const key = 'R' + (index + 1);
    return {
      key,
      title: key + (index === 0 ? ' · Foundation revision' : index === roundCount - 1 ? ' · Final exam revision' : ' · Practice and recall'),
      start_date, end_date, days,
      focus: focuses[Math.min(index, focuses.length - 1)],
      chapters: chapters.slice(0, Math.max(1, Math.ceil(chapters.length * (index === 0 ? 1 : index === roundCount - 1 ? 0.65 : 0.85)))),
    };
  });
}
