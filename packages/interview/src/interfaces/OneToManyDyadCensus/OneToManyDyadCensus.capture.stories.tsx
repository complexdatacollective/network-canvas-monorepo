import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import CaptureStory, {
  type CaptureParameters,
} from '../../../.storybook/CaptureStory';

/**
 * Screenshot-capture story for the OneToManyDyadCensus interface. Consumed by
 * the @codaco/interface-images generation pipeline; tune the synthetic data
 * here to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nt = si.addNodeType({ name: 'Person' });
  const et = si.addEdgeType({ name: 'Friendship' });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('OneToManyDyadCensus', {
    label: 'One-to-Many Dyad Census',
    initialNodes: { count: 8 },
    subject: { entity: 'node', type: nt.id },
    behaviours: { removeAfterConsideration: false },
  });
  stage.addPrompt({
    text: 'Is this person friends with any of the people shown below?',
    createEdge: et.id,
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/OneToManyDyadCensus',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'OneToManyDyadCensus' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
