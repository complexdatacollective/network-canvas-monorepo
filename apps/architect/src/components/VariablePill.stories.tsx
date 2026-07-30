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
  'animated' | 'editable' | 'label' | 'type' | 'width'
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
\`VariablePill\` is the single presentation component for every variable
reference in Architect. Its semantics and visual treatment are controlled
independently:

| Props | Element and behavior | Use when |
| --- | --- | --- |
| \`editable={false}\`, \`animated={false}\` | Non-interactive \`<data>\` with a static type-colored border. | Picker options, query previews, stage configuration, and printable output. This is the default. |
| \`editable={false}\`, \`animated\` | Non-interactive \`<data>\` with an animated border. | A static on-screen reference needs extra visual emphasis. Never use this for printable output. |
| \`editable\` | A button with a details popover and modal name editor. | The variable itself can be inspected and renamed. Provide \`onLabelChange\` to persist edits. |
| \`ConnectedVariablePill\` | Resolves \`label\` and \`type\` from a variable UUID, validates uniqueness, then renders \`VariablePill\`. | Architect state owns the variable and edits must update the protocol codebook. |

\`\`\`tsx
<VariablePill label="participant_age" type="number" width="20rem" />

<ConnectedVariablePill
  animated
  editable
  uuid={variableId}
  width="20rem"
/>
\`\`\`

- \`label\` is both the visible name and the machine-readable \`data\` value
  when the pill is not editable.
- \`type\` selects the variable icon and accent color.
- \`width\` accepts any CSS width and defaults to \`20rem\`.
- \`animated\` changes only the border treatment.
- \`editable\` changes the semantic element and enables the editing workflow.
`,
      },
    },
  },
  args: {
    label: 'participant_age',
    type: 'number',
    width: '20rem',
    animated: false,
    editable: false,
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Displayed variable name.',
    },
    type: {
      control: 'select',
      options: VARIABLE_TYPES,
      description: 'Variable type, which selects the icon and accent color.',
    },
    width: {
      control: 'text',
      description: 'CSS width applied to the pill.',
    },
    animated: {
      control: 'boolean',
      description: 'Enables the animated border independently of editing.',
    },
    editable: {
      control: 'boolean',
      description: 'Enables the details popover and modal name editor.',
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
  },
};

export const Narrow: Story = {
  args: {
    width: '14rem',
  },
};

export const Wide: Story = {
  args: {
    width: '28rem',
  },
};
