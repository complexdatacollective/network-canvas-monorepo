import { useAppIntl } from '@codaco/app-i18n/react';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  finishOutcomeWords,
  finishSessionMessages,
} from '@codaco/protocol-builder/editors/finish-session/finishSessionMessages';
import type {
  FinishOutcome,
  LocalizedString,
} from '@codaco/protocol-validation';

import MiniTable from '../MiniTable';
import { SummaryMarkdown, SummaryText } from '../SummaryText';
import SectionFrame from './SectionFrame';

/** The words a participant sees while finishing the interview. */
type FinishingText = {
  finishLabel?: LocalizedString;
  finishConfirmation?: LocalizedString;
  finishedNotice?: LocalizedString;
  finishFailed?: LocalizedString;
};

type FinishScreenProps = {
  content?: LocalizedString | null;
  outcome?: FinishOutcome | null;
  finishing?: FinishingText;
};

/**
 * A finish stage's text, its finishing words and its outcome. Its heading is
 * the stage's page heading, printed with every other stage's. Each section's
 * content keeps the same space below the section's title band as the tables
 * in other sections.
 */
const FinishScreen = ({
  content = null,
  outcome = null,
  finishing = {},
}: FinishScreenProps) => {
  const intl = useAppIntl();
  const finishingRows = (
    [
      ['finishLabel', finishSessionMessages.finishLabelLabel],
      ['finishConfirmation', finishSessionMessages.finishConfirmationLabel],
      ['finishedNotice', finishSessionMessages.finishedNoticeLabel],
      ['finishFailed', finishSessionMessages.finishFailedLabel],
    ] as const
  ).flatMap(([key, label]) => {
    const value = finishing[key];
    return value === undefined
      ? []
      : [[intl.formatMessage(label), <SummaryText key={key} value={value} />]];
  });
  return (
    <>
      {content && (
        <SectionFrame
          title={intl.formatMessage(finishSessionMessages.textLabel)}
        >
          <div className="my-5">
            <SummaryMarkdown value={content} />
          </div>
        </SectionFrame>
      )}
      {finishingRows.length > 0 && (
        <SectionFrame
          title={intl.formatMessage(finishSessionMessages.finishingTitle)}
        >
          <MiniTable rotated rows={finishingRows} />
        </SectionFrame>
      )}
      {outcome && (
        <SectionFrame
          title={intl.formatMessage(finishSessionMessages.outcomeLabel)}
        >
          <Paragraph className="my-5">
            {intl.formatMessage(finishOutcomeWords[outcome].label)}
          </Paragraph>
        </SectionFrame>
      )}
    </>
  );
};

export default FinishScreen;
