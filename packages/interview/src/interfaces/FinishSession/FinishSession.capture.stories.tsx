import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import CaptureStory, {
  type CaptureParameters,
} from '../../storybook-support/CaptureStory';

/**
 * Screenshot-capture story for the FinishSession interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots. The finish stage shows the text
 * Network Canvas supplies, as a new protocol's finish stage does.
 */
const build = () => {
  const si = new SyntheticInterview(1);

  si.addInformationStage({
    title: 'Before',
    text: 'Padding stage before the finish stage.',
  });
  si.addFinishSessionStage();
  return si;
};

const meta: Meta = {
  title: 'Capture/FinishSession',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'FinishSession' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
