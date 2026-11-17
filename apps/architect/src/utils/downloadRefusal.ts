import {
  type CurrentProtocol,
  findLabelCollisions,
  findMissingFallbackLanguage,
  type LocaleTag,
} from '@codaco/protocol-validation';

import {
  type DefaultLanguageTextProblem,
  findDefaultLanguageTextProblem,
} from './defaultLanguageText';

/**
 * Labels a participant chooses between that read the same, in some language
 * (`findLabelCollisions`): two options of one attribute, or two diseases of
 * one stage. The Stages page lists each.
 */
export type LabelCollisionsSummary = Readonly<{ kind: 'labelCollisions' }>;

/**
 * The protocol's default language is one Network Canvas has no wording in,
 * and it names no fallback language yet (`findMissingFallbackLanguage`). The
 * Languages page is where one is chosen.
 */
export type FallbackLanguageMissing = Readonly<{
  kind: 'fallbackLanguage';
  /** The protocol's default language, which needs one. */
  locale: LocaleTag;
}>;

/**
 * Why a protocol that can be written and saved cannot be downloaded yet: what
 * every host refuses to import.
 */
export type DownloadRefusal =
  | DefaultLanguageTextProblem
  | FallbackLanguageMissing
  | LabelCollisionsSummary;

export const isFallbackLanguageMissing = (
  refusal: DownloadRefusal,
): refusal is FallbackLanguageMissing =>
  'kind' in refusal && refusal.kind === 'fallbackLanguage';

export const findFallbackLanguageMissing = (
  protocol: CurrentProtocol,
): FallbackLanguageMissing | null => {
  const locale = findMissingFallbackLanguage(protocol.localization);
  return locale === undefined ? null : { kind: 'fallbackLanguage', locale };
};

export const isLabelCollisionsSummary = (
  refusal: DownloadRefusal,
): refusal is LabelCollisionsSummary =>
  'kind' in refusal && refusal.kind === 'labelCollisions';

/**
 * The first thing that stops `protocol` being downloaded: text missing in its
 * default language (`findDefaultLanguageTextProblem`), then a fallback
 * language it needs and has not been given, then labels that read the same. A change of the protocol's languages can leave two labels reading
 * the same through fallback; it is made, the researcher is shown each pair,
 * and the protocol cannot leave Architect until they differ.
 */
export const findDownloadRefusal = (
  protocol: CurrentProtocol,
): DownloadRefusal | null =>
  findDefaultLanguageTextProblem(protocol) ??
  findFallbackLanguageMissing(protocol) ??
  (findLabelCollisions(protocol).length > 0
    ? { kind: 'labelCollisions' }
    : null);
