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
import { useSendWhatsAppMessage } from "@/hooks/use-send-mutations";
import { MAX_MESSAGE_LENGTH, type User } from "@/lib/api";
import {
  sendWhatsAppMessageSchema,
  type MessageBodyInput,
  type MessageBodyValues,
} from "@/lib/schemas/messages";

interface SendMessageDialogProps {
  user: User;
  /** Id of the row button that opened this dialog, so focus returns there on close. */
  triggerId: string;
  onClose: () => void;
}

/**
 * Mounted only while open and keyed by user id, so every open starts from a clean
 * form with an empty field — including when the operator switches contacts.
 */
export function SendMessageDialog({ user, triggerId, onClose }: SendMessageDialogProps) {
  const sendMessage = useSendWhatsAppMessage(user.id);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MessageBodyInput, unknown, MessageBodyValues>({
    resolver: zodResolver(sendWhatsAppMessageSchema),
    defaultValues: { body: "" },
  });
  const length = (useWatch({ control, name: "body" }) ?? "").trim().length;

  function handleOpenChange(open: boolean) {
    // While a send is in flight the dialog is not dismissible — not by Escape,
    // not by an outside press, not by Cancel.
    if (!open && !isSubmitting) {
      onClose();
    }
  }

  const submit = handleSubmit(async ({ body }) => {
    try {
      const { deliveryMode } = await sendMessage.mutateAsync(body);

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
    }
  });

  return (
    <Dialog open onOpenChange={handleOpenChange} triggerId={triggerId}>
      <DialogContent showCloseButton={!isSubmitting}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Message {user.name}</DialogTitle>
            <DialogDescription>Sent over WhatsApp to {user.phoneNumber}.</DialogDescription>
          </DialogHeader>

          <FormField
            label="Message"
            error={errors.body?.message}
            counter={<CharacterCounter length={length} max={MAX_MESSAGE_LENGTH} />}
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
