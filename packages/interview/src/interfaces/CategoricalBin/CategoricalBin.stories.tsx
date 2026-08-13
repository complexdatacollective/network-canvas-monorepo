import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type { VariableOption } from '@codaco/protocol-validation';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

const CATEGORY_LABELS = [
  'Family',
  'Work',
  'School',
  'Neighborhood',
  'Social',
  'Online',
  'Sports',
  'Religious',
  'Political',
  'Other',
];

type StoryArgs = {
  categoryCount: number;
  hasMissingValue: boolean;
  hasOtherOption: boolean;
  otherReasonRequired: boolean;
  initialNodeCount: number;
  unassignedCount: number;
  promptCount: number;
};

function buildOptions(categoryCount: number, hasMissingValue: boolean) {
  const options: VariableOption[] = [];

  if (hasMissingValue) {
    options.push({ label: 'N/A', value: -1 });
  }

  for (let i = 0; i < categoryCount; i++) {
    const label = CATEGORY_LABELS[i] ?? `Category ${i + 1}`;
    options.push({ label, value: i + 1 });
  }

  return options;
}

function buildInterview(args: StoryArgs) {
  const interview = new SyntheticInterview();
  const options = buildOptions(args.categoryCount, args.hasMissingValue);

  const nodeType = interview.addNodeType({ name: 'Person' });

  // `component` here is incidental, not required: the "Other" dialog derives
  // validation directly from the codebook variable without resolving a
  // component, so an otherVariable created without one (e.g. via Architect's
  // "Create New Variable" dialog) works identically. `validation` is
  // deliberately omitted unless `otherReasonRequired` is set, so the story can
  // demonstrate that the dialog follows the codebook rule rather than imposing
  // its own required state.
  const otherVariableId = args.hasOtherOption
    ? nodeType.addVariable({
        name: 'Other Reason',
        type: 'text',
        component: 'Text',
        ...(args.otherReasonRequired ? { validation: { required: true } } : {}),
      }).id
    : undefined;

  const variables: string[] = [];
  for (let i = 0; i < args.promptCount; i++) {
    const ref = nodeType.addVariable({
      name: `Category ${i + 1}`,
      type: 'categorical',
      options,
    });
    variables.push(ref.id);
  }

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const stage = interview.addStage('CategoricalBin', {
    label: 'Categorise People',
    initialNodes: { count: args.initialNodeCount },
    subject: { entity: 'node', type: nodeType.id },
  });

  for (let i = 0; i < args.promptCount; i++) {
    stage.addPrompt({
      variable: variables[i],
      text: `Prompt ${i + 1}: Which categories does each person belong to?`,
      ...(otherVariableId && {
        otherVariable: otherVariableId,
        otherVariablePrompt: 'Please specify the other category:',
        otherOptionLabel: 'Other',
      }),
    });
  }

  // Clear categorical values on the first `unassignedCount` nodes so they
  // appear in the bucket (uncategorised).
  const clampedUnassigned = Math.min(
    args.unassignedCount,
    args.initialNodeCount,
  );
  for (let i = 0; i < clampedUnassigned; i++) {
    for (const varId of variables) {
      interview.unsetNodeAttribute(i, varId);
    }
    if (otherVariableId) {
      interview.unsetNodeAttribute(i, otherVariableId);
    }
  }

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return interview;
}

const CategoricalBinStoryWrapper = (args: StoryArgs) => {
  const configKey = JSON.stringify(args);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const interview = useMemo(() => buildInterview(args), [configKey]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/CategoricalBin',
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    categoryCount: {
      control: { type: 'range', min: 2, max: 10 },
      description: 'Number of categories',
    },
    hasMissingValue: {
      control: 'boolean',
      description: 'Include a "N/A" category with negative value',
    },
    hasOtherOption: {
      control: 'boolean',
      description: 'Add an "Other" bin with a text input prompt',
    },
    otherReasonRequired: {
      control: 'boolean',
      description:
        'Apply a codebook `required` rule to the "Other" reason variable.',
    },
    initialNodeCount: {
      control: { type: 'range', min: 0, max: 15 },
      description: 'Total number of nodes in the network',
    },
    unassignedCount: {
      control: { type: 'range', min: 0, max: 15 },
      description: 'Nodes without a category (appear in bucket)',
    },
    promptCount: {
      control: { type: 'range', min: 1, max: 4 },
      description: 'Number of prompts (pips appear for 2+)',
    },
  },
  args: {
    categoryCount: 4,
    hasMissingValue: false,
    hasOtherOption: false,
    otherReasonRequired: false,
    initialNodeCount: 8,
    unassignedCount: 3,
    promptCount: 1,
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  render: (args) => <CategoricalBinStoryWrapper {...args} />,
};

export const OtherBinRequiresAReason: Story = {
  args: {
    hasOtherOption: true,
    otherReasonRequired: true,
    unassignedCount: 3,
  },
  render: (args) => <CategoricalBinStoryWrapper {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          'The "Other" reason variable has a codebook `required` rule, so an empty submission is rejected. Turn `otherReasonRequired` off to allow an empty response.',
      },
    },
  },
};
