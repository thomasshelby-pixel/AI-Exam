# PARAKH All-Course Coverage Foundation

## Purpose

This release makes the full ICAI New Scheme paper/module catalogue visible to PARAKH's learning and quality workflow. It adds a common resolver and readiness inventory for CA Foundation, CA Intermediate, CA Final and Self-Paced Online Modules (SPOM). It is a coverage-control and routing improvement, not a claim that the full CA syllabus has been taught or verified.

## Official curriculum source pages

The paper catalogue uses the official ICAI course pages:

- CA Foundation: https://www.icai.org/post/foundation-nset
- CA Intermediate: https://www.icai.org/post/intermediate-nset
- CA Final: https://www.icai.org/post/final-nset
- SPOM: https://www.icai.org/post/19162

These were checked on 8 November 2026. Each exact exam attempt still requires the relevant ICAI study material, RTP/MTP, amendments, corrigenda, exclusions and applicability announcements. The catalogue page itself does not establish every attempt's chapter or legal treatment.

## What the registry covers

The registry maps 32 official paper/module entries:

| Track | Mapped entries |
| --- | ---: |
| CA Foundation | 4 papers |
| CA Intermediate | 6 papers |
| CA Final | 6 papers |
| SPOM | 16 modules/papers |
| **Total** | **32** |

The registry reuses the application's chapter index for Foundation and Intermediate, with a status that makes clear it has not yet been reconciled chapter-by-chapter to each student's exact attempt. Intermediate Paper 6 is split into Financial Management and Strategic Management sections. The nine Financial Management chapters link to their official ICAI catalogue and retain their existing original draft packs. Section B Strategic Management now uses the five chapter names on ICAI's page headed “Applicable for May 2027 Exam Onwards” and has separate original draft packs and benchmark prompts.

For CA Final, existing subject metadata is represented as a provisional topic index. Those entries are not labelled as official ICAI chapter titles. SPOM is mapped at module/paper level; this release does not pretend to have imported its detailed chapter/unit index.

## What this release authors

Only Intermediate Paper 6, Section A: Financial Management currently has original chapter teaching drafts in this knowledge service:

- Paper 4 Cost and Management Accounting: 15 chapter packs, in English, Hindi and Hinglish, with answer/example/simpler/quiz modes and 75 benchmark prompts.
- Paper 6 Section A Financial Management: 9 chapter packs and 45 benchmark prompts.
- Paper 5 Auditing and Ethics: 11 chapter packs and 55 benchmark prompts, linked to the ICAI page headed May 2027 Exam Onwards.
- Paper 6 Section B Strategic Management: 5 chapter packs and 25 benchmark prompts.
- Across Intermediate Papers 4, 5 and 6: 40 original chapter drafts and 200 benchmark prompts.
- 0 human-reviewed chapter packs and 0 human-reviewed benchmark sets.

The remaining mapped subjects are not silently promoted to authored content. The student response path may identify the matching paper and explain the coverage gap. Current/statutory questions continue to require live primary-source support.

## Coverage-aware chat behaviour

For a student question, the authenticated course profile is used to resolve a paper/section and, where possible, a chapter/topic pointer. The user's message cannot override their saved course. When no dedicated authored chapter pack or live source answer is available, PARAKH adds a language-matched notice stating whether the index is a chapter list, a provisional topic pointer, or only a module-level paper map. This notice is not itself an academic answer.

Paper/source context is returned in response metadata. The all-course coverage inventory is exposed to the Super Admin readiness dashboard.

## Status definitions

- OFFICIAL_CHAPTER_CATALOGUE_LINKED: a linked official chapter catalogue exists for the relevant paper/section; this does not mean every section has authored lessons.
- APP_CHAPTER_INDEX_NOT_ATTEMPT_VERIFIED: a chapter index exists in the application but needs exact-attempt verification.
- PROVISIONAL_TOPIC_INDEX_NOT_OFFICIAL_CHAPTERS: topic pointers are available, but they must not be represented as official chapter headings.
- OFFICIAL_MODULE_MAPPED_CHAPTER_INDEX_PENDING: the official module is mapped; detailed chapter/unit indexing remains pending.
- AUTHOR_DRAFT_NOT_HUMAN_VERIFIED: original explanation exists but is not academically approved.
- MAPPED_ONLY: a mapping exists, but no dedicated authored lesson is served by this entry.
- PROMPTS_DEFINED_NOT_EVALUATED: benchmark prompts exist, but there is no approved answer-key scoring.
- NOT_CREATED: no benchmark prompts have been created for the entry.

No coverage status in this release represents human verification.

## Tests added

The protected study-planner suite checks:

1. All four course tracks and the 32-paper/module count.
2. The 9 authored FM chapter drafts and their 45 prompts remain isolated from mapped-only subjects.
3. CA Final topic pointers are not misrepresented as official chapters.
4. SPOM mapping does not imply chapter/unit coverage.
5. Course-aware routing for Foundation, Intermediate, Final and SPOM.
6. Intermediate FM/SM section resolution and the English/Hindi/Hinglish coverage notices.
7. Zero human-reviewed content and benchmark status remains explicit.

## Safety, cost and copyright

This release adds no paid model, model-provider call, model fine-tuning, model-weight update or automatic training pipeline. It does not ingest student chat transcripts to author content. The registry links ICAI material rather than copying or mirroring ICAI's copyrighted study text. Human review remains mandatory before an authored lesson or benchmark can be promoted.

## Remaining work before claiming full-syllabus quality

- Verify Foundation and Intermediate chapter indexes against the correct attempt editions.
- Import official chapter/unit trees for all Foundation, Intermediate, Final and SPOM paper/module entries.
- Author original chapter lessons, worked examples and multilingual explanations for each chapter.
- Create separate unseen benchmark questions and independently checked answer keys.
- Have qualified CA subject reviewers approve each content set against the exact applicable ICAI material.
- Re-run the protected regression suite after every content or syllabus update.

The current inventory is a complete paper-level map, not complete CA subject knowledge coverage.
