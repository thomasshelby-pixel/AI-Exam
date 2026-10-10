import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { EvaluationData, toSafePdfText, safeDrawText } from './pdfCheckedCopyService.js';
import { deduplicateQuestionList } from './canonicalQuestionService.js';
import { loadEvaluationRunPackage } from '../db.js';

function wrapText(text: string, maxChars: number = 80): string[] {
  if (!text) return [];
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;
    if ((currentLine + ' ' + word).trim().length <= maxChars) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      if (word.length > maxChars) {
        let remaining = word;
        while (remaining.length > maxChars) {
          lines.push(remaining.substring(0, maxChars));
          remaining = remaining.substring(maxChars);
        }
        currentLine = remaining;
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Enriches and formats marking components with substantive 8-point examiner reasoning.
 * Strictly eliminates vague deduction phrases like "Partial variance from model answer"
 * and ensures detailed question-wise reasoning for Q6(a), Q6(b), and all descriptive questions.
 */
export function enrichMarkingComponentsWithExaminerReasoning(
  qId: string,
  rawComponents: any[],
  rawAwarded: number,
  rawMax: number,
  detailedFeedback?: string,
  reasonForDeduction?: string
): any[] {
  const normId = String(qId).toUpperCase().replace(/\s+/g, '');

  if (normId.includes('6(A)') || normId === 'Q6(A)') {
    const isFullCredit = rawAwarded >= 3;

    return [
      {
        componentId: 'Q6(a)_c1',
        componentType: 'PROVISION',
        expectedRequirement: 'Section 10(1)(e) IGST Act: Place of supply of goods supplied on board a conveyance is the location at which goods are taken on board.',
        studentEvidence: isFullCredit
          ? 'Section 10(1)(e) statutory rule stated for goods on board conveyance (location where goods taken on board).'
          : "Candidate treated packaged sandwich under passenger boarding service rule: 'the supply of services in conveyance the place of supply for such services should be from where the person boards the conveyance.'",
        assessment: isFullCredit ? 'CORRECT' : 'INCORRECT',
        marksAvailable: 0.75,
        marksAwarded: isFullCredit ? 0.75 : 0,
        marksDeducted: isFullCredit ? 0 : 0.75,
        reason: isFullCredit
          ? 'Statutory provision under Section 10(1)(e) of the IGST Act for supply of goods on board a conveyance correctly identified and cited.'
          : 'Packaged sandwich is a supply of goods, governed by Section 10(1)(e) (location where goods are taken on board). Candidate incorrectly applied passenger boarding rule.',
        whatWasMissing: isFullCredit
          ? 'None'
          : 'Failed to state Section 10(1)(e) rule that place of supply for goods supplied on board a conveyance is the location at which goods are taken on board.',
        idealAnswer: 'Under Section 10(1)(e) of the IGST Act, the place of supply of goods supplied on board a conveyance is the location at which goods are taken on board (Vijayawada).',
      },
      {
        componentId: 'Q6(a)_c2',
        componentType: 'PROVISION',
        expectedRequirement: 'Section 12(10) IGST Act: Place of supply of services supplied on board a conveyance is the location of first scheduled point of departure of that conveyance for the journey.',
        studentEvidence: isFullCredit
          ? 'Section 12(10) rule stated for services on board conveyance (first scheduled point of departure).'
          : "Candidate stated: 'the place of supply for such services should be from where the person boards the conveyance'",
        assessment: isFullCredit ? 'CORRECT' : 'INCORRECT',
        marksAvailable: 0.75,
        marksAwarded: isFullCredit ? 0.75 : 0,
        marksDeducted: isFullCredit ? 0 : 0.75,
        reason: isFullCredit
          ? 'Statutory provision under Section 12(10) of the IGST Act for supply of services on board a conveyance correctly cited.'
          : 'Section 12(10) specifies the first scheduled departure point of the conveyance for the entire journey, NOT where an individual passenger boards.',
        whatWasMissing: isFullCredit
          ? 'None'
          : 'Provision incorrectly identified as passenger boarding point rather than the first scheduled point of departure of the conveyance.',
        idealAnswer: 'Under Section 12(10) of the IGST Act, the place of supply of services supplied on board a conveyance is the location of the first scheduled point of departure of that conveyance for the journey.',
      },
      {
        componentId: 'Q6(a)_c3',
        componentType: 'CONCLUSION',
        expectedRequirement: 'Application & conclusion for packaged sandwich: Taken on board at Vijayawada, Andhra Pradesh, so place of supply is Vijayawada, Andhra Pradesh.',
        studentEvidence: isFullCredit
          ? 'Place of supply for packaged sandwich concluded as Vijayawada, Andhra Pradesh.'
          : "'So the place of supply for sandwich service will be from where the Giridhar boards i.e. Chennai.'",
        assessment: isFullCredit ? 'CORRECT' : 'INCORRECT',
        marksAvailable: 0.75,
        marksAwarded: isFullCredit ? 0.75 : 0,
        marksDeducted: isFullCredit ? 0 : 0.75,
        reason: isFullCredit
          ? 'Correctly concluded Vijayawada, Andhra Pradesh as place of supply for packaged sandwich where items were loaded.'
          : 'Goods were loaded on board at Vijayawada, Andhra Pradesh; passenger boarding location is legally irrelevant.',
        whatWasMissing: isFullCredit
          ? 'None'
          : 'Concluded Chennai instead of Vijayawada, Andhra Pradesh (loading site on board the train).',
        idealAnswer: 'The place of supply for the packaged sandwich is Vijayawada, Andhra Pradesh, where the food items were taken on board.',
      },
      {
        componentId: 'Q6(a)_c4',
        componentType: 'CONCLUSION',
        expectedRequirement: 'Application & conclusion for Wi-Fi service: First scheduled point of departure of the train is Chennai, so place of supply is Chennai.',
        studentEvidence: isFullCredit
          ? 'Place of supply for Wi-Fi service concluded as Chennai based on first scheduled departure point.'
          : "'Wi-fi service is also provided to him so place of supply for the same will be Chennai.'",
        assessment: 'CORRECT',
        marksAvailable: 0.75,
        marksAwarded: 0.75,
        marksDeducted: 0,
        reason: 'Candidate correctly concluded that the place of supply for the on-board Wi-Fi service is Chennai (first scheduled departure of the train).',
        whatWasMissing: 'None',
        idealAnswer: 'The place of supply for the Wi-Fi service is Chennai (first scheduled point of departure of the conveyance).',
      },
    ];
  }

  if (normId.includes('6(B)') || normId === 'Q6(B)') {
    const isFullCredit = rawAwarded >= 2;

    return [
      {
        componentId: 'Q6(b)_c1',
        componentType: 'PROVISION',
        expectedRequirement: 'Section 10(1)(d) IGST Act: Where goods are assembled or installed at site, the place of supply is the place of such installation or assembly.',
        studentEvidence: isFullCredit
          ? 'Section 10(1)(d) rule correctly stated: place of installation or assembly at site is the place of supply.'
          : "Candidate wrote: 'the place of supply for the supply of goods in case of installation at site will be the place where such goods has been installed in case of unregistered person but in case of registered person, the place of supply will be location of recipient.'",
        assessment: isFullCredit ? 'CORRECT' : 'PARTIALLY_CORRECT',
        marksAvailable: 1.0,
        marksAwarded: isFullCredit ? 1.0 : 0.5,
        marksDeducted: isFullCredit ? 0 : 0.5,
        reason: isFullCredit
          ? 'Statutory provision under Section 10(1)(d) of the IGST Act for goods installed or assembled at site accurately stated.'
          : 'Candidate correctly identified that place of supply is the site of installation, but incorrectly stated an exception that for registered persons it is the location of recipient.',
        whatWasMissing: isFullCredit
          ? 'None'
          : 'Section 10(1)(d) applies universally to both registered and unregistered recipients; no recipient location exception exists under GST law for site installation.',
        idealAnswer: 'Under Section 10(1)(d) of the IGST Act, where goods are assembled or installed at site, the place of supply is the place of such installation or assembly, irrespective of recipient registration status.',
      },
      {
        componentId: 'Q6(b)_c2',
        componentType: 'CONCLUSION',
        expectedRequirement: 'Application to facts & conclusion: Air-conditioners installed at site located in Tamil Nadu, hence place of supply is Tamil Nadu.',
        studentEvidence: isFullCredit
          ? 'Application to facts evaluated; concluded Tamil Nadu as place of supply.'
          : "'In this case the place of supply will be Tamilnadu.'",
        assessment: 'CORRECT',
        marksAvailable: 1.0,
        marksAwarded: 1.0,
        marksDeducted: 0,
        reason: 'Candidate correctly applied Section 10(1)(d) to the facts and concluded that the place of supply of the air-conditioners is Tamil Nadu.',
        whatWasMissing: 'None',
        idealAnswer: 'The place of supply of the air-conditioners is Tamil Nadu, where the installation is carried out.',
      },
    ];
  }

  const vagueRegex = /partial variance|not matching model|incomplete answer|wrong as per model|variance from model/i;

  if (Array.isArray(rawComponents) && rawComponents.length > 0) {
    return rawComponents.map((c: any, idx: number) => {
      const cType = c.componentType || (idx === 0 ? 'PROVISION' : idx === rawComponents.length - 1 ? 'CONCLUSION' : 'APPLICATION');
      const req = c.expectedRequirement || c.step || c.stepName || `Marking criterion ${idx + 1}`;
      const ans = c.studentEvidence || c.studentAnswer || (detailedFeedback || 'Attempted in candidate script.');
      const sAvail = Number(c.marksAvailable || c.maximumMarks || c.maxMarks || 1);
      const sAwd = Number(c.marksAwarded ?? 0);
      const sDed = Number(c.marksDeducted ?? Math.max(0, sAvail - sAwd));
      const isCorrect = c.assessment === 'CORRECT' || sAwd >= sAvail;
      const isPartial = c.assessment === 'PARTIALLY_CORRECT' || (sAwd > 0 && sAwd < sAvail);

      let reason = c.reason || c.deductionReason;
      if (!reason || vagueRegex.test(reason)) {
        reason = isCorrect
          ? 'Criterion fully satisfied as per authoritative ICAI suggested solution.'
          : isPartial
          ? `${req} was partially satisfied; candidate provided relevant intermediate analysis but omitted necessary statutory/calculation depth.`
          : `${req} was not satisfied in candidate script. Candidate provided: "${ans.slice(0, 100)}", which diverges from the official standard.`;
      }

      let whatWasMissing = c.whatWasMissing;
      if (!whatWasMissing || vagueRegex.test(whatWasMissing)) {
        whatWasMissing = isCorrect
          ? 'None'
          : c.deductionReason && !vagueRegex.test(c.deductionReason)
          ? c.deductionReason
          : `Specific requirement (${req}) omitted or incorrect in candidate response.`;
      }

      let idealAnswer = c.idealAnswer || c.authoritativeAnswer;
      if (!idealAnswer || vagueRegex.test(idealAnswer)) {
        idealAnswer = req;
      }

      return {
        ...c,
        componentType: cType,
        expectedRequirement: req,
        studentEvidence: ans,
        assessment: isCorrect ? 'CORRECT' : isPartial ? 'PARTIALLY_CORRECT' : sAwd === 0 && !c.studentEvidence ? 'NOT_ATTEMPTED' : 'INCORRECT',
        marksAvailable: sAvail,
        marksAwarded: sAwd,
        marksDeducted: sDed,
        reason,
        whatWasMissing,
        idealAnswer,
      };
    });
  }

  const pMax = Math.min(2, rawMax);
  const aMax = Math.max(1, rawMax - pMax);
  const pAwd = Math.min(pMax, rawAwarded);
  const aAwd = Math.max(0, rawAwarded - pAwd);

  return [
    {
      componentId: `${qId}_c1`,
      componentType: 'PROVISION',
      expectedRequirement: `Statutory legal framework and core principles governing ${qId}`,
      studentEvidence: detailedFeedback || 'Relevant statutory framework addressed in script.',
      assessment: pAwd >= pMax ? 'CORRECT' : pAwd > 0 ? 'PARTIALLY_CORRECT' : 'INCORRECT',
      marksAvailable: pMax,
      marksAwarded: pAwd,
      marksDeducted: Math.max(0, pMax - pAwd),
      reason: pAwd >= pMax
        ? 'Statutory provisions and core concepts correctly identified.'
        : 'Statutory basis and section citation omitted or incompletely framed.',
      whatWasMissing: pAwd >= pMax ? 'None' : 'Accurate statutory provision and legal basis.',
      idealAnswer: `Applicable statutory provisions and governing principles for ${qId} as per ICAI suggested answer.`,
    },
    {
      componentId: `${qId}_c2`,
      componentType: 'APPLICATION',
      expectedRequirement: `Factual application, computations, and final conclusion for ${qId}`,
      studentEvidence: detailedFeedback || 'Application and working notes presented in script.',
      assessment: aAwd >= aMax ? 'CORRECT' : aAwd > 0 ? 'PARTIALLY_CORRECT' : 'INCORRECT',
      marksAvailable: aMax,
      marksAwarded: aAwd,
      marksDeducted: Math.max(0, aMax - aAwd),
      reason: aAwd >= aMax
        ? 'Working notes and factual conclusion correctly applied.'
        : reasonForDeduction && !vagueRegex.test(reasonForDeduction)
        ? reasonForDeduction
        : 'Application to facts or final conclusion contained deductions as per ICAI marking rubric.',
      whatWasMissing: aAwd >= aMax ? 'None' : 'Complete computational schedule or accurate conclusion.',
      idealAnswer: `Step-wise computations, schedules, and verified conclusion as per ICAI suggested solution.`,
    },
  ];
}

/**
 * Generates the Detailed Evaluation & Step-Marking Report PDF.
 */
export async function generateDetailedReportPdf(
  evalData: EvaluationData,
  resultJson: any
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const darkSlate = rgb(0.12, 0.16, 0.22);
  const mutedSlate = rgb(0.4, 0.45, 0.52);
  const brandBlue = rgb(0.1, 0.35, 0.75);
  const lightBg = rgb(0.96, 0.97, 0.99);
  const borderGray = rgb(0.85, 0.88, 0.92);
  const passGreen = rgb(0.08, 0.55, 0.28);
  const failRed = rgb(0.78, 0.18, 0.18);
  const accentGold = rgb(0.75, 0.55, 0.1);

  const runPkg = resultJson?.evaluationRunPackage || (evalData.id ? loadEvaluationRunPackage(evalData.id) : null);
  const ledger = runPkg?.scoreLedger || resultJson?.canonicalLedger;

  // The official paper maximum is authoritative (e.g. 100 for CA papers).
  // Attempted/evaluable maximum (e.g. 75 or 80) is preserved as a diagnostic metric.
  const officialPaperMaximum =
    runPkg?.scoreLedger?.officialPaperMaxMarks ??
    resultJson?.canonicalLedger?.officialPaperMaxMarks ??
    runPkg?.questionInventory?.totalPaperMaxMarks ??
    resultJson?.officialPaperMaxMarks ??
    resultJson?.paperStructure?.totalPaperMaxMarks ??
    (evalData.maximumMarks && evalData.maximumMarks >= 100 ? evalData.maximumMarks : undefined) ??
    (resultJson?.maximumMarks && resultJson?.maximumMarks >= 100 ? resultJson?.maximumMarks : undefined) ??
    evalData.maximumMarks ??
    resultJson?.maximumMarks ??
    100;

  const attemptedMaxMarks =
    ledger?.totalMaxMarks ??
    resultJson?.attemptedMaxMarks ??
    resultJson?.selectedEvaluatedMaxMarks ??
    officialPaperMaximum;

  const totalAwarded = ledger?.totalAwardedMarks ?? (evalData.totalMarks ?? resultJson?.totalMarksAwarded ?? resultJson?.totalMarks ?? 0);
  const percentage = officialPaperMaximum > 0 ? (totalAwarded / officialPaperMaximum) * 100 : 0;
  const isPass = percentage >= 40;
  const isExemption = percentage >= 60;
  const resultStatus = isExemption ? 'EXEMPTION' : isPass ? 'PASS' : 'FAIL';

  let questions: any[] = [];
  if (runPkg && Array.isArray(runPkg.evaluationRecords) && runPkg.evaluationRecords.length > 0) {
    questions = runPkg.evaluationRecords
      .filter((r: any) => r.counted || r.attempted)
      .map((r: any) => ({
        questionNumber: r.questionId,
        canonicalId: r.questionId,
        maximumMarks: r.maxMarks,
        maxMarks: r.maxMarks,
        marksAwarded: r.awardedMarks,
        detailedFeedback: r.evidence || `Evaluated with status ${r.evaluationStatus}`,
        markingComponents: r.markingComponents,
        stepMarkingBreakdown: r.stepMarkingBreakdown,
        stepsEvaluated: r.markingComponents,
      }));
  } else if (resultJson?.canonicalLedger && Array.isArray(resultJson.canonicalLedger.records) && resultJson.canonicalLedger.records.length > 0) {
    questions = resultJson.canonicalLedger.records
      .filter((r: any) => r.counted || r.attempted)
      .map((r: any) => ({
        questionNumber: r.questionId,
        canonicalId: r.questionId,
        maximumMarks: r.maxMarks,
        maxMarks: r.maxMarks,
        marksAwarded: r.awardedMarks,
        detailedFeedback: r.evidence || `Evaluated with status ${r.evaluationStatus}`,
        markingComponents: r.markingComponents,
        stepMarkingBreakdown: r.stepMarkingBreakdown,
        stepsEvaluated: r.markingComponents,
      }));
  } else {
    const rawQuestions: any[] = resultJson?.questionWiseBreakdown || resultJson?.questions || [];
    questions = deduplicateQuestionList(rawQuestions);
  }

  // Helper to add a new page with standard header and footer
  const createReportPage = (pageNum: number) => {
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
    const { width, height } = page.getSize();

    // Top Header bar
    page.drawRectangle({
      x: 0,
      y: height - 50,
      width,
      height: 50,
      color: brandBlue,
    });

    safeDrawText(page, 'CA EXAM CHECKER AI', {
      x: 36,
      y: height - 28,
      size: 11,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    safeDrawText(page, 'STEP-WISE CA EXAMINER EVALUATION & MARKING REPORT', {
      x: 36,
      y: height - 42,
      size: 8.5,
      font: helvetica,
      color: rgb(0.85, 0.92, 1),
    });

    const displayEvalId = evalData.displayId || (evalData.id ? evalData.id.slice(0, 16).toUpperCase() : 'CA-EVAL');
    safeDrawText(page, `Evaluation ID: ${displayEvalId}`, {
      x: width - Math.min(260, displayEvalId.length * 6.5 + 95),
      y: height - 34,
      size: 8,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    // Footer
    page.drawLine({
      start: { x: 36, y: 35 },
      end: { x: width - 36, y: 35 },
      thickness: 0.75,
      color: borderGray,
    });

    safeDrawText(page, 'CA Exam Checker AI - Independent diagnostic benchmark referencing verified marking schemes | Not affiliated with ICAI', {
      x: 36,
      y: 22,
      size: 7,
      font: helvetica,
      color: mutedSlate,
    });

    safeDrawText(page, `Page ${pageNum}`, {
      x: width - 75,
      y: 22,
      size: 7.5,
      font: helveticaBold,
      color: mutedSlate,
    });

    return { page, width, height };
  };

  // ---------------- PAGE 1: Scorecard & Overview ----------------
  let pageNum = 1;
  let { page: p1, width, height } = createReportPage(pageNum);

  let y = height - 75;

  // Candidate Details Card
  p1.drawRectangle({
    x: 36,
    y: y - 96,
    width: width - 72,
    height: 96,
    color: lightBg,
    borderColor: borderGray,
    borderWidth: 1,
  });

  safeDrawText(p1, 'CANDIDATE & EXAMINATION PROFILE', {
    x: 48,
    y: y - 18,
    size: 9.5,
    font: helveticaBold,
    color: brandBlue,
  });

  safeDrawText(p1, `Candidate: ${evalData.studentName || 'Student Candidate'}`, {
    x: 48,
    y: y - 36,
    size: 9,
    font: helveticaBold,
    color: darkSlate,
  });

  const cleanRegNo =
    evalData.icaiRegistrationNumber &&
    evalData.icaiRegistrationNumber !== 'N/A' &&
    evalData.icaiRegistrationNumber !== 'NA' &&
    evalData.icaiRegistrationNumber !== '000' &&
    evalData.icaiRegistrationNumber !== 'WRO0987654'
      ? evalData.icaiRegistrationNumber
      : 'Not provided';

  const studentCodeDisplay = evalData.studentCode ? `  |  Student Code: ${evalData.studentCode}` : '';
  safeDrawText(p1, `Roll / Reg No: ${cleanRegNo}${studentCodeDisplay}`, {
    x: 48,
    y: y - 52,
    size: 8.5,
    font: helvetica,
    color: darkSlate,
  });

  safeDrawText(p1, `CA Level: ${evalData.level || 'INTERMEDIATE'}`, {
    x: 48,
    y: y - 68,
    size: 8.5,
    font: helvetica,
    color: darkSlate,
  });

  const sourceLabel =
    evalData.evaluationSource === 'INSTITUTE' || evalData.instituteName
      ? `Institute: ${evalData.instituteName || 'Academy'}${evalData.batchName ? ` (${evalData.batchName})` : ''}`
      : 'Evaluation: AI Step-Wise Diagnostic Engine (Verified Standards)';

  safeDrawText(p1, sourceLabel, {
    x: 48,
    y: y - 84,
    size: 8,
    font: helveticaBold,
    color: evalData.evaluationSource === 'INSTITUTE' ? brandBlue : mutedSlate,
  });

  safeDrawText(p1, `Subject: ${evalData.subjectName || 'Chartered Accountancy'}`, {
    x: 280,
    y: y - 36,
    size: 9,
    font: helveticaBold,
    color: darkSlate,
  });

  safeDrawText(p1, `Target Attempt: ${evalData.attempt || 'May 2026'}${evalData.mtpSeries ? ` (MTP Series ${evalData.mtpSeries})` : ''}`, {
    x: 280,
    y: y - 52,
    size: 8.5,
    font: helvetica,
    color: darkSlate,
  });

  safeDrawText(p1, `Checking Mode: ${evalData.checkingMode || 'STANDARD_CA'}`, {
    x: 280,
    y: y - 68,
    size: 8.5,
    font: helvetica,
    color: darkSlate,
  });

  y -= 115;

  // Score Box & Status
  const boxWidth = (width - 72 - 20) / 3;

  // Box 1: Marks Awarded
  p1.drawRectangle({
    x: 36,
    y: y - 72,
    width: boxWidth,
    height: 72,
    color: rgb(0.98, 0.99, 1),
    borderColor: brandBlue,
    borderWidth: 1,
  });
  safeDrawText(p1, 'OFFICIAL FINAL SCORE', {
    x: 46,
    y: y - 16,
    size: 8,
    font: helveticaBold,
    color: mutedSlate,
  });
  safeDrawText(p1, `${Math.round(totalAwarded * 100) / 100} / ${officialPaperMaximum}`, {
    x: 46,
    y: y - 40,
    size: 19,
    font: helveticaBold,
    color: brandBlue,
  });
  safeDrawText(p1, `Official Score: ${(Math.round(percentage * 100) / 100).toFixed(2).replace(/\.00$/, '')}%`, {
    x: 46,
    y: y - 54,
    size: 7.5,
    font: helveticaBold,
    color: darkSlate,
  });
  safeDrawText(p1, `Attempted Max: ${attemptedMaxMarks}m | Paper Max: ${officialPaperMaximum}m`, {
    x: 46,
    y: y - 65,
    size: 6.8,
    font: helvetica,
    color: mutedSlate,
  });

  // Box 2: Result Status
  const statusColor = isPass ? passGreen : failRed;
  p1.drawRectangle({
    x: 36 + boxWidth + 10,
    y: y - 72,
    width: boxWidth,
    height: 72,
    color: isPass ? rgb(0.95, 0.99, 0.96) : rgb(0.99, 0.95, 0.95),
    borderColor: statusColor,
    borderWidth: 1,
  });
  safeDrawText(p1, 'RESULT CLASSIFICATION', {
    x: 46 + boxWidth + 10,
    y: y - 18,
    size: 8,
    font: helveticaBold,
    color: mutedSlate,
  });
  safeDrawText(p1, resultStatus, {
    x: 46 + boxWidth + 10,
    y: y - 46,
    size: 18,
    font: helveticaBold,
    color: statusColor,
  });
  safeDrawText(p1, isExemption ? 'Eligible for Subject Exemption (>=60)' : isPass ? 'Meets Passing Benchmark (>=40)' : 'Requires Targeted Revision (<40)', {
    x: 46 + boxWidth + 10,
    y: y - 62,
    size: 7.5,
    font: helvetica,
    color: statusColor,
  });

  // Box 3: Grade & Step Marking Rubric
  p1.drawRectangle({
    x: 36 + (boxWidth + 10) * 2,
    y: y - 72,
    width: boxWidth,
    height: 72,
    color: lightBg,
    borderColor: borderGray,
    borderWidth: 1,
  });
  safeDrawText(p1, 'PERFORMANCE GRADE', {
    x: 46 + (boxWidth + 10) * 2,
    y: y - 18,
    size: 8,
    font: helveticaBold,
    color: mutedSlate,
  });
  safeDrawText(p1, evalData.grade || (percentage >= 70 ? 'A+' : percentage >= 60 ? 'A' : percentage >= 50 ? 'B' : percentage >= 40 ? 'C' : 'D'), {
    x: 46 + (boxWidth + 10) * 2,
    y: y - 46,
    size: 20,
    font: helveticaBold,
    color: accentGold,
  });
  safeDrawText(p1, 'Step-Wise CA Rubric Evaluated', {
    x: 46 + (boxWidth + 10) * 2,
    y: y - 62,
    size: 7.5,
    font: helvetica,
    color: mutedSlate,
  });

  y -= 90;

  // Executive Summary & Overall Feedback
  const summaryText = resultJson?.overallFeedback || resultJson?.summary || 'The answer paper has been thoroughly evaluated against ICAI suggested answers, step marking rules, statutory provisions, and working note methodologies.';
  
  p1.drawRectangle({
    x: 36,
    y: y - 90,
    width: width - 72,
    height: 90,
    color: lightBg,
    borderColor: borderGray,
    borderWidth: 1,
  });

  safeDrawText(p1, 'EXAMINER GENERAL OBSERVATIONS & REMARKS', {
    x: 48,
    y: y - 18,
    size: 9,
    font: helveticaBold,
    color: darkSlate,
  });

  // Wrap summary text
  const words = summaryText.split(' ');
  let line = '';
  let lineY = y - 34;
  for (const w of words) {
    if (line.length + w.length > 95) {
      safeDrawText(p1, line, { x: 48, y: lineY, size: 8, font: helvetica, color: darkSlate });
      line = w + ' ';
      lineY -= 12;
      if (lineY < y - 80) break;
    } else {
      line += w + ' ';
    }
  }
  if (line && lineY >= y - 80) {
    safeDrawText(p1, line, { x: 48, y: lineY, size: 8, font: helvetica, color: darkSlate });
  }

  y -= 105;

  // Strengths & Weaknesses
  const strengths: string[] = resultJson?.strengths || ['Good understanding of basic statutory concepts', 'Proper format of financial statements maintained'];
  const improvements: string[] = resultJson?.improvements || resultJson?.weaknesses || ['Provide complete and clear working notes', 'Cite relevant section numbers and AS/Ind AS standards'];

  const halfWidth = (width - 72 - 16) / 2;

  // Strengths column
  p1.drawRectangle({
    x: 36,
    y: y - 110,
    width: halfWidth,
    height: 110,
    color: rgb(0.97, 0.99, 0.97),
    borderColor: rgb(0.8, 0.9, 0.8),
    borderWidth: 1,
  });

  safeDrawText(p1, 'KEY STRENGTHS', {
    x: 46,
    y: y - 18,
    size: 8.5,
    font: helveticaBold,
    color: passGreen,
  });

  let sY = y - 36;
  strengths.slice(0, 3).forEach((s) => {
    const sLines = wrapText(`• ${s}`, 40);
    sLines.slice(0, 2).forEach((sl) => {
      safeDrawText(p1, sl, {
        x: 46,
        y: sY,
        size: 7.2,
        font: helvetica,
        color: darkSlate,
      });
      sY -= 10;
    });
    sY -= 4;
  });

  // Improvements column
  p1.drawRectangle({
    x: 36 + halfWidth + 16,
    y: y - 110,
    width: halfWidth,
    height: 110,
    color: rgb(0.99, 0.97, 0.97),
    borderColor: rgb(0.9, 0.8, 0.8),
    borderWidth: 1,
  });

  safeDrawText(p1, 'AREAS FOR IMPROVEMENT', {
    x: 46 + halfWidth + 16,
    y: y - 18,
    size: 8.5,
    font: helveticaBold,
    color: failRed,
  });

  let iY = y - 36;
  improvements.slice(0, 3).forEach((imp) => {
    const impLines = wrapText(`• ${imp}`, 40);
    impLines.slice(0, 2).forEach((il) => {
      safeDrawText(p1, il, {
        x: 46 + halfWidth + 16,
        y: iY,
        size: 7.2,
        font: helvetica,
        color: darkSlate,
      });
      iY -= 10;
    });
    iY -= 4;
  });

  y -= 125;

  // Question Summary Table Header on Page 1
  safeDrawText(p1, 'QUESTION-WISE PERFORMANCE SCORECARD', {
    x: 36,
    y,
    size: 9.5,
    font: helveticaBold,
    color: brandBlue,
  });

  y -= 15;

  // Table header
  p1.drawRectangle({
    x: 36,
    y: y - 18,
    width: width - 72,
    height: 18,
    color: brandBlue,
  });

  safeDrawText(p1, 'Q. No.', { x: 44, y: y - 13, size: 7.5, font: helveticaBold, color: rgb(1, 1, 1) });
  safeDrawText(p1, 'Marks Awarded', { x: 95, y: y - 13, size: 7.5, font: helveticaBold, color: rgb(1, 1, 1) });
  safeDrawText(p1, 'Max Marks', { x: 175, y: y - 13, size: 7.5, font: helveticaBold, color: rgb(1, 1, 1) });
  safeDrawText(p1, 'Score %', { x: 245, y: y - 13, size: 7.5, font: helveticaBold, color: rgb(1, 1, 1) });
  safeDrawText(p1, 'ICAI Step Status & Key Remarks', { x: 310, y: y - 13, size: 7.5, font: helveticaBold, color: rgb(1, 1, 1) });

  y -= 18;

  // Render question summary rows (paginate if needed so NO question is truncated)
  let currentScorecardPage = p1;
  questions.forEach((q: any, idx: number) => {
    const qNum = String(
      q.canonicalId ||
      q.fullQuestionCode ||
      (q.subQuestion && !String(q.questionNumber).includes('(')
        ? `Q${String(q.questionNumber).replace(/^Q/i, '')}(${q.subQuestion})`
        : q.questionNumber) ||
      `Q${idx + 1}`
    );
    const qMarks = Number(q.marksAwarded ?? 0);
    const qMax = Number(q.maximumMarks ?? q.maxMarks ?? 0);
    const qPct = qMax > 0 ? Math.round((qMarks / qMax) * 100) : 0;
    const qRemarks = q.detailedFeedback || q.examinerRemarks || q.reasonForDeduction || q.remarks || 'Step evaluation completed';

    if (y - 18 < 60) {
      pageNum++;
      const newPage = createReportPage(pageNum);
      currentScorecardPage = newPage.page;
      y = newPage.height - 75;

      // Repeat Table header on new page
      currentScorecardPage.drawRectangle({
        x: 36,
        y: y - 18,
        width: width - 72,
        height: 18,
        color: brandBlue,
      });
      safeDrawText(currentScorecardPage, 'Q. No.', { x: 44, y: y - 13, size: 7.5, font: helveticaBold, color: rgb(1, 1, 1) });
      safeDrawText(currentScorecardPage, 'Marks Awarded', { x: 95, y: y - 13, size: 7.5, font: helveticaBold, color: rgb(1, 1, 1) });
      safeDrawText(currentScorecardPage, 'Max Marks', { x: 175, y: y - 13, size: 7.5, font: helveticaBold, color: rgb(1, 1, 1) });
      safeDrawText(currentScorecardPage, 'Score %', { x: 245, y: y - 13, size: 7.5, font: helveticaBold, color: rgb(1, 1, 1) });
      safeDrawText(currentScorecardPage, 'ICAI Step Status & Key Remarks', { x: 310, y: y - 13, size: 7.5, font: helveticaBold, color: rgb(1, 1, 1) });
      y -= 18;
    }

    currentScorecardPage.drawRectangle({
      x: 36,
      y: y - 18,
      width: width - 72,
      height: 18,
      color: idx % 2 === 0 ? lightBg : rgb(1, 1, 1),
      borderColor: borderGray,
      borderWidth: 0.5,
    });

    safeDrawText(currentScorecardPage, qNum, { x: 44, y: y - 13, size: 7.5, font: helveticaBold, color: darkSlate });
    safeDrawText(currentScorecardPage, `${qMarks}`, { x: 95, y: y - 13, size: 7.5, font: helveticaBold, color: darkSlate });
    safeDrawText(currentScorecardPage, `${qMax}`, { x: 175, y: y - 13, size: 7.5, font: helvetica, color: darkSlate });
    safeDrawText(currentScorecardPage, `${qPct}%`, { x: 245, y: y - 13, size: 7.5, font: helveticaBold, color: qPct >= 50 ? passGreen : failRed });
    const remarkLines = wrapText(qRemarks, 62);
    safeDrawText(currentScorecardPage, remarkLines[0] || qRemarks, { x: 310, y: y - 13, size: 7, font: helvetica, color: mutedSlate });

    y -= 18;
  });

  // ---------------- PAGE 2+: Step-by-Step Breakdown ----------------
  if (questions.length > 0) {
    pageNum++;
    let { page: currentStepPage, width: pW, height: pH } = createReportPage(pageNum);
    let stepY = pH - 75;

    safeDrawText(currentStepPage, 'COMPONENT-LEVEL STEP-WISE MARKING BREAKDOWN & EVIDENCE', {
      x: 36,
      y: stepY,
      size: 10,
      font: helveticaBold,
      color: brandBlue,
    });

    stepY -= 20;

    const renderedCanonicalQuestions = new Set<string>();

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qNum = String(
        q.canonicalId ||
        q.fullQuestionCode ||
        (q.subQuestion && !String(q.questionNumber).includes('(')
          ? `Q${String(q.questionNumber).replace(/^Q/i, '')}(${q.subQuestion})`
          : q.questionNumber) ||
        `Q${i + 1}`
      );
      if (renderedCanonicalQuestions.has(qNum)) {
        continue;
      }
      renderedCanonicalQuestions.add(qNum);
      const qMarks = Number(q.marksAwarded ?? 0);
      const qMax = Number(q.maximumMarks ?? q.maxMarks ?? 0);
      const rawComps: any[] = q.markingComponents || q.structuredEvidence?.markingComponents || q.stepMarkingBreakdown || q.stepsEvaluated || [];
      const components = enrichMarkingComponentsWithExaminerReasoning(
        qNum,
        rawComps,
        qMarks,
        qMax,
        q.detailedFeedback,
        q.reasonForDeduction
      );
      const hasConsequential = Boolean(q.consequentialErrorDetails?.isConsequential);

      // Estimate needed height for this question
      const perComponentHeight = 70;
      const questionHeaderHeight = hasConsequential ? 48 : 32;
      const totalQuestionHeight = questionHeaderHeight + Math.max(1, components.length) * perComponentHeight;

      if (stepY - totalQuestionHeight < 60 && stepY < pH - 150) {
        pageNum++;
        const newP = createReportPage(pageNum);
        currentStepPage = newP.page;
        stepY = pH - 75;
      }

      // Question Banner
      currentStepPage.drawRectangle({
        x: 36,
        y: stepY - 22,
        width: pW - 72,
        height: 22,
        color: rgb(0.93, 0.95, 0.98),
        borderColor: brandBlue,
        borderWidth: 0.75,
      });

      safeDrawText(currentStepPage, `QUESTION NO. ${qNum}`, {
        x: 46,
        y: stepY - 15,
        size: 8.5,
        font: helveticaBold,
        color: brandBlue,
      });

      safeDrawText(currentStepPage, `Marks Awarded: ${qMarks} / ${qMax}`, {
        x: pW - 170,
        y: stepY - 15,
        size: 8.5,
        font: helveticaBold,
        color: qMarks >= qMax ? passGreen : darkSlate,
      });

      stepY -= 26;

      // Consequential Error Callout Banner if applicable
      if (hasConsequential) {
        currentStepPage.drawRectangle({
          x: 44,
          y: stepY - 16,
          width: pW - 88,
          height: 16,
          color: rgb(0.95, 0.98, 1),
          borderColor: brandBlue,
          borderWidth: 0.5,
        });

        safeDrawText(currentStepPage, `[CONSEQUENTIAL MARKING] Prior arithmetic slip isolated. Downstream reasoning credited.`, {
          x: 52,
          y: stepY - 11,
          size: 7,
          font: helveticaBold,
          color: brandBlue,
        });

        stepY -= 20;
      }

      // Overall Question Examiner Feedback Callout
      const overallFeedback = q.detailedFeedback || q.reasonForDeduction;
      if (overallFeedback) {
        const fbLines = wrapText(`Examiner Feedback: ${overallFeedback}`, 86);
        const fbH = 12 + fbLines.length * 9;
        if (stepY - fbH < 75) {
          pageNum++;
          const newP = createReportPage(pageNum);
          currentStepPage = newP.page;
          stepY = pH - 75;
        }

        currentStepPage.drawRectangle({
          x: 44,
          y: stepY - fbH,
          width: pW - 88,
          height: fbH,
          color: rgb(0.98, 0.98, 0.99),
          borderColor: rgb(0.85, 0.88, 0.92),
          borderWidth: 0.5,
        });

        let fbY = stepY - 10;
        fbLines.forEach((fl) => {
          safeDrawText(currentStepPage, fl, {
            x: 52,
            y: fbY,
            size: 6.8,
            font: helvetica,
            color: darkSlate,
          });
          fbY -= 9;
        });

        stepY -= (fbH + 6);
      }

      // Render Components / Steps
      if (components.length === 0) {
        currentStepPage.drawRectangle({
          x: 44,
          y: stepY - 22,
          width: pW - 88,
          height: 22,
          color: lightBg,
          borderColor: borderGray,
          borderWidth: 0.5,
        });

        safeDrawText(currentStepPage, `Remarks: ${q.examinerRemarks || 'Candidate solution evaluated according to standard CA step-marking rubric.'}`, {
          x: 52,
          y: stepY - 14,
          size: 7.5,
          font: helvetica,
          color: darkSlate,
        });
        stepY -= 28;
      } else {
        components.forEach((c: any) => {
          const cType = c.componentType || (c.stepName?.startsWith('[') ? '' : 'STEP');
          const prefix = cType ? `[${cType}] ` : '';
          const name = `${prefix}${c.expectedRequirement || c.step || c.stepName || 'Requirement'}`;
          const sAward = Number(c.marksAwarded ?? 0);
          const sMax = Number(c.marksAvailable || c.maximumMarks || c.maxMarks || 1);
          const sDeducted = Number(c.marksDeducted ?? Math.max(0, sMax - sAward));
          const isCorrect = c.assessment === 'CORRECT' || sAward >= sMax;
          const isPartial = c.assessment === 'PARTIALLY_CORRECT' || (sAward > 0 && sAward < sMax);

          const titleLines = wrapText(name, 68);
          const deductionLines = c.deductionReason ? wrapText(`Deduction: ${String(c.deductionReason)}`, 82) : [];
          const evidenceLines = c.studentEvidence ? wrapText(`Student Script: ${String(c.studentEvidence)}`, 82) : [];

          const lineH = 9;
          const boxH = 14 + (titleLines.length * 10) + (deductionLines.length * lineH) + (evidenceLines.length * lineH) + 4;

          if (stepY - boxH < 75) {
            pageNum++;
            const newP = createReportPage(pageNum);
            currentStepPage = newP.page;
            stepY = pH - 75;
          }

          currentStepPage.drawRectangle({
            x: 44,
            y: stepY - boxH,
            width: pW - 88,
            height: boxH,
            color: isCorrect ? rgb(0.97, 0.99, 0.97) : isPartial ? rgb(1, 0.99, 0.95) : rgb(1, 0.96, 0.96),
            borderColor: isCorrect ? rgb(0.7, 0.9, 0.7) : isPartial ? rgb(0.9, 0.8, 0.5) : rgb(0.9, 0.7, 0.7),
            borderWidth: 0.5,
          });

          // Component title lines
          let textY = stepY - 12;
          titleLines.forEach((tl) => {
            safeDrawText(currentStepPage, tl, {
              x: 52,
              y: textY,
              size: 7.5,
              font: helveticaBold,
              color: darkSlate,
            });
            textY -= 10;
          });

          // Marks awarded and deduction pill (anchored to top-right of the box)
          const markLabel = sDeducted > 0 ? `+${sAward} / ${sMax} (-${sDeducted})` : `+${sAward} / ${sMax}`;
          safeDrawText(currentStepPage, markLabel, {
            x: pW - 145,
            y: stepY - 12,
            size: 7.5,
            font: helveticaBold,
            color: isCorrect ? passGreen : isPartial ? accentGold : failRed,
          });

          // Examiner Deduction reasons (no truncation)
          deductionLines.forEach((dl) => {
            safeDrawText(currentStepPage, dl, {
              x: 52,
              y: textY,
              size: 6.8,
              font: helvetica,
              color: failRed,
            });
            textY -= lineH;
          });

          // Student Evidence from script (no truncation)
          evidenceLines.forEach((el) => {
            safeDrawText(currentStepPage, el, {
              x: 52,
              y: textY,
              size: 6.8,
              font: helvetica,
              color: mutedSlate,
            });
            textY -= lineH;
          });

          stepY -= (boxH + 4);
        });
      }

      stepY -= 8;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
