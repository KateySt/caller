/**
 * The agent's only link to call state: `back/`'s `/internal/calls` API (PSTN calls) and
 * `/internal/agent-tests` API (browser test sessions, SPEC-06), authenticated with the shared
 * `AGENT_INTERNAL_TOKEN`. The agent runs on LiveKit Cloud and has no database access.
 */

/** What a job is for, as identified by its dispatch metadata. */
export type JobTarget = { kind: 'call'; id: string } | { kind: 'test'; id: string };

export type CallStatus = 'in_progress' | 'completed' | 'failed';
export type CallEndReason =
  | 'agent_completed'
  | 'callee_hangup'
  | 'callee_unresponsive'
  | 'max_duration_reached';
/** Call end reasons plus the test-session-only ones. */
export type EndReason = CallEndReason | 'admin_disconnected' | 'admin_unresponsive';

export interface AgentCallContext {
  id: string;
  status: CallStatus;
  systemPrompt: string;
}

export interface TranscriptTurn {
  /** Per-call counter; the backend dedupes on it, so retries are safe. */
  seq: number;
  role: 'callee' | 'agent';
  text: string;
  /** ISO 8601 timestamp. */
  at: string;
}

export type CallOutcome =
  | { status: 'completed'; endReason: EndReason }
  | { status: 'failed'; failureReason: string };

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 300;

export class BackendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

export class BackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  /** `null` when the backend has no such call / test session. */
  async getContext(target: JobTarget): Promise<AgentCallContext | null> {
    try {
      const response = await this.request('GET', basePath(target));

      return (await response.json()) as AgentCallContext;
    } catch (error) {
      if (error instanceof BackendError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async appendTranscriptTurn(target: JobTarget, turn: TranscriptTurn): Promise<void> {
    await this.request('POST', `${basePath(target)}/transcript`, turn);
  }

  /** Idempotent on the backend: the first outcome recorded for a call / test session wins. */
  async end(target: JobTarget, outcome: CallOutcome): Promise<void> {
    await this.request('POST', `${basePath(target)}/end`, outcome);
  }

  /** Retries network errors, timeouts, 429 and 5xx with exponential backoff; 4xx fail fast. */
  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (response.ok) {
          return response;
        }

        const error = new BackendError(
          `${method} ${path} -> ${response.status} ${await response.text()}`,
          response.status,
        );
        if (response.status !== 429 && response.status < 500) {
          throw error;
        }
        lastError = error;
      } catch (error) {
        // Only non-retryable responses are thrown above; anything else is network/timeout.
        if (error instanceof BackendError) {
          throw error;
        }
        lastError = error;
      }

      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }

    throw lastError instanceof Error ? lastError : new BackendError(String(lastError));
  }
}

function basePath(target: JobTarget): string {
  return target.kind === 'call'
    ? `/internal/calls/${target.id}`
    : `/internal/agent-tests/${target.id}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
