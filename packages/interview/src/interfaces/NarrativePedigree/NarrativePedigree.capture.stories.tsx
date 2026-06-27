import type { Meta, StoryObj } from '@storybook/react-vite';

import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

import { buildPedigreeInterview } from './NarrativePedigree.stories';

/**
 * Screenshot-capture story for the NarrativePedigree interface. Consumed by the
 * @codaco/interface-images generation pipeline.
 *
 * NarrativePedigree is a read-only view that overlays disease status onto a
 * pedigree collected by a FamilyPedigree source stage, so the build seeds a
 * populated multi-disease pedigree (reusing the main story's builder) and the
 * capture lands on the NarrativePedigree stage itself (step index 1; the
 * FamilyPedigree source is stage 0). The multi-disease network renders the
 * sticker view, picturing the genetics overlay.
 */
const build = () => buildPedigreeInterview(1);

const meta: Meta = {
  title: 'Capture/NarrativePedigree',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'NarrativePedigree' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} currentStep={1} />,
};
