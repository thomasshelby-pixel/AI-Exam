import crypto from 'node:crypto';
import { db } from '../db.js';
import { sendEmail } from './emailService.js';

export interface PendingStudentRegistration {
  email: string;
  fullName: string;
  passwordHash: string;
  phone?: string | null;
  icaiRegistrationNumber: string;
  caLevel: string;
  referralCode?: string | null;
  createdAt: string;
  expiresAt: string;
  resendAvailableAt: string;
  attemptsCount: number;
  maxAttempts: number;
}

export interface OtpChallengeResult {
  success: boolean;
  message: string;
  emailMasked?: string;
  cooldownSeconds?: number;
  expiresInSeconds?: number;
  alreadyRegistered?: boolean;
}

export interface OtpVerificationResult {
  success: boolean;
  message: string;
  code?: 'INVALID_OTP' | 'EXPIRED_OTP' | 'MAX_ATTEMPTS_EXCEEDED' | 'NOT_FOUND' | 'ALREADY_VERIFIED';
  attemptsRemaining?: number;
  registrationData?: PendingStudentRegistration;
}

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;  // 60 seconds
const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Masks an email for user-facing safety (e.g., v***y@gmail.com)
 */
export function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2) return normalized;
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP string (e.g. "482910").
 */
export function generateCryptographicOtp(): string {
  // randomInt generates an integer in range [0, 1000000)
  const codeNum = crypto.randomInt(0, 1000000);
  return String(codeNum).padStart(6, '0');
}

/**
 * Computes a secure SHA-256 HMAC or salted hash of the OTP for storage.
 */
export function hashOtp(otp: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${otp.trim()}`).digest('hex');
}

/**
 * Ensures the student_registration_otps table exists.
 */
export function initRegistrationOtpTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_registration_otps (
      email TEXT PRIMARY KEY,
      otp_hash TEXT NOT NULL,
      otp_salt TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      attempts_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      resend_available_at TEXT NOT NULL,
      last_ip TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reg_otp_expires ON student_registration_otps(expires_at);
  `);
}

/**
 * Sends a branded, professional CA Exam Checker AI OTP email using existing Resend/SMTP config.
 */
export async function sendRegistrationOtpEmail(
  email: string,
  fullName: string,
  otpCode: string
): Promise<{ success: boolean; status: string; message?: string }> {
  const displayName = fullName.trim() || 'Student';
  const subject = `${otpCode} is your CA Exam Checker AI verification code`;

  const text = `Hello ${displayName},\n\n` +
    `Your verification code for CA Exam Checker AI is: ${otpCode}\n\n` +
    `This verification code is valid for 10 minutes. It can only be used once to verify access to this email address.\n\n` +
    `If you did not request this verification code, please ignore this email. No account will be created without this code.\n\n` +
    `Best regards,\nCA Exam Checker AI Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 24px; text-align: center; border-radius: 6px 6px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">CA Exam Checker AI</h1>
        <p style="color: #bfdbfe; margin: 6px 0 0 0; font-size: 13px;">Email Ownership Verification</p>
      </div>
      <div style="background-color: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px;">
        <p style="font-size: 15px; line-height: 1.6; margin-top: 0; color: #0f172a;">
          Hello <strong>${displayName}</strong>,
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #334155;">
          Thank you for registering with <strong>CA Exam Checker AI</strong>. Please enter the verification code below to verify your email address and activate your student account:
        </p>
        
        <div style="text-align: center; margin: 28px 0; padding: 20px 16px; background-color: #f1f5f9; border-radius: 8px; border: 1px dashed #cbd5e1;">
          <div style="font-size: 11px; text-transform: uppercase; tracking-wider; font-weight: 600; color: #64748b; margin-bottom: 8px;">
            Six-Digit Verification Code
          </div>
          <div style="font-size: 34px; font-weight: 800; letter-spacing: 6px; color: #1e3a8a; font-family: monospace;">
            ${otpCode}
          </div>
          <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
            Valid for <strong>10 minutes</strong> &bull; Single-use only
          </div>
        </div>
        
        <div style="padding: 14px 16px; background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; font-size: 13px; color: #1e40af; line-height: 1.5; margin-bottom: 24px;">
          <strong>Security Notice:</strong> This code verifies that you can access this email inbox. If you did not initiate this registration, you can safely ignore this email. No account will be created without entering this code.
        </div>
        
        <p style="font-size: 12px; color: #94a3b8; margin: 28px 0 0 0; border-top: 1px solid #f1f5f9; padding-top: 16px; line-height: 1.5;">
          CA Exam Checker AI &bull; India's Premier ICAI Paper Evaluator<br />
          Need assistance? Contact our team at <a href="mailto:support@caexamcheckerai.com" style="color: #2563eb; text-decoration: none;">support@caexamcheckerai.com</a>
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject,
    text,
    html,
  });
}

/**
 * Initiates or resends an OTP challenge for student registration.
 * Validates cooldown, rate limits, hashes the OTP, and sends the email.
 */
export async function initiateStudentRegistrationOtp(params: {
  email: string;
  fullName: string;
  passwordHash: string;
  phone?: string | null;
  icaiRegistrationNumber: string;
  caLevel: string;
  referralCode?: string | null;
  clientIp?: string;
}): Promise<OtpChallengeResult> {
  initRegistrationOtpTable();

  const normalizedEmail = params.email.trim().toLowerCase();

  // 1. Verify user does not already exist
  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (existing) {
    return {
      success: false,
      message: 'An account with this email address already exists. Please sign in.',
      alreadyRegistered: true,
    };
  }

  const now = Date.now();

  // 2. Check if a recent pending challenge exists to enforce cooldown
  const existingChallenge = db.prepare(`
    SELECT * FROM student_registration_otps WHERE email = ?
  `).get(normalizedEmail) as any;

  if (existingChallenge) {
    const resendAvailableAt = new Date(existingChallenge.resend_available_at).getTime();
    if (now < resendAvailableAt) {
      const waitSeconds = Math.ceil((resendAvailableAt - now) / 1000);
      return {
        success: false,
        message: `Please wait ${waitSeconds} seconds before requesting a new verification code.`,
        cooldownSeconds: waitSeconds,
        emailMasked: maskEmail(normalizedEmail),
      };
    }
  }

  // 3. Generate fresh cryptographically secure OTP
  const rawOtp = generateCryptographicOtp();
  const salt = crypto.randomBytes(16).toString('hex');
  const otpHash = hashOtp(rawOtp, salt);

  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + OTP_EXPIRY_MS).toISOString();
  const resendAvailableAt = new Date(now + RESEND_COOLDOWN_MS).toISOString();

  const payload: PendingStudentRegistration = {
    email: normalizedEmail,
    fullName: params.fullName.trim(),
    passwordHash: params.passwordHash,
    phone: params.phone?.trim() || null,
    icaiRegistrationNumber: params.icaiRegistrationNumber.trim(),
    caLevel: params.caLevel || 'INTERMEDIATE',
    referralCode: params.referralCode?.trim() || null,
    createdAt,
    expiresAt,
    resendAvailableAt,
    attemptsCount: 0,
    maxAttempts: MAX_VERIFICATION_ATTEMPTS,
  };

  // 4. Send the email first. If delivery fails completely, DO NOT save pending registration
  const emailResult = await sendRegistrationOtpEmail(normalizedEmail, params.fullName, rawOtp);
  if (!emailResult.success) {
    return {
      success: false,
      message: emailResult.message || 'Failed to dispatch verification email. Please check your email address and try again.',
      emailMasked: maskEmail(normalizedEmail),
    };
  }

  // 5. Save pending challenge in database
  db.prepare(`
    INSERT INTO student_registration_otps (
      email, otp_hash, otp_salt, payload_json, attempts_count, max_attempts,
      created_at, expires_at, resend_available_at, last_ip
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      otp_hash = excluded.otp_hash,
      otp_salt = excluded.otp_salt,
      payload_json = excluded.payload_json,
      attempts_count = 0,
      max_attempts = excluded.max_attempts,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at,
      resend_available_at = excluded.resend_available_at,
      last_ip = excluded.last_ip
  `).run(
    normalizedEmail,
    otpHash,
    salt,
    JSON.stringify(payload),
    MAX_VERIFICATION_ATTEMPTS,
    createdAt,
    expiresAt,
    resendAvailableAt,
    params.clientIp || null
  );

  return {
    success: true,
    message: `A 6-digit verification code has been dispatched to ${maskEmail(normalizedEmail)}. Code expires in 10 minutes.`,
    emailMasked: maskEmail(normalizedEmail),
    cooldownSeconds: 60,
    expiresInSeconds: 600,
  };
}

/**
 * Atomically verifies and consumes the registration OTP.
 * Enforces:
 * - 10-minute expiry
 * - Single-use consumption (row is deleted immediately upon success)
 * - Maximum 5 attempts per challenge
 * - Atomic transaction locking to eliminate race conditions
 */
export function verifyAndConsumeRegistrationOtp(
  email: string,
  userEnteredOtp: string
): OtpVerificationResult {
  initRegistrationOtpTable();

  const normalizedEmail = email.trim().toLowerCase();
  const cleanOtp = String(userEnteredOtp || '').trim();

  if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return {
      success: false,
      message: 'Please enter a valid 6-digit verification code.',
      code: 'INVALID_OTP',
    };
  }

  // Begin atomic write transaction
  db.exec('BEGIN IMMEDIATE');

  try {
    const row = db.prepare(`
      SELECT * FROM student_registration_otps WHERE email = ?
    `).get(normalizedEmail) as any;

    if (!row) {
      db.exec('ROLLBACK');
      return {
        success: false,
        message: 'No pending registration found for this email, or the code was already verified. Please register again.',
        code: 'NOT_FOUND',
      };
    }

    const now = Date.now();
    const expiresAt = new Date(row.expires_at).getTime();

    // Check expiry
    if (now > expiresAt) {
      db.prepare('DELETE FROM student_registration_otps WHERE email = ?').run(normalizedEmail);
      db.exec('COMMIT');
      return {
        success: false,
        message: 'This verification code has expired (valid for 10 minutes). Please request a new code.',
        code: 'EXPIRED_OTP',
      };
    }

    // Check attempt limit
    if (row.attempts_count >= row.max_attempts) {
      db.prepare('DELETE FROM student_registration_otps WHERE email = ?').run(normalizedEmail);
      db.exec('COMMIT');
      return {
        success: false,
        message: 'Too many incorrect attempts. This verification challenge has been invalidated for security. Please request a new code.',
        code: 'MAX_ATTEMPTS_EXCEEDED',
      };
    }

    // Verify hash
    const computedHash = hashOtp(cleanOtp, row.otp_salt);
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(row.otp_hash, 'hex')
    );

    if (!isMatch) {
      const newAttempts = row.attempts_count + 1;
      const remaining = Math.max(0, row.max_attempts - newAttempts);

      if (remaining <= 0) {
        db.prepare('DELETE FROM student_registration_otps WHERE email = ?').run(normalizedEmail);
        db.exec('COMMIT');
        return {
          success: false,
          message: 'Incorrect verification code. Maximum attempts exceeded; this code has been invalidated. Please request a new code.',
          code: 'MAX_ATTEMPTS_EXCEEDED',
          attemptsRemaining: 0,
        };
      } else {
        db.prepare('UPDATE student_registration_otps SET attempts_count = ? WHERE email = ?').run(
          newAttempts,
          normalizedEmail
        );
        db.exec('COMMIT');
        return {
          success: false,
          message: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
          code: 'INVALID_OTP',
          attemptsRemaining: remaining,
        };
      }
    }

    // Success! Consume OTP immediately so it cannot be reused
    db.prepare('DELETE FROM student_registration_otps WHERE email = ?').run(normalizedEmail);
    db.exec('COMMIT');

    const registrationData: PendingStudentRegistration = JSON.parse(row.payload_json);

    return {
      success: true,
      message: 'Email successfully verified.',
      registrationData,
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    console.error('[RegistrationOtp] Error verifying OTP:', err);
    return {
      success: false,
      message: 'An error occurred during verification. Please try again.',
      code: 'INVALID_OTP',
    };
  }
}
