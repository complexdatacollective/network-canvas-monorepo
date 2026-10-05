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
import { useState, type MouseEvent } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import Button from '../Button';
import NavDrawer, { type NavDrawerProps } from './NavDrawer';
import NavItem from './NavItem';
import NavList, { NavListGroup } from './NavList';
import { routeFocusTargetProps } from './RouteFocus';

/**
 * The trigger's label in these stories. In the product the trigger belongs to
 * `layout/AppArea`'s area bar and names its own area; here it only has to open
 * the drawer, whose name comes from `label`.
 */
const OPEN_LABEL = 'Open navigation';

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

/**
 * Stands in for the host router and the area bar the drawer normally belongs
 * to. `NavDrawer` is told the committed location and nothing else, so all a
 * story has to supply is something that commits one — here, the `href` of
 * whichever destination was activated.
 *
 * Activation is caught on the way up rather than through each `NavItem`'s
 * `renderLink`, so the stories exercise the same plain-anchor destinations
 * every other navigation story renders.
 */
const DrawerHost = ({
  children,
  location: initialLocation,
  ...props
}: NavDrawerProps) => {
  const [open, setOpen] = useState(false);
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
    <div className="bg-surface text-surface-contrast publish-colors flex min-h-[24rem] flex-col items-start gap-4 p-6">
      <h1
        {...routeFocusTargetProps}
        className="font-heading text-2xl font-bold"
      >
        Study overview
      </h1>
      <Button onClick={() => setOpen(true)}>{OPEN_LABEL}</Button>
      <Button variant="outline" color="secondary">
        Return to start screen
      </Button>
      <p className="text-text/70 text-sm">
        Committed location: <code>{location}</code>
      </p>
      <NavDrawer
        {...props}
        open={open}
        onOpenChange={setOpen}
        location={location}
      >
        <div role="presentation" onClick={commitNavigation}>
          {children}
        </div>
      </NavDrawer>
    </div>
  );
};

const documentation = `
The narrow-container presentation of a navigation region: the region's
\`NavList\` in a modal drawer, with the area's own name and a close control.
\`layout/AppArea\` renders it beside the area bar that opens it.

\`\`\`tsx
import NavDrawer from '@codaco/fresco-ui/navigation/NavDrawer';

<NavDrawer
  open={open}
  onOpenChange={setOpen}
  location={pathname}
  label={t('study')}
  closeLabel={t('closeStudyNavigation')}
>
  <NavList>…</NavList>
</NavDrawer>
\`\`\`

- \`open\` / \`onOpenChange\` — controlled; the area owns the state. The drawer
  calls \`onOpenChange(false)\` itself when a navigation commits.
- \`location\` — the host router's **committed** location. Router-agnostic, the
  same way \`RouteFocus\` takes it.
- \`label\` — the region's name, one whole translated string. It names the
  dialog, names the \`<nav>\` inside it, and is the drawer's title.
- \`closeLabel\` — the close control's whole translated label.
- \`children\` — the region's destinations, a \`NavList\`.

**Built on \`Modal\`, not a bare \`Dialog.Root\`.** \`Modal\`'s \`inertOthers\`
sweep is what genuinely inerts the page behind the drawer; Base UI's own focus
manager marks the outside with \`aria-hidden\` only, which hides it from
assistive technology while leaving every control out there reachable with Tab.

**It closes on the navigation it initiated, and only when that navigation
commits.** A cancelled navigation never changes the committed location, so the
drawer stays open for it.

**The two closes move focus differently.** Dismissed — Escape, the backdrop, the
close control — focus returns to the trigger. Navigated: \`finalFocus\` answers
\`false\` and \`focusRouteTarget()\` is called once the popup has unmounted, so
the researcher lands on the destination they asked for rather than back on a
trigger the destination may not even render.
`;

const meta = {
  title: 'Navigation/NavDrawer',
  component: NavDrawer,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: documentation } },
  },
  argTypes: {
    children: { control: false },
    open: { control: false },
    onOpenChange: { control: false },
  },
  args: {
    open: false,
    onOpenChange: () => undefined,
    location: '/study/1',
    label: 'Study',
    closeLabel: 'Close study navigation',
    children: studySidebar,
  },
  render: (args) => <DrawerHost {...args} />,
} satisfies Meta<typeof NavDrawer>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Opens the drawer and waits for Base UI to move focus inside it — both the
 * real timeline and the precondition for asserting anything about where focus
 * goes next.
 */
const openDrawer = async (canvasElement: HTMLElement, name = 'Study') => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: OPEN_LABEL }));

  const dialog = await screen.findByRole('dialog', { name });
  await waitFor(() =>
    expect(dialog.contains(document.activeElement)).toBe(true),
  );
  return dialog;
};

/**
 * The drawer as a researcher meets it on a phone: the area's name, a close
 * control, and the region's whole `NavList`. The dialog and the navigation
 * landmark inside it both carry the area's name.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openDrawer(canvasElement);

    await expect(
      within(dialog).getByRole('navigation', { name: 'Study' }),
    ).toBeVisible();
    await expect(
      within(dialog).getByRole('link', { name: 'Participants 84' }),
    ).toBeVisible();
  },
};

/**
 * The page behind the drawer is `inert`, not merely `aria-hidden`: a control
 * that is out of the accessibility tree but still in the tab order is the WCAG
 * `aria-hidden-focus` failure, and is how a Tab walks out of an open dialog
 * into the page underneath.
 */
export const IsolatesThePageBehind: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const background = canvas.getByRole('button', {
      name: 'Return to start screen',
    });

    await openDrawer(canvasElement);

    await expect(background.closest('[inert]')).not.toBeNull();
  },
};

/**
 * The panel is placed on the inline-start edge with a logical inset, so in a
 * right-to-left document it sits on the right — but a transform has no logical
 * form, and a plain `x: '-100%'` would bring it in from the wrong side of the
 * screen. The offset is a custom property the `rtl:` variant flips, which both
 * the browser (in the initial transform) and Motion (when it builds the
 * keyframes) resolve for themselves.
 */
export const SlidesInFromTheInlineStartEdge: Story = {
  play: async ({ canvasElement }) => {
    const { documentElement } = canvasElement.ownerDocument;
    const offsetOf = (element: Element) =>
      getComputedStyle(element)
        .getPropertyValue('--nav-drawer-closed-offset')
        .trim();

    const previousDirection = documentElement.getAttribute('dir');
    try {
      const dialog = await openDrawer(canvasElement);
      await expect(offsetOf(dialog)).toBe('-100%');

      documentElement.setAttribute('dir', 'rtl');
      await waitFor(() => expect(offsetOf(dialog)).toBe('100%'));
    } finally {
      if (previousDirection === null) {
        documentElement.removeAttribute('dir');
      } else {
        documentElement.setAttribute('dir', previousDirection);
      }
    }
  },
};

/**
 * Dismissing the drawer — Escape here, and equally the backdrop or the close
 * control — puts focus back on the control that opened it. Nothing was asked
 * for, so nothing has moved.
 */
export const ReturnsFocusToTheTriggerOnDismissal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: OPEN_LABEL });

    await openDrawer(canvasElement);
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/**
 * Activating a destination is different: the researcher asked to go somewhere.
 * The trigger restore is suppressed and focus lands on the route's own landing
 * point instead — once the popup has gone, because until then the activated
 * link still holds focus and the destination is still inside the isolated
 * subtree.
 */
export const HandsFocusToTheDestinationOnNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: OPEN_LABEL });
    const landingPoint = canvas.getByRole('heading', {
      name: 'Study overview',
    });

    const dialog = await openDrawer(canvasElement);
    await userEvent.click(
      within(dialog).getByRole('link', { name: 'Participants 84' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expect(landingPoint).toHaveFocus();
    await expect(trigger).not.toHaveFocus();
  },
};

/**
 * A destination whose navigation the host blocked. The committed location never
 * changes, so nothing has happened yet and the drawer has nothing to close
 * over — the researcher is still where the confirmation left them.
 */
export const StaysOpenWhenTheNavigationIsCancelled: Story = {
  args: {
    children: (
      <NavList>
        <NavItem href="/study/1" label="Overview" icon={LayoutDashboard} />
        <NavItem href="/study/1" label="Participants" icon={Users} count={84} />
      </NavList>
    ),
  },
  play: async ({ canvasElement }) => {
    const dialog = await openDrawer(canvasElement);

    // Both destinations resolve to the location already committed, which is
    // what a blocked navigation leaves behind.
    await userEvent.click(
      within(dialog).getByRole('link', { name: 'Participants 84' }),
    );

    await expect(
      await screen.findByRole('dialog', { name: 'Study' }),
    ).toBeVisible();
  },
};

/**
 * Translated labels and headings run about a third longer than their English
 * sources. Everything wraps; the drawer holds its width and nothing is clipped.
 */
export const LongLabels: Story = {
  args: {
    label: 'Studienverwaltung',
    closeLabel: 'Navigation der Studie schließen',
    children: (
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
  play: async ({ canvasElement }) => {
    const dialog = await openDrawer(canvasElement, 'Studienverwaltung');

    await expect(
      within(dialog).getByRole('navigation', { name: 'Studienverwaltung' }),
    ).toBeVisible();
  },
};

/** A region whose destinations carry no icons — Studio's account area. */
export const WithoutIcons: Story = {
  args: {
    label: 'Account',
    closeLabel: 'Close account navigation',
    children: (
      <NavList>
        <NavItem href="/account" label="Profile" current />
        <NavItem href="/account/language" label="Language" />
        <NavItem href="/account/sign-in-methods" label="Sign-in methods" />
        <NavItem href="/account/api-tokens" label="API tokens" count={2} />
      </NavList>
    ),
  },
  play: async ({ canvasElement }) => {
    await openDrawer(canvasElement, 'Account');
  },
};
