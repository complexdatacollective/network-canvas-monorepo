import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import CaptureStory, {
  type CaptureParameters,
} from '../../storybook-support/CaptureStory';

/**
 * Screenshot-capture story for the LanguageChooser interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  si.setLocalization({ defaultLocale: 'en', locales: ['en', 'es', 'ar'] });

  si.addInformationStage({
    title: 'Before',
    text: 'Padding stage before the language chooser.',
  });
  si.addStage('LanguageChooser');
  si.addInformationStage({
    title: 'After',
    text: 'Padding stage after the language chooser.',
  });
  return si;
};

const meta: Meta = {
  title: 'Capture/LanguageChooser',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'LanguageChooser' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
