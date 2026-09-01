import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download, Settings, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import NavItem from './NavItem';

/**
 * `<li>` belongs inside a list and nowhere else, so every story renders one —
 * this is the list `NavList` would otherwise supply, not decoration. The width
 * class is the story's own: a sidebar destination is only interesting at a
 * stated width.
 */
const SidebarFrame = ({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) => (
  // Redundant in the abstract, but Tailwind's preflight sets `list-style: none`
  // and Safari drops list semantics from an unstyled list — the same reason
  // `NavList` marks its own lists.
  // oxlint-disable-next-line jsx-a11y/no-redundant-roles
  <ul role="list" className={`flex list-none flex-col gap-1 ${className}`}>
    {children}
  </ul>
);

const documentation = `
One navigation destination: a link, an optional leading icon, and an optional
count.

\`\`\`tsx
import NavItem from '@codaco/fresco-ui/navigation/NavItem';

<NavItem
  href={\`/study/\${studyId}/participants\`}
  label={t('participants')}
  icon={Users}
  count={study.participantCount}
  current={pathname.endsWith('/participants')}
  renderLink={({ children, ...props }) => <Link {...props}>{children}</Link>}
/>
\`\`\`

**Props**

- \`href\` — the destination, passed to \`renderLink\` untouched.
- \`label\` — the destination's name, as one whole translated string.
- \`icon\` — an optional Lucide icon, rendered \`aria-hidden\` because it repeats
  the label.
- \`count\` — how many things are at the destination. Rendered inside the link,
  so it joins the link's accessible name ("Participants 84") instead of being
  announced as a stray number. Zero is omitted entirely.
- \`current\` — whether this is the destination being shown. Sets
  \`aria-current="page"\`; the fill and the marker bar are additional to that
  state, never the only carrier of it.
- \`renderLink\` — renders the link element. Supplied by the host, so this
  component knows nothing about routing; defaults to a plain \`<a>\`.
- \`className\` — applied to the \`<li>\` the component renders.

**Operated by Tab and Enter.** A sidebar is a list of links, not a composite
widget: nothing here implements roving focus, which would take every
destination out of the tab order.
`;

const meta = {
  title: 'Navigation/NavItem',
  component: NavItem,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: documentation } },
  },
  argTypes: {
    icon: {
      control: 'select',
      options: ['none', 'Users', 'Download', 'Settings'],
      mapping: { none: undefined, Users, Download, Settings },
    },
    renderLink: { control: false },
  },
  args: {
    href: '/study/1/participants',
    label: 'Participants',
    icon: Users,
    count: 84,
    current: false,
  },
  render: (args) => (
    <SidebarFrame className="w-72">
      <NavItem {...args} />
    </SidebarFrame>
  ),
} satisfies Meta<typeof NavItem>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The count sits inside the link, so it is read as part of the destination's
 * name rather than as a number of its own.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('link', { name: 'Participants 84' }),
    ).toBeInTheDocument();
  },
};

/** The destination currently being shown. */
export const Current: Story = {
  args: { current: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link');

    // The state is on the element, not only in the fill behind it.
    await expect(link).toHaveAttribute('aria-current', 'page');
  },
};

/**
 * A count of zero is left off. "Participants" reads better than
 * "Participants 0", and an area with nothing in it has nothing to count.
 */
export const ZeroCountIsOmitted: Story = {
  args: { count: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link');

    await expect(link).toHaveAccessibleName('Participants');
    await expect(link).not.toHaveTextContent('0');
  },
};

/** Not every destination has an icon, and the row is laid out for both. */
export const WithoutIcon: Story = {
  args: { icon: undefined, label: 'Study settings', count: undefined },
};

/**
 * A translated label runs about a third longer than its English source, and
 * some languages compound rather than break. The label wraps and the row grows
 * — it is never truncated, and the count never gets pushed out.
 */
export const LongLabel: Story = {
  args: {
    label: 'Teilnehmerinnen und Teilnehmer verwalten',
    count: 1284,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const label = canvas.getByText('Teilnehmerinnen und Teilnehmer verwalten');
    const styles = getComputedStyle(label);

    // Nothing here can clip the label: the box does not hide what overflows
    // it, the text is allowed to wrap, and no ellipsis stands in for the part
    // that did not fit. `truncate` would fail all three.
    await expect(styles.overflowX).toBe('visible');
    await expect(styles.overflowY).toBe('visible');
    await expect(styles.whiteSpace).toBe('normal');
    await expect(styles.textOverflow).toBe('clip');

    // And it did wrap: the label is taller than one line, so the row grew for
    // it rather than holding it to a fixed height.
    await expect(label.clientHeight).toBeGreaterThan(
      parseFloat(styles.lineHeight),
    );
  },
};

/** At a narrow width — the drawer on a phone — the label wraps rather than clips. */
export const NarrowContainer: Story = {
  args: { label: 'Recruitment and scheduling', count: 12 },
  render: (args) => (
    <SidebarFrame className="w-44">
      <NavItem {...args} />
    </SidebarFrame>
  ),
};

/** At a wide width the row keeps the count at the far end of the line. */
export const WideContainer: Story = {
  render: (args) => (
    <SidebarFrame className="w-[26rem]">
      <NavItem {...args} />
    </SidebarFrame>
  ),
};

/**
 * The host supplies the link element, so the component works with any router.
 * This one is a plain anchor that records the navigation instead of performing
 * it — a router's `Link` goes in exactly the same place.
 */
export const HostSuppliedLink: Story = {
  args: {
    renderLink: ({ children, ...props }) => (
      <a data-host-link="" {...props}>
        {children}
      </a>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: 'Participants 84' });

    await expect(link).toHaveAttribute('data-host-link');
    // Reached by Tab, activated by Enter — no roving focus, no arrow keys.
    await userEvent.tab();
    await expect(link).toHaveFocus();
  },
};
