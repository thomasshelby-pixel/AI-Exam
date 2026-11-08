# PARAKH Learning Engine

PARAKH is the working name for CA Exam Checker's evaluation-learning data pipeline.

## Current phase: consent-based collection and review tracking only

- Students may optionally opt in when they submit an answer sheet.
- A missing or unchecked consent value means **no PARAKH learning record is created**.
- An opt-in creates a metadata-only pointer to the existing evaluation. It does not duplicate the answer sheet, checked copy, report, or student identity details into a training dataset.
- A student can withdraw all earlier PARAKH opt-ins from the answer-sheet upload screen. Withdrawn references are excluded from future learning eligibility; existing evaluations, marks, reports, and credits are unchanged.
- A record remains `AWAITING_ADMIN_REVIEW` until an administrator completes the existing review-and-finalize workflow.
- Only then can the pointer become `VERIFIED_CANDIDATE`.
- V1 AI output and admin-finalized V2 results remain distinct in the existing evaluation-version system. Unreviewed AI output is never treated as ground truth.

## Explicitly disabled

- Model training and fine-tuning.
- Evaluation supervisor activation.
- Automatic model-to-model grading or correction calls.
- Any change to the production evaluation model, routing, marking, credits, or student entitlements.
- Exporting source answer sheets or reports into a training dataset.

The consent ledger stores the evaluation ID, student ID for consent/audit linkage, consent version and timestamp, course/subject/attempt metadata, checking mode, and final review metadata. Original evaluation files remain in the existing protected evaluation storage.

## Dashboard measures

- Opt-in submissions.
- Records waiting for admin review.
- Admin-verified candidate records.
- Withdrawn records.
- Subject/course coverage and last recorded activity.
- Benchmark/training run counts remain zero until those systems are separately implemented and enabled.

The dashboard reports whether counts came from shared Firestore or an instance-local SQLite fallback. The latter may be incomplete in a multi-instance deployment.

## Before any future training

1. Add and verify an anonymisation/export stage; do not put names, email addresses, ICAI registration numbers, or raw identifiers into training examples.
2. Confirm appropriate data rights, consent scope, retention, deletion/withdrawal handling, and applicable privacy notices.
3. Curate question-level answer evidence, authoritative question/marking references, step marks, V1 output, and admin-final V2 labels.
4. Build a human-verified held-out benchmark split by student and paper. Measure question mapping, omissions, false-positive marks, zero-mark decisions, and partial-credit accuracy.
5. Train offline only after the benchmark and dataset are reviewed. Compare against the held-out benchmark; do not deploy automatically.

The dashboard is a data-readiness monitor, not evidence that PARAKH has learned or improved model accuracy.
