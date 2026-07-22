import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Definition from './Definition';
import Paragraph from './typography/Paragraph';

const meta = {
  title: 'Components/Definition',
  component: Definition,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `An inline term that reveals an expanded definition on hover or keyboard focus. It composes Fresco's Base UI Tooltip primitives and renders a keyboard-focusable \`span\` by default.

The definition is also connected to the term with \`aria-describedby\`, because Base UI tooltips are visual-only. Screen readers receive the definition without depending on the popup being visible.

Use \`asAbbreviation\` only when the visible text is genuinely an abbreviation. This switches the term to an \`abbr\` element without adding a competing native \`title\` tooltip.

\`\`\`tsx
import Definition from '@codaco/fresco-ui/Definition';

<Definition definition="Computer-assisted personal interviewing" asAbbreviation>
  CAPI
</Definition>
\`\`\`

Props:
- \`children\`: the visible term or phrase.
- \`definition\`: non-interactive content shown in the tooltip.
- \`asAbbreviation\`: renders the term as \`abbr\` instead of \`span\`.
- \`side\`, \`align\`, and \`sideOffset\`: control tooltip placement.
- \`showArrow\`: shows or hides the tooltip arrow.`,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
      description: 'The visible term or phrase.',
    },
    definition: {
      control: 'text',
      description: 'The expanded definition shown in the tooltip.',
    },
    asAbbreviation: {
      control: 'boolean',
      description: 'Render the visible term as an abbr element.',
    },
    side: {
      control: 'select',
      options: ['top', 'bottom', 'left', 'right'],
    },
    align: {
      control: 'select',
      options: ['start', 'center', 'end'],
    },
    sideOffset: {
      control: { type: 'number', min: 0 },
    },
    showArrow: {
      control: 'boolean',
    },
  },
  args: {
    children: 'personal network',
    definition:
      'The people an individual knows and the relationships among them.',
    asAbbreviation: false,
    side: 'top',
    align: 'center',
    sideOffset: 10,
    showArrow: true,
  },
} satisfies Meta<typeof Definition>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const term = canvas.getByText('personal network');
    await userEvent.hover(term);
    await waitFor(() => expect(term).toHaveAttribute('data-popup-open'));
    await expect(term).toHaveAccessibleDescription(
      'The people an individual knows and the relationships among them.',
    );
  },
};

export const Abbreviation: Story = {
  args: {
    children: 'CAPI',
    definition: 'Computer-assisted personal interviewing',
    asAbbreviation: true,
  },
};

export const InlineProse: Story = {
  render: (args) => (
    <Paragraph>
      The study examines each participant&apos;s <Definition {...args} /> and
      how those relationships change over time.
    </Paragraph>
  ),
};

export const LongDefinition: Story = {
  args: {
    children: 'name generator',
    definition:
      'A question or set of questions used to identify people who belong in a participant’s personal network, often by asking about specific kinds of relationships, interactions, or support.',
    side: 'bottom',
  },
};

export const KeyboardFocus: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const term = canvas.getByText('personal network');
    term.focus();
    await expect(term).toHaveFocus();
    await waitFor(() => expect(term).toHaveAttribute('data-popup-open'));
    await expect(term).toHaveAccessibleDescription(
      'The people an individual knows and the relationships among them.',
    );
  },
};
