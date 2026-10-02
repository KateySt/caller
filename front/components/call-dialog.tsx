"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Call, User } from "@/lib/api";

interface CallDialogProps {
  user: User;
  /** The live/final call state, polled and owned by the parent (`UsersList`) so the
   * "in progress" lock on the row survives this dialog being closed and reopened. */
  call: Call;
  /** Id of the row button that opened this dialog, so focus returns there on close. */
  triggerId: string;
  onClose: () => void;
}

/**
 * Live view of a real outbound PSTN call placed by the AI agent (front SPEC-02 AC-1..AC-6).
 * Closing this dialog only hides the live view — the call itself keeps running
 * server-side and is tracked by the parent until it completes or fails.
 */
export function CallDialog({ user, call, triggerId, onClose }: CallDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} triggerId={triggerId}>
      <DialogContent className="sm:max-w-lg">
        <div className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Call {user.name}</DialogTitle>
            <DialogDescription>{describeCallStatus(call)}</DialogDescription>
          </DialogHeader>

          <div className="max-h-80 min-h-24 overflow-y-auto rounded-lg border p-3">
            {call.transcript.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {call.status === "in_progress"
                  ? "Calling… waiting for the first words of the conversation."
                  : "No conversation was recorded for this call."}
              </p>
            ) : (
              <ul className="grid gap-2">
                {call.transcript.map((turn, index) => (
                  <li key={index} className="grid gap-0.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {turn.role === "agent" ? "Agent" : user.name}
                    </span>
                    <p className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
                      {turn.text}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {call.status === "failed" && (
            <p role="alert" className="text-sm text-destructive">
              Call failed{call.failureReason ? `: ${call.failureReason}` : "."}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** AC-4: end condition in plain language; AC-5: the failure reason, if the backend gave one. */
function describeCallStatus(call: Call): string {
  if (call.status === "in_progress") {
    return "Call in progress…";
  }

  if (call.status === "failed") {
    return "Call failed.";
  }

  switch (call.endReason) {
    case "agent_completed":
      return "Call completed — the agent ended the conversation.";
    case "callee_hangup":
      return "Call completed — the contact hung up.";
    case "max_duration_reached":
      return "Call completed — the maximum call duration was reached.";
    default:
      return "Call completed.";
  }
}
