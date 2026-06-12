import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

/**
 * Screenshot-capture story for the Information interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);

  si.addInformationStage({
    title: 'Before',
    text: 'Padding stage before the main information stage.',
  });
  si.addInformationStage({
    title: 'Welcome',
    text: 'Thank you for participating in this study. Please read each screen carefully and follow the instructions provided.',
  });
  si.addInformationStage({
    title: 'After',
    text: 'Padding stage after the main information stage.',
  });
  return si;
};

const meta: Meta = {
  title: 'Capture/Information',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'Information' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
