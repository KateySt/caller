"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { CharacterCounter, FormField } from "@/components/form-field";
import { api, MAX_SMS_LENGTH, type User } from "@/lib/api";
import { sendSmsSchema, type MessageBodyInput, type MessageBodyValues } from "@/lib/schemas/messages";

interface SendSmsDialogProps {
  user: User;
  /** Id of the row button that opened this dialog, so focus returns there on close. */
  triggerId: string;
  onClose: () => void;
}

/**
 * Mirrors `SendMessageDialog`, but for the SMS channel — there's no freeform/template
 * distinction to surface, every SMS goes out as typed (SPEC-01 AC-30).
 */
export function SendSmsDialog({ user, triggerId, onClose }: SendSmsDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MessageBodyInput, unknown, MessageBodyValues>({
    resolver: zodResolver(sendSmsSchema),
    defaultValues: { body: "" },
  });
  const length = (useWatch({ control, name: "body" }) ?? "").trim().length;

  function handleOpenChange(open: boolean) {
    if (!open && !isSubmitting) {
      onClose();
    }
  }

  const submit = handleSubmit(async ({ body }) => {
    try {
      await api.sendSms(user.id, body);

      toast.success(`SMS sent to ${user.name}.`);
      onClose();
    } catch (error) {
      // The dialog stays open and the draft is untouched so the send can be retried.
      toast.error(error instanceof Error ? error.message : "Could not send the SMS.");
    }
  });

  return (
    <Dialog open onOpenChange={handleOpenChange} triggerId={triggerId}>
      <DialogContent showCloseButton={!isSubmitting}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>SMS {user.name}</DialogTitle>
            <DialogDescription>Sent as plain text to {user.phoneNumber}.</DialogDescription>
          </DialogHeader>

          <FormField
            label="Message"
            error={errors.body?.message}
            counter={<CharacterCounter length={length} max={MAX_SMS_LENGTH} />}
          >
            {(controlProps) => (
              <Textarea
                {...controlProps}
                {...register("body")}
                disabled={isSubmitting}
                rows={4}
                autoFocus
                placeholder="Type your message…"
              />
            )}
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
