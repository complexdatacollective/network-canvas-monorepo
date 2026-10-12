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
  markedStandIn: false,
  referencedElsewhere: false,
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
 * An adopted placeholder relative with details missing: named by their label
 * alone, without the soft hyphens, described as adopted and missing details,
 * and with the warning badge clear of every line of the label.
 */
export const AdoptedPlaceholderWithMissingDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const symbol = canvas.getByRole('button', {
      name: 'Paternal grandparent 1',
      description: 'Adopted. Some details are missing.',
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

/**
 * An adopted relative with details missing who donated to one child and
 * carried another as a surrogate: their roles are read out as the symbol's
 * description, and nothing is drawn for them beyond the symbol, the badge
 * and the brackets.
 */
export const DonorAndSurrogateRolesAreSpoken: Story = {
  args: {
    label: 'Aunt',
    shape: 'circle',
    reproductiveRoles: ['donor', 'gestationalCarrier'],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const symbol = canvas.getByRole('button', {
      name: 'Aunt',
      description:
        'Adopted. Some details are missing. egg or sperm donor and surrogate',
    });
    await expect(symbol).toBeInTheDocument();
    // No pedigree letter is drawn: the only visible text is the label.
    const person = canvas.getByTestId('pedigree-person');
    const visibleText = [...person.querySelectorAll('*')]
      .filter(
        (element) =>
          !element.closest('[hidden]') &&
          [...element.childNodes].some(
            (node) =>
              node.nodeType === Node.TEXT_NODE &&
              (node.textContent ?? '').trim() !== '',
          ),
      )
      .map((element) => element.textContent?.trim());
    await expect(visibleText).toEqual(['Aunt']);
  },
};

/** A donor who carried the pregnancy, read out in plain words. */
export const TraditionalSurrogateRoleIsSpoken: Story = {
  args: {
    label: 'Sister',
    shape: 'circle',
    adopted: false,
    hasMissingDetails: false,
    reproductiveRoles: ['traditionalSurrogate'],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', {
        name: 'Sister',
        description: 'egg donor who carried the pregnancy',
      }),
    ).toBeInTheDocument();
    await expect(canvas.queryByText('S')).toBeNull();
  },
};
