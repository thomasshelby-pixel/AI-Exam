# Request-based evaluation worker: Cloud Tasks setup

The production app uses Cloud Tasks to run evaluations reliably with Cloud Run request-based CPU allocation. The student upload request persists the durable job and enqueues a small Cloud Task. The \`/internal/tasks/evaluation\` HTTP handler verifies Cloud Tasks' OIDC identity and awaits the evaluation worker before returning a response.

## Required environment variables

Set these on the Firebase App Hosting backend (Runtime availability):

| Variable | Value |
|---|---|
| \`CLOUD_TASKS_PROJECT_ID\` | Google Cloud project ID containing the queue |
| \`CLOUD_TASKS_LOCATION\` | Queue region; the current service region is \`asia-southeast1\` |
| \`CLOUD_TASKS_QUEUE\` | Queue ID, e.g. \`ca-exam-evaluations\` |
| \`CLOUD_TASKS_TARGET_URL\` | HTTPS default Cloud Run \`run.app\` URL ending in \`/internal/tasks/evaluation\` |
| \`CLOUD_TASKS_SERVICE_ACCOUNT\` | Dedicated task-invoker service account email |
| \`CLOUD_TASKS_OIDC_AUDIENCE\` | Optional; defaults to the HTTPS origin of \`CLOUD_TASKS_TARGET_URL\` |

Use the service's default \`run.app\` URL, not the public website domain, for the task target. Keep the target URL and OIDC audience aligned with the deployed service.

## One-time Google Cloud setup

Run these commands in Cloud Shell after replacing the project and service-account values:

\`\`\`bash
PROJECT_ID="YOUR_PROJECT_ID"
REGION="asia-southeast1"
QUEUE_ID="ca-exam-evaluations"
TASK_SA="ca-exam-task-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com"
APP_RUNTIME_SA="YOUR_APP_HOSTING_RUNTIME_SERVICE_ACCOUNT"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
TASKS_AGENT="service-\${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com"

gcloud services enable cloudtasks.googleapis.com --project "$PROJECT_ID"

gcloud tasks queues create "$QUEUE_ID" \\
  --location "$REGION" \\
  --project "$PROJECT_ID" \\
  --max-attempts 100 \\
  --max-retry-duration 86400s \\
  --min-backoff 15s \\
  --max-backoff 300s \\
  --max-doublings 5 \\
  --max-concurrent-dispatches 3 \\
  --max-dispatches-per-second 1

gcloud iam service-accounts create ca-exam-task-invoker \\
  --project "$PROJECT_ID" \\
  --display-name "CA Exam Checker evaluation task invoker"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \\
  --member="serviceAccount:$APP_RUNTIME_SA" \\
  --role="roles/cloudtasks.enqueuer"

gcloud run services add-iam-policy-binding caexamcheckerai-prod \\
  --region "$REGION" \\
  --project "$PROJECT_ID" \\
  --member="serviceAccount:$TASK_SA" \\
  --role="roles/run.invoker"

gcloud iam service-accounts add-iam-policy-binding "$TASK_SA" \\
  --project "$PROJECT_ID" \\
  --member="serviceAccount:$TASKS_AGENT" \\
  --role="roles/iam.serviceAccountUser"
\`\`\`

If the Cloud Tasks service agent does not exist yet, enable the Cloud Tasks API first and allow Google Cloud to provision it. Verify that it has the Cloud Tasks Service Agent role. The task service account must be in the same project as the queue.

## Runtime behavior

- Each task contains only the evaluation ID; the large answer sheet and source materials remain in durable Cloud Storage / Firestore.
- The worker handler keeps the HTTP request open until evaluation processing and final status persistence finish.
- Cloud Tasks retries non-2xx responses and request timeouts. The existing Firestore lease is the single-writer guard across retries.
- The task request dispatch deadline is 300 seconds, matching the App Hosting / Cloud Run request timeout.
- Status polling uses bounded exponential backoff and stops after the configured polling attempts. A student can explicitly restart status checks; this does not resubmit the evaluation.
- The legacy in-process recovery loop is disabled when Cloud Tasks is configured.

## Rollout order

1. Create the queue and service account; apply IAM permissions.
2. Set the App Hosting runtime environment variables and redeploy.
3. Confirm the task handler accepts a valid Cloud Tasks OIDC identity and rejects unauthenticated requests.
4. Submit one controlled test evaluation and verify Cloud Tasks shows a successful dispatch and the evaluation reaches a terminal status.
5. Only then rely on request-based CPU allocation for production evaluation traffic.

If Cloud Tasks configuration is missing in production, enqueue fails closed: the app does not falsely acknowledge a job that has no request-bound worker.
