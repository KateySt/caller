import type { Call, SmsMessage, WhatsAppMessage } from "@/lib/api";

interface UserActivityTimelineProps {
  calls: Call[] | null;
  whatsappMessages: WhatsAppMessage[] | null;
  smsMessages: SmsMessage[] | null;
}

type TimelineEntry =
  | { id: string; type: "call"; timestamp: string; call: Call }
  | { id: string; type: "whatsapp"; timestamp: string; message: WhatsAppMessage }
  | { id: string; type: "sms"; timestamp: string; message: SmsMessage };

/**
 * A single chronological, most-recent-first merge of a user's calls and WhatsApp/SMS
 * history (front SPEC-02 AC-14..AC-18). Each source that failed to load is reported on
 * its own, without hiding the sections that did load (AC-18).
 */
export function UserActivityTimeline({
  calls,
  whatsappMessages,
  smsMessages,
}: UserActivityTimelineProps) {
  const entries: TimelineEntry[] = [
    ...(calls ?? []).map(
      (call): TimelineEntry => ({ id: `call-${call.id}`, type: "call", timestamp: call.startedAt, call }),
    ),
    ...(whatsappMessages ?? []).map(
      (message): TimelineEntry => ({
        id: `whatsapp-${message.id}`,
        type: "whatsapp",
        timestamp: message.createdAt,
        message,
      }),
    ),
    ...(smsMessages ?? []).map(
      (message): TimelineEntry => ({
        id: `sms-${message.id}`,
        type: "sms",
        timestamp: message.createdAt,
        message,
      }),
    ),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const hasAnyFailure = calls === null || whatsappMessages === null || smsMessages === null;

  return (
    <div className="grid gap-4">
      {calls === null && <SectionError label="calls" />}
      {whatsappMessages === null && <SectionError label="WhatsApp messages" />}
      {smsMessages === null && <SectionError label="SMS messages" />}

      {entries.length === 0 ? (
        !hasAnyFailure && (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No calls or messages yet.
          </p>
        )
      ) : (
        <ul className="grid gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border p-4">
              {entry.type === "call" && <CallEntry call={entry.call} />}
              {entry.type === "whatsapp" && <MessageEntry channel="WhatsApp" message={entry.message} />}
              {entry.type === "sms" && <MessageEntry channel="SMS" message={entry.message} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionError({ label }: { label: string }) {
  return (
    <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Could not load {label}. Reload the page to try again.
    </p>
  );
}

function CallEntry({ call }: { call: Call }) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Call</span>
        <span className="text-xs text-muted-foreground">{formatDateTime(call.startedAt)}</span>
      </div>

      <p className={`text-sm ${call.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
        {describeCallStatus(call)}
      </p>

      {call.durationSeconds !== null && (
        <p className="text-xs text-muted-foreground">Duration: {formatDuration(call.durationSeconds)}</p>
      )}

      {call.transcript.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/50 p-2">
          <ul className="grid gap-1.5">
            {call.transcript.map((turn, index) => (
              <li key={index} className="text-sm">
                <span className="font-medium text-muted-foreground">
                  {turn.role === "agent" ? "Agent: " : "Them: "}
                </span>
                <span className="whitespace-pre-wrap">{turn.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MessageEntry({ channel, message }: { channel: "WhatsApp" | "SMS"; message: WhatsAppMessage | SmsMessage }) {
  const body = "content" in message ? message.content : message.body;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{channel}</span>
        <span className="text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</span>
      </div>

      <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">{body}</p>

      <p className={`text-xs ${message.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
        {message.status === "failed" ? "Failed to send" : "Sent"}
        {"deliveryMode" in message && message.deliveryMode === "template" ? " (template fallback)" : ""}
      </p>
    </div>
  );
}

function describeCallStatus(call: Call): string {
  if (call.status === "in_progress") {
    return "In progress…";
  }
  if (call.status === "failed") {
    return `Failed${call.failureReason ? `: ${call.failureReason}` : ""}`;
  }

  switch (call.endReason) {
    case "agent_completed":
      return "Completed — the agent ended the conversation.";
    case "callee_hangup":
      return "Completed — the contact hung up.";
    case "max_duration_reached":
      return "Completed — the maximum call duration was reached.";
    default:
      return "Completed.";
  }
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
