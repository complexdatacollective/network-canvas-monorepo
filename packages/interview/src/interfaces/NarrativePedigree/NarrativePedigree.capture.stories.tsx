import type { Meta, StoryObj } from '@storybook/react-vite';

import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

import { buildComprehensivePedigree } from './comprehensivePedigreeFixture';

/**
 * Screenshot-capture story for the NarrativePedigree interface. Consumed by the
 * @codaco/interface-images generation pipeline.
 *
 * NarrativePedigree is a read-only view that overlays disease status onto a
 * pedigree collected by a FamilyPedigree source stage, so the build seeds the
 * populated multi-disease pedigree and the capture lands on the NarrativePedigree
 * stage itself (step index 1; the FamilyPedigree source is stage 0). The
 * multi-disease network renders the sticker view, picturing the genetics overlay.
 *
 * showAtRisk and includeMrtBranch are passed explicitly so the captured image is
 * pinned to the at-risk overlay and the full comprehensive pedigree (including the
 * Architect/import-authored MRT branch) — the richest symbol coverage — regardless
 * of the builder's defaults, keeping the generated interface image stable.
 */
const build = () => buildComprehensivePedigree(1, true, true);

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
