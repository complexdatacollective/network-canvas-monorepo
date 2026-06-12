import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

/**
 * Screenshot-capture story for the TieStrengthCensus interface. Consumed by
 * the @codaco/interface-images generation pipeline; tune the synthetic data
 * here to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nt = si.addNodeType({ name: 'Person' });
  const et = si.addEdgeType({ name: 'Friendship' });
  const strengthVar = et.addVariable({
    name: 'Strength',
    type: 'ordinal',
    options: [
      { label: 'Weak', value: 1 },
      { label: 'Moderate', value: 2 },
      { label: 'Strong', value: 3 },
    ],
  });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('TieStrengthCensus', {
    label: 'Rate Relationships',
    initialNodes: { count: 4 },
    subject: { entity: 'node', type: nt.id },
    introductionPanel: {
      title: 'Rate Your Relationships',
      text: 'In this stage, you will be shown pairs of people from your network. For each pair, please indicate the strength of their relationship.',
    },
  });
  stage.addPrompt({
    text: 'How strong is the friendship between these two people?',
    createEdge: et.id,
    edgeVariable: strengthVar.id,
    negativeLabel: 'They are not friends',
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/TieStrengthCensus',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    // advance: dismiss the stage's introduction panel so the pair UI is
    // pictured (showNavigation keeps the Next button available; the runner
    // removes the navigation before screenshotting).
    capture: {
      interface: 'TieStrengthCensus',
      advance: 1,
    } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} showNavigation />,
};
