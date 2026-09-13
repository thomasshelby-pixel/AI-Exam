import nodemailer, { type Transporter } from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
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

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const mailer = getTransporter();
  const from = process.env.SMTP_FROM || 'support@caexamchecker.ai';

  if (mailer) {
    try {
      await mailer.sendMail({
        from: `"CA Exam Checker AI" <${from}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      console.log(`[EmailService] Email successfully sent to ${options.to} via SMTP.`);
      return true;
    } catch (err) {
      console.error(`[EmailService] Failed to send email to ${options.to} via SMTP:`, err);
    }
  }

  // Fallback / Development mode logging:
  console.log(`\n======================================================`);
  console.log(`[EmailService - DEV/CONSOLE NOTICE] Email dispatch to: ${options.to}`);
  console.log(`Subject: ${options.subject}`);
  console.log(`Content:\n${options.text}`);
  console.log(`======================================================\n`);
  return true;
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  userName?: string
): Promise<boolean> {
  const appUrl = process.env.APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
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

  return sendEmail({ to: email, subject, text, html });
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

  return sendEmail({ to: email, subject, text, html });
}
