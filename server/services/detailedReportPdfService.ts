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

    safeDrawText(page, 'THE INSTITUTE OF CHARTERED ACCOUNTANTS OF INDIA', {
      x: 36,
      y: height - 28,
      size: 11,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    safeDrawText(page, 'AI STEP-MARKING & DETAILED EVALUATION REPORT', {
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

    safeDrawText(page, 'CA Exam Checker AI - Verified Authentic ICAI Evaluation Standard', {
      x: 36,
      y: 22,
      size: 7.5,
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

  safeDrawText(p1, `ICAI Reg No: ${evalData.icaiRegistrationNumber || 'N/A'}`, {
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
      : 'Evaluation: Public AI (Official ICAI Answers)';

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

  safeDrawText(p1, `Checking Mode: ${evalData.checkingMode || 'STRICT_ICAI'}`, {
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
  safeDrawText(p1, isExemption ? 'Eligible for Subject Exemption' : isPass ? 'Meets ICAI Passing Standard' : 'Requires Further Revision', {
    x: 46 + boxWidth + 10,
    y: y - 62,
    size: 7.5,
    font: helvetica,
    color: statusColor,
  });

  // Box 3: Grade & ICAI Step Marking Index
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
  safeDrawText(p1, 'ICAI Evaluated Step Standard', {
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

    safeDrawText(currentStepPage, 'DETAILED ICAI STEP-BY-STEP MARKING BREAKDOWN', {
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
      const steps = q.stepMarkingBreakdown || q.stepsEvaluated || [];

      // Check if page overflow
      const neededHeight = 45 + steps.length * 20;
      if (stepY - neededHeight < 60) {
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
        color: darkSlate,
      });

      stepY -= 28;

      // Question Step Items
      if (steps.length === 0) {
        safeDrawText(currentStepPage, `Remarks: ${q.examinerRemarks || 'Candidate solution evaluated according to standard.'}`, {
          x: 48,
          y: stepY - 10,
          size: 7.5,
          font: helvetica,
          color: darkSlate,
        });
        stepY -= 22;
      } else {
        steps.forEach((s: any) => {
          const sName = s.step || s.stepName || 'Evaluation Step';
          const sMarks = s.marksAwarded ?? 0;
          const sMax = s.maximumMarks || s.maxMarks || 1;
          const sComment = s.remarks || s.comment || '';
          const isCorrect = s.status === 'CORRECT' || sMarks >= sMax;

          currentStepPage.drawRectangle({
            x: 46,
            y: stepY - 18,
            width: pW - 92,
            height: 18,
            color: isCorrect ? rgb(0.97, 0.99, 0.97) : rgb(0.99, 0.97, 0.97),
            borderColor: borderGray,
            borderWidth: 0.5,
          });

          safeDrawText(currentStepPage, sName.substring(0, 50), {
            x: 54,
            y: stepY - 12,
            size: 7.5,
            font: helveticaBold,
            color: darkSlate,
          });

          safeDrawText(currentStepPage, `${sMarks} / ${sMax}`, {
            x: pW - 140,
            y: stepY - 12,
            size: 7.5,
            font: helveticaBold,
            color: isCorrect ? passGreen : failRed,
          });

          if (sComment) {
            safeDrawText(currentStepPage, sComment.substring(0, 35), {
              x: pW - 270,
              y: stepY - 12,
              size: 7,
              font: helvetica,
              color: mutedSlate,
            });
          }

          stepY -= 20;
        });
      }

      stepY -= 10;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
