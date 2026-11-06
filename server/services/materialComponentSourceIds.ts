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
