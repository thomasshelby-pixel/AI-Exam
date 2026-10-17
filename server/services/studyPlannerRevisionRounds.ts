export interface ChapterDifficulty {
  subject: string;
  chapter: string;
  strength: string;
  priority_score?: number;
}

export interface RevisionRoundChapter {
  subject: string;
  chapter: string;
  strength: string;
  priority_score: number;
  start_date: string;
  end_date: string;
  estimated_hours: number;
  method: string;
  steps: string[];
}

export interface RevisionRound {
  key: string;
  title: string;
  start_date: string;
  end_date: string;
  days: number;
  focus: string;
  chapters: RevisionRoundChapter[];
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
    const totalWeight = chapters.reduce((sum, item) => sum + (item.strength === 'WEAK' ? 3 : item.strength === 'STRONG' ? 1 : 2), 0) || 1;
    let cumulativeWeight = 0;
    const roundChapters = chapters.map((chapter) => {
      const weight = chapter.strength === 'WEAK' ? 3 : chapter.strength === 'STRONG' ? 1 : 2;
      const chapterStartOffset = Math.min(days - 1, Math.floor((cumulativeWeight / totalWeight) * days));
      cumulativeWeight += weight;
      const chapterEndOffset = Math.min(days - 1, Math.max(chapterStartOffset, Math.ceil((cumulativeWeight / totalWeight) * days) - 1));
      const chapterStart = new Date(start_date + 'T00:00:00.000Z');
      chapterStart.setUTCDate(chapterStart.getUTCDate() + chapterStartOffset);
      const chapterEnd = new Date(start_date + 'T00:00:00.000Z');
      chapterEnd.setUTCDate(chapterEnd.getUTCDate() + chapterEndOffset);
      const method = index === 0
        ? 'Review concepts and notes first, then solve chapter questions without looking at the solution.'
        : index === 1
          ? 'Recall key points from memory, solve exam-style questions, then review mistakes.'
          : index === 2
            ? 'Practise RTP/MTP/PYQs under time limits and record every error.'
            : 'Rapid active recall, formula/provision review and targeted practice from mock-test errors.';
      const steps = index === 0
        ? ['Review concepts, notes and key provisions/formulas', 'Close notes and recall the chapter structure', 'Solve selected module questions', 'Record doubts and mistakes']
        : index === 1
          ? ['Do a 10-minute closed-book recall', 'Attempt exam-style questions', 'Check answers and classify mistakes', 'Revisit weak concepts only']
          : index === 2
            ? ['Attempt RTP/MTP/PYQs timed', 'Check answers against the suggested answer', 'Maintain an error log', 'Redo incorrect questions']
            : ['Revise short notes, formulas and provisions', 'Review mock-test errors', 'Attempt a short timed question set', 'Finish with active recall'];
      return {
        ...chapter,
        start_date: chapterStart.toISOString().slice(0, 10),
        end_date: chapterEnd.toISOString().slice(0, 10),
        estimated_hours: Math.max(0.5, Math.round((days * input.daily_study_hours * weight / totalWeight) * 10) / 10),
        method,
        steps,
      };
    });
    return {
      key,
      title: key + (index === 0 ? ' · Foundation revision' : index === roundCount - 1 ? ' · Final exam revision' : ' · Practice and recall'),
      start_date, end_date, days,
      focus: focuses[Math.min(index, focuses.length - 1)],
      chapters: roundChapters,
    };
  });
}
