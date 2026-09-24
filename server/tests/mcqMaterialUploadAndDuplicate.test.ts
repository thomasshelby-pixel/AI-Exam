import assert from 'node:assert';
import { PDFDocument } from 'pdf-lib';
import {
  validateMaterialFile,
  extractTextSafely,
  checkMcqMaterialDuplicate,
  saveMcqMaterial,
  getMcqMaterialById,
  listMcqMaterials,
  deleteMcqMaterial,
  initMcqMaterialTables,
} from '../services/mcqMaterialService.js';
import {
  parseCsvText,
  validateBulkQuestions,
  commitBulkQuestions,
} from '../services/mcqBulkImportService.js';
import { computeFileHash } from '../services/materialDuplicateProtectionService.js';
import db from '../db.js';

async function runTests() {
  console.log('🚀 Starting MCQ Material Upload & Duplicate Protection Tests...');
  initMcqMaterialTables();

  // Clean test tables
  db.prepare("DELETE FROM mcq_materials WHERE material_name LIKE 'TEST_%'").run();
  db.prepare("DELETE FROM mcq_questions WHERE source LIKE 'TEST_%'").run();

  // Test 1: Rejection of CSV/XLSX in Material Upload
  console.log('1. Testing rejection of CSV/XLSX in Material Upload...');
  const csvBuffer = Buffer.from('question_text,option_a,option_b\nSample question,A,B', 'utf-8');
  const csvCheck = await validateMaterialFile(csvBuffer, 'questions.csv', 'text/csv');
  assert.strictEqual(csvCheck.valid, false);
  assert.ok(csvCheck.error?.includes('Structured MCQ Bulk Import'), 'Should mention Bulk Import');

  const xlsxCheck = await validateMaterialFile(csvBuffer, 'questions.xlsx', 'application/vnd.ms-excel');
  assert.strictEqual(xlsxCheck.valid, false);
  assert.ok(xlsxCheck.error?.includes('Structured MCQ Bulk Import'));

  // Test 2: Acceptance of valid PDF with PDFDocument
  console.log('2. Testing acceptance of valid PDF document...');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  page.drawText('CA Intermediate Corporate and Other Laws Mock Test Paper May 2026', { x: 50, y: 350 });
  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  const pdfValidation = await validateMaterialFile(pdfBuffer, 'law_mtp_may_2026.pdf', 'application/pdf');
  assert.strictEqual(pdfValidation.valid, true);
  assert.strictEqual(pdfValidation.fileType, 'PDF');
  assert.strictEqual(pdfValidation.pageCount, 1);

  // Test 3: Acceptance of valid TXT
  console.log('3. Testing acceptance and normalization of valid TXT document...');
  const txtContent = `CA INTERMEDIATE — CORPORATE AND OTHER LAWS
MTP SERIES 1 — MAY 2026

Q1. Under Section 2(46) of the Companies Act 2013, define holding company.
(A) A company having subsidiary companies
(B) An associate company
(C) A joint venture
(D) None of the above

Answer: (A)
Explanation: Section 2(46) defines holding company in relation to one or more other companies as a company of which such companies are subsidiary companies.`;

  const txtBuffer = Buffer.from(txtContent, 'utf-8');
  const txtValidation = await validateMaterialFile(txtBuffer, 'law_mtp_series_1.txt', 'text/plain');
  assert.strictEqual(txtValidation.valid, true);
  assert.strictEqual(txtValidation.fileType, 'TXT');

  const txtExtraction = await extractTextSafely(txtBuffer, 'TXT', 'law_mtp_series_1.txt');
  assert.ok(txtExtraction.extractedText.includes('Q1. Under Section 2(46)'));
  assert.ok(txtExtraction.extractedText.includes('Answer: (A)'));

  // Test 4: Rejection of binary files disguised as TXT
  console.log('4. Testing rejection of binary file masquerading as TXT...');
  const binaryFakeTxt = Buffer.from([0x00, 0x01, 0x02, 0x00, 0x05, 0x20]);
  const fakeTxtValidation = await validateMaterialFile(binaryFakeTxt, 'malicious.txt', 'text/plain');
  assert.strictEqual(fakeTxtValidation.valid, false);
  assert.ok(fakeTxtValidation.error?.includes('Binary file detected') || fakeTxtValidation.error?.includes('empty'));

  // Test 5: Save Material and verify storage and SHA-256
  console.log('5. Testing saveMcqMaterial and persistence...');
  const mat1 = await saveMcqMaterial({
    materialName: 'TEST_CA Inter Law MTP — May 2026',
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    chapter: 'All Chapters',
    materialType: 'MTP',
    source: 'ICAI',
    attempt: 'May 2026',
    applicableFrom: '2024-05-01',
    applicableTill: '2026-11-30',
    amendmentVersion: 'New Scheme 2024',
    description: 'Official Mock Test Paper Series 1 for May 2026 examination',
    status: 'Draft',
    fileBuffer: txtBuffer,
    originalFilename: 'law_mtp_may_2026.txt',
    fileType: 'TXT',
    pageCount: 1,
    extractedText: txtExtraction.extractedText,
    uploadedBy: 'test_admin_user',
  });

  assert.ok(mat1.id.startsWith('mcq_mat_'));
  assert.strictEqual(mat1.file_hash, computeFileHash(txtBuffer));
  assert.strictEqual(mat1.status, 'Draft');

  // Test 6: Exact File SHA-256 Duplicate Check (False positive prevention vs exact duplicate)
  console.log('6. Testing exact SHA-256 duplicate check...');
  const dupCheck1 = checkMcqMaterialDuplicate({
    fileHash: computeFileHash(txtBuffer),
    extractedText: txtExtraction.extractedText,
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    materialType: 'MTP',
    attempt: 'May 2026',
  });
  assert.strictEqual(dupCheck1.status, 'EXACT_DUPLICATE');
  assert.strictEqual(dupCheck1.isDuplicate, true);
  assert.strictEqual(dupCheck1.canOverride, false);

  // Test 7: Different attempt / year or different series must NOT be false-positive duplicate!
  console.log('7. Testing different attempt/content is NOT marked duplicate...');
  const differentAttemptTxt = `CA INTERMEDIATE — CORPORATE AND OTHER LAWS
MTP SERIES 1 — SEPTEMBER 2026

Q1. As per Section 62 of the Companies Act 2013, rights issue must be offered:
(A) To existing equity shareholders in proportion to paid-up capital
(B) To general public
(C) Exclusively to debenture holders
(D) None of the above

Answer: (A)`;
  const diffBuffer = Buffer.from(differentAttemptTxt, 'utf-8');
  const diffHash = computeFileHash(diffBuffer);

  const dupCheck2 = checkMcqMaterialDuplicate({
    fileHash: diffHash,
    extractedText: differentAttemptTxt,
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    materialType: 'MTP',
    attempt: 'September 2026',
  });
  assert.strictEqual(dupCheck2.isDuplicate, false);
  assert.ok(dupCheck2.status === 'NEW' || dupCheck2.status === 'SIMILAR');

  // Test 8: Admin Override for Possible Duplicate
  console.log('8. Testing Admin Override flow for Possible Duplicate...');
  // Text with 88% overlap to mat1
  const nearIdenticalText = txtExtraction.extractedText + '\nNote: Minor printing correction in solution key.';
  const nearBuffer = Buffer.from(nearIdenticalText, 'utf-8');
  const nearHash = computeFileHash(nearBuffer);

  const dupCheck3 = checkMcqMaterialDuplicate({
    fileHash: nearHash,
    extractedText: nearIdenticalText,
    course: 'CA_INTERMEDIATE',
    subject: 'Corporate and Other Laws',
    materialType: 'MTP',
    attempt: 'May 2026',
    overrideDuplicate: true,
    overrideReason: 'Printing revision published by ICAI BOS',
  });
  assert.strictEqual(dupCheck3.canOverride, true);
  assert.strictEqual(dupCheck3.isDuplicate, false); // Overridden

  // Test 9: Structured MCQ Bulk Import (CSV) Parser and Validator
  console.log('9. Testing Structured MCQ Bulk Import CSV parsing and validation...');
  const sampleCsvData = `Question Text,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Reference,Course,Subject,Chapter,Difficulty,Question Type,Source,Attempt
"What is the maximum number of members in a private company?","50","100","200","500",C,"As per Section 2(68) of Companies Act 2013, max members is 200.","Sec 2(68)",CA_INTERMEDIATE,"Corporate and Other Laws","Chapter 1",easy,normal,"TEST_ICAI","May 2026"
"Invalid row with missing option C","Opt A","Opt B","","Opt D",A,"Reason","Sec 1",CA_INTERMEDIATE,"Corporate and Other Laws","Chapter 1",easy,normal,"TEST_ICAI","May 2026"`;

  const parsedCsv = parseCsvText(sampleCsvData);
  assert.strictEqual(parsedCsv.length, 3); // Header + 2 rows

  const validated = validateBulkQuestions(parsedCsv, {
    sourceMaterialId: mat1.id,
  });

  assert.strictEqual(validated.totalRows, 2);
  assert.strictEqual(validated.validCount, 1);
  assert.strictEqual(validated.invalidCount, 1);
  assert.strictEqual(validated.rows[0].isValid, true);
  assert.strictEqual(validated.rows[1].isValid, false);
  assert.ok(validated.rows[1].errors.some((e) => e.includes('Option C is required')));

  // Test 10: Commit Bulk Questions with source_material_id linking
  console.log('10. Testing committing valid bulk questions and source_material_id link...');
  const commitRes = commitBulkQuestions([validated.rows[0]], 'test_admin_user');
  assert.strictEqual(commitRes.importedCount, 1);
  assert.strictEqual(commitRes.importedIds.length, 1);

  const importedQ = db.prepare('SELECT * FROM mcq_questions WHERE id = ?').get(commitRes.importedIds[0]) as any;
  assert.ok(importedQ);
  assert.strictEqual(importedQ.source_material_id, mat1.id);
  assert.strictEqual(importedQ.correct_answer, 'C');

  // Test 11: Cleanup test records
  console.log('11. Cleaning up test records...');
  deleteMcqMaterial(mat1.id);
  db.prepare("DELETE FROM mcq_questions WHERE source = 'TEST_ICAI'").run();

  console.log('✅ ALL MCQ Material Upload & Protection tests passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
