import nodemailer, { type Transporter } from 'nodemailer';
import crypto from 'crypto';
import { db } from '../db.js';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

export interface EmailAuditEntry {
  id?: string;
  adminId?: string | null;
  studentId?: string | null;
  recipient: string;
  emailType: string;
  evaluationId: string;
  recheckRequestId?: string | null;
  fileVersionIds?: string | null;
  deliveryStatus: 'SENT' | 'FAILED' | 'SANDBOX_RECORDED';
  providerResponse?: string | null;
}

export function recordEmailAudit(entry: EmailAuditEntry): void {
  try {
    const id = entry.id || `eaudit_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO email_audit_logs (
        id, admin_id, student_id, recipient, email_type,
        evaluation_id, recheck_request_id, file_version_ids,
        delivery_status, provider_response, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      id,
      entry.adminId || null,
      entry.studentId || null,
      entry.recipient,
      entry.emailType,
      entry.evaluationId,
      entry.recheckRequestId || null,
      entry.fileVersionIds || null,
      entry.deliveryStatus,
      entry.providerResponse ? String(entry.providerResponse).slice(0, 1000) : null
    );
  } catch (err) {
    console.warn('[EmailService] Failed to record email audit:', err);
  }
}

export function getEmailAuditLogs(evaluationId?: string): any[] {
  try {
    if (evaluationId) {
      return db.prepare(`
        SELECT * FROM email_audit_logs WHERE evaluation_id = ? ORDER BY sent_at DESC LIMIT 50
      `).all(evaluationId);
    }
    return db.prepare(`
      SELECT * FROM email_audit_logs ORDER BY sent_at DESC LIMIT 100
    `).all();
  } catch (err) {
    console.warn('[EmailService] Failed to fetch email audit logs:', err);
    return [];
  }
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    try {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      return transporter;
    } catch (err) {
      console.warn('[EmailService] Failed to initialize SMTP transporter:', err);
      return null;
    }
  }

  return null;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; status: 'SENT' | 'FAILED' | 'SANDBOX_RECORDED'; message?: string }> {
  const mailer = getTransporter();
  const host = (process.env.SMTP_HOST || '').toLowerCase();
  const isResend = host.includes('resend');

  // Resend requires onboarding@resend.dev when using testing sandbox without a verified custom domain
  let from = process.env.SMTP_FROM;
  if (!from || (isResend && from.includes('caexamchecker.ai'))) {
    from = isResend ? 'onboarding@resend.dev' : 'support@caexamchecker.ai';
  }

  if (mailer) {
    try {
      const info = await mailer.sendMail({
        from: `"CA Exam Checker AI" <${from}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      });
      console.log(`[EmailService] Email successfully delivered to ${options.to} via SMTP:`, info.messageId);
      return { success: true, status: 'SENT', message: `Delivered via SMTP: ${info.messageId}` };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isSandboxRestriction =
        errMsg.includes('550') ||
        errMsg.includes('only send testing emails') ||
        errMsg.includes('verify a domain') ||
        errMsg.includes('sandbox') ||
        errMsg.includes('not verified');

      if (isSandboxRestriction) {
        console.warn(
          `[EmailService Sandbox Notice] SMTP provider in testing sandbox mode (${options.to} is not an authorized test recipient). Email recorded in audit log and dev channel.`
        );
        return { success: true, status: 'SANDBOX_RECORDED', message: `Sandbox mode: ${errMsg}` };
      } else {
        console.warn(`[EmailService] SMTP delivery attempt for ${options.to} did not complete: ${errMsg}`);
        return { success: false, status: 'FAILED', message: errMsg };
      }
    }
  }

  // Fallback / Development mode logging:
  console.log(`\n======================================================`);
  console.log(`[EmailService - DISPATCH LOG] Email target: ${options.to}`);
  console.log(`Subject: ${options.subject}`);
  console.log(`Content:\n${options.text}`);
  if (options.attachments?.length) {
    console.log(`Attachments: ${options.attachments.map(a => a.filename).join(', ')}`);
  }
  console.log(`======================================================\n`);
  return { success: true, status: 'SANDBOX_RECORDED', message: 'Logged in development sandbox channel' };
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  userName?: string
): Promise<boolean> {
  const port = process.env.PORT || '3000';
  const appUrl = process.env.APP_URL || (typeof window !== 'undefined' ? window.location.origin : `http://localhost:${port}`);
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;
  const displayName = userName || 'Student';

  const subject = 'CA Exam Checker AI - Password Reset Request';
  const text = `Hello ${displayName},\n\n` +
    `A request was received to reset your password for CA Exam Checker AI.\n\n` +
    `Click the link below or copy it into your browser to reset your password:\n${resetUrl}\n\n` +
    `This link is time-limited and will expire in 1 hour. It can only be used once.\n\n` +
    `If you did not request this password reset, please ignore this email. Your account remains secure.\n\n` +
    `Best regards,\nCA Exam Checker AI Security Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
      <div style="background-color: #1e3a8a; padding: 20px; text-align: center; border-radius: 6px 6px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">CA Exam Checker AI</h2>
        <p style="color: #93c5fd; margin: 4px 0 0 0; font-size: 13px;">Security & Account Management</p>
      </div>
      <div style="background-color: #ffffff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px;">
        <h3 style="margin-top: 0; color: #0f172a;">Password Reset Request</h3>
        <p style="font-size: 14px; line-height: 1.6;">Hello <strong>${displayName}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6;">We received a request to reset your password for your CA Exam Checker AI account.</p>
        
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset My Password
          </a>
        </div>
        
        <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
          Or copy and paste this secure URL directly into your browser:<br/>
          <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
        </p>
        
        <div style="margin-top: 24px; padding: 14px; background-color: #f1f5f9; border-left: 4px solid #3b82f6; border-radius: 4px; font-size: 12px; color: #475569;">
          <strong>Security Notice:</strong> This single-use link is valid for exactly 1 hour. If you did not initiate this request, no action is needed; your current password remains completely secure.
        </div>
        
        <p style="font-size: 12px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          Best regards,<br/>The CA Exam Checker AI Security Team
        </p>
      </div>
    </div>
  `;

  const res = await sendEmail({ to: email, subject, text, html });
  return res.success;
}

export async function sendPasswordChangedConfirmation(
  email: string,
  userName?: string
): Promise<boolean> {
  const displayName = userName || 'Student';
  const subject = 'CA Exam Checker AI - Your Password Has Been Successfully Changed';
  const text = `Hello ${displayName},\n\n` +
    `This is a confirmation that the password for your CA Exam Checker AI account has been successfully changed.\n\n` +
    `If you made this change, you can safely disregard this notice.\n\n` +
    `If you DID NOT make this change, please contact support immediately.\n\n` +
    `Best regards,\nCA Exam Checker AI Security Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
      <div style="background-color: #1e3a8a; padding: 20px; text-align: center; border-radius: 6px 6px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">CA Exam Checker AI</h2>
      </div>
      <div style="background-color: #ffffff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px;">
        <h3 style="margin-top: 0; color: #16a34a;">Password Successfully Updated</h3>
        <p style="font-size: 14px; line-height: 1.6;">Hello <strong>${displayName}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6;">This email confirms that your password for CA Exam Checker AI was updated successfully.</p>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5;">If you initiated this change, no further action is required.</p>
        <div style="margin-top: 20px; padding: 12px; background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px; font-size: 12px; color: #991b1b;">
          <strong>Did not change your password?</strong> If you did not authorize this change, your account may be compromised. Please contact support immediately.
        </div>
      </div>
    </div>
  `;

  const result = await sendEmail({ to: email, subject, text, html });
  return result.success;
}

export interface RecheckCompletedEmailParams {
  recipient: string;
  studentName?: string;
  subjectName: string;
  paper?: string;
  originalMarks: number;
  recheckedMarks: number;
  difference: number;
  outcome: string; // e.g. 'Marks Increased', 'Marks Retained', 'Marks Decreased'
  changedQuestions: string;
  explanation: string;
  evaluationId: string;
  recheckRequestId?: string;
  studentId?: string;
  adminId?: string;
  checkedCopyPdfBuffer?: Buffer;
  detailedReportPdfBuffer?: Buffer;
}

export async function sendRecheckCompletedEmail(
  params: RecheckCompletedEmailParams
): Promise<{ success: boolean; status: 'SENT' | 'FAILED' | 'SANDBOX_RECORDED'; message?: string }> {
  const port = process.env.PORT || '3000';
  const appUrl = process.env.APP_URL || `http://localhost:${port}`;
  const evalUrl = `${appUrl}/evaluations/${params.evaluationId}`;
  const displayName = params.studentName || 'Student';

  const subject = 'Your CA Exam Checker AI Recheck is Complete';
  const diffSign = params.difference > 0 ? `+${params.difference}` : `${params.difference}`;
  
  const text = `Hello ${displayName},\n\n` +
    `Your recheck review for ${params.subjectName} (${params.paper || 'Paper'}) has been completed.\n\n` +
    `Outcome: ${params.outcome}\n` +
    `Original Score: ${params.originalMarks} marks\n` +
    `Rechecked Score: ${params.recheckedMarks} marks\n` +
    `Difference: ${diffSign} marks\n` +
    `Disputed / Changed Components: ${params.changedQuestions}\n\n` +
    `Examiner Review Resolution:\n${params.explanation}\n\n` +
    `Your dashboard has been updated to reflect the latest official rechecked version.\n` +
    `View evaluation report: ${evalUrl}\n\n` +
    `Best regards,\nCA Exam Checker AI Academic Review Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
      <div style="background-color: #1e3a8a; padding: 20px; text-align: center; border-radius: 6px 6px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">CA Exam Checker AI</h2>
        <p style="color: #93c5fd; margin: 4px 0 0 0; font-size: 13px;">Evaluation Recheck Audit Report</p>
      </div>
      <div style="background-color: #ffffff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
          <div>
            <h3 style="margin: 0; color: #0f172a; font-size: 18px;">Recheck Completed</h3>
            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">${params.subjectName} &bull; ${params.paper || 'Standard Paper'}</p>
          </div>
          <span style="background-color: #ecfdf5; color: #047857; font-weight: bold; font-size: 12px; padding: 6px 12px; border-radius: 9999px; border: 1px solid #a7f3d0;">
            ${params.outcome}
          </span>
        </div>

        <p style="font-size: 14px; line-height: 1.6;">Hello <strong>${displayName}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6;">
          Your request for rechecking has been thoroughly reviewed against your original submitted answer sheet, authoritative Suggested Answers, and the standard marking scheme.
        </p>

        <!-- Score Comparison Table -->
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f8fafc; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background-color: #f1f5f9; text-align: left; font-size: 12px; color: #475569;">
              <th style="padding: 10px 14px;">Metric</th>
              <th style="padding: 10px 14px;">Original (v1)</th>
              <th style="padding: 10px 14px;">Rechecked (v2)</th>
              <th style="padding: 10px 14px;">Delta</th>
            </tr>
          </thead>
          <tbody style="font-size: 14px;">
            <tr>
              <td style="padding: 12px 14px; font-weight: bold; color: #334155;">Total Marks</td>
              <td style="padding: 12px 14px; color: #64748b;">${params.originalMarks}</td>
              <td style="padding: 12px 14px; font-weight: bold; color: #1e3a8a;">${params.recheckedMarks}</td>
              <td style="padding: 12px 14px; font-weight: bold; color: ${params.difference > 0 ? '#16a34a' : params.difference < 0 ? '#dc2626' : '#64748b'};">
                ${diffSign}
              </td>
            </tr>
            <tr style="border-top: 1px solid #e2e8f0; font-size: 12px;">
              <td style="padding: 10px 14px; color: #64748b;">Reviewed Scope</td>
              <td colspan="3" style="padding: 10px 14px; font-weight: 500; color: #334155;">${params.changedQuestions}</td>
            </tr>
          </tbody>
        </table>

        <!-- Examiner Notes Box -->
        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; margin: 20px 0;">
          <h4 style="margin: 0 0 6px 0; color: #1e40af; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Examiner Resolution & Findings</h4>
          <p style="margin: 0; font-size: 13px; color: #1e293b; line-height: 1.6;">
            ${params.explanation}
          </p>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${evalUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Official Revised Evaluation
          </a>
        </div>

        <div style="margin-top: 24px; padding: 12px; background-color: #f8fafc; border-radius: 6px; font-size: 12px; color: #64748b; line-height: 1.5;">
          <strong>Official Record Notice:</strong> Your student dashboard and downloadable evaluation copies now reflect this revised Version 2.0 result. The immutable audit trail of the original evaluation remains securely preserved.
        </div>

        <p style="font-size: 12px; color: #94a3b8; margin-top: 28px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          Best regards,<br/>The CA Exam Checker AI Academic Review Team
        </p>
      </div>
    </div>
  `;

  const attachments: EmailAttachment[] = [];
  if (params.checkedCopyPdfBuffer) {
    attachments.push({
      filename: `Revised_Checked_Copy_${params.evaluationId}_v2.pdf`,
      content: params.checkedCopyPdfBuffer,
      contentType: 'application/pdf',
    });
  }
  if (params.detailedReportPdfBuffer) {
    attachments.push({
      filename: `Detailed_Evaluation_Report_${params.evaluationId}_v2.pdf`,
      content: params.detailedReportPdfBuffer,
      contentType: 'application/pdf',
    });
  }

  const res = await sendEmail({
    to: params.recipient,
    subject,
    text,
    html,
    attachments: attachments.length ? attachments : undefined,
  });

  // Record audit log
  recordEmailAudit({
    adminId: params.adminId || null,
    studentId: params.studentId || null,
    recipient: params.recipient,
    emailType: 'RECHECK_COMPLETED',
    evaluationId: params.evaluationId,
    recheckRequestId: params.recheckRequestId || null,
    fileVersionIds: `v2${attachments.length ? `:${attachments.map(a => a.filename).join(',')}` : ''}`,
    deliveryStatus: res.status,
    providerResponse: res.message || null,
  });

  return res;
}

export interface SendCheckedCopyEmailParams {
  recipient: string;
  studentName?: string;
  subjectName: string;
  paper?: string;
  evaluationId: string;
  version: 'v1' | 'v2' | string;
  copyType: 'CHECKED_COPY' | 'DETAILED_REPORT' | 'BOTH';
  adminId: string;
  studentId?: string;
  checkedCopyPdfBuffer?: Buffer;
  detailedReportPdfBuffer?: Buffer;
}

export async function sendCheckedCopyEmail(
  params: SendCheckedCopyEmailParams
): Promise<{ success: boolean; status: 'SENT' | 'FAILED' | 'SANDBOX_RECORDED'; message?: string; auditId?: string }> {
  const port = process.env.PORT || '3000';
  const appUrl = process.env.APP_URL || `http://localhost:${port}`;
  const evalUrl = `${appUrl}/evaluations/${params.evaluationId}`;
  const displayName = params.studentName || 'Student';

  const typeDesc = params.copyType === 'BOTH'
    ? 'Checked Copy & Detailed Evaluation Report'
    : params.copyType === 'CHECKED_COPY'
    ? 'Checked Copy (Annotated Answer Sheet)'
    : 'Detailed Evaluation Report';

  const subject = `Your CA Exam Checker AI ${typeDesc} - ${params.subjectName}`;

  const text = `Hello ${displayName},\n\n` +
    `Please find attached your requested official ${typeDesc} for ${params.subjectName} (${params.paper || 'Paper'}).\n\n` +
    `Version: ${params.version.toUpperCase()}\n` +
    `Online Evaluation Link: ${evalUrl}\n\n` +
    `Best regards,\nCA Exam Checker AI Academic Review Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
      <div style="background-color: #1e3a8a; padding: 20px; text-align: center; border-radius: 6px 6px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">CA Exam Checker AI</h2>
        <p style="color: #93c5fd; margin: 4px 0 0 0; font-size: 13px;">Official Evaluation Copy Delivery</p>
      </div>
      <div style="background-color: #ffffff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px;">
        <h3 style="margin-top: 0; color: #0f172a;">${typeDesc}</h3>
        <p style="font-size: 14px; line-height: 1.6;">Hello <strong>${displayName}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6;">
          As requested by administration, your official evaluation document(s) for <strong>${params.subjectName}</strong> (${params.paper || 'Paper'}) are attached to this email.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 6px; margin: 20px 0; font-size: 13px;">
          <div><strong>Document Type:</strong> ${typeDesc}</div>
          <div style="margin-top: 4px;"><strong>Evaluation Version:</strong> ${params.version.toUpperCase()}</div>
          <div style="margin-top: 4px;"><strong>Evaluation ID:</strong> <span style="font-family: monospace;">${params.evaluationId}</span></div>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${evalUrl}" style="background-color: #2563eb; color: #ffffff; padding: 11px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">
            View in Student Portal
          </a>
        </div>

        <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 14px;">
          Best regards,<br/>The CA Exam Checker AI Team
        </p>
      </div>
    </div>
  `;

  const attachments: EmailAttachment[] = [];
  if (params.checkedCopyPdfBuffer && (params.copyType === 'CHECKED_COPY' || params.copyType === 'BOTH')) {
    attachments.push({
      filename: `Checked_Copy_${params.evaluationId}_${params.version}.pdf`,
      content: params.checkedCopyPdfBuffer,
      contentType: 'application/pdf',
    });
  }
  if (params.detailedReportPdfBuffer && (params.copyType === 'DETAILED_REPORT' || params.copyType === 'BOTH')) {
    attachments.push({
      filename: `Detailed_Report_${params.evaluationId}_${params.version}.pdf`,
      content: params.detailedReportPdfBuffer,
      contentType: 'application/pdf',
    });
  }

  const res = await sendEmail({
    to: params.recipient,
    subject,
    text,
    html,
    attachments: attachments.length ? attachments : undefined,
  });

  // Record audit log
  recordEmailAudit({
    adminId: params.adminId,
    studentId: params.studentId || null,
    recipient: params.recipient,
    emailType: 'MANUAL_CHECKED_COPY',
    evaluationId: params.evaluationId,
    fileVersionIds: `${params.version}:${params.copyType}`,
    deliveryStatus: res.status,
    providerResponse: res.message || null,
  });

  return res;
}
