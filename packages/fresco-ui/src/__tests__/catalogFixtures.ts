import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AppLocale } from '@codaco/app-i18n/locales';

const srcDir = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * A locale whose digits and grouping are not the ones the source is written
 * in, so a number that reached the screen without going through the app's
 * formatter is visible as such. Its registry is local to the tests: the
 * shipped ecosystem list is English-only, and what is under test is the
 * components, not the set of languages the apps currently offer.
 */
export const ARABIC: AppLocale = {
  locale: 'ar-EG',
  label: 'العربية',
  direction: 'rtl',
};

export const arabicNumber = (
  value: number,
  options?: Intl.NumberFormatOptions,
) => new Intl.NumberFormat(ARABIC.locale, options).format(value);

/**
 * The extracted source template for one id, which `catalogs.test.ts` keeps
 * equal to the descriptor in the component. Standing in for a translation of
 * it is what makes a test a test of the descriptor: a translator copies the
 * arguments as the source declares them, so a bare `{page}` in the source is a
 * bare `{page}` in every catalog derived from it.
 *
 * A catalog entry is what makes the active locale reach the arguments at all —
 * react-intl formats an untranslated `defaultMessage` in the DEFAULT locale,
 * so English text would otherwise keep English digits, which is the coherent
 * fallback rather than the bug.
 */
export function sourceTemplate(id: string): string {
  const extracted = JSON.parse(
    readFileSync(join(srcDir, 'locales', 'en.json'), 'utf8'),
  ) as Record<string, { defaultMessage: string }>;
  const template = extracted[id]?.defaultMessage;
  if (template === undefined) {
    throw new Error(`no extracted message for "${id}"`);
  }
  return template;
}
