# Study Planner deterministic knowledge chat

This feature adds a local, model-free knowledge retrieval and conversation layer for Study Planner.

## Design

- Curated knowledge entries are stored in `server/services/studyPlannerKnowledgeService.ts`.
- Search uses normalization, stop-word removal, topic aliases, subject matching and weighted token scoring. It does not call an external model, embedding API or hosted inference service.
- Replies are authored in English, Hinglish and Hindi.
- Follow-up rules support requests for examples, simpler explanations and quick self-tests by resolving the topic from recent chat history.
- Unsupported, attempt-sensitive or current statutory questions are not guessed; they continue to the existing safe fallback.

## Current scope

The initial knowledge pack contains study skills and answer-writing workflows: active recall, spaced revision, numerical practice, Law/Tax answer structure, mock analysis, focused sessions and chapter revision. It is deliberately not represented as a complete ICAI technical answer bank.

## Add new knowledge

Add a topic entry with a stable ID, title, subjects, keywords and reviewed answers for all supported languages. Include examples, simpler explanations and quiz prompts. Add retrieval tests for natural variations and course boundaries.

Before adding technical Law/Tax/Accounting answers, review the relevant ICAI material for the target attempt and keep source/attempt metadata with the entry.

## Run tests

```bash
npm run test:study-planner
```
