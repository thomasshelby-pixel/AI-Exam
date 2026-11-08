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

This rollout covers only CA Intermediate Paper 6A, Section A. All nine FM chapters have original drafts, but none has human-approved content or human-reviewed benchmark answers. It does not provide complete coverage for the other Intermediate papers, Foundation, Final, SPOM, or Section B: Strategic Management. Those areas remain gaps until separately mapped from current official sources, authored, benchmarked and reviewed.

The next content sequence is to complete the remaining eight FM chapters, then map and build Strategic Management, followed by the other paper/section pairs. Tax and law content requires separate attempt-aware statutory source controls and must not be promoted from evergreen explanations.
