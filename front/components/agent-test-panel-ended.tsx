"use client";

import type { MediaDeviceFailure } from "livekit-client";
import { Button } from "@/components/ui/button";
import { AgentTestTranscript } from "@/components/agent-test-panel-transcript";
import type { AgentTestSessionDetail } from "@/lib/api";
import {
  agentTestSpeaker,
  describeAgentTestEnd,
  describeMicrophoneFailure,
  INSECURE_CONTEXT_MESSAGE,
} from "@/lib/agent-test-format";

/** How the browser side of a test session finished (the backend's end reason is separate). */
export type AgentTestRoomOutcome =
  /**
   * `intentional`: we ended it ("End test", or after the backend reported the end).
   * `server`: the backend deleted the room because the session ended (DisconnectReason.ROOM_DELETED).
   * `lost`: any other drop (AC-21).
   */
  | { kind: "closed"; cause: "intentional" | "server" | "lost" }
  | { kind: "connect-failed"; message: string }
  | { kind: "mic-failed"; failure: MediaDeviceFailure }
  | { kind: "insecure" };

interface AgentTestEndedViewProps {
  outcome: AgentTestRoomOutcome;
  /** The backend's record — the source of truth for the end reason and final transcript. */
  detail: AgentTestSessionDetail;
  /** Set when telling the backend the test ended failed. */
  endError: Error | null;
  /** False until the backend has the session closed, so a new start can't hit the one-session 409. */
  canStartNew: boolean;
  onStartNew: () => void;
}

/** Ended state: plain-language end reason, final transcript, "Start new test" (front SPEC-05 AC-18/20/21). */
export function AgentTestEndedView({
  outcome,
  detail,
  endError,
  canStartNew,
  onStartNew,
}: AgentTestEndedViewProps) {
  const endReason = describeAgentTestEnd(detail);
  const problem = describeProblem(outcome);

  return (
    <div className="grid gap-4">
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}

      <p className="text-sm">
        {endReason ?? interimStatus(outcome)}
        {endReason && "."}
      </p>

      {endError && (
        <p role="alert" className="text-sm text-destructive">
          The server could not be told the test ended: {endError.message}
        </p>
      )}

      <AgentTestTranscript
        lines={detail.transcript.map((turn, index) => ({
          key: `${index}-${turn.at}`,
          speaker: agentTestSpeaker(turn.role),
          text: turn.text,
        }))}
        emptyText={
          detail.status === "in_progress"
            ? "Waiting for the final transcript…"
            : "No conversation was recorded for this test."
        }
      />

      <div className="flex justify-end">
        <Button type="button" disabled={!canStartNew} onClick={onStartNew}>
          Start new test
        </Button>
      </div>
    </div>
  );
}

function describeProblem(outcome: AgentTestRoomOutcome): string | null {
  switch (outcome.kind) {
    case "insecure":
      return INSECURE_CONTEXT_MESSAGE;
    case "mic-failed":
      return describeMicrophoneFailure(outcome.failure);
    case "connect-failed":
      return `Could not connect to the test room: ${outcome.message}`;
    case "closed":
      // AC-21: an unexpected drop is reported, never silently reconnected with the old token.
      return outcome.cause === "lost"
        ? "The connection to the test room was lost. Start a new test to try again."
        : null;
  }
}

/** Shown until the backend (polled while `in_progress`) records how the session ended. */
function interimStatus(outcome: AgentTestRoomOutcome): string {
  return outcome.kind === "closed" && outcome.cause === "lost"
    ? "Waiting for the server to close the session…"
    : "Ending the test…";
}
