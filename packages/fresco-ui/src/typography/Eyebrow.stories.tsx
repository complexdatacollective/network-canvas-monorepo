import type { Meta, StoryObj } from '@storybook/react-vite';

import Eyebrow from './Eyebrow';
import Heading from './Heading';
import Paragraph from './Paragraph';

const meta = {
  title: 'Design System/Typography/Eyebrow',
  component: Eyebrow,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
A short uppercase label set above or beside something else: a category marker, a field label in a fact list, a "featured" flag. Bold monospace at the smallest size with tight leading, so it never reads as a line of copy.

\`\`\`tsx
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';

<Eyebrow tone="primary">Featured protocol</Eyebrow>
<Heading level="h3">Test-to-PrEP</Heading>

<dl>
  <Eyebrow render={<dt />}>Population</Eyebrow>
  <dd>Older adults involved with Adult Protective Services</dd>
</dl>
\`\`\`

Props:
- \`tone\` — \`muted\` (default), \`default\` (inherits the current colour), or \`primary\`.
- \`render\` — substitute the rendered element (\`<span />\`, \`<dt />\`, \`<legend />\`); defaults to \`<p>\`.
- Any other HTML attributes are passed through.
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    tone: {
      control: 'select',
      options: ['default', 'muted', 'primary'],
      description: 'Colour treatment of the label',
    },
  },
} satisfies Meta<typeof Eyebrow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Field of study',
  },
};

export const Tones: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-xs">muted (default)</div>
        <Eyebrow tone="muted">Field of study</Eyebrow>
      </div>
      <div>
        <div className="mb-2 text-xs">default</div>
        <Eyebrow tone="default">Field of study</Eyebrow>
      </div>
      <div>
        <div className="mb-2 text-xs">primary</div>
        <Eyebrow tone="primary">Featured protocol</Eyebrow>
      </div>
    </div>
  ),
};

export const AboveAHeading: Story = {
  render: () => (
    <div className="max-w-xl">
      <Eyebrow tone="primary">Featured protocol</Eyebrow>
      <Heading level="h3" margin="none" className="mt-1">
        Test-to-PrEP
      </Heading>
      <Heading level="label" variant="subtitle" margin="none" className="mt-2">
        Test-to-PrEP: A Randomized Hybrid Implementation/Effectiveness Trial of
        a Social Network Strategy to Increase Equitable Reach of HIV Testing and
        PrEP Information
      </Heading>
      <Paragraph intent="meta" emphasis="muted" margin="none" className="mt-2">
        Bravo A, Butts S, Johnson AL, Rodriguez E, Rabin B, Smith L, Kanamori M,
        &amp; Doblecki-Lewis S
      </Paragraph>
    </div>
  ),
};

export const AsDefinitionTerm: Story = {
  render: () => (
    <dl className="grid max-w-md gap-4">
      <div>
        <Eyebrow render={<dt />}>Population</Eyebrow>
        <dd className="mt-1">
          Older adults involved with Adult Protective Services
        </dd>
      </div>
      <div>
        <Eyebrow render={<dt />}>Uses rosters</Eyebrow>
        <dd className="mt-1">Yes</dd>
      </div>
    </dl>
  ),
};

export const LongLabelWraps: Story = {
  render: () => (
    <div className="max-w-40">
      <Eyebrow>
        Tie-strength census with a label long enough to wrap onto several lines
      </Eyebrow>
    </div>
  ),
};
