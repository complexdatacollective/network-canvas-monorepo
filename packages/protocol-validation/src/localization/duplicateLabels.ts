import { normalizeForComparison } from '@codaco/shared-consts';

import type { LocaleTag, LocalizationDeclaration } from './localeTag.ts';
import { messageText } from './messageSyntax.ts';
import { resolveLocalizedString } from './resolveLocalizedString.ts';

/**
 * The key under which two labels are the same label to a participant.
 *
 * `normalizeForComparison`, never `toLocaleLowerCase()`: this is a
 * PERSISTED-SCHEMA invariant, so the answer has to be the same on every device
 * the protocol is opened on. Locale folding makes it depend on the host — `I`
 * lowercases to `ı` under Turkish and Azeri, so `Ilk` and `ilk` collide on one
 * laptop and not on another — and a raw comparison also misses canonically
 * equivalent spellings of the same label, which render identically to the
 * participant. Surrounding spaces are trimmed: a rendered label shows none of
 * them, so `Close` and `Close ` read the same.
 */
const labelComparisonKey = (label: string): string =>
  normalizeForComparison(label.trim());

export type DuplicateLabel = Readonly<{
  /** The label that repeats an earlier one. */
  index: number;
  /** The earlier label it repeats. */
  firstIndex: number;
  locale: LocaleTag;
  /** The text a participant reading `locale` sees. */
  text: string;
  /** The earlier label's text in `locale`, which reads the same. */
  firstText: string;
}>;

type Localization = Pick<LocalizationDeclaration, 'defaultLocale' | 'locales'>;

type LabelValue = Readonly<Record<LocaleTag, string>>;

const isLabel = (value: unknown): value is LabelValue =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((text) => typeof text === 'string');

const asLabel = (value: unknown): LabelValue | undefined =>
  isLabel(value) ? value : undefined;

/**
 * The text of `label` a participant reading `locale` sees, or undefined where
 * it cannot be known: given the protocol's languages, the translation the
 * interview shows, falling back as it does for a participant whose browser
 * lists no other protocol language, and nothing for a label with no
 * translation in any of them; without them, the label's own translation in
 * `locale`.
 */
const labelTextIn = (
  label: LabelValue,
  locale: LocaleTag,
  localization: Localization | undefined,
): string | undefined => {
  if (localization === undefined) {
    const message = label[locale];
    return message === undefined ? undefined : messageText(message);
  }
  if (!localization.locales.some((declared) => Object.hasOwn(label, declared)))
    return undefined;
  return messageText(
    resolveLocalizedString(label, localization, [locale]).text,
  );
};

/**
 * Labels in one set a participant reading some language would read the same
 * way as an earlier label of the set: each one, once per language it happens
 * in, with the label it repeats. Two choices nothing distinguishes cannot be
 * told apart, so every set of labels a participant chooses between or reads
 * as a key holds to it: a Narrative Pedigree's diseases and an attribute's
 * options.
 *
 * Given the protocol's languages, each label is compared in every one of them
 * as the interview shows it there, falling back where it has no translation,
 * so a collision that only appears through fallback (one label translated,
 * another falling back to the same text) is caught in the language it
 * affects. Labels are resolved as for a participant whose browser lists no
 * other protocol language, so a collision reached only through such a
 * language is not caught. Without the protocol's languages, as while a
 * settings section has not arrived, each label is compared in the languages
 * it is written in, with no fallback.
 *
 * A label that is not text, has no translation in a declared language, or
 * reads as nothing is passed over: other rules say what is wrong with it.
 */
export const findDuplicateLocalizedLabels = (
  labels: readonly unknown[],
  localization?: Localization,
): DuplicateLabel[] => {
  const readable = labels.map(asLabel);
  const locales =
    localization?.locales ??
    Array.from(new Set(readable.flatMap((label) => Object.keys(label ?? {}))));
  const duplicates: DuplicateLabel[] = [];
  for (const locale of locales) {
    const seen = new Map<string, { index: number; text: string }>();
    readable.forEach((label, index) => {
      if (label === undefined) return;
      const text = labelTextIn(label, locale, localization);
      if (text === undefined) return;
      const key = labelComparisonKey(text);
      if (key === '') return;
      const first = seen.get(key);
      if (first === undefined) seen.set(key, { index, text });
      else {
        duplicates.push({
          index,
          firstIndex: first.index,
          locale,
          text,
          firstText: first.text,
        });
      }
    });
  }
  return duplicates;
};

const readOptionLabel = (option: unknown): unknown =>
  typeof option === 'object' && option !== null
    ? Reflect.get(option, 'label')
    : undefined;

/**
 * Options of one attribute a participant would read the same way as an
 * earlier option, as `findDuplicateLocalizedLabels` finds them: the rule the
 * protocol schema holds every categorical, ordinal and yes-or-no attribute
 * to, and that each place an option label is edited asks.
 */
export const findDuplicateOptionLabels = (
  options: unknown,
  localization?: Localization,
): DuplicateLabel[] =>
  findDuplicateLocalizedLabels(
    (Array.isArray(options) ? options : []).map(readOptionLabel),
    localization,
  );
