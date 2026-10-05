import { z } from "zod";
import { E164_PATTERN, MAX_NAME_LENGTH } from "@/lib/api";
import { requiredTrimmedText } from "@/lib/schemas/fields";

/** Create/edit contact. The backend stays the authority (it owns the uniqueness check). */
export const userSchema = z.object({
  name: requiredTrimmedText({
    max: MAX_NAME_LENGTH,
    emptyMessage: "Enter a name.",
    tooLongMessage: `Name is longer than ${MAX_NAME_LENGTH} characters.`,
  }),
  phoneNumber: z
    .string()
    .trim()
    .regex(E164_PATTERN, "Use E.164 format, e.g. +380501234567."),
});

export type UserFormInput = z.input<typeof userSchema>;
export type UserFormValues = z.output<typeof userSchema>;
