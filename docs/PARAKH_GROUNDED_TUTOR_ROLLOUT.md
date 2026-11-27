# PARAKH Grounded Tutor Rollout

## What is active in this release

PARAKH's student-facing page is now a focused CA learning chat. The timetable, schedule, and revision-plan creation interface has been removed from the page.

All generated answers use the owner's self-hosted model at `LOCAL_MODEL_ENDPOINT` (a complete OpenAI-compatible `/v1/chat/completions` URL). Parakh sends no LLM requests to Gemini, OpenAI, Anthropic, or another hosted model provider. If the endpoint is missing, unavailable, or returns no usable response, Parakh fails closed; it does not fall back to a paid/cloud LLM. For current-information, statutory, or explicitly requested searches, PARAKH retrieves public web results and includes source links in the response. The default search provider is Bing RSS; deployments may configure a self-hosted SearXNG JSON endpoint with `PARAKH_WEB_SEARCH_ENDPOINT`. Set `PARAKH_WEB_RESEARCH_ENABLED=false` to disable external web research. Web search is separate from model inference.

The chat page displays the source cards returned by the server. A lack of usable search results is disclosed; the assistant is instructed not to pretend it searched or cite sources it did not receive.

## Checked-copy experience

The student evaluation report now supports an in-page PDF preview using the existing authenticated checked-copy endpoint. The checked-copy generation and certification rules are unchanged; the preview is not a way around the existing review or certification gates.

Each evaluated question has two Ask PARAKH actions:
- **Why were marks cut?** explains the saved marks, recorded deduction reason, and question-level examiner feedback.
- **How can I improve?** provides a learning checklist and answer-writing suggestions based on the saved evaluation evidence.

The new `POST /api/student/evaluations/:id/ask-parakh` endpoint is student-only, checks disclaimer acknowledgement, verifies ownership of the evaluation, requires a finalized evaluation, and applies a per-student rate limit. It does not modify the result, the awarded marks, the checked PDF, or the recheck process.

## What “training” means at this stage

This release activates **retrieval-grounded tutoring (RAG-style generation)**: the owner's self-hosted model is given curated CA material and relevant web excerpts as context when generating an explanation. It does not update model weights and is not fine-tuning.

The separate model-training pipeline remains OFF. Student answer sheets are not exported as model-training examples. Fine-tuning requires, at minimum:
1. A reviewed privacy/legal basis and clear student disclosure/consent and exclusion handling.
2. De-identification and a controlled dataset export process.
3. Human-verified question-level reference answers and marking evidence.
4. A held-out benchmark split by student and source paper, including false-positive, omission, and partial-credit testing.
5. An administrator-approved go/no-go decision before any training job is enabled.

The admin PARAKH learning dashboard distinguishes active grounded tutor generation from disabled fine-tuning. Existing aggregate learning signals, when explicitly enabled, remain aggregate metadata and do not train or update model weights.

## Runtime configuration

- `LOCAL_MODEL_ENDPOINT`: required for generated answers; a self-hosted OpenAI-compatible chat-completions endpoint.
- `LOCAL_MODEL_NAME`: optional model identifier sent to the self-hosted inference service.
- `PARAKH_LOCAL_MODEL_TIMEOUT_MS`: optional request timeout (5–180 seconds).
- `PARAKH_WEB_RESEARCH_ENABLED`: defaults to enabled unless set to `false`.
- `PARAKH_WEB_SEARCH_ENDPOINT`: optional SearXNG JSON endpoint; blank uses Bing RSS.
- `PARAKH_CONVERSATION_LEARNING_ENABLED`: remains opt-in and is not required for tutor answers.

## Validation

Run:
- `npm run lint`
- `npm run build`
- `npm run test:study-planner`

Live browser/API checks still require a deployed environment with valid student test credentials and configured Gemini credentials.
