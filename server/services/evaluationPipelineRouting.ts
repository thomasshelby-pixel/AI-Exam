/**
 * Routing boundary for evaluation engines.
 *
 * Faculty Mock evaluation is intentionally isolated: its existing page-audited
 * pipeline must not be changed by the public/institute evaluation refactor.
 */
export function shouldUseFacultyMockPagePipeline(input: {
  materialType?: string;
  evaluationSource?: string;
}): boolean {
  return input.materialType === 'FACULTY_MOCK_TEST' ||
    input.evaluationSource === 'FACULTY_MOCK';
}
