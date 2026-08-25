import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { VariableType } from '@codaco/protocol-validation';

import { VariablePill, type VariablePillProps } from './VariablePill';

const VARIABLE_TYPES = [
  'boolean',
  'categorical',
  'datetime',
  'layout',
  'location',
  'number',
  'ordinal',
  'scalar',
  'text',
] as const satisfies readonly VariableType[];

type StoryArgs = Pick<
  VariablePillProps,
  'animated' | 'className' | 'editable' | 'label' | 'type'
>;

const StoryVariablePill = ({ label, ...props }: StoryArgs) => {
  const [currentLabel, setCurrentLabel] = useState(label);

  return (
    <VariablePill
      {...props}
      label={currentLabel}
      onLabelChange={setCurrentLabel}
    />
  );
};

const meta = {
  title: 'Components/VariablePill',
  component: VariablePill,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
\`VariablePill\` is the single presentation component for every attribute
reference in Architect. Its semantics and visual treatment are controlled
independently:

| Props | Element and behavior | Use when |
| --- | --- | --- |
| \`editable={false}\`, \`animated={false}\` | Non-interactive \`<data>\` with a static type-colored border. | Picker options, query previews, stage configuration, and printable output. This is the default. |
| \`editable={false}\`, \`animated\` | Non-interactive \`<data>\` with an animated border. | A static on-screen reference needs extra visual emphasis. Never use this for printable output. |
| \`editable\` | A button that opens the anchored name editor directly. Hover, focus, and tooltip affordances communicate the action. | The attribute can be renamed. Provide \`onLabelChange\` to persist edits. |
| \`ConnectedVariablePill\` | Resolves \`label\` and \`type\` from an attribute UUID, validates uniqueness, then renders \`VariablePill\`. | Architect state owns the attribute and edits must update the protocol codebook. |

\`\`\`tsx
// Content-sized and constrained by its container.
<VariablePill label="participant_age" type="number" />

// A Tailwind max-width truncates a longer label.
<VariablePill
  label="participant_neighbourhood_connection_frequency"
  type="number"
  className="max-w-64"
/>

<ConnectedVariablePill
  animated
  editable
  uuid={variableId}
  className="max-w-80"
/>
\`\`\`

- \`label\` is both the visible name and the machine-readable \`data\` value
  when the pill is not editable.
- \`type\` selects the attribute icon and accent color.
- The pill is exactly as wide as its label and type icon require by default.
- Its containing block provides the default width constraint; long labels
  truncate rather than expanding beyond it.
- \`className\` composes Tailwind layout constraints such as \`max-w-64\`.
- \`animated\` changes only the border treatment.
- \`editable\` changes the semantic element to a button, adds the raised
  interaction affordance and edit tooltip, and enables the editing workflow.
- On entering edit mode, the pill expands from its current width to
  its available maximum while remaining anchored around the same center point.
`,
      },
    },
  },
  args: {
    label: 'participant_age',
    type: 'number',
    animated: false,
    editable: false,
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Displayed attribute name.',
    },
    type: {
      control: 'select',
      options: VARIABLE_TYPES,
      description: 'Attribute type, which selects the icon and accent color.',
    },
    className: {
      control: 'text',
      description:
        'Optional Tailwind classes, such as max-w-64, for context-specific layout constraints.',
    },
    animated: {
      control: 'boolean',
      description: 'Enables the animated border independently of editing.',
    },
    editable: {
      control: 'boolean',
      description:
        'Makes the pill a directly editable button with a tooltip and anchored name editor.',
    },
  },
  render: (args) => (
    <StoryVariablePill key={`${args.label}-${args.type}`} {...args} />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = {};

export const Animated: Story = {
  args: {
    animated: true,
  },
};

export const Editable: Story = {
  args: {
    animated: true,
    editable: true,
  },
};

export const EditableStaticBorder: Story = {
  args: {
    editable: true,
  },
};

export const LongLabel: Story = {
  args: {
    animated: true,
    editable: true,
    label: 'participant_neighbourhood_connection_frequency',
    className: 'max-w-64',
  },
};

export const ContentSized: Story = {
  args: {
    label: 'participant_neighbourhood',
  },
};

export const MaximumWidth: Story = {
  args: {
    label:
      'participant_neighbourhood_connection_frequency_during_the_last_year',
    className: 'max-w-64',
  },
};
