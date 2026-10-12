import crypto from 'node:crypto';

/**
 * MFA Secret Encryption Service
 * Encrypts stored TOTP secrets at rest using AES-256-GCM.
 * Backward compatible: Automatically decrypts legacy plaintext Base32 secrets.
 */

// Derive a 256-bit primary key from server environment secrets
function getEncryptionKey(): Buffer {
  const masterSecret =
    process.env.SESSION_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'ca-exam-checker-production-mfa-security-key-2026';
  
  return crypto.createHash('sha256').update(`mfa-secret-encryption:${masterSecret}`).digest();
}

/**
 * Returns candidate encryption keys to gracefully decrypt secrets across environment transitions,
 * restarts, or secret rotations.
 */
function getCandidateDecryptionKeys(): Buffer[] {
  const candidateMasters = [
    process.env.SESSION_SECRET,
    process.env.ENCRYPTION_KEY,
    process.env.JWT_SECRET,
    'ca-exam-checker-production-mfa-security-key-2026',
    'ca-exam-checker-super-secure-jwt-secret-2026-production',
    'ca-exam-jwt-secret-production-key-change-in-env',
  ].filter((s): s is string => typeof s === 'string' && s.length > 0);

  const seenKeys = new Set<string>();
  const keys: Buffer[] = [];

  const addKey = (buf: Buffer) => {
    const hex = buf.toString('hex');
    if (!seenKeys.has(hex)) {
      seenKeys.add(hex);
      keys.push(buf);
    }
  };

  // Add primary key first
  addKey(getEncryptionKey());

  for (const master of candidateMasters) {
    addKey(crypto.createHash('sha256').update(`mfa-secret-encryption:${master}`).digest());
    addKey(crypto.createHash('sha256').update(master).digest());
  }

  return keys;
}

/**
 * Encrypts a plaintext TOTP secret with AES-256-GCM
 * Returns formatted ciphertext: enc:gcm:<iv_hex>:<tag_hex>:<data_hex>
 */
export function encryptMfaSecret(plainSecret: string | null | undefined): string | null {
  if (!plainSecret) return null;
  const trimmed = plainSecret.trim();
  if (!trimmed) return null;

  // Already encrypted?
  if (trimmed.startsWith('enc:gcm:')) {
    return trimmed;
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(trimmed, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');

    return `enc:gcm:${ivHex}:${authTag}:${encrypted}`;
  } catch (err) {
    console.warn('[MfaCrypto] Failed to encrypt MFA secret:', err);
    // Fail safe: return null if encryption error occurs so unencrypted secret is never stored
    return null;
  }
}

/**
 * Decrypts a stored TOTP secret.
 * If the secret is stored in legacy plaintext format, returns it directly.
 * Attempts primary key and all candidate keys before failing gracefully.
 */
export function decryptMfaSecret(storedSecret: string | null | undefined): string {
  if (!storedSecret) return '';
  const trimmed = storedSecret.trim();
  if (!trimmed) return '';

  if (!trimmed.startsWith('enc:gcm:')) {
    // Legacy plaintext Base32 secret
    return trimmed;
  }

  const parts = trimmed.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'gcm') {
    return '';
  }

  const ivHex = parts[2];
  const authTagHex = parts[3];
  const encryptedHex = parts[4];

  let iv: Buffer;
  let authTag: Buffer;
  try {
    iv = Buffer.from(ivHex, 'hex');
    authTag = Buffer.from(authTagHex, 'hex');
  } catch {
    return '';
  }

  const candidateKeys = getCandidateDecryptionKeys();

  for (const key of candidateKeys) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      if (decrypted && decrypted.length >= 16) {
        return decrypted;
      }
    } catch {
      // Key mismatch or auth tag verification failure; try next candidate key
      continue;
    }
  }

  // Graceful fallback: log warning without triggering unhandled error cascade
  console.warn('[MfaCrypto] MFA secret ciphertext could not be authenticated with available keys; returning empty secret.');
  return '';
}

/**
 * Validates whether a secret (encrypted or plaintext) represents a valid Base32 TOTP secret.
 */
export function isValidMfaSecret(storedSecret: string | null | undefined): boolean {
  if (!storedSecret) return false;
  const decrypted = decryptMfaSecret(storedSecret);
  return decrypted.length >= 16;
}
