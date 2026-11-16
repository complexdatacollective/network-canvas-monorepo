import {
  type CurrentProtocol,
  findBuiltInWordingProblems,
  findFinishStageTextProblems,
  type FinishStageTextProblem,
  type LocaleTag,
} from '@codaco/protocol-validation';

/**
 * Wording Network Canvas supplies (button labels, messages, the Family
 * Pedigree's answers) with no text in the protocol's default language: how
 * much of it, and in which language.
 */
export type BuiltInWordingSummary = Readonly<{
  kind: 'builtInWording';
  locale: LocaleTag;
  count: number;
}>;

/**
 * Text a participant must be able to read in the protocol's default language
 * but that has none there: a finish stage's screens, or Network Canvas's
 * built-in wording.
 */
export type DefaultLanguageTextProblem =
  | FinishStageTextProblem
  | BuiltInWordingSummary;

export const isBuiltInWordingSummary = (
  problem: DefaultLanguageTextProblem,
): problem is BuiltInWordingSummary =>
  'kind' in problem && problem.kind === 'builtInWording';

/**
 * The first text missing in the protocol's default language that stops it
 * being downloaded: the finish stage's screens first, then Network Canvas's
 * built-in wording, which it writes only in a language it has it in exactly.
 * A new protocol in another language (Mexican Spanish, Japanese) starts like
 * this, and a researcher can clear the text later. The protocol can be edited
 * and saved, but not downloaded (`bundleProtocol`).
 */
export const findDefaultLanguageTextProblem = (
  protocol: CurrentProtocol,
): DefaultLanguageTextProblem | null => {
  const [finish] = findFinishStageTextProblems(protocol);
  if (finish !== undefined) return finish;
  const builtIn = findBuiltInWordingProblems(protocol);
  return builtIn.length === 0
    ? null
    : {
        kind: 'builtInWording',
        locale: protocol.localization.defaultLocale,
        count: builtIn.length,
      };
};
