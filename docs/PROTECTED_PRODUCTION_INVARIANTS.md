# Protected Production Invariants

This document describes the persistence contract for administrator MFA, permanent student deletion, and evaluation model routing. Code tests are release checks, not immutable protection; repository review rules and required CI checks still need to be configured by repository administrators.

## 1. Administrator MFA

- Firestore is the durable production store; SQLite is a runtime cache hydrated before the server accepts requests.
- The `users` record carries the enrollment flag and legacy TOTP-secret mirror. `mfa_authenticators` carries authenticator records. Existing MFA data has no version field that can resolve conflicting non-null secrets reliably.
- Schema initialization must not infer that `mfa_enabled = 1` with a temporarily missing local secret means an administrator reset MFA. It preserves the enrollment and returns the explicit `MFA_RECOVERY_REQUIRED` state.
- Hydration may restore local state from Firestore. Startup must not push an incomplete SQLite MFA record back to Firestore or write a null secret over the durable secret.
- Normal enrollment and recovery handlers must persist their state successfully before reporting completion. MFA secrets are currently stored as plaintext in the existing SQLite and Firestore fields; no stable encryption-key configuration or safe in-place migration was found. Do not change the secret representation until the production key and a recoverable backup are verified.
- If an enrolled administrator has no readable secret, login must remain protected and use the existing authorized recovery process. No password-only bypass or public reset is allowed.

## 2. Permanent student deletion

- Firestore `tombstones` is the durable deletion ledger. A tombstone uses the stable internal document ID and the source collection name. SQLite tombstones are a local mirror only.
- The allowed account-delete paths are the authorized administrator deletion service and the authenticated student self-deletion service. They must await every tombstone-backed cloud delete before removing the local active account row.
- Missing Firestore state or a tombstone read/write failure is not treated as proof that a record is not tombstoned. Hydration and fallback login fail closed when they cannot verify the deletion ledger.
- Startup baseline seeding and Firestore hydration must skip tombstoned users, including baseline/demo students. Stale cloud documents must never recreate an active local student.
- Failed deletion remains explicit (`DELETING`/`DELETION_FAILED`) and retryable; a route must not report `DELETED` until required persistence is confirmed.

## 3. Primary evaluation model

- Firestore document `system_configuration/evaluation_model_routing` is the authoritative server-side routing configuration.
- Its `primaryModel` must be a single approved registry ID. The Admin API validates the ID and persists the document only after authorization and validation.
- `model_configs` and `pricing_settings` in SQLite are a local UI/runtime cache and legacy settings store. Startup seeding must not replace a valid administrator choice with a default.
- Provider API-key environment variables enable providers; they do not select or override the primary model.
- Production evaluation fails with an explicit configuration error if the authoritative routing document is missing or invalid. It must not silently select Gemini or a different provider.
- The actual provider/model used by each evaluation component should be recorded in safe diagnostics; never log credentials or student answer content as routing diagnostics.

## 4. Administrator-controlled fallback order

- The ordered `fallbackOrder` array in `system_configuration/evaluation_model_routing` is authoritative and is separate from `primaryModel`.
- The Admin API rejects duplicate, unapproved, malformed, or primary-as-fallback entries and stores the submitted list without sorting it.
- Runtime retries walk the saved order and may skip only entries unavailable under explicit runtime/provider conditions. Availability checks must not reorder the remaining entries.
- SQLite `fallback_order` is a cache/UI projection. Routine startup and registry refresh must not rewrite the authoritative Firestore order.
- A missing/invalid routing document requires an explicit administrator save/recovery; there is no silent hard-coded order recovery.

## Initialization, rollback, and release controls

- The server initializes SQLite, hydrates Firestore, and only then listens in non-development mode. Routing configuration is read from Firestore at evaluation time; the Admin API can hydrate the local model cache from that document.
- No production database, MFA record, primary model, or fallback order was inspected or modified during this code audit. No production backup was created because no production data migration or repair was run.
- Before a production data migration or manual recovery, export the affected Firestore collections/document and SQLite data through the approved administrator process, verify restore access, and keep secret values out of reports.
- Rollback must restore the prior application revision and the matching durable data snapshot. Do not restore an older SQLite or Firestore replica over newer MFA enrollment, tombstones, or model routing.
- The registry currently lists five Gemini IDs in `APPROVED_MODELS`, while the requested policy specifies exactly three intended Gemini entries. The repository does not establish which two IDs must be retired; an administrator decision is required before changing the approved registry.
- A repository administrator must enable branch protection and require the `Protected production invariants` CI workflow on the protected branch. Those GitHub settings cannot be verified or changed from this local checkout.
