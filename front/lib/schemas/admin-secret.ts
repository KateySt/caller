import { z } from "zod";

export const adminSecretSchema = z.object({
  secret: z.string().trim().min(32, "The admin key is at least 32 characters."),
});

export type AdminSecretFormInput = z.input<typeof adminSecretSchema>;
export type AdminSecretFormValues = z.output<typeof adminSecretSchema>;
