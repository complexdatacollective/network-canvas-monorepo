import Markdown from '~/components/Form/Fields/Markdown';

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
      <h1>{introductionPanel.title}</h1>
      <Markdown label={introductionPanel.text} />
    </SectionFrame>
  );
};

export default IntroductionPanel;
