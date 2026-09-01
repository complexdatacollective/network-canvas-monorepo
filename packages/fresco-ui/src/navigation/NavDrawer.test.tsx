import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import NavDrawer from './NavDrawer';
import NavItem from './NavItem';
import NavList from './NavList';
import { routeFocusTargetProps } from './RouteFocus';

/**
 * A closing popup animates out and only then returns focus. Unmounting the tree
 * mid-animation (what Testing Library's automatic cleanup does at the end of a
 * test) leaves that move pending, and it would otherwise land in the middle of
 * the NEXT test. Settle each teardown first — the same reason the Modal and
 * Dialog focus suites do.
 */
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 400));
});

type Destination = {
  href: string;
  label: string;
  /**
   * Whether activating this destination COMMITS. `false` is a navigation the
   * host blocked — a `useBlocker` that asked "discard your changes?" and was
   * answered no — which is exactly the case the committed-location rule exists
   * for: the URL never changes, so nothing about the drawer may either.
   */
  commits: boolean;
};

const DESTINATIONS: Destination[] = [
  { href: '/study/1/participants', label: 'Participants', commits: true },
  { href: '/study/1/settings', label: 'Study settings', commits: false },
];

const Harness = () => {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState('/study/1');

  return (
    <div>
      {/* The route's own landing point, outside the drawer — where a
          navigation-driven close has to put focus. */}
      <h1 {...routeFocusTargetProps}>Study overview</h1>
      <button type="button" id="background">
        Return to start screen
      </button>
      <button type="button" id="trigger" onClick={() => setOpen(true)}>
        Open study navigation
      </button>
      <NavDrawer
        open={open}
        onOpenChange={setOpen}
        location={location}
        label="Study"
        closeLabel="Close study navigation"
      >
        <NavList>
          {DESTINATIONS.map((destination) => (
            <NavItem
              key={destination.href}
              href={destination.href}
              label={destination.label}
              renderLink={({ children, href, ...props }) => (
                <a
                  href={href}
                  {...props}
                  onClick={(event) => {
                    // jsdom does not navigate, and a router would not either:
                    // what a host does here is commit a new location, and that
                    // is the only signal the drawer reads.
                    event.preventDefault();
                    if (destination.commits) setLocation(destination.href);
                  }}
                >
                  {children}
                </a>
              )}
            />
          ))}
        </NavList>
      </NavDrawer>
    </div>
  );
};

const getElementById = (id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} not rendered`);
  return element;
};

/**
 * Opens the drawer the way a researcher does, and waits for Base UI to move
 * focus inside it — both the real timeline and the precondition for asserting
 * anything about where focus goes next.
 */
const openDrawer = async () => {
  const trigger = getElementById('trigger');
  trigger.focus();
  trigger.click();

  const dialog = await screen.findByRole('dialog');
  await waitFor(() =>
    expect(dialog.contains(document.activeElement)).toBe(true),
  );

  return trigger;
};

const closedDrawer = async () => {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
};

describe('NavDrawer semantics', () => {
  it('names the dialog and the navigation landmark inside it after the area', async () => {
    render(<Harness />);
    await openDrawer();

    expect(screen.getByRole('dialog', { name: 'Study' })).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Study' }),
    ).toBeInTheDocument();
  });

  it('isolates the page behind it, and gives it back on close', async () => {
    render(<Harness />);
    const background = getElementById('background');

    await openDrawer();

    // `inert`, not merely `aria-hidden`: a control that is hidden from
    // assistive technology but still reachable with Tab is the WCAG
    // `aria-hidden-focus` failure, and is how a Tab walks out of an open
    // dialog into the page behind it. This is the guarantee `Modal` adds over
    // Base UI's own focus manager, and the reason the drawer is built on it.
    expect(background.closest('[inert]')).not.toBeNull();

    await userEvent.keyboard('{Escape}');
    await closedDrawer();

    expect(background.closest('[inert]')).toBeNull();
  });
});

describe('NavDrawer close on committed navigation', () => {
  it('closes when the location the host committed changes', async () => {
    render(<Harness />);
    await openDrawer();

    await userEvent.click(screen.getByRole('link', { name: 'Participants' }));

    await closedDrawer();
  });

  it('stays open when the navigation it started is cancelled', async () => {
    render(<Harness />);
    await openDrawer();

    await userEvent.click(screen.getByRole('link', { name: 'Study settings' }));

    // A blocked navigation never changes the committed location, so nothing
    // has happened yet and the drawer has nothing to close over. Given time to
    // be wrong: the close path is asynchronous, so an immediate assertion
    // would pass even if the drawer were closing.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('NavDrawer focus handoff', () => {
  it('returns focus to the trigger when it is dismissed with Escape', async () => {
    render(<Harness />);
    const trigger = await openDrawer();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('returns focus to the trigger when it is dismissed with the close control', async () => {
    render(<Harness />);
    const trigger = await openDrawer();

    await userEvent.click(
      screen.getByRole('button', { name: 'Close study navigation' }),
    );

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('hands focus to the route landing point when a destination commits', async () => {
    render(<Harness />);
    // Resolved before the drawer opens: while it is open the landing point is
    // inside the isolated subtree, so a role query would not reach it — which
    // is the same reason the handoff cannot happen until the popup has gone.
    const landingPoint = screen.getByRole('heading', {
      name: 'Study overview',
    });
    const trigger = await openDrawer();

    await userEvent.click(screen.getByRole('link', { name: 'Participants' }));

    // Not the trigger: the researcher asked to go somewhere, and the trigger
    // belongs to an area bar the destination may not even render.
    await waitFor(() => expect(landingPoint).toHaveFocus());
    expect(trigger).not.toHaveFocus();
  });

  it('does not leave focus on the body while the handoff waits for the popup to go', async () => {
    render(<Harness />);
    await openDrawer();

    await userEvent.click(screen.getByRole('link', { name: 'Participants' }));
    await closedDrawer();

    expect(document.activeElement).not.toBe(document.body);
  });

  it('returns focus to the trigger again on a dismissal that follows a navigation', async () => {
    render(<Harness />);
    await openDrawer();

    await userEvent.click(screen.getByRole('link', { name: 'Participants' }));
    await closedDrawer();

    // Reopening clears the record of WHY the drawer last closed. Without that
    // reset the navigation answer sticks: `finalFocus` would go on suppressing
    // the restore, and every later dismissal would drop focus.
    const trigger = await openDrawer();
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
