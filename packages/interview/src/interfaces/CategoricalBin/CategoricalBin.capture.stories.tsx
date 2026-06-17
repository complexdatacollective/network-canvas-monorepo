import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

/**
 * Screenshot-capture story for the CategoricalBin interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nt = si.addNodeType({ name: 'Person' });
  const categoryVar = nt.addVariable({
    name: 'Relationship Context',
    type: 'categorical',
    options: [
      { label: 'Family', value: 1 },
      { label: 'Work', value: 2 },
      { label: 'School', value: 3 },
      { label: 'Neighborhood', value: 4 },
      { label: 'Social', value: 5 },
    ],
  });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('CategoricalBin', {
    label: 'Categorise People',
    initialNodes: { count: 8 },
    subject: { entity: 'node', type: nt.id },
  });
  stage.addPrompt({
    variable: categoryVar.id,
    text: 'Which of these options best describes how you know each person?',
  });

  // Clear the categorical value on the first few nodes so they appear in the
  // bucket (uncategorised) alongside nodes already sorted into bins.
  for (let i = 0; i < 3; i++) {
    si.setNodeAttribute(i, categoryVar.id, null);
  }

  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/CategoricalBin',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'CategoricalBin' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
