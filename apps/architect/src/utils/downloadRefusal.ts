import {
  type CurrentProtocol,
  findLabelCollisions,
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
 * Why a protocol that can be written and saved cannot be downloaded yet: what
 * every host refuses to import.
 */
export type DownloadRefusal =
  | DefaultLanguageTextProblem
  | LabelCollisionsSummary;

export const isLabelCollisionsSummary = (
  refusal: DownloadRefusal,
): refusal is LabelCollisionsSummary =>
  'kind' in refusal && refusal.kind === 'labelCollisions';

/**
 * The first thing that stops `protocol` being downloaded: text missing in its
 * default language (`findDefaultLanguageTextProblem`), then labels that read
 * the same. A change of the protocol's languages can leave two labels reading
 * the same through fallback; it is made, the researcher is shown each pair,
 * and the protocol cannot leave Architect until they differ.
 */
export const findDownloadRefusal = (
  protocol: CurrentProtocol,
): DownloadRefusal | null =>
  findDefaultLanguageTextProblem(protocol) ??
  (findLabelCollisions(protocol).length > 0
    ? { kind: 'labelCollisions' }
    : null);
