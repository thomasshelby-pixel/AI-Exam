/**
 * Resolves stable source-component IDs from one selected master evaluation material.
 *
 * The master row owns the authoritative text fields. These IDs identify the exact
 * QP / Suggested Answer / Marking Scheme components that are carried with that text.
 * Keep this resolver shared by the submission hard-gate and the async worker so
 * both sides apply identical fallback and source-format rules.
 */
export type MaterialComponentSourceFormat = 'SEPARATE' | 'COMBINED' | 'LEGACY';

export interface MaterialComponentSourceIds {
  sourceFormat: MaterialComponentSourceFormat;
  combinedSourceMaterialId?: string;
  questionMaterialId?: string;
  suggestedAnswerMaterialId?: string;
  markingSchemeMaterialId?: string;
}

function nonEmptyString(value: unknown): string | undefined {
  const result = String(value ?? '').trim();
  return result || undefined;
}

export function resolveMaterialComponentSourceIds(
  material: any,
  markingSchemeText?: unknown,
): MaterialComponentSourceIds {
  const rawFormat = String(material?.source_format ?? material?.sourceFormat ?? 'SEPARATE')
    .trim()
    .toUpperCase();
  const sourceFormat: MaterialComponentSourceFormat =
    rawFormat === 'COMBINED' || rawFormat === 'LEGACY' ? rawFormat : 'SEPARATE';
  const masterId = nonEmptyString(material?.id) || 'unknown';
  const hasMarkingScheme = String(markingSchemeText ?? material?.marking_scheme_text ?? '').trim().length > 0;

  return {
    sourceFormat,
    combinedSourceMaterialId: sourceFormat === 'COMBINED'
      ? nonEmptyString(material?.combined_source_material_id) ||
        nonEmptyString(material?.file_id) ||
        `mat_comb_${masterId}`
      : undefined,
    questionMaterialId: sourceFormat === 'SEPARATE'
      ? nonEmptyString(material?.question_material_id) ||
        nonEmptyString(material?.file_id) ||
        `mat_qp_${masterId}`
      : undefined,
    suggestedAnswerMaterialId: sourceFormat === 'SEPARATE'
      ? nonEmptyString(material?.suggested_answer_material_id) ||
        `mat_sa_${masterId}`
      : undefined,
    markingSchemeMaterialId: hasMarkingScheme
      ? nonEmptyString(material?.marking_scheme_material_id) ||
        `mat_ms_${masterId}`
      : undefined,
  };
}


/**
 * Resolve the three private Faculty Mock TXT component IDs using the same
 * adapter shape used by the student submission route. Legacy mocks that do
 * not yet have all component IDs receive deterministic synthetic identities;
 * this keeps the worker's re-check consistent without weakening source locks.
 */
export function resolveFacultyMockComponentSourceIds(mock: any): MaterialComponentSourceIds {
  const mockId = nonEmptyString(mock?.id) || 'unknown';
  const suggestedAnswerFileId = nonEmptyString(
    mock?.suggested_answer_file_id ?? mock?.suggestedAnswerFileId,
  );
  const questionPaperReferenceFileId = nonEmptyString(
    mock?.question_paper_reference_file_id ?? mock?.questionPaperReferenceFileId,
  );
  const markingSchemeFileId = nonEmptyString(
    mock?.marking_scheme_file_id ?? mock?.markingSchemeFileId,
  );

  return resolveMaterialComponentSourceIds({
    id: mockId,
    source_format: 'SEPARATE',
    file_id: suggestedAnswerFileId,
    question_material_id: questionPaperReferenceFileId || suggestedAnswerFileId,
    suggested_answer_material_id: suggestedAnswerFileId,
    marking_scheme_material_id: markingSchemeFileId || suggestedAnswerFileId,
  }, mock?.marking_scheme_text ?? mock?.markingSchemeText);
}
