import { z } from "zod";

/** Trim first, then validate: mirrors the backend DTOs, so whitespace-only counts as empty. */
export function requiredTrimmedText(options: {
  max: number;
  emptyMessage: string;
  tooLongMessage: string;
}) {
  return z.string().trim().min(1, options.emptyMessage).max(options.max, options.tooLongMessage);
}
