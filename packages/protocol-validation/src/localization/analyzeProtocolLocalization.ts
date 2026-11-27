import { dynamicValueNameFor } from '../schemas/9/dynamic-value-names.ts';
import { wordingPresent } from '../schemas/9/protocol-wording.ts';
import type { Protocol } from '../schemas/index.ts';
import {
  collectLocalizedStrings,
  type LocalizedStringHit,
} from '../utils/collectLocalizedStrings.ts';
import { isOwnTextOf, textPlaceOf } from '../utils/textPlace.ts';
import { localesShowingDynamicAttribute } from './dynamicAttributeLocales.ts';
import { localesPlacingFieldText } from './formFieldLocales.ts';
import type { LocaleTag } from './localeTag.ts';
import { resolveLocalizedString } from './resolveLocalizedString.ts';

export type ProtocolLocalizationWarning = Readonly<{
  code: 'missing-translation';
  path: readonly (string | number)[];
  locale: LocaleTag;
  isDefaultLocale: boolean;
  fallbackLocale: LocaleTag;
}>;

type Path = readonly (string | number)[];

/** What of a protocol decides which languages a string is expected in. */
type LocalizedProtocol = Readonly<{
  localization: Readonly<{
    defaultLocale: LocaleTag;
    locales: readonly LocaleTag[];
  }>;
}>;

// The localized strings of a protocol, read once for each protocol object:
// Architect's translation table asks for every row.
const hitsByProtocol = new WeakMap<object, readonly LocalizedStringHit[]>();
const hitsOf = (protocol: object): readonly LocalizedStringHit[] => {
  const known = hitsByProtocol.get(protocol);
  if (known !== undefined) return known;
  const hits = collectLocalizedStrings(protocol);
  hitsByProtocol.set(protocol, hits);
  return hits;
};

const expectedLocalesFrom = (
  path: Path,
  protocol: LocalizedProtocol,
  hits: () => readonly LocalizedStringHit[],
): readonly LocaleTag[] => {
  const place = textPlaceOf(path);
  if (place.kind !== 'dynamicAttributeWording') {
    return (
      localesPlacingFieldText(path, protocol, protocol.localization) ??
      protocol.localization.locales
    );
  }
  const ownTexts = hits().filter((hit) =>
    isOwnTextOf(textPlaceOf(hit.path), place.owner),
  );
  return localesShowingDynamicAttribute(
    dynamicValueNameFor({ kind: 'dynamicAttribute', id: place.id }),
    ownTexts,
    protocol,
    protocol.localization,
  );
};

/**
 * The languages a localized string at `path` is expected to have a
 * translation in. A missing translation is reported only in these; the
 * translation table shows the string as not used in any other language.
 * - A form field's question and hint: the languages whose form document
 *   places the field (`localesPlacingFieldText`).
 * - A dynamic attribute's wording: the languages in which a text of its
 *   owner (its stage, or its node label) shows it, as a participant reading
 *   each language sees the text (`localesShowingDynamicAttribute`).
 * - Every other string: all of the protocol's languages.
 */
export const expectedLocalesOf = (
  path: Path,
  protocol: LocalizedProtocol,
): readonly LocaleTag[] =>
  expectedLocalesFrom(path, protocol, () => hitsOf(protocol));

/**
 * Every declared language each participant-facing string lacks, with the
 * language a participant who selected it sees instead when their browser lists
 * no other language that has the string. Missing translations never make a
 * protocol invalid, so this is separate from `validateProtocol`. A string is
 * expected only in the languages that `expectedLocalesOf` gives: a form field
 * that a language's form does not place lacks nothing in that language.
 *
 * `fallbackLocale` comes from the runtime resolver itself, so the coverage an
 * author is shown is exactly what the interview renders.
 *
 * The protocol is read with every text it shows written out, with a stand-in
 * for Network Canvas's wording wherever it has words (`wordingPresent`): only
 * which languages a text has words in is read here, never the words. A text
 * Network Canvas words lacks a language only where neither the protocol nor
 * Network Canvas has wording for it, and it counts whether or not the
 * protocol holds any wording of its own for it. So a
 * stored protocol and the same protocol as an editor holds it give the same
 * answer.
 */
export function analyzeProtocolLocalization(
  protocol: Protocol<9>,
): readonly ProtocolLocalizationWarning[] {
  const { localization } = protocol;
  const hits = collectLocalizedStrings(
    wordingPresent.withSuppliedWording(protocol),
  );
  return hits.flatMap((hit) => {
    const expected = expectedLocalesFrom(hit.path, protocol, () => hits);
    const missing = expected.filter(
      (locale) => !Object.hasOwn(hit.value, locale),
    );
    // A string with no declared translation at all is a validation error,
    // and the resolver cannot pick a fallback for it.
    if (
      localization.locales.every((locale) => !Object.hasOwn(hit.value, locale))
    ) {
      return [];
    }
    return missing.map((locale): ProtocolLocalizationWarning => ({
      code: 'missing-translation',
      path: hit.path,
      locale,
      isDefaultLocale: locale === localization.defaultLocale,
      fallbackLocale: resolveLocalizedString(hit.value, localization, [locale])
        .locale,
    }));
  });
}
