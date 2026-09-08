import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Markdown from '~/components/Markdown';

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
    title: string;
    text: string;
  } | null;
};
const IntroductionPanel = ({
  introductionPanel = null,
}: IntroductionPanelProps) => {
  const intl = useAppIntl();
  if (!introductionPanel) {
    return null;
  }
  return (
    <SectionFrame title={intl.formatMessage(messages.introductionPanel)}>
      <Heading level="h1">{introductionPanel.title}</Heading>
      <Markdown label={introductionPanel.text} />
    </SectionFrame>
  );
};
export default IntroductionPanel;
