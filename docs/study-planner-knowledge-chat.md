# Study Planner deterministic knowledge chat

This feature adds a local, model-free knowledge retrieval and conversation layer for Study Planner.

## Design

- Curated knowledge entries are stored in `server/services/studyPlannerKnowledgeService.ts`.
- Search uses normalization, stop-word removal, topic aliases, subject matching and weighted token scoring. Explicit subject mentions are checked against the student's saved CA course so Foundation and Intermediate guidance cannot cross over accidentally. It does not call an external model, embedding API or hosted inference service.
- Replies are authored in English, Hinglish and Hindi.
- Follow-up rules support requests for examples, simpler explanations and quick self-tests by resolving the topic from recent chat history.
- Unsupported, attempt-sensitive or current statutory questions are not guessed; they continue to the existing safe fallback.

## Current scope

The knowledge pack contains general study skills and subject-specific methods for Foundation Quantitative Aptitude and Business Economics, and Intermediate Auditing and Ethics plus Financial Management and Strategic Management. It also covers numerical practice, Law/Tax answer structure, mock analysis, focused sessions and chapter revision. Subject-specific retrieval is limited to the Foundation and Intermediate curriculum names and aliases already represented in the planner. It is deliberately not represented as a complete ICAI technical answer bank.

## Add new knowledge

Add a topic entry with a stable ID, title, subjects, keywords and reviewed answers for all supported languages. Include examples, simpler explanations and quiz prompts. Add retrieval tests for natural variations, explicit course-subject boundaries, generic subject-neutral queries and follow-up context.

Before adding technical Law/Tax/Accounting answers, review the relevant ICAI material for the target attempt and keep source/attempt metadata with the entry. The official Board of Studies page lists the study material applicable to Foundation and Intermediate examinations: https://boslive.icai.org/assets/BOS_Study_Material_applicable_for_Foundation_and_Inter_Sep2026Exam.pdf. This link is a source locator, not permission to copy ICAI material into the knowledge pack.

## Run tests

```bash
npm run test:study-planner
```
