import { useAppIntl } from '@codaco/app-i18n/react';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  finishModeWords,
  finishOutcomeWords,
  finishSessionMessages,
} from '@codaco/protocol-builder/editors/finish-session/finishSessionMessages';
import type {
  FinishMode,
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
  finishFailed?: LocalizedString;
};

type FinishScreenProps = {
  mode?: FinishMode;
  content?: LocalizedString | null;
  finishedContent?: LocalizedString | null;
  outcome?: FinishOutcome | null;
  finishing?: FinishingText;
};

/**
 * A finish stage's mode, its closing and finished text, its finishing words
 * and its outcome. The closing text and the confirmation question are only
 * printed for a stage that asks participants to confirm, because an automatic
 * one never shows them. Each section's content keeps the same space below the
 * section's title band as the tables in other sections.
 */
const FinishScreen = ({
  mode = 'confirmation',
  content = null,
  finishedContent = null,
  outcome = null,
  finishing = {},
}: FinishScreenProps) => {
  const intl = useAppIntl();
  const finishingRows = (
    [
      ['finishLabel', finishSessionMessages.finishLabelLabel],
      ['finishConfirmation', finishSessionMessages.finishConfirmationLabel],
      ['finishFailed', finishSessionMessages.finishFailedLabel],
    ] as const
  ).flatMap(([key, label]) => {
    const value = finishing[key];
    return value === undefined ||
      (key === 'finishConfirmation' && mode !== 'confirmation')
      ? []
      : [[intl.formatMessage(label), <SummaryText key={key} value={value} />]];
  });
  return (
    <>
      <SectionFrame title={intl.formatMessage(finishSessionMessages.modeLabel)}>
        <Paragraph className="my-5">
          {intl.formatMessage(finishModeWords[mode].label)}
        </Paragraph>
      </SectionFrame>
      {mode === 'confirmation' && content && (
        <SectionFrame
          title={intl.formatMessage(finishSessionMessages.closingTextLabel)}
        >
          <div className="my-5">
            <SummaryMarkdown value={content} />
          </div>
        </SectionFrame>
      )}
      {finishedContent && (
        <SectionFrame
          title={intl.formatMessage(finishSessionMessages.finishedTextLabel)}
        >
          <div className="my-5">
            <SummaryMarkdown value={finishedContent} />
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
