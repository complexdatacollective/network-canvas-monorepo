import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

/**
 * Screenshot-capture story for the EgoForm interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('EgoForm', {
    label: 'About You',
    introductionPanel: {
      title: 'About You',
      text: 'Please answer the following questions about yourself. Your responses will be kept confidential.',
    },
  });
  stage.addFormField({ component: 'Text', prompt: 'What is your name?' });
  stage.addFormField({ component: 'Number', prompt: 'How old are you?' });
  stage.addFormField({
    component: 'TextArea',
    prompt: 'Describe yourself briefly.',
  });
  stage.addFormField({ component: 'Toggle', prompt: 'Do you live alone?' });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/EgoForm',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'EgoForm' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
