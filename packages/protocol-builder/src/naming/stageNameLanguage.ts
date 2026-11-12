import { IntlMessageFormat } from 'intl-messageformat';

import {
  type LocaleTag,
  type StageNameWording,
  stageNameWordingFor,
} from '@codaco/protocol-validation';

import type { ProtocolLocalization } from '../localization/localizedText.ts';

/**
 * The language a stage's proposed name is written in, and the wording it is
 * made from there.
 */
export type StageNameLanguage = Readonly<{
  locale: LocaleTag;
  wording: StageNameWording;
}>;

/**
 * What a protocol that declares no languages is taken to be written in, which
 * is what the schema 8 to 9 migration records for one that never said.
 */
const UNDECLARED_LANGUAGE: LocaleTag = 'en';

/**
 * The language a stage of this protocol is named in: its DEFAULT language,
 * whatever language the researcher has Architect's own interface in, because
 * the name is written into the protocol as the default language's text.
 * `undefined` when Network Canvas supplies no wording in that language
 * (`stageNameWordingFor`): such a protocol is given no proposed names at all,
 * and its researcher names every stage.
 *
 * A protocol whose languages are not known yet is named in English, which is
 * what a proposal was before it followed the protocol. Nothing is WRITTEN
 * until they are known (`useAutoStageName`).
 */
export function stageNameLanguageOf(
  localization: ProtocolLocalization | undefined,
): StageNameLanguage | undefined {
  const locale = localization?.defaultLocale ?? UNDECLARED_LANGUAGE;
  const wording = stageNameWordingFor(locale);
  return wording === undefined ? undefined : { locale, wording };
}

const parsed = new Map<LocaleTag, Map<string, IntlMessageFormat>>();

/**
 * One of the language's wording messages, with its arguments filled in. Tags
 * stay literal text, as everywhere a protocol's own messages are formatted.
 */
export function formatStageNameMessage(
  language: StageNameLanguage,
  message: string,
  values: Readonly<Record<string, string>>,
): string {
  let formats = parsed.get(language.locale);
  if (formats === undefined) {
    formats = new Map();
    parsed.set(language.locale, formats);
  }
  let format = formats.get(message);
  if (format === undefined) {
    format = new IntlMessageFormat(message, language.locale, undefined, {
      ignoreTag: true,
    });
    formats.set(message, format);
  }
  const formatted = format.format<string>(values);
  return typeof formatted === 'string' ? formatted : formatted.join('');
}
