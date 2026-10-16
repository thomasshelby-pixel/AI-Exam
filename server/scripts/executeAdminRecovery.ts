import { DatabaseSync } from 'node:sqlite';
import { getFirestoreDoc, setFirestoreDoc } from '../services/firestoreDbService.js';

async function recoverSuperAdminAccount() {
  console.log('--- STARTING AUTHORITATIVE SUPER ADMIN IDENTITY RECOVERY ---');

  const TARGET_UID = 'usr_super_admin_001';
  const VERIFIED_EMAIL = 'admin@caexamchecker.ai';
  const VERIFIED_ORIGINAL_HASH = 'ed84eb956c11cd1fbc867d2c843ba366:e9221b7cfd6dc76d82f8abc0104cb46c69b789acfc7ee73a352b4ee5d10d57719de0c13bbe1378941e5c9b8b4734cfe449576b0601e58b49e1e799fa1e59f854';

  const db = new DatabaseSync('data/ca_exam_checker.db');

  // Step 1: Remove any colliding row using the verified email that is not usr_super_admin_001
  const colliding = db.prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?').all(VERIFIED_EMAIL, TARGET_UID) as Array<{ id: string }>;
  for (const c of colliding) {
    console.log(`[Recovery] Removing colliding user row ${c.id}`);
    db.prepare('DELETE FROM users WHERE id = ?').run(c.id);
  }

  // Step 2: Restore usr_super_admin_001 in SQLite
  db.prepare(`
    UPDATE users
    SET email = ?,
        password_hash = ?,
        role = 'SUPER_ADMIN',
        status = 'ACTIVE',
        full_name = 'Super Administrator',
        phone = COALESCE(phone, '+919876543210'),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(VERIFIED_EMAIL, VERIFIED_ORIGINAL_HASH, TARGET_UID);

  const localRow = db.prepare('SELECT id, email, role, status FROM users WHERE id = ?').get(TARGET_UID) as any;
  console.log('[Recovery] Restored SQLite row:', localRow);

  // Step 3: Record audit log of the restoration
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, 'RESTORE_SUPER_ADMIN_IDENTITY', 'USER', ?, ?)
  `).run(
    `log_recovery_${Date.now()}`,
    TARGET_UID,
    TARGET_UID,
    `Restored authoritative registered email ${VERIFIED_EMAIL} and credentials for Super Admin ${TARGET_UID}`
  );

  // Step 4: Synchronize to Cloud Firestore
  try {
    const existingFs = await getFirestoreDoc<any>('users', TARGET_UID);
    const updatedFsDoc: Record<string, any> = {
      ...(existingFs || {}),
      id: TARGET_UID,
      email: VERIFIED_EMAIL,
      password_hash: VERIFIED_ORIGINAL_HASH,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      full_name: 'Super Administrator',
      updated_at: new Date().toISOString(),
    };
    await setFirestoreDoc('users', TARGET_UID, updatedFsDoc);
    console.log('[Recovery] Synchronized restored Super Admin to Cloud Firestore successfully.');
  } catch (fsErr) {
    console.warn('[Recovery] Cloud Firestore sync note:', fsErr);
  }

  console.log('--- SUPER ADMIN ACCOUNT RECOVERY COMPLETED SUCCESSFULLY ---');
}

recoverSuperAdminAccount().catch((err) => {
  console.error('[Recovery Fatal Error]:', err);
  process.exit(1);
});
