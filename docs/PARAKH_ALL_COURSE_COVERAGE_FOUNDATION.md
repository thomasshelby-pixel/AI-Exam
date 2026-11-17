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

Foundation Papers 1–4 and all Intermediate Papers 1–6 now have source-linked chapter catalogues for the authored packs. Paper 3 Taxation is split into Section A (Income-tax Law) and Section B (GST); Paper 6 is split into Financial Management and Strategic Management. Exact attempt editions and amendments still require verification.

For CA Final, existing subject metadata is represented as a provisional topic index. Those entries are not labelled as official ICAI chapter titles. SPOM is mapped at module/paper level; this release does not pretend to have imported its detailed chapter/unit index.

## What this release authors

Original teaching drafts cover all four Foundation papers and all six Intermediate papers:

- Foundation Paper 1 Accounting: 11 chapter packs and 55 benchmark prompts.
- Foundation Paper 2 Business Laws: 7 chapter packs and 35 benchmark prompts.
- Foundation Paper 3 Quantitative Aptitude: 18 chapter packs and 90 benchmark prompts.
- Foundation Paper 4 Business Economics: 10 chapter packs and 50 benchmark prompts.
- Intermediate Paper 1 Advanced Accounting: 15 chapter packs and 75 benchmark prompts.
- Intermediate Paper 2 Corporate and Other Laws: 15 chapter packs and 75 benchmark prompts (12 Company Law/LLP chapters and 3 Other Laws chapters).
- Intermediate Paper 3 Section A Income-tax Law: 9 chapter packs and 45 benchmark prompts.
- Intermediate Paper 3 Section B GST: 15 chapter packs and 75 benchmark prompts.
- Intermediate Paper 4 Cost and Management Accounting: 15 chapter packs and 75 benchmark prompts.
- Intermediate Paper 5 Auditing and Ethics: 11 chapter packs and 55 benchmark prompts.
- Intermediate Paper 6 Section A Financial Management: 9 chapter packs and 45 benchmark prompts.
- Intermediate Paper 6 Section B Strategic Management: 5 chapter packs and 25 benchmark prompts.
- Foundation total: **46 original chapter drafts and 230 benchmark prompts**.
- Intermediate total: **94 original chapter drafts and 470 benchmark prompts**.
- Combined total: **140 original chapter drafts and 700 benchmark prompts**.
- Qualified human-reviewed chapter packs: **0**. Human-reviewed benchmark answer-key sets: **0**.

The Paper 2 and Paper 3 chapter drafts are original PARAKH teaching notes in English, Hindi and Hinglish, with answer, example, simpler and quiz modes. They are not reproductions of ICAI material. Paper 2 source: https://www.icai.org/post/24331. Paper 3 Section A source: https://www.icai.org/post/24313. Paper 3 Section B source: https://www.icai.org/post/24360. Current statutory rules, rates, thresholds, filing dates, notifications, effective dates and attempt-specific questions are routed away from evergreen drafts and require current primary-source verification.

The 700 benchmark items are prompt scaffolds, not a held-out scored benchmark. No approved answer-key set or qualified human review has been completed. Passing retrieval tests does not establish factual accuracy or exam readiness. Foundation and Intermediate coverage is broader, but neither level should be described as fully verified until qualified subject review and independently checked benchmark evaluation are complete.

CA Final and SPOM are not part of this implementation phase; their existing mapping metadata is left unchanged.

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
2. Foundation Papers 1–4 and Intermediate Papers 1–6 resolve to source-linked chapter catalogues with distinct authorship, benchmark counts and Paper 3 section-level routing.
3. Five benchmark prompts per authored chapter remain separate from mapped-only subjects.
4. CA Final topic pointers are not misrepresented as official chapters.
5. SPOM mapping does not imply chapter/unit coverage.
6. Course-aware routing for Foundation, Intermediate, Final and SPOM.
7. Intermediate FM/SM section resolution and English/Hindi/Hinglish coverage notices.
8. Zero human-reviewed content and benchmark status remains explicit.

## Safety, cost and copyright

This release adds no paid model, model-provider call, model fine-tuning, model-weight update or automatic training pipeline. It does not ingest student chat transcripts to author content. The registry links ICAI material rather than copying or mirroring ICAI's copyrighted study text. Human review remains mandatory before an authored lesson or benchmark can be promoted.

## Remaining work before claiming full-syllabus quality

- Verify every authored Foundation and Intermediate chapter against each student's exact attempt edition, including RTP/MTP, amendments, exclusions and corrigenda.
- Expand worked numericals, case-law reasoning, tax computations and exam-style answer presentation where reviewers identify gaps.
- Create held-out benchmark questions that are not reused as authoring examples, with independently checked answer keys and difficulty calibration.
- Have qualified CA reviewers for Accounting, Law, Tax, Audit, Costing, FM/SM, Quantitative Aptitude and Economics approve every content set against the exact applicable ICAI material.
- Evaluate factual accuracy, calculations, question routing, multilingual fidelity and uncertainty handling; resolve critical failures before any verified label.
- Keep CA Final and SPOM deferred until Foundation and Intermediate pass their own quality gates.
- Re-run the full protected regression suite after every content or syllabus update.

The current inventory is a complete paper-level map, not complete CA subject knowledge coverage.
