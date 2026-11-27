import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect } from 'storybook/test';

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
  'className' | 'editable' | 'label' | 'type'
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
\`VariablePill\` is Architect's attribute pill: it draws protocol-builder's one
\`VariablePill\` (the same pill as the attribute pickers and the stage editors)
and adds a rename editor and the Redux connection:

| Props | Element and behavior | Use when |
| --- | --- | --- |
| \`editable={false}\` | Non-interactive \`<data>\` with a static type-colored border. | The codebook, query previews and printable output. This is the default. |
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

// Renameable from Architect state; static border, as everywhere but the picker.
<ConnectedVariablePill editable uuid={variableId} className="max-w-80" />
\`\`\`

- \`label\` is both the visible name and the machine-readable \`data\` value
  when the pill is not editable.
- \`type\` selects the attribute icon and accent color.
- The pill is exactly as wide as its label and type icon require by default.
- Its containing block provides the default width constraint; long labels
  truncate rather than expanding beyond it.
- \`className\` composes Tailwind layout constraints such as \`max-w-64\`.
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

const pillOf = (canvasElement: HTMLElement) => {
  const pill = canvasElement.querySelector('.variable-pill');
  if (!(pill instanceof HTMLElement)) {
    throw new Error('the pill did not render');
  }
  return pill;
};

/** A static pill draws in the accent of its type, read from the page. */
export const Static: Story = {
  play: async ({ canvasElement }) => {
    const pill = pillOf(canvasElement);
    await expect(pill.tagName).toBe('DATA');
    await expect(getComputedStyle(pill).backgroundColor).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
  },
};

/**
 * The editable pill draws the same pill as the static one, as a button: the
 * same accent and the same mark.
 */
export const Editable: Story = {
  args: {
    editable: true,
  },
  play: async ({ canvasElement }) => {
    const pill = pillOf(canvasElement);
    await expect(pill.tagName).toBe('BUTTON');
    await expect(getComputedStyle(pill).backgroundColor).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
    const mark = pill.querySelector('img');
    await expect(mark?.getAttribute('alt')).toBe('');
  },
};

export const LongLabel: Story = {
  args: {
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
