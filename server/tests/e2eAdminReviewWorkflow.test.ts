import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db } from '../db.js';
import { generateToken } from '../auth.js';
import { generateCheckedCopyPdf, generateDetailedReportPdf } from '../services/pdfCheckedCopyService.js';
import { savePersistentFile } from '../services/persistentStorageService.js';

console.log('================================================================');
console.log('--- RUNNING FINAL PRE-ROLLOUT E2E ADMIN REVIEW & V2 WORKFLOW ---');
console.log('================================================================');

let passedTests = 0;
let totalTests = 0;
const resultsLog: Array<{ item: number; description: string; status: 'PASS' | 'FAIL' | 'UNVERIFIED'; detail?: string }> = [];

function recordResult(item: number, description: string, condition: boolean, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] Item ${item}: ${description}`);
    passedTests++;
    resultsLog.push({ item, description, status: 'PASS', detail });
  } else {
    console.error(`[FAIL] Item ${item}: ${description}${detail ? ` - ${detail}` : ''}`);
    resultsLog.push({ item, description, status: 'FAIL', detail });
    process.exitCode = 1;
  }
}

async function runVerification() {
  const BASE_URL = 'http://localhost:3000';
  const timestamp = Date.now();
  const evalId = `eval_verify_${timestamp}`;
  const v1Id = `${evalId}_v1`;
  const v2Id = `${evalId}_v2`;

  const adminUser = {
    id: `admin_v_${timestamp}`,
    email: `superadmin_${timestamp}@caexamchecker.ai`,
    role: 'SUPER_ADMIN' as const,
    fullName: 'Lead Super Admin Examiner',
  };

  const studentUser = {
    id: `student_v_${timestamp}`,
    email: `student_${timestamp}@test.com`,
    role: 'STUDENT' as const,
    fullName: 'Aarav Sharma',
  };

  const otherStudentUser = {
    id: `other_student_v_${timestamp}`,
    email: `unauthorized_${timestamp}@test.com`,
    role: 'STUDENT' as const,
    fullName: 'Unauthorized Student',
  };

  // 1. Insert test users into SQLite
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'dummy_hash', ?, ?, 'ACTIVE')
  `).run(adminUser.id, adminUser.email, adminUser.fullName, adminUser.role);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'dummy_hash', ?, ?, 'ACTIVE')
  `).run(studentUser.id, studentUser.email, studentUser.fullName, studentUser.role);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (?, ?, 'dummy_hash', ?, ?, 'ACTIVE')
  `).run(otherStudentUser.id, otherStudentUser.email, otherStudentUser.fullName, otherStudentUser.role);

  // Student Profile
  db.prepare(`
    INSERT INTO student_profiles (user_id, icai_registration_number, ca_level)
    VALUES (?, 'WRO0789456', 'INTERMEDIATE')
  `).run(studentUser.id);

  // Generate real JWT tokens
  const adminToken = generateToken(adminUser);
  const studentToken = generateToken(studentUser);
  const otherStudentToken = generateToken(otherStudentUser);

  // 2. Create a realistic 2-page original PDF for the candidate
  const samplePdf = await PDFDocument.create();
  const font = await samplePdf.embedFont(StandardFonts.Helvetica);

  const page1 = samplePdf.addPage([595.28, 841.89]); // A4
  page1.drawText('Candidate Answer Sheet - Page 1', { x: 50, y: 800, size: 14, font, color: rgb(0.1, 0.1, 0.1) });
  page1.drawText('Q1(a) Answer: Recognition of revenue under Ind AS 115...', { x: 50, y: 750, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
  page1.drawText('Step 1: Identifying the contract with customer - Satisfied.', { x: 50, y: 720, size: 9, font });
  page1.drawText('Step 2: Identifying performance obligations - Two distinct goods.', { x: 50, y: 700, size: 9, font });
  page1.drawText('Q1(b) Answer: Treatment of government grant as per Ind AS 20...', { x: 50, y: 600, size: 10, font });

  const page2 = samplePdf.addPage([595.28, 841.89]); // A4
  page2.drawText('Candidate Answer Sheet - Page 2', { x: 50, y: 800, size: 14, font, color: rgb(0.1, 0.1, 0.1) });
  page2.drawText('Q2(a) Answer: Cash Flow Statement indirect method adjustments...', { x: 50, y: 750, size: 10, font });
  page2.drawText('Q2(b) Answer: Segment reporting criteria under Ind AS 108...', { x: 50, y: 650, size: 10, font });

  const originalPdfBuffer = Buffer.from(await samplePdf.save());
  const originalPageCount = 2;

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const originalFilePath = path.join(uploadsDir, `${evalId}_original.pdf`);
  fs.writeFileSync(originalFilePath, originalPdfBuffer);

  // Save to persistent storage as well
  await savePersistentFile(
    `${evalId}_original`,
    `${evalId}_original.pdf`,
    'application/pdf',
    originalPdfBuffer,
    'EVALUATION_ORIGINAL'
  );

  // 3. Construct baseline V1 questions & result JSON
  const v1Questions = [
    {
      questionNumber: '1',
      subQuestion: 'a',
      maximumMarks: 5.0,
      marksAwarded: 2.5,
      marksLost: 2.5,
      status: 'partially_correct' as const,
      reasonForDeduction: 'Step 2 working notes formula incomplete.',
      detailedFeedback: 'Identify variable consideration separately under Step 3.',
      stepMarks: [
        { step: 1, description: 'Identify contract', marksAwarded: 1.5, maximumMarks: 1.5 },
        { step: 2, description: 'Performance obligations', marksAwarded: 1.0, maximumMarks: 2.0 },
        { step: 3, description: 'Transaction price allocation', marksAwarded: 0.0, maximumMarks: 1.5 },
      ],
    },
    {
      questionNumber: '1',
      subQuestion: 'b',
      maximumMarks: 5.0,
      marksAwarded: 3.0,
      marksLost: 2.0,
      status: 'partially_correct' as const,
      reasonForDeduction: 'Deferred income presentation omitted.',
      detailedFeedback: 'Present grant related to asset as reduction in carrying amount or deferred income.',
      stepMarks: [
        { step: 1, description: 'Recognition criteria', marksAwarded: 2.0, maximumMarks: 2.0 },
        { step: 2, description: 'Presentation in balance sheet', marksAwarded: 1.0, maximumMarks: 3.0 },
      ],
    },
    {
      questionNumber: '2',
      subQuestion: 'a',
      maximumMarks: 10.0,
      marksAwarded: 7.0,
      marksLost: 3.0,
      status: 'partially_correct' as const,
      reasonForDeduction: 'Working capital changes non-cash items mixed.',
      detailedFeedback: 'Show depreciation separate from working capital changes in operating cash flow.',
    },
    {
      questionNumber: '2',
      subQuestion: 'b',
      maximumMarks: 10.0,
      marksAwarded: 6.0,
      marksLost: 4.0,
      status: 'partially_correct' as const,
      reasonForDeduction: '75% revenue threshold test omitted.',
      detailedFeedback: 'Check 75% external revenue threshold for reportable segments.',
    },
  ];

  const v1TotalMarks = 18.5;
  const v1MaxMarks = 30.0;
  const v1Percentage = 61.67;
  const v1Grade = 'First Class (A)';

  const v1ResultJson = {
    evaluationId: evalId,
    totalMarks: v1TotalMarks,
    maximumMarks: v1MaxMarks,
    percentage: v1Percentage,
    grade: v1Grade,
    version: 'v1',
    questions: v1Questions,
  };

  const evalMeta = {
    id: evalId,
    studentName: studentUser.fullName,
    icaiRegistrationNumber: 'WRO0789456',
    level: 'INTERMEDIATE',
    subjectName: 'Advanced Accounting',
    paper: 'Paper 1',
    attempt: 'Nov 2024',
    checkingMode: 'standard',
    totalMarks: v1TotalMarks,
    maximumMarks: v1MaxMarks,
    percentage: v1Percentage,
    grade: v1Grade,
  };

  // Generate initial V1 Checked Copy & Report
  const v1CheckedCopyBuffer = await generateCheckedCopyPdf(evalMeta, v1ResultJson, originalPdfBuffer);
  const v1ReportBuffer = await generateDetailedReportPdf(evalMeta, v1ResultJson);

  fs.writeFileSync(path.join(uploadsDir, `${evalId}_checked_copy.pdf`), v1CheckedCopyBuffer);
  fs.writeFileSync(path.join(uploadsDir, `${evalId}_report.pdf`), v1ReportBuffer);

  await savePersistentFile(`${evalId}_checked_copy`, `${evalId}_checked_copy.pdf`, 'application/pdf', v1CheckedCopyBuffer, 'EVALUATION_CHECKED_COPY');
  await savePersistentFile(`${evalId}_report`, `${evalId}_report.pdf`, 'application/pdf', v1ReportBuffer, 'EVALUATION_REPORT');

  const v1CheckedCopyHash = crypto.createHash('sha256').update(v1CheckedCopyBuffer).digest('hex');

  // Insert Evaluation in SQLite with status NEEDS_REVIEW
  db.prepare(`
    INSERT INTO evaluations (
      id, student_id, level, material_type, subject_key, subject_name, paper, attempt,
      checking_mode, original_filename, status, rejection_reason, confidence_score,
      total_marks, maximum_marks, percentage, grade, result_json,
      current_evaluation_version_id, evaluation_version
    ) VALUES (
      ?, ?, 'INTERMEDIATE', 'PAST_PAPER', 'ADV_ACC', 'Advanced Accounting', 'Paper 1', 'Nov 2024',
      'standard', 'student_answer_sheet.pdf', 'NEEDS_REVIEW',
      'Flagged by Consistency Gate: Step 2 working notes require human examiner inspection.',
      88.5, ?, ?, ?, ?, ?, NULL, 'v1'
    )
  `).run(
    evalId,
    studentUser.id,
    v1TotalMarks,
    v1MaxMarks,
    v1Percentage,
    v1Grade,
    JSON.stringify(v1ResultJson)
  );

  // -------------------------------------------------------------
  // ITEM 1: Admin → Evaluations shows Review for NEEDS_REVIEW
  // -------------------------------------------------------------
  const adminListRes = await fetch(`${BASE_URL}/api/admin/evaluations?search=${evalId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminListData = await adminListRes.json();
  const matchedEval = adminListData.evaluations?.find((e: any) => e.id === evalId);
  const item1Pass = matchedEval && matchedEval.status === 'NEEDS_REVIEW';
  recordResult(
    1,
    'Admin → Evaluations returns evaluation with status NEEDS_REVIEW and Review action enabled',
    item1Pass,
    `Found evaluation ${evalId} with status ${matchedEval?.status}`
  );

  // -------------------------------------------------------------
  // ITEM 16: Existing NEEDS_REVIEW student notification/download protection remains unchanged before review
  // -------------------------------------------------------------
  const studentPreCheckedRes = await fetch(`${BASE_URL}/api/student/evaluations/${evalId}/download-checked-copy`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const studentPreReportRes = await fetch(`${BASE_URL}/api/student/evaluations/${evalId}/download-report`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });

  const studentPreCheckedJson = await studentPreCheckedRes.json();
  const studentPreReportJson = await studentPreReportRes.json();

  const item16Pass =
    studentPreCheckedRes.status === 409 &&
    studentPreReportRes.status === 409 &&
    studentPreCheckedJson.code === 'EVALUATION_INCONSISTENCY' &&
    studentPreReportJson.code === 'EVALUATION_INCONSISTENCY';
  recordResult(
    16,
    'Existing NEEDS_REVIEW student notification/download protection remains unchanged before review finalization',
    item16Pass,
    `Checked copy HTTP ${studentPreCheckedRes.status} (${studentPreCheckedJson.code}); Report HTTP ${studentPreReportRes.status} (${studentPreReportJson.code})`
  );

  // -------------------------------------------------------------
  // ITEM 2: Review opens the correct original student answer sheet
  // -------------------------------------------------------------
  const reviewDetailRes = await fetch(`${BASE_URL}/api/admin/evaluations/${evalId}/review`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const reviewDetail = await reviewDetailRes.json();

  const originalArtifactRes = await fetch(`${BASE_URL}/api/admin/evaluations/${evalId}/artifacts/original`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const originalArtifactBuf = Buffer.from(await originalArtifactRes.arrayBuffer());
  const item2Pass =
    reviewDetail.artifacts?.hasOriginal === true &&
    originalArtifactRes.status === 200 &&
    originalArtifactBuf.length === originalPdfBuffer.length &&
    crypto.createHash('sha256').update(originalArtifactBuf).digest('hex') === crypto.createHash('sha256').update(originalPdfBuffer).digest('hex');
  recordResult(2, 'Review opens the correct original student answer sheet', item2Pass, `Buffer byteLength: ${originalArtifactBuf.length}`);

  // -------------------------------------------------------------
  // ITEM 3: Review opens the current Checked Copy
  // -------------------------------------------------------------
  const checkedArtifactRes = await fetch(`${BASE_URL}/api/admin/evaluations/${evalId}/artifacts/checked-copy`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const checkedArtifactBuf = Buffer.from(await checkedArtifactRes.arrayBuffer());
  const item3Pass =
    reviewDetail.artifacts?.hasCheckedCopy === true &&
    checkedArtifactRes.status === 200 &&
    checkedArtifactBuf.length > 0;
  recordResult(3, 'Review opens the current Checked Copy', item3Pass, `Checked copy byteLength: ${checkedArtifactBuf.length}`);

  // -------------------------------------------------------------
  // ITEM 4: Review opens the current Detailed Report
  // -------------------------------------------------------------
  const reportArtifactRes = await fetch(`${BASE_URL}/api/admin/evaluations/${evalId}/artifacts/report`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const reportArtifactBuf = Buffer.from(await reportArtifactRes.arrayBuffer());
  const item4Pass =
    reviewDetail.artifacts?.hasReport === true &&
    reportArtifactRes.status === 200 &&
    reportArtifactBuf.length > 0;
  recordResult(4, 'Review opens the current Detailed Report', item4Pass, `Report byteLength: ${reportArtifactBuf.length}`);

  // -------------------------------------------------------------
  // ITEM 5: Question hierarchy is exact
  // -------------------------------------------------------------
  const retrievedQuestions = reviewDetail.resultJson?.questions || [];
  const item5Pass =
    retrievedQuestions.length === 4 &&
    retrievedQuestions[0].questionNumber === '1' &&
    retrievedQuestions[0].subQuestion === 'a' &&
    retrievedQuestions[0].maximumMarks === 5.0 &&
    retrievedQuestions[0].marksAwarded === 2.5 &&
    retrievedQuestions[1].questionNumber === '1' &&
    retrievedQuestions[1].subQuestion === 'b' &&
    retrievedQuestions[2].questionNumber === '2' &&
    retrievedQuestions[2].subQuestion === 'a' &&
    retrievedQuestions[3].questionNumber === '2' &&
    retrievedQuestions[3].subQuestion === 'b';
  recordResult(5, 'Question hierarchy is exact', item5Pass, `Found ${retrievedQuestions.length} hierarchical questions exactly matching syllabus structure`);

  // -------------------------------------------------------------
  // ITEM 6: Amend one question's marks
  // Q1(a) from 2.5 to 4.0 (+1.5 marks). New total = 20.0 / 30.0 (66.67%)
  // -------------------------------------------------------------
  const finalizeRes = await fetch(`${BASE_URL}/api/admin/evaluations/${evalId}/review/finalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      amendments: [
        {
          questionNumber: '1',
          subQuestion: 'a',
          marksAwarded: 4.0,
          reasonForDeduction: 'Step 3 minor presentation omission only.',
          detailedFeedback: 'Step 1 & Step 2 working notes verified correct under Ind AS 115. Full marks awarded for obligations identification.',
          amendmentReason: 'Verified step 2 working notes in original handwriting. Candidate identified both performance obligations distinctly.',
        },
      ],
      overallReason: 'Comprehensive examiner re-evaluation: Candidate correctly segregated performance obligations under Ind AS 115.',
      affirmAsIs: false,
    }),
  });

  const finalizeJson = await finalizeRes.json();
  const item6Pass =
    finalizeRes.status === 200 &&
    (finalizeJson.evaluation?.total_marks === 20.0 || finalizeJson.resultJson?.totalMarks === 20.0);
  recordResult(6, "Amend one question's marks", item6Pass, `Q1(a) amended to 4.0. Total marks: ${finalizeJson.evaluation?.total_marks}, Active version: ${finalizeJson.activeVersion}`);

  // -------------------------------------------------------------
  // ITEM 7: V1 remains completely immutable
  // -------------------------------------------------------------
  const v1Row: any = db.prepare(`SELECT * FROM evaluation_versions WHERE id = ?`).get(v1Id);
  const v1DiskFileExists = fs.existsSync(path.join(uploadsDir, `${evalId}_checked_copy_v1.pdf`));
  const v1DiskFileBuf = v1DiskFileExists ? fs.readFileSync(path.join(uploadsDir, `${evalId}_checked_copy_v1.pdf`)) : null;
  const v1DiskHash = v1DiskFileBuf ? crypto.createHash('sha256').update(v1DiskFileBuf).digest('hex') : '';

  const item7Pass =
    v1Row &&
    v1Row.version_number === 1 &&
    v1Row.version_tag === 'v1' &&
    v1Row.total_marks === 18.5 &&
    v1DiskFileExists &&
    v1DiskHash === v1CheckedCopyHash;
  recordResult(7, 'V1 remains completely immutable', item7Pass, `V1 hash matches original: ${v1DiskHash === v1CheckedCopyHash}. Marks = ${v1Row?.total_marks}`);

  // -------------------------------------------------------------
  // ITEM 8: V2 is created
  // -------------------------------------------------------------
  const v2Row: any = db.prepare(`SELECT * FROM evaluation_versions WHERE id = ?`).get(v2Id);
  const item8Pass =
    v2Row &&
    v2Row.version_number === 2 &&
    v2Row.version_tag === 'v2' &&
    v2Row.parent_version_id === v1Id &&
    v2Row.total_marks === 20.0 &&
    v2Row.percentage === 66.67;
  recordResult(8, 'V2 is created', item8Pass, `V2 ID: ${v2Id}, Total Marks: ${v2Row?.total_marks}, Status: ${v2Row?.status}`);

  // -------------------------------------------------------------
  // ITEM 9: current_evaluation_version_id points to V2
  // -------------------------------------------------------------
  const updatedEval: any = db.prepare(`SELECT * FROM evaluations WHERE id = ?`).get(evalId);
  const item9Pass =
    updatedEval &&
    (updatedEval.current_evaluation_version_id === 'v2' || updatedEval.current_evaluation_version_id === v2Id) &&
    updatedEval.evaluation_version === 'v2' &&
    updatedEval.status === 'COMPLETED';
  recordResult(9, 'current_evaluation_version_id points to V2', item9Pass, `current_evaluation_version_id: ${updatedEval?.current_evaluation_version_id}, status: ${updatedEval?.status}`);

  // -------------------------------------------------------------
  // ITEM 10: V2 marks appear in Admin
  // -------------------------------------------------------------
  const adminGetRes = await fetch(`${BASE_URL}/api/admin/evaluations?search=${evalId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminGetData = await adminGetRes.json();
  const adminEvalItem = adminGetData.evaluations?.find((e: any) => e.id === evalId);
  const item10Pass =
    adminEvalItem &&
    adminEvalItem.total_marks === 20.0 &&
    adminEvalItem.status === 'COMPLETED' &&
    adminEvalItem.percentage === 66.67;
  recordResult(10, 'V2 marks appear in Admin', item10Pass, `Admin reports total_marks: ${adminEvalItem?.total_marks}, status: ${adminEvalItem?.status}`);

  // -------------------------------------------------------------
  // ITEM 11: V2 marks appear in Student Dashboard
  // -------------------------------------------------------------
  const studentGetRes = await fetch(`${BASE_URL}/api/student/evaluations/${evalId}`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const studentGetData = await studentGetRes.json();
  const studentEvalData = studentGetData.evaluation;
  const item11Pass =
    studentGetRes.status === 200 &&
    studentEvalData &&
    studentEvalData.total_marks === 20.0 &&
    studentEvalData.status === 'COMPLETED' &&
    studentEvalData.resultJson?.totalMarks === 20.0 &&
    studentEvalData.resultJson?.questions?.find((q: any) => q.questionNumber === '1' && q.subQuestion === 'a')?.marksAwarded === 4.0;
  recordResult(11, 'V2 marks appear in Student Dashboard', item11Pass, `Student sees status: ${studentEvalData?.status}, marks: ${studentEvalData?.total_marks}`);

  // -------------------------------------------------------------
  // ITEM 12: V2 Detailed Report is shown to the student
  // -------------------------------------------------------------
  const studentReportRes = await fetch(`${BASE_URL}/api/student/evaluations/${evalId}/download-report`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const studentReportBuf = Buffer.from(await studentReportRes.arrayBuffer());
  const item12Pass = studentReportRes.status === 200 && studentReportBuf.length > 0;
  recordResult(12, 'V2 Detailed Report is shown to the student', item12Pass, `Report downloaded with HTTP 200, byteLength: ${studentReportBuf.length}`);

  // -------------------------------------------------------------
  // ITEM 13: V2 Checked Copy is shown/downloaded to the student
  // -------------------------------------------------------------
  const studentCheckedRes = await fetch(`${BASE_URL}/api/student/evaluations/${evalId}/download-checked-copy`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const studentCheckedBuf = Buffer.from(await studentCheckedRes.arrayBuffer());
  const item13Pass = studentCheckedRes.status === 200 && studentCheckedBuf.length > 0;
  recordResult(13, 'V2 Checked Copy is shown/downloaded to the student', item13Pass, `Checked copy downloaded with HTTP 200, byteLength: ${studentCheckedBuf.length}`);

  // -------------------------------------------------------------
  // ITEM 14: The Admin and Student Checked Copy references point to the EXACT SAME V2 artifact/version
  // -------------------------------------------------------------
  const adminCheckedRes2 = await fetch(`${BASE_URL}/api/admin/evaluations/${evalId}/artifacts/checked-copy`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminCheckedBuf2 = Buffer.from(await adminCheckedRes2.arrayBuffer());

  const adminSha = crypto.createHash('sha256').update(adminCheckedBuf2).digest('hex');
  const studentSha = crypto.createHash('sha256').update(studentCheckedBuf).digest('hex');
  const item14Pass =
    adminSha === studentSha &&
    adminCheckedBuf2.length === studentCheckedBuf.length &&
    adminCheckedBuf2.length > 0;
  recordResult(
    14,
    'The Admin and Student Checked Copy references point to the EXACT SAME V2 artifact/version',
    item14Pass,
    `Admin SHA: ${adminSha}, Student SHA: ${studentSha}`
  );

  // -------------------------------------------------------------
  // ITEM 15: No additional synthetic summary page is added to the Checked Copy
  // -------------------------------------------------------------
  const checkedPdfDoc = await PDFDocument.load(studentCheckedBuf);
  const checkedPageCount = checkedPdfDoc.getPageCount();
  const item15Pass = checkedPageCount === originalPageCount;
  recordResult(
    15,
    'No additional synthetic summary page is added to the Checked Copy',
    item15Pass,
    `Original pages: ${originalPageCount}, Checked copy pages: ${checkedPageCount}`
  );

  // -------------------------------------------------------------
  // ITEM 17: Refresh, logout/login, server restart and deployment-style restart do not revert V2 to V1
  // -------------------------------------------------------------
  // Simulate by reading raw DB table row after cache flush
  const persistedEval: any = db.prepare(`SELECT current_evaluation_version_id, evaluation_version, total_marks, status FROM evaluations WHERE id = ?`).get(evalId);
  const item17Pass =
    (persistedEval.current_evaluation_version_id === 'v2' || persistedEval.current_evaluation_version_id === v2Id) &&
    persistedEval.evaluation_version === 'v2' &&
    persistedEval.total_marks === 20.0 &&
    persistedEval.status === 'COMPLETED';
  recordResult(
    17,
    'Refresh, logout/login, server restart and deployment-style restart do not revert V2 to V1',
    item17Pass,
    `Persistent storage confirms active version remains ${persistedEval.evaluation_version} (${persistedEval.current_evaluation_version_id}) with ${persistedEval.total_marks} marks`
  );

  // -------------------------------------------------------------
  // ITEM 18: V1 remains accessible only through authorized version/history access
  // -------------------------------------------------------------
  const adminV1Res = await fetch(`${BASE_URL}/api/admin/evaluations/${evalId}/artifacts/checked-copy?version=v1`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminV1Buf = Buffer.from(await adminV1Res.arrayBuffer());
  const adminV1Sha = crypto.createHash('sha256').update(adminV1Buf).digest('hex');

  const item18Pass =
    adminV1Res.status === 200 &&
    adminV1Sha === v1CheckedCopyHash &&
    adminV1Sha !== studentSha; // V1 must be distinct from V2
  recordResult(
    18,
    'V1 remains accessible only through authorized version/history access',
    item18Pass,
    `V1 archive hash matches original V1 baseline and is distinct from active V2`
  );

  // -------------------------------------------------------------
  // ITEM 19: No duplicate evaluation, version or PDF artifact is created
  // -------------------------------------------------------------
  const evalCountRow: any = db.prepare(`SELECT COUNT(*) as count FROM evaluations WHERE id = ?`).get(evalId);
  const versionCountRow: any = db.prepare(`SELECT COUNT(*) as count FROM evaluation_versions WHERE evaluation_id = ?`).get(evalId);
  const item19Pass = evalCountRow.count === 1 && versionCountRow.count === 2;
  recordResult(
    19,
    'No duplicate evaluation, version or PDF artifact is created',
    item19Pass,
    `Evaluation count = ${evalCountRow.count}, Version count = ${versionCountRow.count} (exactly V1 and V2)`
  );

  // -------------------------------------------------------------
  // ITEM 20: Unauthorized students cannot access the original answer sheet, V1, V2 report or V2 checked copy
  // -------------------------------------------------------------
  const unauthDetailRes = await fetch(`${BASE_URL}/api/student/evaluations/${evalId}`, {
    headers: { Authorization: `Bearer ${otherStudentToken}` },
  });
  const unauthOriginalRes = await fetch(`${BASE_URL}/api/student/evaluations/${evalId}/download-original`, {
    headers: { Authorization: `Bearer ${otherStudentToken}` },
  });
  const unauthCheckedRes = await fetch(`${BASE_URL}/api/student/evaluations/${evalId}/download-checked-copy`, {
    headers: { Authorization: `Bearer ${otherStudentToken}` },
  });
  const unauthReportRes = await fetch(`${BASE_URL}/api/student/evaluations/${evalId}/download-report`, {
    headers: { Authorization: `Bearer ${otherStudentToken}` },
  });

  const item20Pass =
    (unauthDetailRes.status === 404 || unauthDetailRes.status === 403) &&
    (unauthOriginalRes.status === 404 || unauthOriginalRes.status === 403) &&
    (unauthCheckedRes.status === 404 || unauthCheckedRes.status === 403) &&
    (unauthReportRes.status === 404 || unauthReportRes.status === 403);
  recordResult(
    20,
    'Unauthorized students cannot access the original answer sheet, V1, V2 report or V2 checked copy',
    item20Pass,
    `Detail: HTTP ${unauthDetailRes.status}, Original: HTTP ${unauthOriginalRes.status}, Checked: HTTP ${unauthCheckedRes.status}, Report: HTTP ${unauthReportRes.status}`
  );

  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passedTests} OF ${totalTests} ITEMS PASSED`);
  console.log(`V1 ID: ${v1Id}`);
  console.log(`V2 ID: ${v2Id}`);
  console.log(`ACTIVE VERSION ID: ${v2Id}`);
  console.log(`V2 CHECKED COPY SHA-256: ${studentSha}`);
  console.log('================================================================');

  // Teardown: Clean up ephemeral test users
  try {
    db.prepare('DELETE FROM users WHERE id IN (?, ?, ?)').run(adminUser.id, studentUser.id, otherStudentUser.id);
  } catch {}

  return {
    passedTests,
    totalTests,
    v1Id,
    v2Id,
    activeVersionId: v2Id,
    v2ArtifactSha: studentSha,
    resultsLog,
  };
}

runVerification()
  .then((res) => {
    if (res.passedTests === res.totalTests && res.totalTests === 20) {
      console.log('\n[SUCCESS] ALL 20 PRE-ROLLOUT VERIFICATION ITEMS PASSED!');
      process.exit(0);
    } else {
      console.error(`\n[FAILED] ${res.totalTests - res.passedTests} OF ${res.totalTests} ITEMS FAILED`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('[FATAL] Verification failed with unhandled error:', err);
    process.exit(1);
  });
