import type { Locale } from "date-fns";
import { enUS } from "date-fns/locale/en-US";

/**
 * Registry of app locale -> date-fns locale. To add a language, import its date-fns locale
 * here and add one entry (e.g. `uk: uk` from "date-fns/locale/uk"). Nothing else changes.
 */
export const DATE_LOCALES = {
  en: enUS,
} as const satisfies Record<string, Locale>;

export type AppLocale = keyof typeof DATE_LOCALES;

export const DEFAULT_LOCALE: AppLocale = "en";

export function getDateLocale(locale: AppLocale = DEFAULT_LOCALE): Locale {
  return DATE_LOCALES[locale];
}
