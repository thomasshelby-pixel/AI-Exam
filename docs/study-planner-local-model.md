# Self-hosted Study Planner language model

The Study Planner can optionally use an Ollama-compatible model for ordinary study guidance and concept explanations. It does not use Gemini, OpenAI, Anthropic, or a per-message hosted-model API.

## Model candidate

The default model is `qwen3:4b-instruct`. The Ollama quantized download is approximately 2.5 GB. Qwen3 is listed under the Apache 2.0 license; review the model card and license before changing model versions.

## Important deployment boundary

The production Firebase App Hosting backend currently runs with 1 CPU and 1024 MiB of memory. Do not download or load the model inside that application container. Run Ollama on a separate machine or inference service with enough RAM/VRAM, then connect the application to that service over a private network or authenticated TLS endpoint.

A model's weights being free does not make inference compute free. Self-hosting removes per-token provider billing, but the machine, electricity, bandwidth and availability still have costs. A machine that is switched off cannot answer production chat requests.

## Run Ollama on a separate host

Install Ollama on the chosen host, then pull the model:

```bash
ollama pull qwen3:4b-instruct
```

Start Ollama so it is reachable from the application over the host's private network. Do not expose port 11434 directly to the public internet. Put the service behind private networking or a TLS reverse proxy with authentication and restrict inbound access to the application.

## Configure Firebase App Hosting

Set these variables as runtime environment variables for the App Hosting backend:

- `STUDY_PLANNER_LLM_BASE_URL`: the Ollama host root URL, for example `https://ollama.internal.example`. Do not include `/api/chat`.
- `STUDY_PLANNER_LLM_MODEL`: model name; defaults to `qwen3:4b-instruct`.
- `STUDY_PLANNER_LLM_TIMEOUT_MS`: optional request timeout from 1000 to 90000 milliseconds; defaults to 30000.
- `STUDY_PLANNER_LLM_API_KEY`: optional bearer token when the reverse proxy requires one. Store it in Secret Manager, not source control.

Do not set the base URL to `localhost` in App Hosting: that would refer to the app container, not the separate Ollama machine.

## Runtime behavior and safety

- Only ordinary general-study guidance calls the optional model. Existing timetable generation, chapter assessments, and save/progress workflows remain deterministic and separate.
- The authenticated student's saved course is passed to the model; the client cannot override it.
- The last six conversation entries are passed as chat context.
- If the endpoint is not configured or the request fails/times out, the existing deterministic response is returned.
- The model prompt instructs the assistant not to invent current ICAI amendments, statutory rates, section numbers, or saved actions. It is still a language model: verify legal/tax answers against the applicable ICAI material.
- Conversation context is currently supplied by the browser session; this integration does not add persistent chat history.

## Validation

Run:

```bash
npm run test:study-planner
```
