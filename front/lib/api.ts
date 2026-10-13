/**
 * Thin typed client for the NestJS API in `../back`. Every call goes over HTTP —
 * the backend is not part of this project's dependency tree.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api";

export const MAX_MESSAGE_LENGTH = 4096;

export const MAX_SMS_LENGTH = 1600;

export const MAX_NAME_LENGTH = 255;

export const MAX_SYSTEM_PROMPT_LENGTH = 8000;

export interface User {
  id: string;
  name: string;
  phoneNumber: string;
  createdAt: string;
}

export type DeliveryMode = "freeform" | "template";

export interface SendMessageResult {
  deliveryMode: DeliveryMode;
}

export interface WhatsAppMessage {
  id: string;
  phoneNumber: string;
  content: string;
  deliveryMode: DeliveryMode;
  status: "sent" | "failed";
  createdAt: string;
}

export interface SmsMessage {
  id: string;
  phoneNumber: string;
  body: string;
  status: "sent" | "failed";
  createdAt: string;
}

export type TelegramStatus = "not_linked" | "linked" | "opted_out" | "unreachable";

export interface TelegramStatusInfo {
  status: TelegramStatus;
  linkedAt: string | null;
  optedOutAt: string | null;
  unreachableAt: string | null;
  /** An unused, unexpired invitation exists (the raw link itself is never retrievable). */
  hasPendingInvite: boolean;
}

export interface TelegramInvite {
  link: string;
  expiresAt: string;
  status: TelegramStatusInfo;
}

export interface TelegramMessage {
  id: string;
  direction: "inbound" | "outbound";
  /** `text`, or a placeholder kind for non-text content (`photo`, `voice`, ...). */
  contentType: string;
  text: string | null;
  status: "received" | "sent" | "failed";
  failureReason: string | null;
  occurredAt: string;
}

export interface TelegramMessagePage {
  /** Oldest first. */
  messages: TelegramMessage[];
  hasMore: boolean;
}

export interface AgentSettings {
  systemPrompt: string;
  updatedAt: string;
}

export type CallStatus = "in_progress" | "completed" | "failed";
export type CallEndReason =
  | "agent_completed"
  | "callee_hangup"
  | "callee_unresponsive"
  | "max_duration_reached";

export interface CallTranscriptTurn {
  role: "callee" | "agent";
  text: string;
  at: string;
}

export interface Call {
  id: string;
  phoneNumber: string;
  status: CallStatus;
  endReason: CallEndReason | null;
  failureReason: string | null;
  transcript: CallTranscriptTurn[];
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

export type AgentTestStatus = "in_progress" | "completed" | "failed";
export type AgentTestEndReason =
  | "admin_ended"
  | "admin_disconnected"
  | "agent_completed"
  | "admin_unresponsive"
  | "max_duration_reached";
export type PromptSource = "saved" | "draft";

/** Admin turns are stored with role `callee`; the UI labels them "You". */
export interface AgentTestTranscriptTurn {
  role: "callee" | "agent";
  text: string;
  at: string;
}

/** One row of the test-session history (no transcript, prompt truncated). */
export interface AgentTestSessionSummary {
  id: string;
  status: AgentTestStatus;
  endReason: AgentTestEndReason | null;
  failureReason: string | null;
  promptSource: PromptSource;
  promptPreview: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

export interface AgentTestSessionDetail {
  id: string;
  status: AgentTestStatus;
  endReason: AgentTestEndReason | null;
  failureReason: string | null;
  promptSource: PromptSource;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  systemPrompt: string;
  transcript: AgentTestTranscriptTurn[];
}

export interface CreatedAgentTestSession {
  session: AgentTestSessionDetail;
  server_url: string;
  participant_token: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Lets TanStack Query cancel an in-flight read when its observer unmounts or its key changes. */
export interface RequestOptions {
  signal?: AbortSignal;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (error) {
    // A cancelled request is not a connectivity problem — let the caller see the abort.
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    // A network failure has no status; the caller still gets something it can show.
    throw new ApiError("Could not reach the server. Is the backend running?", 0);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(payload, response.status), response.status);
  }

  return payload as T;
}

/** Agent-test routes are admin-only; the secret travels in a header, never a URL or key. */
function adminHeaders(adminToken: string): Record<string, string> {
  return { "X-Admin-Token": adminToken };
}

/** Unwraps the `{ statusCode, message }` envelope produced by `AllExceptionsFilter`. */
function extractErrorMessage(payload: unknown, status: number): string {
  const message = (payload as { message?: unknown } | null)?.message;
  const inner = (message as { message?: unknown } | null)?.message ?? message;

  if (Array.isArray(inner) && inner.length > 0) {
    return inner.join(", ");
  }
  if (typeof inner === "string" && inner.length > 0) {
    return inner;
  }

  return `Request failed with status ${status}`;
}

export interface CreateUserInput {
  name: string;
  phoneNumber: string;
}

export interface UpdateUserInput {
  name?: string;
  phoneNumber?: string;
}

export const api = {
  listUsers({ signal }: RequestOptions = {}): Promise<User[]> {
    return requestJson<User[]>("/users", { signal });
  },

  createUser(input: CreateUserInput): Promise<User> {
    return requestJson<User>("/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateUser(userId: string, input: UpdateUserInput): Promise<User> {
    return requestJson<User>(`/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async sendMessage(userId: string, body: string): Promise<SendMessageResult> {
    const result = await requestJson<SendMessageResult>(
      `/users/${encodeURIComponent(userId)}/messages`,
      { method: "POST", body: JSON.stringify({ body }) },
    );

    // An unrecognised delivery mode must not be reported as a successful send —
    // the whole point of the field is telling the operator what the contact got.
    if (result?.deliveryMode !== "freeform" && result?.deliveryMode !== "template") {
      throw new ApiError("The server returned an unexpected response.", 0);
    }

    return result;
  },

  listWhatsAppMessages(userId: string): Promise<WhatsAppMessage[]> {
    return requestJson<WhatsAppMessage[]>(
      `/users/${encodeURIComponent(userId)}/whatsapp-messages`,
    );
  },

  sendSms(userId: string, body: string): Promise<SmsMessage> {
    return requestJson<SmsMessage>(`/users/${encodeURIComponent(userId)}/sms-messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  },

  listSmsMessages(userId: string): Promise<SmsMessage[]> {
    return requestJson<SmsMessage[]>(`/users/${encodeURIComponent(userId)}/sms-messages`);
  },

  getTelegramStatus(userId: string, { signal }: RequestOptions = {}): Promise<TelegramStatusInfo> {
    return requestJson<TelegramStatusInfo>(`/users/${encodeURIComponent(userId)}/telegram`, {
      signal,
    });
  },

  createTelegramInvite(userId: string): Promise<TelegramInvite> {
    return requestJson<TelegramInvite>(
      `/users/${encodeURIComponent(userId)}/telegram-invite`,
      { method: "POST" },
    );
  },

  listTelegramMessages(
    userId: string,
    options: { limit?: number; before?: string } & RequestOptions = {},
  ): Promise<TelegramMessagePage> {
    const query = new URLSearchParams();
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    if (options.before !== undefined) query.set("before", options.before);
    const suffix = query.size > 0 ? `?${query}` : "";

    return requestJson<TelegramMessagePage>(
      `/users/${encodeURIComponent(userId)}/telegram-messages${suffix}`,
      { signal: options.signal },
    );
  },

  sendTelegramMessage(userId: string, text: string): Promise<TelegramMessage> {
    return requestJson<TelegramMessage>(
      `/users/${encodeURIComponent(userId)}/telegram-messages`,
      { method: "POST", body: JSON.stringify({ text }) },
    );
  },

  async deleteTelegramMessages(userId: string): Promise<void> {
    await requestJson<null>(`/users/${encodeURIComponent(userId)}/telegram-messages`, {
      method: "DELETE",
    });
  },

  getAgentSettings({ signal }: RequestOptions = {}): Promise<AgentSettings> {
    return requestJson<AgentSettings>("/agent-settings", { signal });
  },

  updateAgentSettings(systemPrompt: string): Promise<AgentSettings> {
    return requestJson<AgentSettings>("/agent-settings", {
      method: "PUT",
      body: JSON.stringify({ systemPrompt }),
    });
  },

  placeCall(userId: string): Promise<Call> {
    return requestJson<Call>(`/users/${encodeURIComponent(userId)}/calls`, {
      method: "POST",
    });
  },

  listCalls(userId: string): Promise<Call[]> {
    return requestJson<Call[]>(`/users/${encodeURIComponent(userId)}/calls`);
  },

  getCall(userId: string, callId: string, { signal }: RequestOptions = {}): Promise<Call> {
    return requestJson<Call>(
      `/users/${encodeURIComponent(userId)}/calls/${encodeURIComponent(callId)}`,
      { signal },
    );
  },

  createAgentTestSession(
    systemPrompt: string,
    adminToken: string,
  ): Promise<CreatedAgentTestSession> {
    return requestJson<CreatedAgentTestSession>("/agent-tests", {
      method: "POST",
      headers: adminHeaders(adminToken),
      body: JSON.stringify({ systemPrompt }),
    });
  },

  async endAgentTestSession(id: string, adminToken: string): Promise<void> {
    await requestJson<null>(`/agent-tests/${encodeURIComponent(id)}/end`, {
      method: "POST",
      headers: adminHeaders(adminToken),
    });
  },

  listAgentTestSessions(
    adminToken: string,
    { signal }: RequestOptions = {},
  ): Promise<AgentTestSessionSummary[]> {
    return requestJson<AgentTestSessionSummary[]>("/agent-tests", {
      headers: adminHeaders(adminToken),
      signal,
    });
  },

  getAgentTestSession(
    id: string,
    adminToken: string,
    { signal }: RequestOptions = {},
  ): Promise<AgentTestSessionDetail> {
    return requestJson<AgentTestSessionDetail>(`/agent-tests/${encodeURIComponent(id)}`, {
      headers: adminHeaders(adminToken),
      signal,
    });
  },
};
