import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import SuperJSON from 'superjson';

import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

import { buildComprehensivePedigree } from './comprehensivePedigreeFixture';

// The NarrativePedigree stage sits at index 1 (its FamilyPedigree source is index
// 0); currentStep is a 0-based index into the stages array.
const NP_STEP = 1;

type NarrativePedigreeArgs = {
  // Mirrors the stage's `showAtRiskStatuses` option: whether the probabilistic
  // markers ("may develop", "may carry") are drawn in addition to the certain
  // ones.
  showAtRiskStatuses: boolean;
  // Whether to include the mitochondrial-donation (MRT) branch. Fixed per story
  // (not a control) because MRT is not participant-reachable — see the
  // MitochondrialDonation story.
  includeMrtBranch: boolean;
};

function NarrativePedigreeStory({
  showAtRiskStatuses,
  includeMrtBranch,
}: NarrativePedigreeArgs) {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildComprehensivePedigree(
          1,
          showAtRiskStatuses,
          includeMrtBranch,
        ).getInterviewPayload({
          currentStep: NP_STEP,
        }),
      ),
    [showAtRiskStatuses, includeMrtBranch],
  );

  return (
    <div className="h-screen">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta = {
  title: 'Interfaces/NarrativePedigree',
  component: NarrativePedigreeStory,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    showAtRiskStatuses: {
      control: 'boolean',
      description:
        'Show the at-risk (probabilistic) markers alongside the certain ones.',
    },
    // Fixed per story rather than a control: the MRT branch is Architect/import-
    // authored, so it belongs to its own story, not a toggle on the default one.
    includeMrtBranch: { table: { disable: true } },
  },
  args: { showAtRiskStatuses: true, includeMrtBranch: false },
} satisfies Meta<typeof NarrativePedigreeStory>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The inheritance-pathways explorer over a single family that manifests all six
 * conditions. Open the key on the right and select a condition to walk its
 * pathway; toggle **showAtRiskStatuses** in the controls to add or hide the
 * probabilistic markers.
 *
 * This pedigree contains only structure a participant can build through the
 * FamilyPedigree interface (at most one egg contributor per child). For the
 * mitochondrial-replacement-therapy (MRT) case, which is not participant-
 * reachable, see the **Mitochondrial donation (MRT)** story.
 */
export const Default: Story = {};

/**
 * The same family with an added **mitochondrial replacement therapy (MRT)**
 * branch: ego's maternal aunt Margaret — at risk down the maternal (mtDNA) line —
 * conceives her daughter Chloe from two eggs. Margaret's egg supplies the nucleus
 * and a donor's egg (Ivy Brooks) supplies the mitochondria, so Chloe inherits
 * Margaret's autosomes (she stays at risk for Huntington's) but escapes the
 * mitochondrial condition. Select **Mitochondrial Myopathy** in the key to see
 * Chloe's mtDNA routed down the donor's line.
 *
 * A two-egg child cannot be built through the participant FamilyPedigree interface
 * (its parentage form allows at most one egg contributor per child). This
 * structure is authorable only via Architect or protocol import, so it is shown
 * here as a separate, explicitly Architect/import-authored example rather than as
 * part of the default pedigree.
 */
export const MitochondrialDonation: Story = {
  args: { includeMrtBranch: true },
};
