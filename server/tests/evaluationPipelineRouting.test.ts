import assert from 'node:assert/strict';
import { shouldUseFacultyMockPagePipeline } from '../services/evaluationPipelineRouting.js';

assert.equal(shouldUseFacultyMockPagePipeline({
  materialType: 'FACULTY_MOCK_TEST',
  evaluationSource: 'FACULTY_MOCK',
}), true, 'Faculty Mock keeps its existing page-audited pipeline.');
assert.equal(shouldUseFacultyMockPagePipeline({
  materialType: 'PYQ', evaluationSource: 'PUBLIC',
}), false, 'Public PYQ uses the full-sheet evaluation pipeline.');
assert.equal(shouldUseFacultyMockPagePipeline({
  materialType: 'MTP', evaluationSource: 'INSTITUTE',
}), false, 'Institute MTP uses the full-sheet evaluation pipeline.');
assert.equal(shouldUseFacultyMockPagePipeline({
  materialType: 'MODEL_TEST_PAPER', evaluationSource: 'PUBLIC',
}), false, 'Public Model Tests use the full-sheet evaluation pipeline.');
assert.equal(shouldUseFacultyMockPagePipeline({
  materialType: 'MODEL_TEST_PAPER', evaluationSource: 'FACULTY_MOCK',
}), true, 'Faculty source identity preserves the Faculty Mock pipeline.');

console.log('Evaluation pipeline routing boundaries passed.');
