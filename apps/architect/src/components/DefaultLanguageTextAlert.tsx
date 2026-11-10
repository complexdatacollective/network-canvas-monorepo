import { Link } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import type { FinishStageTextProblem } from '@codaco/protocol-validation';
import { useAppSelector } from '~/ducks/hooks';
import { getDefaultLanguageTextProblem } from '~/selectors/issues';
import { isBuiltInWordingSummary } from '~/utils/defaultLanguageText';
import {
  type DownloadRefusal,
  isLabelCollisionsSummary,
} from '~/utils/downloadRefusal';

import { translationTableHref } from './Localization/translationTableLinks';
import { useLanguageName } from './Localization/useLanguageName';

const messages = defineMessages({
  cannotBeDownloadedYet: {
    id: 'architect.finishStageText.cannotBeDownloadedYet',
    defaultMessage: 'This protocol can’t be downloaded yet',
    description:
      'Title of the notice on the stage list, and of the dialog shown when a download is refused, while a stage that ends the interview has no text for a screen it shows in the protocol’s default language, while Network Canvas’s built-in wording has no text in that language, or while two labels participants choose between read the same.',
  },
  labelCollisions: {
    id: 'architect.labelCollisions.downloadRefused',
    defaultMessage:
      'Some answer options or diseases have labels that read the same in one of the protocol’s languages, so participants could not tell them apart. The Stages page lists them. The protocol can’t be downloaded until each pair has different labels.',
    description:
      'Shown in the dialog that refuses to download (or send) a protocol while two answer options of one attribute, or two diseases of a Narrative Pedigree stage, have labels a participant would read as the same text in one of the protocol’s languages: written the same, differing only in capital letters or spaces at either end, or because one has no translation in that language and shows another language’s text instead. Researcher-facing. “The Stages page” is the Architect page listing the protocol’s stages, where a notice names each pair.',
  },
  missingBuiltInWording: {
    id: 'architect.builtInWording.missingInDefaultLanguage',
    defaultMessage:
      'Network Canvas has no built-in wording, such as button labels and messages, in {language}. Translate it into {language}, or make a language that has built-in wording the default. The protocol can’t be downloaded until then.',
    description:
      'Shown while the protocol’s default language is one Network Canvas has no built-in wording in (for example Mexican Spanish or Japanese), so the wording Network Canvas supplies (button labels, messages and similar) has no text in it. The researcher can translate that wording into the language in the translation table, or make another of the protocol’s languages that Network Canvas has wording in (for example Spanish) the default. language is the name of the default language, for example “Spanish (Mexico)”.',
  },
  showMissingWording: {
    id: 'architect.builtInWording.showMissing',
    defaultMessage: 'Show the wording to translate',
    description:
      'Link in the notice about built-in wording missing in the protocol’s default language. It opens the translation table showing only the text that has no translation in that language.',
  },
  missingClosingAndFinishedText: {
    id: 'architect.finishStageText.missingClosingAndFinishedText',
    defaultMessage:
      'A stage that ends the interview has no text for its closing screen or its finished screen in {language}. The protocol can’t be downloaded until they’re added.',
    description:
      'Shown while a stage that ends the interview (a Finish Screen stage) has neither the text of its closing screen (where the participant finishes the interview) nor the text of its finished screen (shown once the interview has ended) in the protocol’s default language. language is the name of that language, for example “Japanese”.',
  },
  missingClosingText: {
    id: 'architect.finishStageText.missingClosingText',
    defaultMessage:
      'A stage that ends the interview has no text for its closing screen in {language}. The protocol can’t be downloaded until it’s added.',
    description:
      'Shown while a stage that ends the interview (a Finish Screen stage) has no text for its closing screen, where the participant finishes the interview, in the protocol’s default language. language is the name of that language, for example “Japanese”.',
  },
  missingFinishedText: {
    id: 'architect.finishStageText.missingFinishedText',
    defaultMessage:
      'A stage that ends the interview has no text for its finished screen in {language}. The protocol can’t be downloaded until it’s added.',
    description:
      'Shown while a stage that ends the interview (a Finish Screen stage) has no text for its finished screen, shown to the participant once the interview has ended, in the protocol’s default language. language is the name of that language, for example “Japanese”.',
  },
  editFinishStage: {
    id: 'architect.finishStageText.editFinishStage',
    defaultMessage: 'Edit the stage that ends the interview',
    description:
      'Link in the notice about the missing closing or finished screen text. It opens the editor for the stage that ends the interview.',
  },
});

const describeProblem = ({ missing }: FinishStageTextProblem) => {
  if (!missing.includes('content')) return messages.missingFinishedText;
  if (!missing.includes('finishedContent')) return messages.missingClosingText;
  return messages.missingClosingAndFinishedText;
};

/** The title for a refused download, matching the notice's own. */
export const DownloadRefusalTitle = () => {
  const intl = useAppIntl();
  return <>{intl.formatMessage(messages.cannotBeDownloadedYet)}</>;
};

/** What stops the download, and that it does. */
export const DownloadRefusalMessage = ({
  problem,
}: {
  problem: DownloadRefusal;
}) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  if (isLabelCollisionsSummary(problem)) {
    return <>{intl.formatMessage(messages.labelCollisions)}</>;
  }
  return (
    <>
      {intl.formatMessage(
        isBuiltInWordingSummary(problem)
          ? messages.missingBuiltInWording
          : describeProblem(problem),
        { language: languageName(problem.locale) },
      )}
    </>
  );
};

/**
 * Stage-list notice shown whenever text a participant must read has none in
 * the protocol's default language: a stage that ends the interview with no
 * text for a screen it shows, or Network Canvas's built-in wording, in a new
 * protocol in a language Network Canvas has no wording in, or text a
 * researcher cleared. The protocol can still be edited and saved; only
 * downloading it is refused. Not dismissable, because the download stays
 * refused until the text is written. Renders nothing otherwise.
 */
const DefaultLanguageTextAlert = () => {
  const intl = useAppIntl();
  const problem = useAppSelector(getDefaultLanguageTextProblem);

  if (problem === null) return null;

  return (
    <Alert variant="warning">
      <AlertTitle>
        {intl.formatMessage(messages.cannotBeDownloadedYet)}
      </AlertTitle>
      <AlertDescription className="space-y-4 text-sm">
        <span className="block">
          <DownloadRefusalMessage problem={problem} />
        </span>
        {isBuiltInWordingSummary(problem) ? (
          <NativeLink
            render={
              <Link
                href={translationTableHref({
                  kind: 'language',
                  locale: problem.locale,
                })}
              />
            }
          >
            {intl.formatMessage(messages.showMissingWording)}
          </NativeLink>
        ) : (
          <NativeLink
            render={<Link href={`/protocol/stage/${problem.stageId}`} />}
          >
            {intl.formatMessage(messages.editFinishStage)}
          </NativeLink>
        )}
      </AlertDescription>
    </Alert>
  );
};

export default DefaultLanguageTextAlert;
