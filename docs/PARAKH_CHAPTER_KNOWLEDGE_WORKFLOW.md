# PARAKH Chapter Knowledge Workflow

## Purpose

This document governs the move from a paper-level curriculum locator to chapter-level, source-linked learning content. The aim is to make coverage measurable without confusing a mapped chapter, an authored explanation, an automated test, and a human-verified answer.

## First rollout: CA Intermediate Financial Management

**Source of truth:** ICAI's official Intermediate Paper 6A page for Section A: Financial Management, headed “Applicable for May 2026 Exam”:

- https://www.icai.org/post/sm-inter-p6a-may2026
- Parent course page: https://www.icai.org/post/intermediate-nset

The official page lists nine chapters:

| Module | Chapter | Current PARAKH state |
| --- | --- | --- |
| Module 1 | 1. Scope and Objectives of Financial Management | Original authored draft; automated retrieval checks; not human-verified |
| Module 1 | 2. Types of Financing | Original authored draft; automated retrieval checks; not human-verified |
| Module 1 | 3. Financial Analysis and Planning – Ratio Analysis | Original authored draft, detailed worked ratios and self-test; not human-verified |
| Module 1 | 4. Cost of Capital | Original authored draft and WACC illustration; not human-verified |
| Module 1 | 5. Financing Decisions – Capital Structure | Original authored draft and debt-risk illustration; not human-verified |
| Module 1 | 6. Financing Decisions – Leverages | Original authored draft and DOL/DFL/DCL illustration; not human-verified |
| Module 2 | 7. Investment Decisions | Original authored draft and NPV illustration; not human-verified |
| Module 2 | 8. Dividend Decision | Original authored draft and payout/retention illustration; not human-verified |
| Module 2 | 9. Management of Working Capital | Original authored draft and operating-cycle illustration; six official units listed; not human-verified |

All nine mapped FM chapters now have original draft teaching content in English, Hindi and Hinglish, with answer, example, simpler-explanation and quiz modes. The chapter drafts are a first content rollout, not a claim of complete academic depth or subject mastery.
## Third rollout: CA Intermediate Paper 4: Cost and Management Accounting

**Source of truth:** ICAI's official Paper 4 page at https://icai.org/post/24297 is headed “Applicable for May 2027 Exam Onwards” and lists 15 chapters.

The 15 original teaching packs cover:

1. Introduction to Cost and Management Accounting
2. Material Cost
3. Employee Cost and Direct Expenses
4. Overheads – Absorption Costing Method
5. Activity Based Costing
6. Cost Sheet
7. Cost Accounting Systems
8. Unit & Batch Costing
9. Job Costing
10. Process & Operation Costing
11. Joint Products and By Products
12. Service Costing
13. Standard Costing
14. Marginal Costing
15. Budgets and Budgetary Control

Each pack has original explanations in English, Hindi and Hinglish, plus answer, example, simpler and quiz modes. Worked examples include EOQ, Halsey/Rowan incentives, overhead absorption, activity drivers, cost-sheet build-up, normal/abnormal process loss, further-processing decisions, service cost units, material variances, break-even analysis and flexible budgets. A deterministic cost-sheet helper is covered by regression tests.

Five distinct benchmark prompts are defined per chapter (75 total) across core concept, unseen numerical/application, exam presentation, edge cases and attempt/source sensitivity. There are zero human-reviewed chapters and zero human-reviewed benchmark answer keys. The notes are original and do not reproduce ICAI study material.

**Attempt boundary:** this ICAI page is headed May 2027 Exam Onwards. Do not claim these chapters apply to a different attempt without checking the student's exact ICAI material, RTP, corrigenda and exclusions.

## Second rollout: CA Intermediate Paper 6B, Section B: Strategic Management

**Source of truth:** ICAI's official Paper 6B page with separate applicability editions. The page for the next listed edition is headed “Applicable for May 2027 Exam Onwards” and lists five chapters:

- https://www.icai.org/post/sm-inter-p6b-may2027
- Paper 6B edition index: https://www.icai.org/post/sm-intermediate-paper6b

| Chapter | Current PARAKH state |
| --- | --- |
| 1. Introduction to Strategic Management | Original authored draft in English, Hindi and Hinglish; answer/example/simpler/quiz modes; not human-verified |
| 2. Strategic Analysis: External Environment | Original authored draft with PESTEL and industry/competitive analysis examples; not human-verified |
| 3. Strategic Analysis: Internal Environment | Original authored draft with resources, capabilities, VRIO, value chain and SWOT examples; not human-verified |
| 4. Strategic Choices | Original authored draft with corporate directions, competitive strategies, Ansoff and BCG illustrations; not human-verified |
| 5. Strategy Implementation and Evaluation | Original authored draft with implementation alignment, controls, KPIs and Balanced Scorecard examples; not human-verified |

The five packs have original explanations in English, Hindi and Hinglish and five distinct benchmark prompts each (25 total). The prompts span core concepts, unseen application, exam-style analysis, trade-offs/edge cases and attempt/source sensitivity. These are not approved answer keys and have not been scored. No Strategic Management chapter or benchmark is human-reviewed.

**Attempt boundary:** The official page is headed May 2027 Exam Onwards. The drafts must not be used to assert chapter applicability for a different attempt without checking that student's exact ICAI material, RTP, amendment and corrigendum. This authored content does not reproduce ICAI study-material text.

## Content and intellectual-property policy

ICAI's website carries an intellectual-property notice reserving its material to ICAI. PARAKH therefore stores original explanations, original examples and links to the official source page; it does not copy ICAI chapter text, reproduce its illustrations, or mirror its PDFs.

Every knowledge entry must keep:
- Course, paper, section, chapter and syllabus applicability.
- Official source title and URL, source type and last-checked date.
- Authored content separate from official source material.
- Content-review state and benchmark-review state.
- A clear note when the official page is only a catalogue and the exact attempt's RTP, amendment or corrigendum still needs checking.

## Status definitions

| Status | Meaning | May be described as verified? |
| --- | --- | --- |
| MAPPED_ONLY | Official chapter title and module are indexed; no authored explanation is provided by this pack. | No |
| AUTHOR_DRAFT_NOT_HUMAN_VERIFIED | Original teaching content exists but has not been approved by a qualified academic reviewer. | No |
| SELF_CHECKED_NOT_HUMAN_VERIFIED | Automated regression cases exercise the content and examples; factual correctness and syllabus treatment are not independently certified. | No |
| PROMPTS_DEFINED_NOT_EVALUATED | Distinct benchmark question prompts exist, but there is no scored answer key or evaluation run yet. | No |
| HUMAN_REVIEWED | A recorded qualified reviewer has checked the content against the applicable official material and attempt. | Only within the recorded scope |
| HELD_OUT_BENCHMARKED | Separate, unseen questions and approved answer keys have been reviewed and passed. | Only within the tested scope |

No current item in this rollout is HUMAN_REVIEWED or HELD_OUT_BENCHMARKED.

## Chapter-level authored content

The nine chapter packs provide:
- Original explanations in English, Hindi and Hinglish, with answer, example, simpler and quiz modes.
- Chapter-level topics across financial-management objectives, financing sources, ratio analysis, cost of capital, capital structure, leverages, investment appraisal, dividend policy and working capital.
- Original illustrations for WACC, leverage, NPV, payout/retention, operating cycle and Ratio Analysis.
- Explicit assumptions and cautions for ratio definitions, leverage formulas, tax treatment, cash-flow timing, maturity matching and operating-cycle calculations.
- Five distinct benchmark prompts for each chapter (45 total), spanning concept, unseen numerical/application, exam presentation, edge case and attempt/source sensitivity.
- A link to the official ICAI Paper 6A chapter catalogue.

It is deliberately not a statutory or attempt-amendment answer. Questions asking about latest amendments or exact upcoming-attempt applicability are routed away from this evergreen draft.

## Benchmark coverage

Five benchmark families are applied to every chapter, with five distinct prompts per chapter:
1. Core concept and interpretation.
2. Unseen numerical/application.
3. Exam-style presentation and workings.
4. Edge cases and common mistakes, including zero denominators and missing average balances.
5. Attempt/source sensitivity.

The automated suite confirms retrieval boundaries for all nine chapters, language/mode selection, selected example arithmetic, official source metadata, nine-chapter mapping, 45 distinct prompts (five per chapter) and explicit non-verified status. These prompts are not a held-out answer-key evaluation and the tests do not replace human marking.

## Human-review release gate

Before any content is promoted:
1. A qualified reviewer checks every statement and formula against the correct ICAI material for the selected attempt.
2. The reviewer checks definitions, conventions, units, calculations, rounding, assumptions and interpretation.
3. Benchmark questions are kept separate from the authored explanation and worked examples.
4. The answer key is independently checked; hard and edge cases are included.
5. Reviewer identity/role, review date, source edition, applicable attempts, and material changes are recorded.
6. The protected regression suite is run; failures are resolved before release.
7. The status is updated only for the exact chapter/content/attempt reviewed. A review of one chapter must never promote the whole paper or subject.

Chat messages, unreviewed evaluation results and aggregate student signals must not auto-approve content, publish knowledge or update model weights. Conversation learning remains governed by the separate privacy and legal gate.

## Current scope and next expansion

The paper-level catalogue covers all four ICAI New Scheme tracks: Foundation (4 papers), Intermediate (6 papers), Final (6 papers) and SPOM (16 modules/papers). A course-aware coverage registry and Super Admin dashboard show the map/index type and content status for all 32 entries. See docs/PARAKH_ALL_COURSE_COVERAGE_FOUNDATION.md.

Intermediate Paper 4 and Paper 6 now have original content: Paper 4 Cost and Management Accounting (15 chapter drafts, 75 benchmark prompts; catalogue headed May 2027 Exam Onwards), Paper 6 Section A Financial Management (9 chapter drafts, 45 prompts; catalogue headed May 2026 Exam) and Paper 6 Section B Strategic Management (5 chapter drafts, 25 prompts; catalogue headed May 2027 Exam Onwards). Across these papers there are 29 authored chapter drafts and 145 prompts, but zero human-reviewed chapters and zero human-reviewed benchmark sets. Foundation and other Intermediate chapter indexes are reused from the app curriculum and still need attempt-specific verification; CA Final entries are provisional topic pointers, not official chapter titles; SPOM is mapped at module level while chapter/unit indexing remains pending. No other paper in this release has dedicated authored chapter lessons.

Next work is source-verified chapter/unit indexing and original content authoring for every remaining paper/section, followed by separate benchmark answer keys and qualified review. Tax and law content needs attempt-aware statutory source controls and must not be promoted from evergreen explanations.
