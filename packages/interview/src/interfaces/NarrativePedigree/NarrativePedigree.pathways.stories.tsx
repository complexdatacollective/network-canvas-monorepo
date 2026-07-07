import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

import { addComprehensivePedigree } from './comprehensivePedigreeFixture';

// ---------------------------------------------------------------------------
// A single comprehensive NarrativePedigree example: six conditions chosen so
// that COLLECTIVELY they exercise every inheritance pattern the interface
// supports AND every status a Sticker can show (affected, "will develop"
// (obligateAffected), carrier (obligateCarrier), and the two at-risk statuses),
// with each condition reaching ego and — wherever the biology allows — her
// children. Ego and her partner are paternal first cousins, so the union is
// consanguineous and their children are autozygous for the recessive condition.
// The pedigree itself lives in `comprehensivePedigreeFixture` so it can also be
// composed into the FamilyPedigree→NarrativePedigree flow story.
// ---------------------------------------------------------------------------

/** Build a SyntheticInterview seeded with the comprehensive all-pathways pedigree. */
export function buildAllPathwaysInterview(seed: number, showAtRisk = true) {
  const si = new SyntheticInterview(seed);
  addComprehensivePedigree(si, showAtRisk);
  return si;
}

function AllPathwaysWrapper({ seed }: { seed: number }) {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildAllPathwaysInterview(seed).getInterviewPayload({ currentStep: 1 }),
      ),
    [seed],
  );
  return (
    <div className="h-screen">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta: Meta = {
  title: 'Interfaces/NarrativePedigree',
  parameters: { layout: 'fullscreen' },
  // `buildAllPathwaysInterview` is an exported fixture helper (used by tests),
  // not a story. Without this, CSF auto-registers it as a broken story that
  // freezes the browser when opened.
  excludeStories: ['buildAllPathwaysInterview'],
};

export default meta;

type Story = StoryObj;

/**
 * Every inheritance pattern and every status in one pedigree. Open the key
 * (right) and select each condition to walk the pathways; at-risk statuses are
 * shown so the "will develop", carrier and at-risk glyphs all appear.
 */
export const AllInheritancePatterns: Story = {
  render: () => <AllPathwaysWrapper seed={7} />,
};
