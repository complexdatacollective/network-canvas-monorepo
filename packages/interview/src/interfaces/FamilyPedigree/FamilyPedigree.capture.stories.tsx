import type { Meta, StoryObj } from '@storybook/react-vite';
import { screen, userEvent } from 'storybook/test';

import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

import {
  buildScenarioInterview,
  type StoryArgs,
  WithPartnerAndChildren,
} from './FamilyPedigree.stories';

/**
 * Screenshot-capture story for the FamilyPedigree interface. Consumed by the
 * @codaco/interface-images generation pipeline.
 *
 * Rather than seeding the network by hand (the pedigree's edge/metadata
 * invariants are owned by its wizards), this replays the
 * WithPartnerAndChildren scenario through the real quick-start wizard: ego,
 * both parents (Linda ⚭ Robert), partner Jennifer, and children Daniel and
 * Emma. The capture runner waits for the play function to complete before
 * screenshotting, so the image shows the resulting three-generation
 * pedigree on the canvas.
 */
const build = () => buildScenarioInterview();

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
  render: () => <CaptureStory build={build} />,
  play: async (ctx) => {
    await WithPartnerAndChildren.play?.(ctx);
    // Dismiss the post-wizard "Building the rest of your pedigree" hint so
    // the pedigree canvas itself is pictured.
    const gotIt = await screen.findByRole(
      'button',
      { name: 'Got it' },
      { timeout: 10_000 },
    );
    await userEvent.click(gotIt);
  },
};
