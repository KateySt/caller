import { format, formatDuration as formatDurationParts, intervalToDuration } from "date-fns";
import { type AppLocale, DEFAULT_LOCALE, getDateLocale } from "./locales";

/**
 * Locale-aware format tokens (date-fns "long localized" tokens), so each language gets its
 * own natural order/separators instead of a hand-written pattern.
 */
export const DATE_FORMATS = {
  date: "PP",
  time: "p",
  dateTime: "PP p",
} as const;

export type DateFormatName = keyof typeof DATE_FORMATS;

type DateInput = string | number | Date;

export interface DateFormatOptions {
  locale?: AppLocale;
  format?: DateFormatName;
}

/** Formats an ISO string / timestamp / Date. Returns "—" for missing or invalid input. */
export function formatDate(input: DateInput | null | undefined, options: DateFormatOptions = {}): string {
  if (input === null || input === undefined) {
    return "—";
  }
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return format(date, DATE_FORMATS[options.format ?? "dateTime"], {
    locale: getDateLocale(options.locale ?? DEFAULT_LOCALE),
  });
}

/** Human, localized duration from seconds, e.g. "1 minute 5 seconds". */
export function formatDurationSeconds(totalSeconds: number, locale: AppLocale = DEFAULT_LOCALE): string {
  const duration = intervalToDuration({ start: 0, end: totalSeconds * 1000 });
  return formatDurationParts(duration, {
    locale: getDateLocale(locale),
    format: ["hours", "minutes", "seconds"],
    zero: totalSeconds === 0,
  });
}
