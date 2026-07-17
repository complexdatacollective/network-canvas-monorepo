import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import CaptureStory, {
  type CaptureParameters,
} from '../../../.storybook/CaptureStory';

/**
 * Screenshot-capture story for the Anonymisation interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Anonymisation', {
    explanationText: {
      title: 'Data Anonymisation',
      body: 'Your data will be anonymised using a **passphrase** that you create below.\n\nThis passphrase is used to generate a unique encryption key that replaces any identifying information in your responses. Only someone with the same passphrase can link your data back to you.\n\nPlease choose a passphrase that is memorable but not easily guessed.',
    },
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/Anonymisation',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'Anonymisation' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
