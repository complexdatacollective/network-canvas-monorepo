import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

/**
 * Screenshot-capture story for the DyadCensus interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nt = si.addNodeType({ name: 'Person' });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('DyadCensus', {
    label: 'Dyad Census',
    initialNodes: { count: 4 },
    subject: { entity: 'node', type: nt.id },
    introductionPanel: {
      title: 'Network Relationships',
      text: 'In this section, you will be asked about relationships between people in your network. For each pair of people, please indicate whether they know each other.',
    },
  });
  stage.addPrompt({
    text: 'Do these two people know each other?',
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/DyadCensus',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    // advance: dismiss the stage's introduction panel so the pair UI is
    // pictured (showNavigation keeps the Next button available; the runner
    // removes the navigation before screenshotting).
    capture: {
      interface: 'DyadCensus',
      advance: 1,
    } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} showNavigation />,
};
