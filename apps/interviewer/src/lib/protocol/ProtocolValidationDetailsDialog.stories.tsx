import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useMemo, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';

import {
  type ProtocolValidationIssue,
  ProtocolValidationDetailsDialogView,
} from './ProtocolValidationDetailsDialog';

type IssueSet = 'typical' | 'long' | 'fallback';

type StoryArgs = {
  issueSet: IssueSet;
  open: boolean;
};

const typicalIssues: ProtocolValidationIssue[] = [
  {
    path: 'stages.0.label',
    message: 'Required',
  },
  {
    path: 'codebook.node.person.variables.age.type',
    message: 'Invalid literal value, expected "number"',
  },
  {
    path: 'stages.2.prompts.0.additionalAttributes',
    message: 'Unrecognized key: "promptColor"',
  },
];

const longIssues: ProtocolValidationIssue[] = Array.from(
  { length: 18 },
  (_, index) => ({
    path: `stages.${index}.prompts.0.variable`,
    message: `Variable reference "missing_variable_${index + 1}" does not exist in the codebook.`,
  }),
);

function getIssues(issueSet: IssueSet) {
  if (issueSet === 'fallback') return undefined;
  if (issueSet === 'long') return longIssues;
  return typicalIssues;
}

function ValidationDetailsDialogStory({
  issueSet,
  open: initialOpen,
}: StoryArgs) {
  const [open, setOpen] = useState(initialOpen);
  const issues = useMemo(() => getIssues(issueSet), [issueSet]);

  useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen, issueSet]);

  return (
    <div className="flex min-h-96 items-center justify-center">
      <Button color="primary" onClick={() => setOpen(true)}>
        View validation details
      </Button>
      <ProtocolValidationDetailsDialogView
        open={open}
        onClose={() => setOpen(false)}
        issues={issues}
        message="Protocol failed schema validation."
      />
    </div>
  );
}

const meta: Meta<StoryArgs> = {
  title: 'Protocol Import/ValidationDetailsDialog',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The dialog opened from the protocol-import failure toast when a protocol fails validation. It shows the validation issues in an inset scroll area and provides a Copy action for support requests.',
      },
    },
  },
  args: {
    issueSet: 'typical',
    open: true,
  },
  argTypes: {
    issueSet: {
      control: 'inline-radio',
      options: ['typical', 'long', 'fallback'],
      description:
        'Typical renders a short issue list, long exercises the inset scroll area, and fallback shows the message used when no issue array is available.',
    },
    open: {
      control: 'boolean',
      description: 'Whether the dialog starts open.',
    },
  },
  render: (args) => <ValidationDetailsDialogStory {...args} />,
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

export const LongErrorList: Story = {
  args: {
    issueSet: 'long',
  },
};

export const FallbackMessage: Story = {
  args: {
    issueSet: 'fallback',
  },
};
