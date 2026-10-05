import type { Meta, StoryObj } from '@storybook/react-vite';

import CaptureStory, {
  type CaptureParameters,
} from '../../storybook-support/CaptureStory';
import {
  buildScenarioInterview,
  type StoryArgs,
  WithPartnerAndChildren,
} from './FamilyPedigree.stories';
import { SuppressPedigreeHintContext } from './pedigreeHintContext';

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
 * pedigree on the canvas. The post-wizard "Building the rest of your
 * pedigree" hint is suppressed, as in the scenario stories, so the canvas
 * itself is pictured.
 */
const build = () => buildScenarioInterview();

const meta: Meta<StoryArgs> = {
  // '!test': the play function replays WithPartnerAndChildren, which the
  // vitest storybook project already runs.
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
  render: () => (
    <SuppressPedigreeHintContext.Provider value={true}>
      <CaptureStory build={build} />
    </SuppressPedigreeHintContext.Provider>
  ),
  play: async (ctx) => {
    await WithPartnerAndChildren.play?.(ctx);
  },
};
