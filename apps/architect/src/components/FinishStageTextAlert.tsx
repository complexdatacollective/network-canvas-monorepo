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
      'Title of the notice on the stage list, and of the dialog shown when a download is refused, while the stage that ends the interview has no heading or text in the protocol’s default language.',
  },
  missingHeadingAndText: {
    id: 'architect.finishStageText.missingHeadingAndText',
    defaultMessage:
      'The stage that ends the interview has no heading or text in {language}. The protocol can’t be downloaded until they’re added.',
    description:
      'Shown while the stage that ends the interview has neither a heading nor text in the protocol’s default language. language is the name of that language, for example “Japanese”.',
  },
  missingHeading: {
    id: 'architect.finishStageText.missingHeading',
    defaultMessage:
      'The stage that ends the interview has no heading in {language}. The protocol can’t be downloaded until it’s added.',
    description:
      'Shown while the stage that ends the interview has text but no heading in the protocol’s default language. language is the name of that language, for example “Japanese”.',
  },
  missingText: {
    id: 'architect.finishStageText.missingText',
    defaultMessage:
      'The stage that ends the interview has no text in {language}. The protocol can’t be downloaded until it’s added.',
    description:
      'Shown while the stage that ends the interview has a heading but no text in the protocol’s default language. language is the name of that language, for example “Japanese”.',
  },
  editFinishStage: {
    id: 'architect.finishStageText.editFinishStage',
    defaultMessage: 'Edit the stage that ends the interview',
    description:
      'Link in the notice about the missing heading or text. It opens the editor for the stage that ends the interview.',
  },
});

const describeProblem = ({ missing }: FinishStageTextProblem) => {
  if (!missing.includes('title')) return messages.missingText;
  if (!missing.includes('content')) return messages.missingHeading;
  return messages.missingHeadingAndText;
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
 * Stage-list notice shown whenever the stage that ends the interview has no
 * heading or text in the protocol's default language: a new protocol in a
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
