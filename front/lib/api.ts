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

/** E.164, mirroring the backend's own rule: `+`, non-zero country digit, 6–14 more. */
export const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

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

export interface AgentSettings {
  systemPrompt: string;
  updatedAt: string;
}

export type CallStatus = "in_progress" | "completed" | "failed";
export type CallEndReason = "agent_completed" | "callee_hangup" | "max_duration_reached";

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

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    // A network failure has no status; the caller still gets something it can show.
    throw new ApiError("Could not reach the server. Is the backend running?", 0);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(payload, response.status), response.status);
  }

  return payload as T;
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
  listUsers(): Promise<User[]> {
    return requestJson<User[]>("/users");
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

  getAgentSettings(): Promise<AgentSettings> {
    return requestJson<AgentSettings>("/agent-settings");
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

  getCall(userId: string, callId: string): Promise<Call> {
    return requestJson<Call>(
      `/users/${encodeURIComponent(userId)}/calls/${encodeURIComponent(callId)}`,
    );
  },
};
