import { Link } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import type { FinishStageTextProblem } from '@codaco/protocol-validation';
import { useAppSelector } from '~/ducks/hooks';
import { getFinishStageTextProblem } from '~/selectors/issues';

import { useLanguageName } from './Localization/useLanguageName';

const messages = defineMessages({
  cannotBeDownloadedYet: {
    id: 'architect.finishStageText.cannotBeDownloadedYet',
    defaultMessage: 'This protocol can’t be downloaded yet',
    description:
      'Title of the notice on the stage list, and of the dialog shown when a download is refused, while a stage that ends the interview has no text for a screen it shows in the protocol’s default language.',
  },
  missingClosingAndFinishedText: {
    id: 'architect.finishStageText.missingClosingAndFinishedText',
    defaultMessage:
      'A stage that ends the interview has no text for its closing screen or its finished screen in {language}. The protocol can’t be downloaded until it’s added.',
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
export const FinishStageTextRefusalTitle = () => {
  const intl = useAppIntl();
  return <>{intl.formatMessage(messages.cannotBeDownloadedYet)}</>;
};

/** What is missing, in which language, and that it blocks downloading. */
export const FinishStageTextRefusal = ({
  problem,
}: {
  problem: FinishStageTextProblem;
}) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  return (
    <>
      {intl.formatMessage(describeProblem(problem), {
        language: languageName(problem.locale),
      })}
    </>
  );
};

/**
 * Stage-list notice shown whenever a stage that ends the interview has no
 * text for a screen it shows in the protocol's default language: a new protocol in a
 * language Network Canvas supplies no closing text for, or text a researcher
 * cleared. The protocol can still be edited and saved; only downloading it is
 * refused. Not dismissable, because the download stays refused until the text
 * is written. Renders nothing otherwise.
 */
const FinishStageTextAlert = () => {
  const intl = useAppIntl();
  const problem = useAppSelector(getFinishStageTextProblem);

  if (problem === null) return null;

  return (
    <Alert variant="warning" className="mx-auto mb-10 max-w-3xl">
      <AlertTitle>
        {intl.formatMessage(messages.cannotBeDownloadedYet)}
      </AlertTitle>
      <AlertDescription className="space-y-4 text-sm">
        <span className="block">
          <FinishStageTextRefusal problem={problem} />
        </span>
        <NativeLink
          render={<Link href={`/protocol/stage/${problem.stageId}`} />}
        >
          {intl.formatMessage(messages.editFinishStage)}
        </NativeLink>
      </AlertDescription>
    </Alert>
  );
};

export default FinishStageTextAlert;
