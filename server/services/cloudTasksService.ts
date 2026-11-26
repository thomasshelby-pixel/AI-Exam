import { CloudTasksClient } from '@google-cloud/tasks';
import { OAuth2Client } from 'google-auth-library';

export interface CloudTasksRuntimeConfig {
  projectId: string;
  location: string;
  queue: string;
  targetUrl: string;
  serviceAccountEmail: string;
  audience: string;
}

let tasksClient: CloudTasksClient | null = null;
let oauthClient: OAuth2Client | null = null;

function readConfig(): CloudTasksRuntimeConfig | null {
  const projectId = String(
    process.env.CLOUD_TASKS_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    '',
  ).trim();
  const location = String(process.env.CLOUD_TASKS_LOCATION || '').trim();
  const queue = String(process.env.CLOUD_TASKS_QUEUE || '').trim();
  const targetUrl = String(process.env.CLOUD_TASKS_TARGET_URL || '').trim();
  const serviceAccountEmail = String(process.env.CLOUD_TASKS_SERVICE_ACCOUNT || '').trim();

  if (!projectId || !location || !queue || !targetUrl || !serviceAccountEmail) return null;

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    throw new Error('CLOUD_TASKS_TARGET_URL must be a valid absolute HTTPS URL.');
  }
  if (parsedTarget.protocol !== 'https:') {
    throw new Error('CLOUD_TASKS_TARGET_URL must use HTTPS.');
  }
  if (!parsedTarget.pathname.endsWith('/internal/tasks/evaluation')) {
    throw new Error('CLOUD_TASKS_TARGET_URL must end with /internal/tasks/evaluation.');
  }
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/i.test(serviceAccountEmail)) {
    throw new Error('CLOUD_TASKS_SERVICE_ACCOUNT must be a Google Cloud service-account email.');
  }

  const audience = String(process.env.CLOUD_TASKS_OIDC_AUDIENCE || parsedTarget.origin).trim();
  return { projectId, location, queue, targetUrl, serviceAccountEmail, audience };
}

export function isCloudTasksConfigured(): boolean {
  return readConfig() !== null;
}

function getTasksClient(): CloudTasksClient {
  if (!tasksClient) tasksClient = new CloudTasksClient();
  return tasksClient;
}

/**
 * Creates one durable Cloud Tasks HTTP task for an evaluation.
 * A deterministic task name makes repeated submissions/status nudges idempotent.
 */
export async function enqueueCloudEvaluationTask(evaluationId: string): Promise<void> {
  const config = readConfig();
  if (!config) {
    throw new Error(
      'CLOUD_TASKS_NOT_CONFIGURED: Configure CLOUD_TASKS_PROJECT_ID, CLOUD_TASKS_LOCATION, CLOUD_TASKS_QUEUE, CLOUD_TASKS_TARGET_URL and CLOUD_TASKS_SERVICE_ACCOUNT before accepting production evaluations.',
    );
  }

  if (!/^[A-Za-z0-9_-]{1,180}$/.test(evaluationId)) {
    throw new Error('Invalid evaluation ID for Cloud Tasks.');
  }

  const client = getTasksClient();
  const parent = client.queuePath(config.projectId, config.location, config.queue);
  const taskName = client.taskPath(
    config.projectId,
    config.location,
    config.queue,
    'evaluation-' + evaluationId,
  );

  try {
    await client.createTask({
      parent,
      task: {
        name: taskName,
        httpRequest: {
          httpMethod: 'POST',
          url: config.targetUrl,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify({ evaluationId }), 'utf8').toString('base64'),
          oidcToken: {
            serviceAccountEmail: config.serviceAccountEmail,
            audience: config.audience,
          },
        },
        dispatchDeadline: { seconds: 300 },
        retryConfig: {
          maxAttempts: 100,
          maxRetryDuration: '86400s',
          minBackoff: '15s',
          maxBackoff: '300s',
          maxDoublings: 5,
        },
      } as any,
    });
  } catch (error: any) {
    const code = Number(error?.code);
    const message = String(error?.message || '');
    if (code === 6 || code === 409 || /ALREADY_EXISTS/i.test(message)) return;
    throw new Error(
      'CLOUD_TASK_ENQUEUE_FAILED: Could not schedule evaluation ' +
      evaluationId + ': ' + (message || 'Unknown Cloud Tasks error'),
    );
  }
}

/**
 * Verifies the OIDC token Cloud Tasks attaches to its HTTP request.
 * Do not use a shared custom header as the sole authentication mechanism.
 */
export async function verifyCloudTasksAuthorizationHeader(
  authorizationHeader: string | undefined,
): Promise<boolean> {
  const config = readConfig();
  if (!config || !authorizationHeader) return false;

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return false;

  try {
    if (!oauthClient) oauthClient = new OAuth2Client();
    const ticket = await oauthClient.verifyIdToken({
      idToken: match[1],
      audience: config.audience,
    });
    const payload = ticket.getPayload();
    return Boolean(
      payload?.email &&
      payload.email.toLowerCase() === config.serviceAccountEmail.toLowerCase() &&
      payload.email_verified !== false,
    );
  } catch (error) {
    console.warn('[CloudTasks] Rejected task request with invalid OIDC token:', error);
    return false;
  }
}

export function getCloudTasksRuntimeConfigForDiagnostics(): Omit<CloudTasksRuntimeConfig, 'serviceAccountEmail'> | null {
  const config = readConfig();
  if (!config) return null;
  return {
    projectId: config.projectId,
    location: config.location,
    queue: config.queue,
    targetUrl: config.targetUrl,
    audience: config.audience,
  };
}
