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

import { SummaryMarkdown } from '../SummaryText';
import SectionFrame from './SectionFrame';

type FinishScreenProps = {
  content?: LocalizedString | null;
  outcome?: FinishOutcome | null;
};

/**
 * A finish stage's text and outcome. Its heading is the stage's page heading,
 * printed with every other stage's.
 */
const FinishScreen = ({
  content = null,
  outcome = null,
}: FinishScreenProps) => {
  const intl = useAppIntl();
  return (
    <>
      {content && (
        <SectionFrame
          title={intl.formatMessage(finishSessionMessages.textLabel)}
        >
          <SummaryMarkdown value={content} />
        </SectionFrame>
      )}
      {outcome && (
        <SectionFrame
          title={intl.formatMessage(finishSessionMessages.outcomeLabel)}
        >
          <Paragraph>
            {intl.formatMessage(finishOutcomeWords[outcome].label)}
          </Paragraph>
        </SectionFrame>
      )}
    </>
  );
};

export default FinishScreen;
