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
  // markers ("may develop", "may carry", the "two copies" homozygous marker) are
  // drawn in addition to the certain ones.
  showAtRiskStatuses: boolean;
};

function NarrativePedigreeStory({ showAtRiskStatuses }: NarrativePedigreeArgs) {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildComprehensivePedigree(1, showAtRiskStatuses).getInterviewPayload({
          currentStep: NP_STEP,
        }),
      ),
    [showAtRiskStatuses],
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
  },
  args: { showAtRiskStatuses: true },
} satisfies Meta<typeof NarrativePedigreeStory>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The inheritance-pathways explorer over a single family that manifests all six
 * conditions. Open the key on the right and select a condition to walk its
 * pathway; toggle **showAtRiskStatuses** in the controls to add or hide the
 * probabilistic markers.
 */
export const Default: Story = {};
