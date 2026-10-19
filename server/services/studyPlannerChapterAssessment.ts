export type ChapterAssessmentTarget = { label: string; storageSubject: string; chapters: string[] };

/** Resolve a CA Intermediate subject or combined paper into the chapter set to assess. */
export function resolveChapterAssessmentTarget(
  text: string,
  registry: Record<string, string[]>,
): ChapterAssessmentTarget | null {
  const value = text.toLowerCase();
  const taxonomy = registry['Taxation (Income Tax & GST)'] || [];
  const combinedFs = registry['Financial Management and Strategic Management'] || [];
  const accounting = registry['Advanced Accounting'] || [];
  const laws = registry['Corporate and Other Laws'] || [];
  const costing = registry['Cost and Management Accounting'] || [];
  const audit = registry['Auditing and Ethics'] || [];

  if (/\b(income tax\s*(?:and|&)\s*gst|taxation\s*\(\s*income tax\s*(?:and|&)\s*gst\s*\))\b/i.test(value)) {
    return { label: 'Taxation', storageSubject: 'Taxation (Income Tax & GST)', chapters: taxonomy };
  }
  if (/\b(gst|goods and services tax)\b/i.test(value)) {
    return { label: 'GST', storageSubject: 'Taxation (Income Tax & GST)', chapters: taxonomy.filter((chapter) => chapter.startsWith('GST:')) };
  }
  if (/\b(income tax|direct tax|income-tax)\b/i.test(value)) {
    return { label: 'Income Tax', storageSubject: 'Taxation (Income Tax & GST)', chapters: taxonomy.filter((chapter) => !chapter.startsWith('GST:')) };
  }
  if (/\b(fm\s*(?:and|&)\s*sm|financial management and strategic management|both fm and sm)\b/i.test(value)) {
    return { label: 'FM and SM', storageSubject: 'Financial Management and Strategic Management', chapters: combinedFs };
  }
  if (/\b(financial management|fm)\b/i.test(value)) {
    return { label: 'FM', storageSubject: 'Financial Management and Strategic Management', chapters: combinedFs.slice(0, 9) };
  }
  if (/\b(strategic management|sm)\b/i.test(value)) {
    return { label: 'SM', storageSubject: 'Financial Management and Strategic Management', chapters: combinedFs.slice(9) };
  }
  if (/\b(taxation|tax paper)\b/i.test(value)) {
    return { label: 'Taxation', storageSubject: 'Taxation (Income Tax & GST)', chapters: taxonomy };
  }
  if (/\b(costing|cost and management accounting|cost accounting)\b/i.test(value)) {
    return { label: 'Cost and Management Accounting', storageSubject: 'Cost and Management Accounting', chapters: costing };
  }
  if (/\b(corporate and other laws|corporate law|company law|law|laws)\b/i.test(value)) {
    return { label: 'Corporate and Other Laws', storageSubject: 'Corporate and Other Laws', chapters: laws };
  }
  if (/\b(advanced accounting|accounts|accounting)\b/i.test(value)) {
    return { label: 'Advanced Accounting', storageSubject: 'Advanced Accounting', chapters: accounting };
  }
  if (/\b(audit|auditing|ethics)\b/i.test(value)) {
    return { label: 'Auditing and Ethics', storageSubject: 'Auditing and Ethics', chapters: audit };
  }
  return null;
}
