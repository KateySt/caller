"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CharacterCounter, FormField } from "@/components/form-field";
import { api, MAX_MESSAGE_LENGTH, type TelegramMessage, type TelegramStatus } from "@/lib/api";
import {
  sendTelegramMessageSchema,
  type SendTelegramMessageInput,
  type SendTelegramMessageValues,
} from "@/lib/schemas/telegram";

/** Why the composer is disabled, per status (front SPEC-03 AC-13). */
const DISABLED_REASON: Record<Exclude<TelegramStatus, "linked">, string> = {
  not_linked: "The client has not opened the bot yet. Generate a link and send it to them.",
  opted_out:
    "The client stopped messages with /stop. Only the client can resume, by sending /start to the bot. You cannot re-enable it, and generating a new link is not required.",
  unreachable:
    "The client blocked the bot. Sending resumes automatically once they unblock the bot or send /start.",
};

interface TelegramComposerProps {
  userId: string;
  status: TelegramStatus;
  onSent: (message: TelegramMessage) => void;
  /** Called after a failed send so the parent can refresh status/history (AC-17). */
  onSendFailed: () => void;
  /** Lets the parent block closing and "Delete history" while a send is in flight (AC-15, AC-20). */
  onSubmittingChange: (isSubmitting: boolean) => void;
}

export function TelegramComposer({
  userId,
  status,
  onSent,
  onSendFailed,
  onSubmittingChange,
}: TelegramComposerProps) {
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SendTelegramMessageInput, unknown, SendTelegramMessageValues>({
    resolver: zodResolver(sendTelegramMessageSchema),
    defaultValues: { text: "" },
  });

  useEffect(() => {
    onSubmittingChange(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const isLinked = status === "linked";
  const disabledReason = isLinked ? null : DISABLED_REASON[status];
  const length = (useWatch({ control, name: "text" }) ?? "").trim().length;

  const submit = handleSubmit(async ({ text }) => {
    try {
      onSent(await api.sendTelegramMessage(userId, text));
      reset(); // AC-16
    } catch (error) {
      // The typed text stays in the field (AC-17).
      toast.error(error instanceof Error ? error.message : "Could not send the message.");
      onSendFailed();
    }
    // Disabling during the send dropped focus; give it back once enabled again.
    requestAnimationFrame(() => setFocus("text"));
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-2">
      <FormField
        label="Message"
        error={errors.text?.message}
        hint={disabledReason ?? undefined}
        counter={<CharacterCounter length={length} max={MAX_MESSAGE_LENGTH} />}
      >
        {(controlProps) => (
          <Textarea
            {...controlProps}
            {...register("text")}
            rows={3}
            placeholder="Type your message…"
            disabled={!isLinked || isSubmitting}
          />
        )}
      </FormField>
      <div className="flex justify-end">
        <Button type="submit" disabled={!isLinked || isSubmitting}>
          {isSubmitting ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
