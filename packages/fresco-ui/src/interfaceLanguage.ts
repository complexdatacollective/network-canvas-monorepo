'use client';

import { useAppDirection, useAppIntl } from '@codaco/app-i18n/react';

import {
  type PresentationalText,
  presentationalTextProps,
} from './PresentationalText';

/** The interface's language and direction. */
export type InterfaceLanguage = Readonly<{ lang: string; dir: 'ltr' | 'rtl' }>;

/**
 * `lang` and `dir` for words drawn inside text in the protocol's language,
 * such as a label on a value in a line of text. The interface's own words
 * (a plain string) take the interface's language and direction, whatever
 * language the text around them is in (a protocol's English text in an Arabic
 * interface), so a screen reader reads them in the right voice and they take
 * the interface's typeface. Text with a language of its own, such as
 * `{ text, dir: 'auto' }` for a name someone wrote, keeps it.
 */
export const interfaceLanguage = (
  label: PresentationalText,
  language: InterfaceLanguage,
): Readonly<{ lang?: string; dir?: 'ltr' | 'rtl' | 'auto' }> =>
  typeof label === 'string' ? language : presentationalTextProps(label);

/**
 * `lang` and `dir` for `label` (see `interfaceLanguage`). Without a label,
 * for the interface's own words.
 */
export const useInterfaceLanguage = (label: PresentationalText = '') => {
  const intl = useAppIntl();
  const dir = useAppDirection();
  return interfaceLanguage(label, { lang: intl.locale, dir });
};
