import { withSuppliedWording } from '../schemas/9/protocol-wording.ts';
import type { Protocol } from '../schemas/index.ts';
import { collectLocalizedStrings } from '../utils/collectLocalizedStrings.ts';
import type { LocaleTag } from './localeTag.ts';
import { resolveLocalizedString } from './resolveLocalizedString.ts';

export type ProtocolLocalizationWarning = Readonly<{
  code: 'missing-translation';
  path: readonly (string | number)[];
  locale: LocaleTag;
  isDefaultLocale: boolean;
  fallbackLocale: LocaleTag;
}>;

/**
 * Every declared language each participant-facing string lacks, with the
 * language a participant who selected it sees instead when their browser lists
 * no other language that has the string. Missing translations never make a
 * protocol invalid, so this is separate from `validateProtocol`.
 *
 * `fallbackLocale` comes from the runtime resolver itself, so the coverage an
 * author is shown is exactly what the interview renders.
 *
 * The protocol is read with the wording it shows written out
 * (`withSuppliedWording`): a text Network Canvas words lacks a language only
 * where neither the protocol nor Network Canvas has wording for it, and it
 * counts whether or not the protocol holds any wording of its own for it. So a
 * stored protocol and the same protocol as an editor holds it give the same
 * answer.
 */
export function analyzeProtocolLocalization(
  protocol: Protocol<9>,
): readonly ProtocolLocalizationWarning[] {
  const { localization } = protocol;
  return collectLocalizedStrings(withSuppliedWording(protocol)).flatMap(
    (hit) => {
      const missing = localization.locales.filter(
        (locale) => !Object.hasOwn(hit.value, locale),
      );
      // A string with no declared translation at all is a validation error,
      // and the resolver cannot pick a fallback for it.
      if (missing.length === localization.locales.length) return [];
      return missing.map((locale): ProtocolLocalizationWarning => ({
        code: 'missing-translation',
        path: hit.path,
        locale,
        isDefaultLocale: locale === localization.defaultLocale,
        fallbackLocale: resolveLocalizedString(hit.value, localization, [
          locale,
        ]).locale,
      }));
    },
  );
}
