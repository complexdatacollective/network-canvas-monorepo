import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  CreditCard,
  Download,
  FolderOpen,
  History,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import NavItem from './NavItem';
import NavList from './NavList';

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
  \`aria-current="page"\`; the tinted fill is additional to that state, never the
  only carrier of it.
- \`renderLink\` — renders the link element. Supplied by the host, so this
  component knows nothing about routing; defaults to a plain \`<a>\`. \`href\` is
  a URL, so a router that builds its own destination (TanStack Router's \`to\`,
  React Router's \`to\`) is handed it there instead — the mapping is the host's,
  which is the point of the prop.
- \`disabled\` + \`unavailableReason\` — the destination is not available on this
  deployment. The pair is required together: \`disabled\` without a reason does
  not typecheck.
- \`className\` — applied to the \`<li>\` the component renders.

**Operated by Tab and Enter.** A sidebar is a list of links, not a composite
widget: nothing here implements roving focus, which would take every
destination out of the tab order.

**An unavailable destination is text, not a disabled link.** \`disabled\` renders
the row with no \`href\`, no \`tabIndex\`, no \`role\` and no \`aria-disabled\` — the
usual focusable-\`aria-disabled\` shape cannot be spelled here without giving the
row a \`link\` or \`button\` role, which is the announcement this state exists to
prevent. The row is still an \`<li>\` in the sidebar's list, which is how a screen
reader enumerates the sidebar, so it is found and read — "Billing, Managed
deployments only" — without occupying a stop in the tab order that would do
nothing when activated.

Use it for a place this deployment genuinely does not have (billing on a
self-hosted instance), not for one that is merely unbuilt. An unbuilt
destination gets a route and a placeholder.
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

/**
 * A destination this deployment does not have — billing on a self-hosted
 * instance. It is shown rather than hidden, because a researcher who has read
 * about billing should find out where it went, and it says why rather than
 * being mysteriously dim.
 *
 * The row is text: no `href`, nothing focusable, and nothing that announces as
 * a link or a button. What separates it from an enabled row is structural, not
 * chromatic — the reason line, the lock, and no response to hover. The one
 * colour difference is a single step, `text-text/70` against the enabled row's
 * `text-text/75`: 5.20:1 in the worst case (light theme, over `--background`)
 * against the enabled row's 6.00:1, where 4.5:1 is required and the next step
 * down measures 4.44:1.
 */
export const Unavailable: Story = {
  args: {
    href: '/team/1/billing',
    label: 'Billing',
    icon: CreditCard,
    count: undefined,
    disabled: true,
    unavailableReason: 'Managed deployments only',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    await expect(
      canvas.getByText('Managed deployments only'),
    ).toBeInTheDocument();

    // Nothing in the row takes focus, so Tab leaves the story entirely.
    await userEvent.tab();
    await expect(canvasElement.contains(document.activeElement)).toBe(false);

    // Two graphics, both hidden: the destination's own icon and the lock. The
    // lock is the cue that survives a glance down the sidebar, and it is
    // redundant with the sentence rather than a substitute for it.
    const graphics = canvasElement.querySelectorAll('svg');
    await expect(graphics).toHaveLength(2);
    for (const graphic of graphics) {
      await expect(graphic).toHaveAttribute('aria-hidden', 'true');
    }
  },
};

/**
 * The state as it is actually met: one unavailable destination among reachable
 * ones, in the team sidebar of a self-hosted deployment. It keeps its place in
 * the order rather than being dropped to the bottom or removed — the sidebar
 * shows the whole product, and a researcher comparing notes with a colleague on
 * a managed instance finds the same list.
 */
export const UnavailableInAList: Story = {
  // The team sidebar, on `--background` because that is the surface it sits on
  // in the app and the one the disabled row's contrast was measured against.
  render: () => (
    <div className="bg-background w-72 rounded-sm p-2">
      <NavList>
        <NavItem
          href="/team/1"
          label="Studies"
          icon={FolderOpen}
          count={3}
          current
        />
        <NavItem
          href="/team/1/members"
          label="Members"
          icon={Users}
          count={4}
        />
        <NavItem href="/team/1/roles" label="Roles" icon={ShieldCheck} />
        <NavItem href="/team/1/activity" label="Activity" icon={History} />
        <NavItem
          href="/team/1/billing"
          label="Billing"
          icon={CreditCard}
          disabled
          unavailableReason="Managed deployments only"
        />
        <NavItem
          href="/team/1/settings"
          label="Team settings"
          icon={Settings}
        />
      </NavList>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Six destinations in the list, five of them reachable. The unavailable
    // one is counted — which is how a screen reader finds it, since it walks
    // the list rather than the tab order.
    await expect(canvas.getAllByRole('listitem')).toHaveLength(6);
    await expect(canvas.getAllByRole('link')).toHaveLength(5);

    const billing = canvas.getByText('Billing').closest('li');
    await expect(billing).toHaveTextContent('Managed deployments only');

    // Tab walks the five links and steps straight over the sixth row.
    for (const name of [
      'Studies 3',
      'Members 4',
      'Roles',
      'Activity',
      'Team settings',
    ]) {
      await userEvent.tab();
      await expect(canvas.getByRole('link', { name })).toHaveFocus();
    }
  },
};
