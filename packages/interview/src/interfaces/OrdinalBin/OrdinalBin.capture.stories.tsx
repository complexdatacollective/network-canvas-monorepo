import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import CaptureStory, {
  type CaptureParameters,
} from '../../../.storybook/CaptureStory';

/**
 * Screenshot-capture story for the OrdinalBin interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nt = si.addNodeType({ name: 'Person' });
  const closenessVar = nt.addVariable({
    name: 'Closeness',
    type: 'ordinal',
    options: [
      { label: 'Not Close', value: 1 },
      { label: 'Somewhat Close', value: 2 },
      { label: 'Close', value: 3 },
      { label: 'Very Close', value: 4 },
      { label: 'Extremely Close', value: 5 },
    ],
  });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('OrdinalBin', {
    label: 'Rate Closeness',
    initialNodes: { count: 8 },
    subject: { entity: 'node', type: nt.id },
  });
  stage.addPrompt({
    variable: closenessVar.id,
    text: 'How close do you feel to each of these people?',
    color: 'ord-color-seq-1',
  });

  // Clear the ordinal value on the first few nodes so they appear in the
  // bucket (unassigned) alongside nodes already sorted into bins.
  for (let i = 0; i < 3; i++) {
    si.setNodeAttribute(i, closenessVar.id, null);
  }

  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/OrdinalBin',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'OrdinalBin' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
