import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import NavItem from '../../navigation/NavItem';
import NavList from '../../navigation/NavList';
import { routeFocusTargetProps } from '../../navigation/RouteFocus';
import AppArea, { type AppAreaProps } from '../AppArea';
import { DEFAULT_SKIP_TARGET_ID } from '../AppFrame';

/**
 * The drawer animates out and only then settles focus. Let each test's teardown
 * finish before the next one starts, the same way the Modal and Dialog focus
 * suites do.
 */
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 400));
});

const studyNavigation = {
  label: 'Study',
  openLabel: 'Open study navigation',
  closeLabel: 'Close study navigation',
  content: (
    <NavList>
      <NavItem href="/study/1" label="Overview" current />
      <NavItem href="/study/1/participants" label="Participants" count={84} />
    </NavList>
  ),
};

const renderArea = (props?: Partial<AppAreaProps>) =>
  render(
    <AppArea location="/study/1" navigation={studyNavigation} {...props}>
      <h1 {...routeFocusTargetProps}>Study overview</h1>
    </AppArea>,
  );

describe('AppArea landmarks', () => {
  it('renders the main the skip link targets', () => {
    renderArea();

    // The id is imported, not repeated: the link lives in `AppFrame` and the
    // landmark lives here, so a literal in each is two things to keep in step.
    expect(screen.getByRole('main')).toHaveAttribute(
      'id',
      DEFAULT_SKIP_TARGET_ID,
    );
  });

  it('honours a host that names its main something else', () => {
    renderArea({ mainId: 'editor-content' });

    expect(screen.getByRole('main')).toHaveAttribute('id', 'editor-content');
  });

  it('names the navigation region after the area', () => {
    renderArea();

    expect(
      screen.getByRole('navigation', { name: 'Study' }),
    ).toBeInTheDocument();
  });

  it('puts the area bar first and the sidebar before main', () => {
    const { container } = renderArea();

    const areaBar = screen.getByRole('button', {
      name: 'Open study navigation',
    });
    const sidebar = screen.getByRole('navigation', { name: 'Study' });
    const main = screen.getByRole('main');

    const root = container.firstElementChild;
    // The area bar is the region's first element, directly beneath the app
    // header — not a control tucked in beside the destinations it opens.
    expect(root?.firstElementChild?.contains(areaBar)).toBe(true);
    expect(
      sidebar.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('AppArea without a sidebar', () => {
  const renderSidebarless = () =>
    render(
      <AppArea location="/gallery">
        <h1 {...routeFocusTargetProps}>Gallery</h1>
      </AppArea>,
    );

  it('renders main alone', () => {
    renderSidebarless();

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', DEFAULT_SKIP_TARGET_ID);
    expect(within(main).getByRole('heading')).toHaveTextContent('Gallery');
  });

  it('renders no navigation region and no area bar', () => {
    renderSidebarless();

    // There is nothing to open, so there is no trigger — and no bar holding
    // one. An area bar here would be a control that does nothing at every
    // width.
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('AppArea drawer', () => {
  /**
   * A host that commits its navigation, which is the only thing about a
   * navigation the drawer can see. `location` is state here for the same
   * reason it is a prop there: a router owns it, and a blocked navigation
   * never changes it.
   */
  const Host = ({ commits = true }: { commits?: boolean }) => {
    const [location, setLocation] = useState('/study/1');

    return (
      <AppArea
        location={location}
        navigation={{
          ...studyNavigation,
          content: (
            <NavList>
              <NavItem
                href="/study/1/participants"
                label="Participants"
                renderLink={({ children, href, ...props }) => (
                  <a
                    href={href}
                    {...props}
                    onClick={(event) => {
                      event.preventDefault();
                      if (commits) setLocation('/study/1/participants');
                    }}
                  >
                    {children}
                  </a>
                )}
              />
            </NavList>
          ),
        }}
      >
        <h1 {...routeFocusTargetProps}>Study overview</h1>
      </AppArea>
    );
  };

  const openDrawer = async () => {
    const trigger = screen.getByRole('button', {
      name: 'Open study navigation',
    });
    await userEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Study' });
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );

    return trigger;
  };

  it('reports on its trigger whether the drawer is showing', async () => {
    render(<Host />);
    const trigger = screen.getByRole('button', {
      name: 'Open study navigation',
    });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await openDrawer();

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes the drawer when the location changes', async () => {
    render(<Host />);
    await openDrawer();

    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('link', {
        name: 'Participants',
      }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('leaves the drawer open when the navigation is cancelled', async () => {
    render(<Host commits={false} />);
    await openDrawer();

    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('link', {
        name: 'Participants',
      }),
    );

    // Given time to be wrong: the close path is asynchronous, so an immediate
    // assertion would pass even if the drawer were on its way out.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
