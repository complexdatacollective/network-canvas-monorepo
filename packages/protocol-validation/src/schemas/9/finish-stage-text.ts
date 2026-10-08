import { isBlankMessage } from '../../localization/blankText.ts';
import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import type { LocalizedString } from './localized-string.ts';

/** The finish stage text a participant reads. */
export type FinishStageTextField = 'title' | 'content';

const FINISH_STAGE_TEXT_FIELDS = [
  'title',
  'content',
] as const satisfies readonly FinishStageTextField[];

/**
 * A finish stage whose heading or text is missing in the protocol's default
 * language. The schema allows this while a protocol is being written, because
 * a new protocol in a language Network Canvas supplies no closing text for
 * starts without any; a protocol leaving its editor must not.
 */
export type FinishStageTextProblem = Readonly<{
  stageId: string;
  stageIndex: number;
  /** The protocol's default language, which the text is missing in. */
  locale: LocaleTag;
  /** What is missing, in the order a participant reads them. */
  missing: readonly FinishStageTextField[];
}>;

type ProtocolLike = Readonly<{
  localization: LocalizationDeclaration;
  stages: readonly Readonly<{
    id: string;
    type: string;
    title?: LocalizedString;
    content?: LocalizedString;
  }>[];
}>;

const isWritten = (text: string | undefined): boolean =>
  text !== undefined && !isBlankMessage(text);

/**
 * Every finish stage missing its heading or text in the protocol's default
 * language. Text in another language does not count: the interview falls back
 * to the default language, so it is the text every participant can be shown.
 */
export const findFinishStageTextProblems = (
  protocol: ProtocolLike,
): readonly FinishStageTextProblem[] => {
  const locale = protocol.localization.defaultLocale;
  const problems: FinishStageTextProblem[] = [];
  protocol.stages.forEach((stage, stageIndex) => {
    if (stage.type !== 'FinishSession') return;
    const missing = FINISH_STAGE_TEXT_FIELDS.filter(
      (field) => !isWritten(stage[field]?.[locale]),
    );
    if (missing.length > 0) {
      problems.push({ stageId: stage.id, stageIndex, locale, missing });
    }
  });
  return problems;
};
