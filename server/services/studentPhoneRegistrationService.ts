import { db } from '../db.js';
import type { PendingStudentRegistration } from './studentRegistrationOtpService.js';
import { normalizePhoneToE164 } from './smsService.js';

const PHONE_REGISTRATION_EXPIRY_MS = 15 * 60 * 1000;
const PHONE_REGISTRATION_RESEND_COOLDOWN_MS = 60 * 1000;

export interface PendingPhoneRegistrationResult {
  success: boolean;
  message: string;
  phoneMasked?: string;
  cooldownSeconds?: number;
  expiresInSeconds?: number;
  registrationData?: PendingStudentRegistration;
}

export function initPhoneRegistrationTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_phone_registration_pending (
      email TEXT PRIMARY KEY,
      phone_e164 TEXT NOT NULL UNIQUE,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      resend_available_at TEXT NOT NULL,
      last_ip TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_student_phone_registration_pending_expires
      ON student_phone_registration_pending(expires_at);
  `);
}

/** Compare normalized phone values rather than raw input to catch +91/91/local duplicates. */
export function isStudentPhoneRegistered(phoneInput: string): boolean {
  const candidate = normalizePhoneToE164(phoneInput).canonicalPhoneE164;
  if (!candidate) return false;

  // Only a previously verified phone can establish ownership. Legacy/student profile
  // phone fields may have been entered without OTP proof and must not reserve a number.
  const rows = db.prepare(`
    SELECT phone FROM users
    WHERE role = 'STUDENT'
      AND phone_verified = 1
      AND phone IS NOT NULL
      AND TRIM(phone) <> ''
  `).all() as Array<{ phone: string }>;

  return rows.some((row) => normalizePhoneToE164(row.phone).canonicalPhoneE164 === candidate);
}

export function savePendingPhoneRegistration(params: {
  email: string;
  fullName: string;
  passwordHash: string;
  phone: string;
  icaiRegistrationNumber: string;
  caLevel: string;
  referralCode?: string | null;
  clientIp?: string;
}): PendingPhoneRegistrationResult {
  initPhoneRegistrationTable();

  const email = params.email.trim().toLowerCase();
  const normalizedPhone = normalizePhoneToE164(params.phone);
  if (!normalizedPhone.canonicalPhoneE164) {
    return { success: false, message: normalizedPhone.error || 'Enter a valid mobile number.' };
  }
  const phone = normalizedPhone.canonicalPhoneE164;
  // The current signup UI and SMS contract support India only. Do not store an
  // international number that the widget flow cannot verify.
  if (!/^\+91\d{10}$/.test(phone)) {
    return { success: false, message: 'Mobile OTP registration currently supports Indian mobile numbers only (+91 followed by 10 digits).' };
  }

  const existingEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
  if (existingEmail) {
    return { success: false, message: 'An account with this email address already exists. Please sign in.' };
  }
  if (isStudentPhoneRegistered(phone)) {
    return { success: false, message: 'This mobile number is already linked to a student account.' };
  }

  // Expire old pending challenges before checking whether this number is reserved.
  db.prepare('DELETE FROM student_phone_registration_pending WHERE expires_at <= ?').run(new Date().toISOString());

  const existingChallenge = db.prepare(
    'SELECT phone_e164, resend_available_at FROM student_phone_registration_pending WHERE email = ?'
  ).get(email) as { phone_e164: string; resend_available_at: string } | undefined;

  if (existingChallenge) {
    const resendAt = new Date(existingChallenge.resend_available_at).getTime();
    if (Date.now() < resendAt) {
      return {
        success: false,
        message: 'Please wait before restarting mobile verification.',
        cooldownSeconds: Math.max(1, Math.ceil((resendAt - Date.now()) / 1000)),
      };
    }
  }

  const phoneOwner = db.prepare(
    'SELECT email FROM student_phone_registration_pending WHERE phone_e164 = ? AND email != ?'
  ).get(phone, email) as { email: string } | undefined;
  if (phoneOwner) {
    return { success: false, message: 'This mobile number is already being used for another pending registration. Please try again later.' };
  }

  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + PHONE_REGISTRATION_EXPIRY_MS).toISOString();
  const resendAvailableAt = new Date(now + PHONE_REGISTRATION_RESEND_COOLDOWN_MS).toISOString();
  const payload: PendingStudentRegistration = {
    email,
    fullName: params.fullName.trim(),
    passwordHash: params.passwordHash,
    phone,
    icaiRegistrationNumber: params.icaiRegistrationNumber.trim(),
    caLevel: params.caLevel || 'INTERMEDIATE',
    referralCode: params.referralCode?.trim() || null,
    createdAt,
    expiresAt,
    resendAvailableAt,
    attemptsCount: 0,
    maxAttempts: 5,
  };

  try {
    db.prepare(`
      INSERT INTO student_phone_registration_pending (
        email, phone_e164, payload_json, created_at, expires_at, resend_available_at, last_ip
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        phone_e164 = excluded.phone_e164,
        payload_json = excluded.payload_json,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        resend_available_at = excluded.resend_available_at,
        last_ip = excluded.last_ip
    `).run(email, phone, JSON.stringify(payload), createdAt, expiresAt, resendAvailableAt, params.clientIp || null);
  } catch (error: unknown) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      return { success: false, message: 'This mobile number is already reserved for another pending registration.' };
    }
    throw error;
  }

  const digits = phone.replace(/\D/g, '');
  const maskedPhone = `+${digits.slice(0, 2)} ******${digits.slice(-2)}`;
  return {
    success: true,
    message: `Send the verification code to ${maskedPhone} to complete registration.`,
    phoneMasked: maskedPhone,
    cooldownSeconds: 60,
    expiresInSeconds: PHONE_REGISTRATION_EXPIRY_MS / 1000,
  };
}

/** Consume pending registration only if the provider-verified identifier matches the phone submitted. */
export function consumePendingPhoneRegistration(
  emailInput: string,
  verifiedPhoneInput: string
): PendingPhoneRegistrationResult {
  initPhoneRegistrationTable();
  const email = emailInput.trim().toLowerCase();
  const verifiedPhone = normalizePhoneToE164(verifiedPhoneInput).canonicalPhoneE164;
  if (!verifiedPhone) {
    return { success: false, message: 'The verified mobile number is invalid.' };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare(
      'SELECT phone_e164, payload_json, expires_at FROM student_phone_registration_pending WHERE email = ?'
    ).get(email) as { phone_e164: string; payload_json: string; expires_at: string } | undefined;

    if (!row) {
      db.exec('ROLLBACK');
      return { success: false, message: 'No pending registration was found. Please submit the registration form again.' };
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      db.prepare('DELETE FROM student_phone_registration_pending WHERE email = ?').run(email);
      db.exec('COMMIT');
      return { success: false, message: 'Your registration expired. Please submit the form again.' };
    }
    if (row.phone_e164 !== verifiedPhone) {
      db.exec('ROLLBACK');
      return { success: false, message: 'The verified mobile number does not match the number entered during registration.' };
    }

    db.prepare('DELETE FROM student_phone_registration_pending WHERE email = ?').run(email);
    db.exec('COMMIT');
    const registrationData = JSON.parse(row.payload_json) as PendingStudentRegistration;
    return { success: true, message: 'Mobile number verified.', registrationData };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('[PhoneRegistration] Failed to consume pending registration:', error instanceof Error ? error.message : 'unknown error');
    return { success: false, message: 'Could not finish mobile verification. Please try again.' };
  }
}

