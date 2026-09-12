import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { EvaluationData, toSafePdfText, safeDrawText } from './pdfCheckedCopyService.js';

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

  const totalAwarded = evalData.totalMarks ?? resultJson?.totalMarksAwarded ?? resultJson?.totalMarks ?? 0;
  const maxMarks = evalData.maximumMarks ?? resultJson?.maximumMarks ?? 100;
  const percentage = maxMarks > 0 ? (totalAwarded / maxMarks) * 100 : 0;
  const isPass = percentage >= 40;
  const isExemption = percentage >= 60;
  const resultStatus = isExemption ? 'EXEMPTION' : isPass ? 'PASS' : 'FAIL';

  const questions: any[] = resultJson?.questionWiseBreakdown || resultJson?.questions || [];

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

    safeDrawText(page, `Report ID: ${evalData.id ? evalData.id.slice(0, 8).toUpperCase() : 'CA-EVAL'}`, {
      x: width - 180,
      y: height - 34,
      size: 8.5,
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

  safeDrawText(p1, `Roll / Reg No: ${cleanRegNo}`, {
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

  safeDrawText(p1, `Target Attempt: ${evalData.attempt || 'May 2026'}`, {
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
    y: y - 70,
    width: boxWidth,
    height: 70,
    color: rgb(0.98, 0.99, 1),
    borderColor: brandBlue,
    borderWidth: 1,
  });
  safeDrawText(p1, 'TOTAL SCORE', {
    x: 46,
    y: y - 18,
    size: 8,
    font: helveticaBold,
    color: mutedSlate,
  });
  safeDrawText(p1, `${Math.round(totalAwarded * 10) / 10} / ${maxMarks}`, {
    x: 46,
    y: y - 46,
    size: 20,
    font: helveticaBold,
    color: brandBlue,
  });
  safeDrawText(p1, `Percentage: ${Math.round(percentage)}%`, {
    x: 46,
    y: y - 62,
    size: 8,
    font: helvetica,
    color: mutedSlate,
  });

  // Box 2: Result Status
  const statusColor = isPass ? passGreen : failRed;
  p1.drawRectangle({
    x: 36 + boxWidth + 10,
    y: y - 70,
    width: boxWidth,
    height: 70,
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
    y: y - 70,
    width: boxWidth,
    height: 70,
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
    safeDrawText(p1, `- ${s.substring(0, 50)}`, {
      x: 46,
      y: sY,
      size: 7.5,
      font: helvetica,
      color: darkSlate,
    });
    sY -= 16;
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
    safeDrawText(p1, `- ${imp.substring(0, 50)}`, {
      x: 46 + halfWidth + 16,
      y: iY,
      size: 7.5,
      font: helvetica,
      color: darkSlate,
    });
    iY -= 16;
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

  // Render question summary rows
  questions.slice(0, 8).forEach((q: any, idx: number) => {
    const qNum = String(q.questionNumber || `Q${idx + 1}`);
    const qMarks = Number(q.marksAwarded ?? 0);
    const qMax = Number(q.maxMarks || q.maximumMarks || 5);
    const qPct = qMax > 0 ? Math.round((qMarks / qMax) * 100) : 0;
    const qRemarks = q.examinerRemarks || q.remarks || 'Step evaluation completed';

    p1.drawRectangle({
      x: 36,
      y: y - 18,
      width: width - 72,
      height: 18,
      color: idx % 2 === 0 ? lightBg : rgb(1, 1, 1),
      borderColor: borderGray,
      borderWidth: 0.5,
    });

    safeDrawText(p1, qNum, { x: 44, y: y - 13, size: 7.5, font: helveticaBold, color: darkSlate });
    safeDrawText(p1, `${qMarks}`, { x: 95, y: y - 13, size: 7.5, font: helveticaBold, color: darkSlate });
    safeDrawText(p1, `${qMax}`, { x: 175, y: y - 13, size: 7.5, font: helvetica, color: darkSlate });
    safeDrawText(p1, `${qPct}%`, { x: 245, y: y - 13, size: 7.5, font: helveticaBold, color: qPct >= 50 ? passGreen : failRed });
    safeDrawText(p1, qRemarks.substring(0, 48), { x: 310, y: y - 13, size: 7, font: helvetica, color: mutedSlate });

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

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qNum = String(q.questionNumber || `Q${i + 1}`);
      const qMarks = Number(q.marksAwarded ?? 0);
      const qMax = Number(q.maxMarks || q.maximumMarks || 5);
      const components: any[] = q.markingComponents || q.structuredEvidence?.markingComponents || q.stepMarkingBreakdown || q.stepsEvaluated || [];
      const hasConsequential = Boolean(q.consequentialErrorDetails?.isConsequential);

      // Estimate needed height for this question
      const perComponentHeight = 36;
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
          if (stepY < 75) {
            pageNum++;
            const newP = createReportPage(pageNum);
            currentStepPage = newP.page;
            stepY = pH - 75;
          }

          const cType = c.componentType || (c.stepName?.startsWith('[') ? '' : 'STEP');
          const prefix = cType ? `[${cType}] ` : '';
          const name = c.expectedRequirement || c.step || c.stepName || 'Requirement';
          const sAward = Number(c.marksAwarded ?? 0);
          const sMax = Number(c.marksAvailable || c.maximumMarks || c.maxMarks || 1);
          const sDeducted = Number(c.marksDeducted ?? Math.max(0, sMax - sAward));
          const isCorrect = c.assessment === 'CORRECT' || sAward >= sMax;
          const isPartial = c.assessment === 'PARTIALLY_CORRECT' || (sAward > 0 && sAward < sMax);

          const studentEvidence = c.studentEvidence ? `Script: ${String(c.studentEvidence).substring(0, 65)}` : '';
          const deductionReason = c.deductionReason ? `Deduction: ${String(c.deductionReason).substring(0, 70)}` : '';

          const boxH = (studentEvidence || deductionReason) ? 32 : 20;

          currentStepPage.drawRectangle({
            x: 44,
            y: stepY - boxH,
            width: pW - 88,
            height: boxH,
            color: isCorrect ? rgb(0.97, 0.99, 0.97) : isPartial ? rgb(1, 0.99, 0.95) : rgb(1, 0.96, 0.96),
            borderColor: isCorrect ? rgb(0.7, 0.9, 0.7) : isPartial ? rgb(0.9, 0.8, 0.5) : rgb(0.9, 0.7, 0.7),
            borderWidth: 0.5,
          });

          // Component title
          safeDrawText(currentStepPage, `${prefix}${name}`.substring(0, 55), {
            x: 52,
            y: stepY - 12,
            size: 7.5,
            font: helveticaBold,
            color: darkSlate,
          });

          // Marks awarded and deduction
          const markLabel = sDeducted > 0 ? `+${sAward} / ${sMax} (-${sDeducted})` : `+${sAward} / ${sMax}`;
          safeDrawText(currentStepPage, markLabel, {
            x: pW - 145,
            y: stepY - 12,
            size: 7.5,
            font: helveticaBold,
            color: isCorrect ? passGreen : isPartial ? accentGold : failRed,
          });

          // Detail line (student evidence / deduction reason)
          let subY = stepY - 22;
          if (deductionReason) {
            safeDrawText(currentStepPage, deductionReason, {
              x: 52,
              y: subY,
              size: 6.8,
              font: helvetica,
              color: failRed,
            });
            subY -= 9;
          } else if (studentEvidence) {
            safeDrawText(currentStepPage, studentEvidence, {
              x: 52,
              y: subY,
              size: 6.8,
              font: helvetica,
              color: mutedSlate,
            });
          }

          stepY -= (boxH + 4);
        });
      }

      stepY -= 8;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
