import { z } from "zod";
import { MAX_MESSAGE_LENGTH, MAX_SMS_LENGTH } from "@/lib/api";
import { requiredTrimmedText } from "@/lib/schemas/fields";

/** WhatsApp message body (`SendMessageDialog`). */
export const sendWhatsAppMessageSchema = z.object({
  body: requiredTrimmedText({
    max: MAX_MESSAGE_LENGTH,
    emptyMessage: "Enter a message before sending.",
    tooLongMessage: `Message is too long. The limit is ${MAX_MESSAGE_LENGTH} characters.`,
  }),
});

/** SMS body (`SendSmsDialog`). */
export const sendSmsSchema = z.object({
  body: requiredTrimmedText({
    max: MAX_SMS_LENGTH,
    emptyMessage: "Enter a message before sending.",
    tooLongMessage: `Message is too long. The limit is ${MAX_SMS_LENGTH} characters.`,
  }),
});

export type MessageBodyInput = z.input<typeof sendSmsSchema>;
export type MessageBodyValues = z.output<typeof sendSmsSchema>;
