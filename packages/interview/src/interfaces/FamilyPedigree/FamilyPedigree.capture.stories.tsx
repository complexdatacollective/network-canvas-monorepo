import type { Meta, StoryObj } from '@storybook/react-vite';

import CaptureStory, {
  type CaptureParameters,
} from '../../storybook-support/CaptureStory';
import {
  buildScenarioInterview,
  type StoryArgs,
  WithPartnerAndChildren,
} from './FamilyPedigree.stories';
import { clickDialogPrimary } from './familyPedigreeWizardHelpers';

/**
 * Screenshot-capture story for the FamilyPedigree interface. Consumed by the
 * @codaco/interface-images generation pipeline.
 *
 * Rather than seeding the network by hand (the pedigree's edge/metadata
 * invariants are owned by its wizards), this replays the
 * WithPartnerAndChildren scenario through the real quick-start wizard: ego,
 * both parents (Linda ⚭ Robert), partner James, and children Daniel and
 * Emma. The capture runner waits for the play function to complete before
 * screenshotting, so the image shows the resulting three-generation
 * pedigree on the canvas.
 */
const build = () => buildScenarioInterview();

// Stable identity: a fresh object each render would re-derive the payload and
// restart the wizard replay under the capture runner.
const STOP_AT_PEDIGREE = { stageIndex: 1 };

const meta: Meta<StoryArgs> = {
  // '!test' matches the scenario stories: the wizard replay is too slow for
  // the vitest storybook project.
  tags: ['capture', '!test'],
  title: 'Capture/FamilyPedigree',
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'FamilyPedigree' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj<StoryArgs> = {
  args: { scaffoldingText: '' },
  // The picture is of the pedigree the wizard below builds, so the stage has
  // to arrive empty: `stopAt` ends the walk on it (index 1, behind the
  // leading Information stage), and the get-started button the replay needs
  // only appears while the network has no nodes.
  render: () => <CaptureStory build={build} stopAt={STOP_AT_PEDIGREE} />,
  play: async (ctx) => {
    await WithPartnerAndChildren.play?.(ctx);
    // Dismiss the post-wizard "Building the rest of your pedigree" hint so
    // the pedigree canvas itself is pictured.
    await clickDialogPrimary();
  },
};
