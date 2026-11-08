# PARAKH Learning Engine

PARAKH is the working name for CA Exam Checker's evaluation-learning data pipeline.

## Current phase: consent-based observation collection and sampled quality review

- Students may optionally opt in when they submit an answer sheet.
- A missing or unchecked consent value means **no PARAKH learning record is created**.
- Every explicitly opted-in, successfully completed evaluation becomes a `COLLECTED_UNVERIFIED` observation. Ordinary completed evaluations do not wait for an administrator.
- The record is a metadata-only pointer to the existing protected evaluation; source answer sheets, checked copies, and reports are not duplicated into a training dataset.
- System-flagged `NEEDS_REVIEW` evaluations become `SELECTED_FOR_REVIEW`; additional quality-control samples can be selected separately. This is a sample-based quality process, not mandatory review of every submission.
- Only a selected sample finalized through the existing admin review workflow becomes a `VERIFIED_SAMPLE`.
- Failed/rejected submissions are excluded from the completed observation count. A student can withdraw all earlier PARAKH opt-ins; this does not alter evaluation history, marks, reports, or credits.
- V1 AI output and admin-finalized V2 results remain distinct in the existing evaluation-version system. Unreviewed AI output is never treated as ground truth.

## Explicitly disabled

- Model training and fine-tuning.
- Evaluation supervisor activation.
- Automatic model-to-model grading or correction calls.
- Any change to the production evaluation model, routing, marking, credits, or student entitlements.
- Exporting source answer sheets or reports into a training dataset.

The consent ledger stores the evaluation ID, student ID for consent/audit linkage, consent version and timestamp, course/subject/attempt metadata, checking mode, observation state, and final review metadata. The existing evaluation record remains the source of the answer, AI output, checked copy, and report. Original evaluation files remain in the existing protected evaluation storage.

## Dashboard measures

- Total completed observations collected from consented submissions.
- Unreviewed observations available for analysis and quality sampling.
- Selected-for-review cases (including system-flagged integrity cases).
- Human-verified samples finalized by an administrator.
- Processing, failed, and withdrawn records.
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
