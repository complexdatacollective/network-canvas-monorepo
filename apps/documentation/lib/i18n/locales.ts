// The documentation's languages. The locale edge function loads this file
// through Deno, so it must import nothing.
export const locales = ['en', 'es'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

// Narrow a string to a documentation locale, or undefined when it names none.
export function toLocale(value: string | undefined): Locale | undefined {
  return locales.find((candidate) => candidate === value);
}
