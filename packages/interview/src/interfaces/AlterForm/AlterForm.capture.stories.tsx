import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import CaptureStory, {
  type CaptureParameters,
} from '../../storybook-support/CaptureStory';

/**
 * Screenshot-capture story for the AlterForm interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nt = si.addNodeType({ name: 'Person' });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('AlterForm', {
    label: 'About Each Person',
    initialNodes: { count: 3 },
    subject: { entity: 'node', type: nt.id },
  });
  stage.addFormField({ component: 'Text', prompt: 'Nickname' });
  stage.addFormField({ component: 'Number', prompt: 'Age' });
  stage.addFormField({
    component: 'RadioGroup',
    prompt: 'How close are you to this person?',
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/AlterForm',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'AlterForm' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
