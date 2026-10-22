import type { ReactNode } from 'react';

/**
 * Text a host hands to a component to show. A plain string is in the page's
 * own language; the object form names the language the text is actually
 * written in, so the element showing it can tell the browser and assistive
 * technology (pronunciation, hyphenation, font choice, bidirectional layout).
 */
export type PresentationalText =
  | string
  | Readonly<{
      text: string;
      lang: string;
      dir: 'ltr' | 'rtl';
    }>;

type LanguageAttributes = Readonly<{ lang?: string; dir?: 'ltr' | 'rtl' }>;

export function isPresentationalText(
  value: unknown,
): value is PresentationalText {
  if (typeof value === 'string') return true;
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    typeof value.text === 'string' &&
    'lang' in value &&
    typeof value.lang === 'string' &&
    'dir' in value &&
    (value.dir === 'ltr' || value.dir === 'rtl')
  );
}

/**
 * The bare text, for code that needs a primitive: filtering, sorting,
 * `aria-label`, React keys, native `<option>` text.
 */
export function presentationalTextValue(text: PresentationalText): string {
  return typeof text === 'string' ? text : text.text;
}

/**
 * `lang` and `dir` to spread onto the element that shows the text. Empty for
 * a plain string or any other React node, which keep the page's language.
 */
export function presentationalTextProps(
  value: ReactNode | PresentationalText,
): LanguageAttributes {
  return isPresentationalText(value) && typeof value !== 'string'
    ? { lang: value.lang, dir: value.dir }
    : {};
}
