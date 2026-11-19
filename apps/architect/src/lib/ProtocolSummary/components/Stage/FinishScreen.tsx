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

import { SummaryMarkdown } from '../SummaryText';
import SectionFrame from './SectionFrame';
import StageWording, { type SummaryStage } from './StageWording';

type FinishScreenProps = {
  mode?: FinishMode;
  content?: LocalizedString | null;
  finishedContent?: LocalizedString | null;
  outcome?: FinishOutcome | null;
  /** The stage, for the words a participant sees while finishing. */
  stage: SummaryStage;
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
  stage,
}: FinishScreenProps) => {
  const intl = useAppIntl();
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
      <StageWording
        stage={stage}
        omits={(path) =>
          path === 'finishConfirmation' && mode !== 'confirmation'
        }
      />
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
