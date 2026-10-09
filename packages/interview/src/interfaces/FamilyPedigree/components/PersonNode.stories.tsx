import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import type { Person } from '../model';
import PersonNode from './PersonNode';

const placeholder: Person = {
  id: 'grandparent',
  isEgo: false,
  name: undefined,
  hasUnreadableName: false,
  hasOtherDetails: false,
  genderIdentity: undefined,
  genderWords: undefined,
  sexAssignedAtBirth: undefined,
  relativesNotRecorded: [],
  attributes: {},
};

const noop = () => undefined;

const meta: Meta<typeof PersonNode> = {
  title: 'Interfaces/FamilyPedigree/PersonNode',
  component: PersonNode,
  parameters: { layout: 'centered' },
  args: {
    person: placeholder,
    // A long kinship label, as a placeholder relative is given, with the
    // soft hyphens it breaks at.
    label: 'Paternal grand­parent 1',
    color: 'node-color-seq-1',
    shape: 'diamond',
    selected: false,
    menuOpen: false,
    linking: false,
    adopted: true,
    hasMissingDetails: true,
    onActivate: noop,
    tabIndex: 0,
    onFocus: noop,
    onKeyDown: noop,
    onPointerEnter: noop,
    onPointerLeave: noop,
    onPointerDown: noop,
  },
  render: (args) => (
    <div className="size-28">
      <PersonNode {...args} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<typeof PersonNode>;

/** The rectangles the label's text is drawn in, line by line. */
const textRects = (element: Element) => {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  return [...range.getClientRects()];
};

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * An adopted placeholder relative with details missing: announced with
 * both, without the soft hyphens, and with the warning badge clear of every
 * line of the label.
 */
export const AdoptedPlaceholderWithMissingDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const symbol = canvas.getByRole('button', {
      name: 'Paternal grandparent 1, adopted, some details missing',
    });
    await expect(symbol).toBeInTheDocument();

    const person = canvas.getByTestId('pedigree-person');
    const badge = person.querySelector('[data-missing-details-badge]');
    if (!badge) throw new Error('No badge');
    const badgeBox = badge.getBoundingClientRect();
    const label = within(symbol).getByText(/Paternal/);
    const lines = textRects(label);
    await expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      await expect(overlaps(line, badgeBox)).toBe(false);
    }
  },
};
