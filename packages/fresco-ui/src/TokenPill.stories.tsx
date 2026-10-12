import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

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
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Number', { selector: '[data-token]' }),
    ).toBeVisible();
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

/** A long label stays on one line rather than breaking inside the pill. */
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
