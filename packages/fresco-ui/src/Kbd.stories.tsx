import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import Kbd from './Kbd';

const meta = {
  title: 'Components/Kbd',
  component: Kbd,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `A keyboard key, or a run of them, rendered as real \`kbd\` elements.

\`\`\`tsx
import Kbd from '@codaco/fresco-ui/Kbd';

<Kbd keys="Esc" />
<Kbd keys="⌘K" label="Search and commands (Command K)" />
<Kbd keys={['G', 'P']} label="Shortcut: G then P" />
\`\`\`

| Prop | Purpose |
| --- | --- |
| \`keys\` | One key, or the keys of a combination or sequence — each renders as its own cap. Keys are the literal glyphs the keyboard shows and are never translated. |
| \`label\` | What the caps mean, as one whole translated string. It becomes the hint's accessible name, and the caps are then hidden from assistive technology. |

Whether a run is a combination (held together) or a sequence (pressed one after another) is carried by \`label\`, not by a separator glyph: no glyph says it in every language, and the accessible name has to say it anyway.

The cap face comes from the theme's own \`kbd\` element style, so a key hint looks the same here as in any prose that uses the element directly. Both themes are covered by that style — switch the toolbar's theme to see it.`,
      },
    },
  },
  tags: ['autodocs'],
  args: { keys: 'Esc' },
} satisfies Meta<typeof Kbd>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One key, announced as itself. */
export const SingleKey: Story = {
  args: { keys: 'Esc' },
};

/** A combination the caller writes as one cap, the way a shortcut hint reads. */
export const Combination: Story = {
  args: { keys: '⌘K', label: 'Search and commands (Command K)' },
};

/** A chord: two keys pressed one after the other, explained by the label. */
export const Sequence: Story = {
  args: { keys: ['G', 'P'], label: 'Shortcut: G then P' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Two caps are drawn, and the phrase — not the loose letters — is what
    // assistive technology is given.
    const caps = canvasElement.querySelectorAll('kbd');
    await expect(caps).toHaveLength(2);
    await expect(caps[0]?.closest('[aria-hidden="true"]')).not.toBeNull();
    await expect(canvas.getByText('Shortcut: G then P')).toBeInTheDocument();
  },
};

/** The runs the everything bar's footer renders, inline in their hint text. */
export const InlineHints: Story = {
  args: { keys: 'Esc' },
  render: () => (
    <div className="text-text flex items-center gap-4 text-xs">
      <span className="flex items-center gap-1.5">
        <Kbd keys={['↑', '↓']} label="Up and down arrows" />
        Navigate
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd keys="↵" label="Enter" />
        Select
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd keys="Esc" />
        Close
      </span>
    </div>
  ),
};

/** Caps stay a consistent width, so a run does not look ragged. */
export const KeyWidths: Story = {
  args: { keys: 'Esc' },
  render: () => (
    <div className="flex items-center gap-2">
      {['G', 'W', '↑', '↵', '⌘K', 'Esc', 'Shift'].map((key) => (
        <Kbd key={key} keys={key} />
      ))}
    </div>
  ),
};
