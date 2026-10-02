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
import { api, MAX_MESSAGE_LENGTH, type User } from "@/lib/api";

interface SendMessageDialogProps {
  user: User;
  /** Id of the row button that opened this dialog, so focus returns there on close. */
  triggerId: string;
  onClose: () => void;
}

/**
 * Mounted only while open and keyed by user id, so every open starts from a clean
 * `idle` state with an empty field — including when the operator switches contacts.
 */
export function SendMessageDialog({ user, triggerId, onClose }: SendMessageDialogProps) {
  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const fieldId = useId();
  const errorId = useId();

  function handleOpenChange(open: boolean) {
    // While a send is in flight the dialog is not dismissible — not by Escape,
    // not by an outside press, not by Cancel.
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
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setValidationError(
        `Message is ${trimmed.length} characters — the limit is ${MAX_MESSAGE_LENGTH}.`,
      );
      return;
    }

    setValidationError(null);
    setIsSending(true);
    try {
      const { deliveryMode } = await api.sendMessage(user.id, trimmed);

      if (deliveryMode === "freeform") {
        toast.success(`Message sent to ${user.name}.`);
      } else {
        toast.warning(
          `${user.name} hasn't messaged in the last 24 hours, so WhatsApp only allowed a ` +
            `template notification — your text was not delivered.`,
        );
      }
      onClose();
    } catch (error) {
      // The dialog stays open and the draft is untouched so the send can be retried.
      toast.error(error instanceof Error ? error.message : "Could not send the message.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange} triggerId={triggerId}>
      <DialogContent showCloseButton={!isSending}>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Message {user.name}</DialogTitle>
            <DialogDescription>
              Sent over WhatsApp to {user.phoneNumber}.
            </DialogDescription>
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
                  body.trim().length > MAX_MESSAGE_LENGTH
                    ? "shrink-0 tabular-nums text-destructive"
                    : "shrink-0 tabular-nums text-muted-foreground"
                }
              >
                {body.trim().length}/{MAX_MESSAGE_LENGTH}
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
