import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  CalendarClock,
  ClipboardList,
  Download,
  GitBranch,
  LayoutDashboard,
  Megaphone,
  PencilRuler,
  Repeat,
  Settings,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import NavItem from './NavItem';
import NavList, { NavListGroup } from './NavList';

/**
 * The width the region is given. A navigation list is one column at every
 * width, so the only thing a story has to state is how much room it is in.
 */
const Region = ({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) => <div className={className}>{children}</div>;

/** Studio's study sidebar, grouped in the order the work happens. */
const studySidebar = (
  <>
    <NavItem href="/study/1" label="Overview" icon={LayoutDashboard} current />
    <NavListGroup heading="Design">
      <NavItem href="/study/1/editor" label="Editor" icon={PencilRuler} />
      <NavItem
        href="/study/1/versions"
        label="Versions"
        icon={GitBranch}
        count={6}
      />
    </NavListGroup>
    <NavListGroup heading="Collect">
      <NavItem
        href="/study/1/participants"
        label="Participants"
        icon={Users}
        count={84}
      />
      <NavItem href="/study/1/waves" label="Waves" icon={Repeat} count={3} />
      <NavItem
        href="/study/1/sessions"
        label="Sessions"
        icon={ClipboardList}
        count={212}
      />
      <NavItem href="/study/1/schedule" label="Schedule" icon={CalendarClock} />
      <NavItem
        href="/study/1/recruitment"
        label="Recruitment"
        icon={Megaphone}
      />
    </NavListGroup>
    <NavListGroup heading="Data">
      <NavItem href="/study/1/export" label="Export" icon={Download} />
    </NavListGroup>
    <NavItem href="/study/1/settings" label="Study settings" icon={Settings} />
  </>
);

const documentation = `
A navigation region's contents: destinations, optionally divided into named
groups.

\`\`\`tsx
import NavItem from '@codaco/fresco-ui/navigation/NavItem';
import NavList, { NavListGroup } from '@codaco/fresco-ui/navigation/NavList';

<NavList>
  <NavItem href={studyHref} label={t('overview')} current />
  <NavListGroup heading={t('design')}>
    <NavItem href={editorHref} label={t('editor')} />
    <NavItem href={versionsHref} label={t('versions')} count={6} />
  </NavListGroup>
  <NavItem href={settingsHref} label={t('studySettings')} />
</NavList>
\`\`\`

**\`NavList\`**

- \`children\` — \`NavItem\`s and \`NavListGroup\`s, in the order they should
  appear. A run of items outside a group becomes a list of its own, either side
  of the groups. Fragments and arrays are opened out first, so a sidebar
  assembled from per-section variables or conditional blocks groups exactly as a
  hand-written one does. A group has to arrive as a \`NavListGroup\` element,
  though: grouping is decided from the element itself, and a component that
  renders a group hides it — so it throws rather than nesting one list inside
  another. A component that renders a \`NavItem\` is fine; it is a row, which is
  what the surrounding list is made of.
- \`className\` — applied to the element wrapping the region's lists.

**\`NavListGroup\`**

- \`heading\` — the group's name, as one whole translated string. It is
  displayed above the group and names the group's list.
- \`children\` — the group's \`NavItem\`s.
- \`className\` — applied to the group's wrapper.

**Grouping is sibling lists.** Each group is its own \`<ul>\`, carrying its
heading's string as its own \`aria-label\`, so it reports an accurate item count
and claims no depth — every destination in a sidebar is a peer of every other.
One list with headings inside it would count the headings as destinations;
nested lists would announce a hierarchy ("level 2") that does not exist.

**\`aria-label\`, deliberately, and not \`aria-labelledby\` pointed at the
heading.** Chromium folds \`text-transform\` into the accessible name, so
labelling the list by the \`all-caps\` heading exposes the group as "DESIGN" —
which a screen reader may spell out letter by letter. \`aria-label\` takes the
string as written. No test catches this: jsdom and the browser-mode test runner
both compute names through \`dom-accessibility-api\`, which does not apply
\`text-transform\`, so both agree with the visual source and disagree with the
browser. Verified against Chromium's own accessibility tree.

**The headings are not \`<h2>\`s.** The sidebar precedes \`<main>\`, so heading
elements here would put the same chrome entries at the top of the heading rotor
on every route, ahead of the route's own \`<h1>\`. The group name still reaches
assistive technology, as the name of the list it labels.

This renders the contents only — no \`<nav>\` and no accessible name. The
labelled \`<nav>\`, and the drawer that presents this list on a narrow
container, belong to \`layout/AppArea\`.
`;

const meta = {
  title: 'Navigation/NavList',
  component: NavList,
  subcomponents: { NavListGroup },
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: documentation } },
  },
  argTypes: {
    children: { control: false },
  },
  args: {
    children: studySidebar,
  },
  render: (args) => (
    <Region className="w-72">
      <NavList {...args} />
    </Region>
  ),
} satisfies Meta<typeof NavList>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The study sidebar: an ungrouped destination, three named groups, and a
 * trailing ungrouped destination — five sibling lists, none nested in another.
 */
export const StudySidebar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Overview, Design, Collect, Data, Study settings.
    await expect(canvas.getAllByRole('list')).toHaveLength(5);
    await expect(canvasElement.querySelectorAll('ul ul')).toHaveLength(0);

    const collect = canvas.getByRole('list', { name: 'Collect' });
    // Five destinations, and not a sixth row for the heading.
    await expect(within(collect).getAllByRole('listitem')).toHaveLength(5);
    await expect(
      within(collect).getByRole('link', { name: 'Participants 84' }),
    ).toBeInTheDocument();
  },
};

/**
 * Every destination is reached by Tab, in the order it is written, across the
 * group boundaries. Nothing is behind an arrow key: this is a list of links,
 * not a composite widget.
 */
export const TabReachesEveryDestination: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const links = canvas.getAllByRole('link');

    for (const link of links) {
      await userEvent.tab();
      await expect(link).toHaveFocus();
    }

    await expect(links.map((link) => link.textContent)).toEqual([
      'Overview',
      'Editor',
      'Versions6',
      'Participants84',
      'Waves3',
      'Sessions212',
      'Schedule',
      'Recruitment',
      'Export',
      'Study settings',
    ]);
  },
};

/**
 * Only the current destination carries `aria-current`; the others carry no
 * such attribute at all.
 */
export const CurrentDestination: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('link', { name: 'Overview' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      canvas.getByRole('link', { name: 'Editor' }),
    ).not.toHaveAttribute('aria-current');
  },
};

/**
 * A region with no grouping at all — Studio's team sidebar. One list, no
 * headings.
 */
export const Ungrouped: Story = {
  args: {
    children: (
      <>
        <NavItem href="/team/1" label="Studies" count={4} current />
        <NavItem href="/team/1/members" label="Members" count={12} />
        <NavItem href="/team/1/roles" label="Roles" />
        <NavItem href="/team/1/activity" label="Activity" />
        <NavItem href="/team/1/billing" label="Billing" />
        <NavItem href="/team/1/settings" label="Settings" />
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getAllByRole('list')).toHaveLength(1);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(6);
  },
};

/** Destinations without icons, laid out on the same rows. */
export const WithoutIcons: Story = {
  args: {
    children: (
      <>
        <NavItem href="/account" label="Profile" current />
        <NavItem href="/account/language" label="Language" />
        <NavItem href="/account/sign-in-methods" label="Sign-in methods" />
        <NavItem href="/account/api-tokens" label="API tokens" count={2} />
      </>
    ),
  },
};

/**
 * Translated labels and headings, which run about a third longer than their
 * English sources. Everything wraps; nothing is truncated and no count is
 * pushed out of its row.
 */
export const LongLabels: Story = {
  args: {
    children: (
      <>
        <NavItem href="/study/1" label="Übersicht der Studie" current />
        <NavListGroup heading="Entwurf und Gestaltung">
          <NavItem href="/study/1/editor" label="Protokoll bearbeiten" />
          <NavItem
            href="/study/1/versions"
            label="Veröffentlichte Versionen"
            count={6}
          />
        </NavListGroup>
        <NavListGroup heading="Datenerhebung">
          <NavItem
            href="/study/1/participants"
            label="Teilnehmerinnen und Teilnehmer"
            count={1284}
          />
          <NavItem
            href="/study/1/recruitment"
            label="Rekrutierung und Terminplanung"
          />
        </NavListGroup>
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wrapped = canvas.getByRole('link', {
      name: /^Teilnehmerinnen und Teilnehmer/,
    });
    const single = canvas.getByRole('link', { name: 'Übersicht der Studie' });

    // The row grew for the label that did not fit on one line, rather than
    // holding a fixed height and cutting it off.
    await expect(wrapped.clientHeight).toBeGreaterThan(single.clientHeight);
    // And the count is still on the row, not pushed out of it. Formatted here
    // the same way the component formats it, so the assertion is about the
    // count being present rather than about the runtime's locale.
    await expect(wrapped).toHaveTextContent((1284).toLocaleString());
  },
};

/** The width a drawer gives the list on a phone. */
export const NarrowContainer: Story = {
  render: (args) => (
    <Region className="w-48">
      <NavList {...args} />
    </Region>
  ),
};

/** A generously sized sidebar. Rows fill it; counts stay at the far end. */
export const WideContainer: Story = {
  render: (args) => (
    <Region className="w-[26rem]">
      <NavList {...args} />
    </Region>
  ),
};
