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
 * printed with every other stage's. Each section's content keeps the same
 * space below the section's title band as the tables in other sections.
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
          <div className="my-5">
            <SummaryMarkdown value={content} />
          </div>
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
