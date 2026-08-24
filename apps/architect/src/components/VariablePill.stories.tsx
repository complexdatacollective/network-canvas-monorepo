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
  | 'animated'
  | 'displayMaxWidth'
  | 'editable'
  | 'label'
  | 'maxWidth'
  | 'minWidth'
  | 'type'
  | 'width'
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
// Content-sized between the default 12rem minimum and 20rem maximum.
<VariablePill label="participant_age" type="number" />

// Custom bounds; the label truncates after reaching maxWidth.
<VariablePill
  label="participant_neighbourhood_connection_frequency"
  type="number"
  minWidth="10rem"
  maxWidth="16rem"
/>

<ConnectedVariablePill
  animated
  editable
  uuid={variableId}
  width="100%"
/>
\`\`\`

- \`label\` is both the visible name and the machine-readable \`data\` value
  when the pill is not editable.
- \`type\` selects the attribute icon and accent color.
- Without \`width\`, the pill grows with its content between \`minWidth\`
  (default \`12rem\`) and \`maxWidth\` (default \`20rem\`).
- Labels truncate with an ellipsis only after reaching \`maxWidth\`.
- \`displayMaxWidth\` overrides that resting bound without changing the
  editable pill's expansion ceiling. Use it when the surrounding layout, not
  the editor design, determines where truncation begins.
- \`width\` forces a preferred CSS width for contexts such as
  \`VariableSpotlight\`; unless \`maxWidth\` is also supplied, that width is
  used as the maximum.
- \`animated\` changes only the border treatment.
- \`editable\` changes the semantic element to a button, adds the raised
  interaction affordance and edit tooltip, and enables the editing workflow.
- On entering edit mode, the pill transitions from its current width toward
  \`maxWidth\` while remaining anchored around the same center point. The target
  is clamped before the 1.5× edit zoom so a wide resting pill cannot overflow
  the viewport.
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
    width: {
      control: 'text',
      description:
        'Optional preferred CSS width. By default, width follows the content.',
    },
    minWidth: {
      control: 'text',
      description: 'Minimum CSS width. Defaults to 12rem.',
    },
    maxWidth: {
      control: 'text',
      description:
        'Maximum CSS width, after which the label truncates. Defaults to 20rem.',
    },
    displayMaxWidth: {
      control: 'text',
      description:
        'Optional resting maximum that does not change the edit-mode ceiling.',
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
    maxWidth: '16rem',
  },
};

export const MinimumWidth: Story = {
  args: {
    label: 'age',
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
    maxWidth: '16rem',
  },
};

export const FullWidth: Story = {
  args: {
    width: '100%',
  },
  parameters: {
    layout: 'padded',
  },
};
