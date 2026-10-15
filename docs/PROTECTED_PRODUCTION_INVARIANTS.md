# CA Exam Checker AI — Protected Production Invariants

**Document Version:** 1.0.0-PROD  
**Status:** Authoritative Production Engineering Policy  
**Scope:** Core Persistence, Security, Model Orchestration, Financial Settlement, and Integrity Engines  

---

## 1. Domain 1: Admin MFA Enrollment, Persistence, and Recovery

### 1.1 Authoritative Source of Truth
- **Authoritative Database:** Primary table `users` (`mfa_enabled`, `mfa_reset_required`, `totp_secret`, `mfa_enrolled_at`), `mfa_authenticators` (encrypted TOTP secret, factor metadata), `mfa_recovery_codes` (SHA-256 code hashes), and `mfa_trusted_devices` (SHA-256 device tokens, 30-day sliding window).
- **Secondary Authoritative Mirror:** Cloud Firestore `users/{userId}` and `admins/{userId}` hydrated with encryption-preserved secrets and MFA status flags.

### 1.2 Core Architectural Invariants
1. **Zero Silent Re-Enrollment:** An enrolled administrator who completed initial TOTP verification MUST NEVER be presented with a new enrollment QR code on subsequent logins, deployments, server restarts, or Firestore hydrations.
2. **Encrypted Secret Storage at Rest:** TOTP secrets MUST be encrypted using AES-256-GCM with unique cryptographic nonces (12-byte IV) and authentication tags (16-byte GCM tag). Ciphertexts must never be decrypted with ephemeral keys.
3. **Dedicated Single-User Recovery:** If a Super Admin requires recovery, the recovery procedure (`executeServerMfaReset`) MUST apply strictly to the target administrator's UID. Bulk MFA resets, hardcoded bypass tokens, or public disable endpoints are strictly forbidden.
4. **Authoritative Hydration Self-Healing:** During server reboot and Firestore hydration, valid MFA enrollments (`mfa_authenticators` and `users`) take precedence. Corrupt secrets gracefully transition ONLY the specific damaged account to `MFA_RESET_REQUIRED` without impacting other accounts.

### 1.3 Key Regression Tests
- `server/tests/adminMfaLifecycleSecurityAudit.test.ts`
- `server/tests/superAdminMfaResetVerification.test.ts`

### 1.4 Migration & Deployment Risks
- Rotating or changing `ENCRYPTION_KEY` / `MFA_SECRET_KEY` without running a dual-key ciphertext migration will invalidate stored authenticators and lock out administrators.
- Re-running initial database schemas without preserving `mfa_authenticators` and `mfa_recovery_codes` tables.

---

## 2. Domain 2: Student and Institute Deletion, Tombstones, and Resurrection Prevention

### 2.1 Authoritative Source of Truth
- **Authoritative Tables:** `deletion_tombstones` (SQLite) and `tombstones` collection (Cloud Firestore).
- **Enforcement Services:** `server/services/studentDeleteService.ts`, `server/services/instituteDeleteService.ts`, `server/services/firestoreSyncService.ts`.

### 2.2 Core Architectural Invariants
1. **Cryptographic Deletion Tombstones:** Once an account (student or institute) is deleted by an authorized administrator, a durable tombstone record (`collection_id`, `record_id`, `reason`, `tombstoned_at`) is written to both SQLite and Firestore BEFORE or AT the time of record deletion.
2. **Permanent Resurrection Block:** Baseline seeders, Firestore hydrators, periodic synchronization jobs, and container reboots MUST consult `isTombstoned(collection, id)` and NEVER resurrect a tombstoned entity.
3. **Step 15 Auto-Heal Immunity:** Dangling records (e.g., historical evaluations or legacy batch references) MUST NEVER trigger student or institute account recreation if the parent entity is tombstoned. The orphan record is safely decoupled or pruned.
4. **Financial Record Preservation:** Deleting an account purges student profiles, personal credentials, and active batches, but MUST preserve immutable financial transaction logs (`credit_transactions`, `orders`, `invoices`) with anonymized references for audit and tax compliance.

### 2.3 Key Regression Tests
- `server/tests/deletedUserResurrectionPrevention.test.ts`
- `server/tests/instituteDeletionFullLifecycleAudit.test.ts`
- `server/tests/deletedUserPersistenceAndTombstone.test.ts`

### 2.4 Migration & Deployment Risks
- Clearing the `deletion_tombstones` table or dropping Firestore `tombstones` collection will allow legacy cloud backups to resurrect previously deleted user accounts.

---

## 3. Domain 3: AI Model Registry and Primary Model Persistence

### 3.1 Authoritative Source of Truth
- **Authoritative Setting:** `pricing_settings` (key: `EVAL_MODEL_PROVIDER`) and `model_configs` table (`is_primary = 1`).
- **Cloud Replication:** Cloud Firestore `system_settings/ai_model_config` (`primary_model`).
- **Strict Runtime Whitelist:** Exactly 8 approved production models in `APPROVED_MODELS` (`server/models/modelRegistry.ts`):
  * **Google Gemini (3):** `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.1-flash-lite`
  * **OpenAI (3):** `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`
  * **Anthropic (2):** `claude-opus-5`, `claude-sonnet-5`

### 3.2 Core Architectural Invariants
1. **No Silent Reversion to Gemini Default:** The primary model selection chosen by the administrator MUST NOT revert to `gemini-3.8-flash` on server reboot, container cold-starts, deployment scripts, or seed routines.
2. **Strict Server-Side Model Validation:** Direct API calls attempting to set unapproved, retired, or arbitrary model IDs (e.g., `gpt-4o`, `gemini-1.5-pro`, `claude-3-5-sonnet`) MUST be rejected with HTTP 400.
3. **Atomic Multi-Layer Sync:** Setting a primary model updates `pricing_settings`, toggles `model_configs.is_primary`, removes the primary model from the fallback chain, and replicates to Firestore.

### 3.3 Key Regression Tests
- `server/tests/evaluationModelSelectorAndRegistry.test.ts`
- `server/tests/adminApiKeySecurityAndProviderStatus.test.ts`

### 3.4 Migration & Deployment Risks
- Seeding routines that execute unconditional `UPDATE model_configs SET is_primary = ...` will overwrite the administrator's selection.
- Modifying `pricing_settings` defaults without checking `SELECT key FROM pricing_settings WHERE key = 'EVAL_MODEL_PROVIDER'`.

---

## 4. Domain 4: Administrator-Controlled Fallback Ordering and Runtime Routing

### 4.1 Authoritative Source of Truth
- **Authoritative Setting:** `pricing_settings` (key: `EVAL_FALLBACK_ORDER` stored as JSON array) and `model_configs.fallback_order`.
- **Cloud Replication:** Cloud Firestore `system_settings/ai_model_config` (`fallback_chain`).
- **Routing Engine:** `determineModelRouting` and `executeModelWithFallback` (`server/models/modelRegistry.ts`).

### 4.2 Core Architectural Invariants
1. **Exact Sequential Execution:** When an evaluation is executed, the engine attempts the primary model first. If it encounters rate limits (429), server capacity errors (503), or network timeouts, it MUST advance through the fallback chain in the exact sequence configured by the administrator.
2. **Duplicate & Self-Reference Prevention:** The primary model CANNOT appear in its own fallback chain. Duplicate models in the chain are strictly rejected.
3. **Circuit Breaking Without Reordering:** A transiently unavailable or rate-limited fallback model is placed in temporary cooldown (15–45s) without corrupting or permanently altering the stored configuration order.
4. **Execution Safety Gate:** If all approved fallback candidates fail or are unconfigured, evaluation MUST fail safely with a clean diagnostic error; credits MUST NOT be deducted.

### 4.3 Key Regression Tests
- `server/tests/adminFallbackOrderAndRouting.test.ts`
- `server/tests/evaluationModelSelectorAndRegistry.test.ts`

### 4.4 Migration & Deployment Risks
- Resetting `fallback_order` in `seedModelConfigs()` on application startup.
- Desynchronization between `EVAL_FALLBACK_ORDER` and `model_configs.fallback_order`.

---

## 5. Domain 5: Student Credits and Monthly Free-Evaluation Entitlements

### 5.1 Authoritative Source of Truth
- **Authoritative Table:** `student_profiles` (`purchased_credits`, `free_evaluations_used`, `free_evaluations_reset_date`), `student_credit_purchases` (FIFO lot consumption ledger).
- **Enforcement Service:** `server/services/studentCreditService.ts` (`getValidStudentCreditBalance`, `consumeEvaluationEntitlementAtomic`).

### 5.2 Core Architectural Invariants
1. **Monthly Free Reset Window:** Free evaluations reset strictly on the 1st day of each calendar month at 00:00 UTC based on `free_evaluations_reset_date`.
2. **Atomic Pre-Deduction with Refund on Reject:** Credits are pre-deducted atomically before enqueuing heavy evaluation jobs. If pre-evaluation document validation rejects the document (e.g., subject mismatch or unreadable scan), credits MUST be refunded immediately.
3. **FIFO Lot Consumption:** Purchased credits consume from the earliest expiring purchased lot first.
4. **Local Consumption Firestore Preservation:** In cross-layer sync, local credit decrements take precedence over older Firestore balances to prevent replay or credit double-spending.

### 5.3 Key Regression Tests
- `server/tests/creditPersistenceAndConsumptionMaster.test.ts`
- `server/tests/monthlyFreeAndPaidCredits.test.ts`
- `server/tests/promoCreditsVisibilityAndConsumption.test.ts`

### 5.4 Migration & Deployment Risks
- Overwriting `free_evaluations_used` during user profile sync.
- Timezone shifts causing premature or delayed monthly credit resets.

---

## 6. Domain 6: Razorpay Checkout Verification, Webhook Security, and Idempotent Fulfillment

### 6.1 Authoritative Source of Truth
- **Authoritative Tables:** `orders` (`razorpay_order_id`, `status`), `payments` (`razorpay_payment_id`, `signature`, `status`), `credit_transactions` (ledger entry).
- **Enforcement Route:** `server/routes/paymentRoutes.ts` and `server/services/razorpayService.ts`.

### 6.2 Core Architectural Invariants
1. **HMAC-SHA256 Signature Verification:** Every client payment response and webhook payload MUST be cryptographically verified using `crypto.createHmac('sha256', RAZORPAY_KEY_SECRET)` before fulfilling credits or plans.
2. **Strict Idempotency:** Webhook retries and multiple fulfillment calls for the same `razorpay_payment_id` MUST be completely idempotent; duplicate credits or duplicate invoice entries are strictly forbidden.
3. **Atomic Transactional Credit Allocation:** Credit balance updates and transaction ledger insertions MUST occur within a single SQLite database transaction.

### 6.3 Key Regression Tests
- `server/tests/razorpayWebhookAndFulfillmentSecurity.test.ts`
- `server/tests/unifiedAuthAndInstitutePlanPurchase.test.ts`

### 6.4 Migration & Deployment Risks
- Running in development mode without mock payment validation guards.
- Missing `RAZORPAY_KEY_SECRET` causing silent failure or rejected legitimate checkouts.

---

## 7. Domain 7: CA Evaluation Scoring, Report Integrity, and Step Marking

### 7.1 Authoritative Source of Truth
- **Authoritative Table:** `evaluations` (`result_json`, `total_marks`, `maximum_marks`, `status`).
- **Enforcement Engines:** `server/services/evaluationIntegrityEngine.ts`, `server/services/questionChunkEvaluator.ts`, `server/services/multiModeMarkingEngine.ts`.

### 7.2 Core Architectural Invariants
1. **Immutable Maximum Marks Allocation:** Question maximum marks are determined exclusively by the official Question Paper and Marking Scheme structure. They cannot be altered by AI output.
2. **Mathematical Sum Integrity:** For every question, awarded marks MUST equal the exact sum of component marks. Total score MUST equal the sum of question marks.
3. **Zero-Mark Safety Gate:** If any creditworthy work exists (formula, legal principle, section citation, working note, intermediate calculation), 0 marks is strictly forbidden.
4. **Consequential Marking / Own-Figure Rule:** If an arithmetic slip occurs in an early step, marks are deducted for that step only. Downstream steps logically sound based on the carried-forward figure MUST receive full step marks.
5. **No Presentation Penalty:** Formatting, handwriting neatness, or paragraph vs. tabular layout must NOT be penalized unless explicitly mandated in the official marking scheme.

### 7.3 Key Regression Tests
- `server/tests/finalAuthoritativeRuntimeVerification.test.ts`
- `server/tests/evaluationIntegrity.test.ts`
- `server/tests/evaluationIntegrityHardening.test.ts`
- `server/tests/sourceGroundedTransformation.test.ts`

### 7.4 Migration & Deployment Risks
- Modifying prompts in a way that strips structured evidence or component-level breakdowns.
- Incompatible changes to `result_json` serialization.

---

## 8. Domain 8: Student, Institute Admin, and Super Admin Authentication & RBAC

### 8.1 Authoritative Source of Truth
- **Authoritative Tables:** `users` (`role`, `status`, `password_hash`), `institute_memberships`, `sessions`.
- **Enforcement Middleware:** `server/auth.ts` (`authenticateToken`, `requireRole`, `requireSuperAdmin`).

### 8.2 Core Architectural Invariants
1. **Strict Role Hierarchy:** Roles are strictly partitioned into `STUDENT`, `INSTITUTE_ADMIN`, and `SUPER_ADMIN`.
2. **Super Admin Isolation:** Only authenticated accounts with role `SUPER_ADMIN` and verified email can access `/api/admin/*` management routes.
3. **Mandatory MFA for Administrators:** Administrative routes require verified MFA status (`mfa_enabled = 1`, `mfa_reset_required = 0`) unless operating in a recognized enrollment state.
4. **Token Invalidation on Password/MFA Reset:** When an administrator password or MFA factor is reset, all active refresh tokens and trusted device sessions MUST be revoked immediately.

### 8.3 Key Regression Tests
- `server/tests/authAcceptance.test.ts`
- `server/tests/adminMfaLifecycleSecurityAudit.test.ts`
- `server/tests/googleAuthAndSrnValidation.test.ts`

### 8.4 Migration & Deployment Risks
- Inadvertently removing the Super Admin authorization middleware from new admin endpoints.
- JWT secret mismatch across restarts.

---

## Operational Deployment Protocol

1. **Pre-Deployment Check:** Run `npm run test:production-integrity` and `npm run build` before pushing any changes to release branches.
2. **Zero Auto-Deploy Policy:** Deployments to production environments must be explicitly approved and initiated by human operators.
3. **Protected Branch Rules:** The `main` and `production` branches MUST require:
   - Passing status check: `production-integrity`
   - Required code review by designated code owners.
