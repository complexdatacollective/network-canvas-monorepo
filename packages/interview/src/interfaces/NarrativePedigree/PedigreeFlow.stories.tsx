import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

import { addComprehensivePedigree } from './comprehensivePedigreeFixture';

// ---------------------------------------------------------------------------
// A short, navigable "mini interview" for subject experts: an introduction, the
// FamilyPedigree stage where a family is drawn, then the NarrativePedigree stage
// where the genetics of that same family are explored. It demonstrates the
// hand-off from data COLLECTION (FamilyPedigree) to genetic VISUALISATION
// (NarrativePedigree) over one shared network — use the interview's own Back /
// Next controls to move between the two stages.
// ---------------------------------------------------------------------------

/**
 * Build the flow interview: Information intro (step 0) → FamilyPedigree (step 1)
 * → NarrativePedigree (step 2), sharing one seeded family network.
 */
export function buildPedigreeFlowInterview(seed: number) {
  const si = new SyntheticInterview(seed);
  si.addInformationStage({
    label: 'Welcome',
    title: 'Your family health history',
    text:
      'This short walk-through has two parts. First you will build your family ' +
      'tree, adding relatives and noting any conditions that run in the family. ' +
      'Then you will explore how those conditions may be inherited across the ' +
      'generations. Use Next to begin, and Back at any time to make changes.',
  });
  addComprehensivePedigree(si);
  return si;
}

function PedigreeFlowWrapper({ seed }: { seed: number }) {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildPedigreeFlowInterview(seed).getInterviewPayload({
          currentStep: 0,
        }),
      ),
    [seed],
  );
  return (
    <div className="h-screen">
      {/* Hide developer-only affordances (e.g. the pedigree Dump/Load buttons)
          so the walk-through reads as a real interview for demonstration. */}
      <StoryInterviewShell rawPayload={rawPayload} isDevelopment={false} />
    </div>
  );
}

const meta: Meta = {
  title: 'Examples/Pedigree Flow',
  parameters: { layout: 'fullscreen' },
  excludeStories: ['buildPedigreeFlowInterview'],
};

export default meta;

type Story = StoryObj;

/**
 * The full FamilyPedigree → NarrativePedigree journey. Starts on the
 * introduction; press Next to reach the pedigree, then Next again to explore the
 * inheritance of the conditions recorded in it. Back returns to the pedigree.
 */
export const CollectThenExplore: Story = {
  render: () => <PedigreeFlowWrapper seed={7} />,
};
