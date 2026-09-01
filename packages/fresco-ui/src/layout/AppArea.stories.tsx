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
import { useState, type MouseEvent, type ReactNode } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import NavItem from '../navigation/NavItem';
import NavList, { NavListGroup } from '../navigation/NavList';
import { routeFocusTargetProps } from '../navigation/RouteFocus';
import { cx } from '../utils/cva';
import AppArea, { type AppAreaProps } from './AppArea';

/** Studio's study sidebar, grouped in the order the work happens. */
const studySidebar = (
  <NavList>
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
  </NavList>
);

const studyNavigation = {
  label: 'Study',
  openLabel: 'Open study navigation',
  closeLabel: 'Close study navigation',
  content: studySidebar,
};

/**
 * The region an area is given, standing in for `AppFrame`'s. The `app-area`
 * container is declared here, exactly as the frame declares it, because that is
 * what the area's wide/narrow decision is measured against — a story sets the
 * width and the component answers to it.
 */
const Region = ({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) => (
  <div
    className={cx(
      'border-surface-2 bg-surface text-surface-contrast publish-colors',
      '@container/app-area grid h-[28rem] min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden rounded border',
      className,
    )}
  >
    {children}
  </div>
);

/** A route's content: the landing point every route change moves focus to. */
const RouteContent = ({ heading }: { heading: string }) => (
  <div className="flex flex-col gap-3 p-6">
    <h1 {...routeFocusTargetProps} className="font-heading text-2xl font-bold">
      {heading}
    </h1>
    <p className="text-text/80 max-w-[60ch]">
      The area owns this landmark. On a wide container the sidebar sits beside
      it; on a narrow one the area bar above it opens the same destinations in a
      drawer.
    </p>
  </div>
);

/**
 * Stands in for the host router. `AppArea` is told the committed location and
 * nothing else, so all a story has to supply is something that commits one —
 * here, the `href` of whichever destination was activated. Activation is caught
 * on the way up so the stories keep rendering the same plain-anchor
 * destinations every other navigation story does.
 */
const AreaHost = ({
  location: initialLocation,
  navigation,
  children,
  ...props
}: AppAreaProps) => {
  const [location, setLocation] = useState(initialLocation);

  const commitNavigation = (event: MouseEvent<HTMLDivElement>) => {
    const link =
      event.target instanceof Element ? event.target.closest('a') : null;
    if (!link) return;

    // A story is not a browsing context: stop the anchor and commit the
    // location the way a router would.
    event.preventDefault();
    setLocation(link.getAttribute('href') ?? location);
  };

  return (
    <AppArea
      {...props}
      location={location}
      navigation={
        navigation && {
          ...navigation,
          content: (
            <div role="presentation" onClick={commitNavigation}>
              {navigation.content}
            </div>
          ),
        }
      }
    >
      {children}
    </AppArea>
  );
};

const documentation = `
One area's frame: its navigation region, in whichever presentation the available
width calls for, and the \`<main>\` that region labels.

\`\`\`tsx
import AppArea from '@codaco/fresco-ui/layout/AppArea';

<AppArea
  location={pathname}
  navigation={{
    label: t('study'),
    openLabel: t('openStudyNavigation'),
    closeLabel: t('closeStudyNavigation'),
    content: <NavList>…</NavList>,
  }}
>
  <Outlet />
</AppArea>
\`\`\`

- \`navigation\` — the area's region: \`label\`, \`content\` (a \`NavList\`),
  \`openLabel\`, \`closeLabel\`, and an optional \`className\` for the
  wide-container \`<nav>\`. **Omit it entirely for an area with no sidebar**,
  which then renders \`<main>\` alone, with no area bar: there is nothing to
  open, so there is no trigger.
- \`location\` — the host router's committed location, forwarded to
  \`NavDrawer\`. A change to it closes the drawer.
- \`mainId\` — the \`<main>\`'s id. Defaults to the id \`AppFrame\`'s skip link
  targets, imported from there rather than repeated.
- \`className\` — merged onto the area's root.

**Rendered by the area layout, not the app layout.** An area's sidebar and the
\`<main>\` it labels replace each other wholesale when the researcher moves
between areas — a study's sidebar and the editor's outline are siblings, not one
nested in the other. \`AppFrame\` renders neither landmark for the same reason.

**Wide and narrow are container queries**, against the \`app-area\` container
\`AppFrame\` establishes — never viewport breakpoints. The area answers to the
width it is actually given rather than the viewport's, so anything that narrows
the region narrows the area with it and no host has to pass a width down.
`;

const meta = {
  title: 'Layout/AppArea',
  component: AppArea,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: documentation } },
  },
  argTypes: {
    children: { control: false },
    navigation: { control: false },
  },
  args: {
    location: '/study/1',
    navigation: studyNavigation,
    children: <RouteContent heading="Study overview" />,
  },
  render: (args) => (
    <Region className="w-[64rem]">
      <AreaHost {...args} />
    </Region>
  ),
} satisfies Meta<typeof AppArea>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * A wide region: the labelled `<nav>` beside `<main>`, and no area bar at all —
 * the trigger for a drawer nobody can reach is out of the tab order, not merely
 * out of sight.
 */
export const WideContainer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('navigation', { name: 'Study' }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Open study navigation' }),
    ).toBeNull();
  },
};

/**
 * The same area in a narrow region. The sidebar is replaced by the area bar —
 * the drawer trigger and the area's name — as the first element of the region,
 * and the destinations move into the drawer.
 */
export const NarrowContainer: Story = {
  render: (args) => (
    <Region className="w-[24rem]">
      <AreaHost {...args} />
    </Region>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole('navigation')).toBeNull();
    const trigger = canvas.getByRole('button', {
      name: 'Open study navigation',
    });
    await expect(trigger).toBeVisible();

    await userEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Study' });
    await expect(
      within(dialog).getByRole('link', { name: 'Participants 84' }),
    ).toBeVisible();
  },
};

/**
 * Activating a destination in the drawer. The drawer closes on the committed
 * navigation, and focus is handed to the route's own landing point rather than
 * back to a trigger the destination may not even render.
 */
export const DrawerClosesOnNavigation: Story = {
  render: (args) => (
    <Region className="w-[24rem]">
      <AreaHost {...args} />
    </Region>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', {
      name: 'Open study navigation',
    });
    const landingPoint = canvas.getByRole('heading', {
      name: 'Study overview',
    });

    await userEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Study' });
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );

    await userEvent.click(
      within(dialog).getByRole('link', { name: 'Participants 84' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expect(landingPoint).toHaveFocus();
    await expect(trigger).not.toHaveFocus();
  },
};

/**
 * An area with no sidebar — Studio's gallery and templates. It renders `<main>`
 * alone: no `<nav>`, and no area bar holding a trigger that would open nothing.
 */
export const WithoutSidebar: Story = {
  args: {
    navigation: undefined,
    children: <RouteContent heading="Protocol gallery" />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('main')).toBeVisible();
    await expect(canvas.queryByRole('navigation')).toBeNull();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/**
 * The same area at a narrow width with no sidebar: still `<main>` alone, and
 * still no area bar. The bar belongs to the region, not to the width.
 */
export const WithoutSidebarNarrow: Story = {
  args: {
    navigation: undefined,
    children: <RouteContent heading="Protocol gallery" />,
  },
  render: (args) => (
    <Region className="w-[24rem]">
      <AreaHost {...args} />
    </Region>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/**
 * Translated labels run about a third longer than their English sources. The
 * sidebar sizes to the region and every label wraps; nothing is truncated and
 * no count is pushed out of its row.
 */
export const LongLabels: Story = {
  args: {
    navigation: {
      label: 'Studienverwaltung',
      openLabel: 'Navigation der Studie öffnen',
      closeLabel: 'Navigation der Studie schließen',
      content: (
        <NavList>
          <NavItem
            href="/study/1"
            label="Übersicht der Studie"
            icon={LayoutDashboard}
            current
          />
          <NavListGroup heading="Entwurf und Gestaltung">
            <NavItem
              href="/study/1/editor"
              label="Protokoll bearbeiten"
              icon={PencilRuler}
            />
            <NavItem
              href="/study/1/versions"
              label="Veröffentlichte Versionen"
              icon={GitBranch}
              count={6}
            />
          </NavListGroup>
          <NavListGroup heading="Datenerhebung">
            <NavItem
              href="/study/1/participants"
              label="Teilnehmerinnen und Teilnehmer"
              icon={Users}
              count={1284}
            />
          </NavListGroup>
        </NavList>
      ),
    },
    children: <RouteContent heading="Übersicht der Studie" />,
  },
};

/** A region whose destinations carry no icons — Studio's account area. */
export const WithoutIcons: Story = {
  args: {
    navigation: {
      label: 'Account',
      openLabel: 'Open account navigation',
      closeLabel: 'Close account navigation',
      content: (
        <NavList>
          <NavItem href="/account" label="Profile" current />
          <NavItem href="/account/language" label="Language" />
          <NavItem href="/account/sign-in-methods" label="Sign-in methods" />
          <NavItem href="/account/api-tokens" label="API tokens" count={2} />
        </NavList>
      ),
    },
    children: <RouteContent heading="Profile" />,
  },
};
