# PARAKH Quality Standard

## Product objective

PARAKH is intended to become a reliable CA learning companion across Foundation, Intermediate and Final. It must not be described as fully subject-capable merely because it can respond conversationally or has a few authored examples.

Quality is more important than answer volume. When a question needs current law, a statutory source, an unstated numerical assumption or a subject-specific explanation that is not in the verified knowledge bank, PARAKH must disclose the gap instead of inventing an answer.

## Official curriculum map

The implementation includes an ICAI New Scheme paper-title registry checked on 8 November 2026. It maps Foundation (4 papers), Intermediate (6 papers), Final (6 papers) and SPOM (16 listed modules/papers) to broad learning domains. The registry is a navigation and mapping layer only; it does not claim chapter-level content, attempt-specific amendments or answer benchmarks are verified.

Official references:
- Foundation: https://www.icai.org/post/foundation-nset
- Intermediate: https://www.icai.org/post/intermediate-nset
- Final: https://www.icai.org/post/final-nset
- Self-Paced Online Modules: https://www.icai.org/post/19162

The ICAI pages are authoritative for the paper catalogue. A student answer still needs the study material/RTP/MTP and amendments that apply to the student's exact examination attempt.

## Implemented foundation

- A shared question classifier identifies the subject domain and whether the request is current-information, statutory application, numerical, conceptual, exam strategy or study planning.
- The response-quality gate checks answer substance, structure, topic match, numerical workings, assumptions, conclusion/next step and primary-source evidence.
- The API returns the quality assessment in reply metadata. The gate is a structural/evidence check, not a proof of factual or mathematical correctness.
- Current and statutory questions require an HTTPS primary-source host from the maintained authority allowlist. A general news result is not enough to mark a statutory answer source-grounded.
- The Super Admin learning dashboard exposes the current subject-readiness matrix. Existing authored guidance is labelled partial; no subject is marked fully verified.
- A deterministic benchmark harness checks required/forbidden answer signals and primary-source requirements. Passing the harness alone does not certify correctness.

## Quality statuses

| Status | Meaning |
| --- | --- |
| STRUCTURE_READY | The answer has the expected structural signals for its classified request. This does not mean facts or calculations have been independently verified. |
| PARTIAL_NEEDS_INPUT | A numerical answer has calculated the supported portion and disclosed the missing input needed for a final decision. |
| NEEDS_PRIMARY_SOURCE | A current/statutory answer lacks a verified primary-source link. |
| NEEDS_HUMAN_REVIEW | The response lacks subject-specific grounding, useful structure or a clear next step. |
| INCOMPLETE | The answer is too thin or a numerical response does not show workings. |

## Required benchmark families per subject

Every subject domain needs a held-out benchmark set that includes:

1. Core concepts, definitions and distinctions.
2. Unseen numerical or application questions.
3. ICAI-style exam questions and answer presentation.
4. Edge cases, common mistakes and multi-step follow-ups.
5. Current/statutory questions with effective dates and primary-source verification where applicable.

Benchmark answers must be prepared or verified by a qualified human reviewer. Keep test questions separate from examples used to author the knowledge base. Include a range of easy, normal and difficult questions; do not tune only to one sample prompt.

## Learning and training policy

- Completed evaluation samples and chat learning signals are different datasets and must remain separate.
- An AI evaluation result is not ground truth. Only selected and human-reviewed samples can become verified labels in the existing learning pipeline.
- Conversation insights are aggregate topic/intent/language counts only. Raw conversation text, student identifiers and contact details must not be placed in the aggregate insight store.
- Conversation learning remains disabled by default until its purpose-specific privacy notice and applicable legal/consent review are complete.
- Aggregate insights can suggest which topic needs better content; they must not automatically publish knowledge, train a model or update model weights.
- Knowledge changes require a human reviewer, a source reference, applicability/effective-date metadata where relevant, regression tests and a documented version change.
- No training or quality operation may alter production evaluation marks, question mapping, credits, payments or billing.

## Subject expansion workflow

For each subject domain:

1. Map the current course and syllabus boundaries; keep unsupported or unmapped course areas explicit.
2. Add source-backed knowledge entries with source title, authority, URL, syllabus/attempt applicability, effective date and reviewer.
3. Add worked examples and unseen questions across the required benchmark families.
4. Run deterministic structure checks and human-verified answer comparisons.
5. Review failures, update the knowledge or solver, and rerun the full regression suite.
6. Release only when critical benchmark failures are resolved and no current/statutory answer is presented as verified without primary-source support.

## Current limitation

The present readiness matrix is an initial engineering inventory. It reports partial authored guidance and known syllabus-mapping gaps; it is not a claim that all Foundation, Intermediate and Final subjects have been covered. CA Final course-to-subject mapping still needs to be completed against the authoritative curriculum registry before any complete-coverage claim is made.
