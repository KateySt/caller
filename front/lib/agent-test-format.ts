import { MediaDeviceFailure } from "livekit-client";
import {
  ApiError,
  type AgentTestEndReason,
  type AgentTestSessionDetail,
  type AgentTestStatus,
} from "@/lib/api";

/** Plain-language end reasons (front SPEC-05 AC-20). */
const END_REASON_TEXT: Record<AgentTestEndReason, string> = {
  admin_ended: "You ended the test",
  admin_disconnected: "Connection closed",
  agent_completed: "The agent ended the conversation",
  admin_unresponsive: "Ended after a period of silence",
  max_duration_reached: "Reached the maximum duration",
};

const STATUS_LABEL: Record<AgentTestStatus, string> = {
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
};

/** Explicit session status word for the history rows and detail (front SPEC-05 AC-24/AC-25). */
export function agentTestStatusLabel(status: AgentTestStatus): string {
  return STATUS_LABEL[status];
}

/** Why a finished test ended, or `null` while the backend still reports it as in progress. */
export function describeAgentTestEnd(
  session: Pick<AgentTestSessionDetail, "status" | "endReason" | "failureReason">,
): string | null {
  if (session.status === "in_progress") return null;
  if (session.status === "failed") return session.failureReason ?? "The test failed.";
  return session.endReason ? END_REASON_TEXT[session.endReason] : "The test ended.";
}

/** Admin turns are stored as `callee`; the UI always calls them "You". */
export function agentTestSpeaker(role: "callee" | "agent"): "You" | "Agent" {
  return role === "agent" ? "Agent" : "You";
}

export const INSECURE_CONTEXT_MESSAGE =
  "Microphone access requires HTTPS. Open this page over https:// (or on localhost) to test the agent in your browser.";

/** How to get the microphone working again (front SPEC-05 AC-15). */
export function describeMicrophoneFailure(failure: MediaDeviceFailure): string {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return "Microphone access is blocked for this site. Click the site icon at the left of the address bar, set Microphone to Allow, then start a new test.";
    case MediaDeviceFailure.NotFound:
      return "No microphone was found. Connect a microphone and check that your system sound settings can see it, then start a new test.";
    case MediaDeviceFailure.DeviceInUse:
      return "Your microphone could not be started — another app may be using it. Close that app, then start a new test.";
    default:
      return "Your microphone could not be started. Check that this site is allowed to use the microphone (site icon at the left of the address bar), then start a new test.";
  }
}

/** Specific messages for a failed session create (front SPEC-05 AC-12). */
export function describeCreateTestError(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "Another test session is already running.";
    if (error.status === 401) return "The admin key was missing or wrong — re-enter it.";
  }
  return error.message || "Could not start the test session.";
}
