import Heading from '@codaco/fresco-ui/typography/Heading';
import Markdown from '~/components/Markdown';

import SectionFrame from './SectionFrame';
type IntroductionPanelProps = {
  introductionPanel?: {
    title: string;
    text: string;
  } | null;
};
const IntroductionPanel = ({
  introductionPanel = null,
}: IntroductionPanelProps) => {
  if (!introductionPanel) {
    return null;
  }
  return (
    <SectionFrame title="Introduction Panel">
      <Heading level="h1">{introductionPanel.title}</Heading>
      <Markdown label={introductionPanel.text} />
    </SectionFrame>
  );
};
export default IntroductionPanel;
