import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { IdentityMark } from './IdentityMark';

const documentation = `
A small tile giving an entity a stable visual identity: a monogram on one of
six Network Canvas hues, chosen by hashing the entity's id.

\`\`\`tsx
import { IdentityMark } from '@codaco/fresco-ui/IdentityMark';

<span className="flex items-center gap-2">
  <IdentityMark id={team.id} name={team.name} size="sm" />
  <span>{team.name}</span>
</span>
\`\`\`

| Prop | Purpose |
| --- | --- |
| \`id\` | The entity id. The hue derives from this and only this, so renaming an entity changes its monogram and never its colour. |
| \`name\` | The entity name. The monogram is the first letter of the first and last word; a single word gives its first two letters; non-alphanumerics are ignored; a name with no usable characters falls back to \`?\`. |
| \`size\` | \`sm\` (24px), \`md\` (32px, default) or \`lg\` (40px). |
| \`className\` | Merged onto the tile. |

**The mark is decorative and must stay decorative.** It renders
\`aria-hidden\` and is never the entity's accessible name — two letters on a
colour identify nothing to a reader who cannot see them, and a colour that
carries meaning alone fails WCAG 1.4.1. Always render the entity's real name
beside it, as \`EntitySwitcher\` does.

**The colour is derived, not stored.** The same id gives the same hue in every
session and on every machine, so there is no assignment table to keep in sync
and nothing to migrate. The three lightest fills — mustard, sea green and sea
serpent — carry a dark foreground; the other three carry white. Those pairings
are measured: white on sea serpent is 2.23:1, below even the 3:1 floor for
large text.
`;

const meta = {
  title: 'Components/IdentityMark',
  component: IdentityMark,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: { description: { component: documentation } },
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    id: { control: 'text' },
    name: { control: 'text' },
  },
  args: {
    id: 'team_01JQ2W3T4Y5Z6A7B8C9D0EFGHJ',
    name: 'SONIC Lab',
    size: 'md',
  },
} satisfies Meta<typeof IdentityMark>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The three sizes, which step the tile and its monogram together. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <IdentityMark {...args} size="sm" />
      <IdentityMark {...args} size="md" />
      <IdentityMark {...args} size="lg" />
    </div>
  ),
};

/**
 * The whole palette, and the foreground each hue takes. Six ids chosen to land
 * on the six fills — change the ids and they land somewhere else, which is the
 * point.
 */
export const Palette: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      {['team_5', 'team_2', 'team_3', 'team_0', 'team_1', 'team_4'].map(
        (id) => (
          <IdentityMark key={id} {...args} id={id} />
        ),
      )}
    </div>
  ),
};

/**
 * How names become monograms: two words give their initials, one word gives
 * its first two letters, punctuation and emoji fall out, digits count, and a
 * name with nothing usable in it falls back rather than rendering an empty
 * tile.
 */
export const MonogramDerivation: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      {[
        'SONIC Lab',
        'Complex Data Collective',
        'Sociogram',
        'the   SONIC   lab',
        'Bo & Co.',
        '2024 Cohort',
        '🙂 Happy Team 🙂',
        '•••',
      ].map((name) => (
        <div key={name} className="flex items-center gap-3">
          <IdentityMark {...args} name={name} id={name} />
          <span className="text-sm">{name}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The fallback is the one that would otherwise fail silently: an empty
    // tile looks like a rendering fault rather than a missing name.
    await expect(canvas.getByText('?')).toBeInTheDocument();
    await expect(canvas.getByText('2C')).toBeInTheDocument();
  },
};

/**
 * The pairing the component is built for. The mark carries no name of its own,
 * so the name beside it is the only one a screen reader reads.
 */
export const BesideTheName: Story = {
  render: (args) => (
    <span className="flex items-center gap-2 text-sm font-semibold">
      <IdentityMark {...args} size="sm" />
      <span>{args.name}</span>
    </span>
  ),
  play: async ({ canvasElement }) => {
    const mark = canvasElement.querySelector('[aria-hidden="true"]');
    await expect(mark).not.toBeNull();
    // The monogram is present in the DOM and absent from the accessible name.
    await expect(mark).toHaveTextContent('SL');
    await expect(canvasElement).toHaveTextContent('SONIC Lab');
  },
};
