import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { TokenizedText, TokenPill } from './TokenPill';

const meta = {
  title: 'Components/TokenPill',
  component: TokenPill,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
A placeholder inside text, such as a person's name that is filled in later,
drawn as a pill. The rich text editor draws every placeholder it holds this
way, and \`TokenizedText\` draws them in text that is only read, so a
placeholder looks the same where it is written and where it is shown.

\`\`\`tsx
import { TokenizedText, TokenPill } from '@codaco/fresco-ui/TokenPill';

<TokenPill token="name" label="Name" />

<TokenizedText
  parts={['Add ', { token: 'name' }, '’s parents']}
  tokens={[{ id: 'name', label: 'Name' }]}
/>
\`\`\`

- \`token\`: what the text records for the placeholder.
- \`label\`: what the pill says, and what a screen reader reads.
- \`selected\`: outlines the pill, as the editor does while the caret is on it.
- \`TokenizedText\` \`parts\`: a run of words, or \`{ token }\`; \`tokens\`: the
  label of each token the text may hold.
`,
      },
    },
  },
  args: { token: 'name', label: 'Name' },
} satisfies Meta<typeof TokenPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

export const InText: Story = {
  render: () => (
    <p className="max-w-80">
      <TokenizedText
        parts={['Add ', { token: 'name' }, '’s ', { token: '#' }, ' parents']}
        tokens={[
          { id: 'name', label: 'Name' },
          { id: '#', label: 'Number' },
        ]}
      />
    </p>
  ),
  play: async ({ canvasElement }) => {
    const pill = canvasElement.querySelector('[data-token="#"]');
    await expect(pill).toHaveTextContent('Number');
    await expect(pill).toBeVisible();
  },
};

/** A token the text may not hold shows as the name it was recorded under. */
export const UnknownToken: Story = {
  render: () => (
    <p>
      <TokenizedText parts={['Add ', { token: 'relation' }]} tokens={[]} />
    </p>
  ),
};

/**
 * A long label wraps like the words around it, so a narrow column is never
 * pushed wider. Its icon stays on the line the label starts on, beside the
 * label's first word.
 */
export const LongLabel: Story = {
  args: { label: 'The name of the person this is about' },
  decorators: [
    (Story) => (
      <p className="max-w-60">
        Add <Story /> now
      </p>
    ),
  ],
};

/** In the narrowest column, the icon still starts the label's first line. */
export const NarrowColumn: Story = {
  args: { token: 'partner', label: 'partner of (x) Name' },
  decorators: [
    (Story) => (
      <p className="w-24">
        <Story />
      </p>
    ),
  ],
  play: async ({ canvasElement }) => {
    const pill = canvasElement.querySelector('[data-token="partner"]');
    const icon = pill?.querySelector('svg');
    const lead = icon?.parentElement;
    await expect(icon).toBeVisible();
    // The icon and the first word are one unbroken run, on one line.
    await expect(lead?.textContent).toBe('partner');
    await expect(lead?.getClientRects()).toHaveLength(1);
    // And the label did wrap after it.
    await expect(pill?.getClientRects().length).toBeGreaterThan(1);
  },
};
