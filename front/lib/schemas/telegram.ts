import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "@/lib/api";
import { requiredTrimmedText } from "@/lib/schemas/fields";

export const sendTelegramMessageSchema = z.object({
  text: requiredTrimmedText({
    max: MAX_MESSAGE_LENGTH,
    emptyMessage: "Enter a message before sending.",
    tooLongMessage: `Message is too long. The limit is ${MAX_MESSAGE_LENGTH} characters.`,
  }),
});

export type SendTelegramMessageInput = z.input<typeof sendTelegramMessageSchema>;
export type SendTelegramMessageValues = z.output<typeof sendTelegramMessageSchema>;
