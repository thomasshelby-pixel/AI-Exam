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

Technical Law/Tax/Accounting knowledge must be attempt-versioned for the inclusive target window **January 2027 through September 2027**. Every technical entry must carry its course, subject, valid-from attempt, valid-through attempt, source reference, verification date and reviewer status. Never reuse a provision/rate/limit across attempts unless its applicability is explicitly verified. Before adding technical answers, review the ICAI material and amendments applicable to the student's selected attempt. The official Board of Studies page lists study material for Foundation and Intermediate examinations; the current September 2026 PDF is only a source locator and must not be treated as the Jan–Sep 2027 applicable material: https://boslive.icai.org/assets/BOS_Study_Material_applicable_for_Foundation_and_Inter_Sep2026Exam.pdf. A public link is not permission to copy ICAI material into the knowledge pack.

## Run tests

```bash
npm run test:study-planner
```
