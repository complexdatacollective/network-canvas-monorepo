import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { LocalizedString } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import MiniTable from '../MiniTable';
import {
  SummaryMarkdown,
  SummaryText,
  useMultilingualSummary,
} from '../SummaryText';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  introductionPanel: {
    id: 'architect.protocolSummary.stage.introductionPanel.introductionPanel',
    defaultMessage: 'Introduction Panel',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / IntroductionPanel.',
  },
});

type IntroductionPanelProps = {
  introductionPanel?: {
    title: LocalizedString;
    // Optional: a panel can show only its title.
    text?: LocalizedString;
  } | null;
};
const IntroductionPanel = ({
  introductionPanel = null,
}: IntroductionPanelProps) => {
  const intl = useAppIntl();
  const multilingual = useMultilingualSummary();
  if (!introductionPanel) {
    return null;
  }
  return (
    <SectionFrame title={intl.formatMessage(messages.introductionPanel)}>
      {multilingual ? (
        <MiniTable
          rotated
          wide
          rows={[
            [
              intl.formatMessage(summaryMessages.title),
              <SummaryText key="title" value={introductionPanel.title} />,
            ],
            ...(introductionPanel.text
              ? [
                  [
                    intl.formatMessage(summaryMessages.text),
                    <SummaryMarkdown
                      key="text"
                      value={introductionPanel.text}
                    />,
                  ],
                ]
              : []),
          ]}
        />
      ) : (
        <>
          <Heading level="h1">
            <SummaryText value={introductionPanel.title} />
          </Heading>
          <SummaryMarkdown value={introductionPanel.text} />
        </>
      )}
    </SectionFrame>
  );
};
export default IntroductionPanel;
