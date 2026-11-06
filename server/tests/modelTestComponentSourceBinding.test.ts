import assert from 'node:assert/strict';
import { enforceMaterialHardGate } from '../services/materialHardGateService.js';
import { resolveMaterialComponentSourceIds } from '../services/materialComponentSourceIds.js';

const separateMaterial = {
  id: 'mat_502c892824c23659',
  level: 'INTERMEDIATE',
  subject_key: 'advanced_accounting',
  subject_name: 'Advanced Accounting',
  paper: 'Paper 1',
  attempt: 'All',
  syllabus_version: 'New Scheme 2024',
  material_type: 'MODEL_TEST_PAPER',
  model_test_number: 1,
  source_format: 'SEPARATE',
  question_material_id: 'mat_qp_mat_502c892824c23659',
  suggested_answer_material_id: 'mat_sa_mat_502c892824c23659',
  marking_scheme_material_id: 'mat_ms_mat_502c892824c23659',
  question_paper_text: [
    'CA Intermediate - Advanced Accounting',
    'Question Paper',
    'Question 1(a) - 5 Marks',
    'Pass the required journal entries and explain the accounting treatment.',
  ].join('\n'),
  suggested_answers_text: [
    'Suggested Answers',
    'Question 1(a)',
    'The journal entries should reflect the prescribed accounting treatment and the facts stated in the question.',
  ].join('\n'),
  marking_scheme_text: [
    'Marking Scheme',
    'Question 1(a) - 5 Marks',
    'Accounting treatment: 2 marks',
    'Journal entries and workings: 2 marks',
    'Conclusion: 1 mark',
  ].join('\n'),
  status: 'ACTIVE',
  source_type: 'ADMIN',
  admin_approved: 1,
};

const verified = enforceMaterialHardGate({
  evaluationId: 'eval_model_component_ids',
  level: 'INTERMEDIATE',
  subjectKey: 'advanced_accounting',
  subjectName: 'Advanced Accounting',
  paper: 'Paper 1',
  attempt: 'All',
  syllabusVersion: 'New Scheme 2024',
  materialType: 'MODEL_TEST_PAPER',
  modelTestNumber: 1,
  evaluationSource: 'PUBLIC',
  preloadedMaterial: separateMaterial,
});

assert.equal(verified.sourceFormat, 'SEPARATE');
assert.equal(verified.questionMaterialId, 'mat_qp_mat_502c892824c23659');
assert.equal(verified.suggestedAnswerMaterialId, 'mat_sa_mat_502c892824c23659');
assert.equal(verified.markingSchemeMaterialId, 'mat_ms_mat_502c892824c23659');
assert.equal(verified.manifest.questionPaper.materialId, verified.questionMaterialId);
assert.equal(verified.manifest.suggestedAnswers.materialId, verified.suggestedAnswerMaterialId);
assert.equal(verified.manifest.markingScheme?.materialId, verified.markingSchemeMaterialId);
assert.equal(verified.evidencePackage?.questionPaper.metadata.materialId, verified.questionMaterialId);
assert.equal(verified.evidencePackage?.suggestedAnswers.metadata.materialId, verified.suggestedAnswerMaterialId);
assert.equal(verified.evidencePackage?.markingScheme.metadata.materialId, verified.markingSchemeMaterialId);

const resolvedSeparateIds = resolveMaterialComponentSourceIds(separateMaterial, separateMaterial.marking_scheme_text);
assert.deepEqual(resolvedSeparateIds, {
  sourceFormat: 'SEPARATE',
  questionMaterialId: 'mat_qp_mat_502c892824c23659',
  suggestedAnswerMaterialId: 'mat_sa_mat_502c892824c23659',
  markingSchemeMaterialId: 'mat_ms_mat_502c892824c23659',
});

// Combined PYQ/MTP materials continue to use one combined source ID for both
// question and answer text, with a separate marking-scheme ID when supplied.
const combinedMaterial = {
  ...separateMaterial,
  id: 'mat_combined_pyq_1',
  material_type: 'PYQ',
  model_test_number: null,
  source_format: 'COMBINED',
  combined_source_material_id: 'mat_qp_answers_combined_1',
  question_material_id: null,
  suggested_answer_material_id: null,
  marking_scheme_material_id: 'mat_ms_combined_1',
};
const resolvedCombinedIds = resolveMaterialComponentSourceIds(
  combinedMaterial,
  combinedMaterial.marking_scheme_text,
);
assert.deepEqual(resolvedCombinedIds, {
  sourceFormat: 'COMBINED',
  combinedSourceMaterialId: 'mat_qp_answers_combined_1',
  markingSchemeMaterialId: 'mat_ms_combined_1',
});

console.log('Model Test component source-ID manifest regression passed.');
