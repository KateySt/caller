"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, MAX_SMS_LENGTH, type User } from "@/lib/api";

interface SendSmsDialogProps {
  user: User;
  /** Id of the row button that opened this dialog, so focus returns there on close. */
  triggerId: string;
  onClose: () => void;
}

/**
 * Mirrors `SendMessageDialog`'s state machine, but for the SMS channel — there's no
 * freeform/template distinction to surface, every SMS goes out as typed (SPEC-01 AC-30).
 */
export function SendSmsDialog({ user, triggerId, onClose }: SendSmsDialogProps) {
  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const fieldId = useId();
  const errorId = useId();

  function handleOpenChange(open: boolean) {
    if (!open && !isSending) {
      onClose();
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = body.trim();
    if (trimmed.length === 0) {
      setValidationError("Enter a message before sending.");
      return;
    }
    if (trimmed.length > MAX_SMS_LENGTH) {
      setValidationError(
        `Message is ${trimmed.length} characters — the limit is ${MAX_SMS_LENGTH}.`,
      );
      return;
    }

    setValidationError(null);
    setIsSending(true);
    try {
      await api.sendSms(user.id, trimmed);

      toast.success(`SMS sent to ${user.name}.`);
      onClose();
    } catch (error) {
      // The dialog stays open and the draft is untouched so the send can be retried.
      toast.error(error instanceof Error ? error.message : "Could not send the SMS.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange} triggerId={triggerId}>
      <DialogContent showCloseButton={!isSending}>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>SMS {user.name}</DialogTitle>
            <DialogDescription>Sent as plain text to {user.phoneNumber}.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <label htmlFor={fieldId} className="text-sm font-medium">
              Message
            </label>
            <Textarea
              id={fieldId}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onInput={() => setValidationError(null)}
              disabled={isSending}
              rows={4}
              autoFocus
              placeholder="Type your message…"
              aria-invalid={validationError !== null}
              aria-describedby={validationError ? errorId : undefined}
            />
            <div className="flex items-start justify-between gap-2 text-sm">
              <p id={errorId} role="alert" className="text-destructive">
                {validationError}
              </p>
              <span
                className={
                  body.trim().length > MAX_SMS_LENGTH
                    ? "shrink-0 tabular-nums text-destructive"
                    : "shrink-0 tabular-nums text-muted-foreground"
                }
              >
                {body.trim().length}/{MAX_SMS_LENGTH}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSending}>
              {isSending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
