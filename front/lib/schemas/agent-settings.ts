import { z } from "zod";
import { MAX_SYSTEM_PROMPT_LENGTH } from "@/lib/api";
import { requiredTrimmedText } from "@/lib/schemas/fields";

export const agentSettingsSchema = z.object({
  systemPrompt: requiredTrimmedText({
    max: MAX_SYSTEM_PROMPT_LENGTH,
    emptyMessage: "Enter a system prompt.",
    tooLongMessage: `System prompt is too long. The limit is ${MAX_SYSTEM_PROMPT_LENGTH} characters.`,
  }),
});

export type AgentSettingsFormInput = z.input<typeof agentSettingsSchema>;
export type AgentSettingsFormValues = z.output<typeof agentSettingsSchema>;
