import { z } from "zod";
import { isValidPhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js";
import { MAX_NAME_LENGTH } from "@/lib/api";
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
    .refine((value) => value.startsWith("+") && isValidPhoneNumber(value), {
      message: "Enter a valid international number, e.g. +380501234567.",
    })
    .transform((value) => parsePhoneNumberFromString(value)?.number ?? value),
});

export type UserFormInput = z.input<typeof userSchema>;
export type UserFormValues = z.output<typeof userSchema>;
