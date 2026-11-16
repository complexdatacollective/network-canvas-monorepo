import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import NavItem from '../../navigation/NavItem';
import NavList, { NavListGroup } from '../../navigation/NavList';
import { routeFocusTargetProps } from '../../navigation/RouteFocus';
import AppArea from '../AppArea';
import AppFrame, { DEFAULT_SKIP_TARGET_ID } from '../AppFrame';

/**
 * `AppFrame` and `AppArea` together, which is the only arrangement either of
 * them is specified in: the skip link is rendered by the frame and the `<main>`
 * it targets by a descendant, so neither component can be held to the landmark
 * rules on its own.
 *
 * The rules, from the app shell design (§5.3, §7.1):
 *
 *   - exactly one `<main id="main-content">` per rendered shell;
 *   - at most one navigation region, named from the area's own closed set;
 *   - the skip link's fragment resolves to that one `<main>`.
 */

const studyNavigation = {
  label: 'Study',
  openLabel: 'Open study navigation',
  closeLabel: 'Close study navigation',
  content: (
    <NavList>
      <NavItem href="/study/1" label="Overview" current />
      <NavListGroup heading="Collect">
        <NavItem href="/study/1/participants" label="Participants" count={84} />
      </NavListGroup>
    </NavList>
  ),
};

const renderShell = (area: ReactNode) =>
  render(
    <AppFrame header={<span>Studio</span>} skipLinkLabel="Skip to main content">
      {area}
    </AppFrame>,
  );

const getSkipLink = () =>
  screen.getByRole('link', { name: 'Skip to main content' });

/** What the skip link itself does with its fragment, asked of the document. */
const resolveSkipTarget = () =>
  document.getElementById(getSkipLink().getAttribute('href')!.slice(1));

describe('AppFrame composed with an area that has a sidebar', () => {
  const renderStudyArea = () =>
    renderShell(
      <AppArea location="/study/1" navigation={studyNavigation}>
        <h1 {...routeFocusTargetProps}>Study overview</h1>
      </AppArea>,
    );

  it('renders exactly one main, and it is the one the skip link names', () => {
    const { container } = renderStudyArea();

    const mains = container.querySelectorAll('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', DEFAULT_SKIP_TARGET_ID);
    expect(
      container.querySelectorAll(`#${DEFAULT_SKIP_TARGET_ID}`),
    ).toHaveLength(1);
    expect(resolveSkipTarget()).toBe(mains[0]);
  });

  it('renders exactly one navigation region, named after the area', () => {
    renderStudyArea();

    const navigations = screen.getAllByRole('navigation');
    expect(navigations).toHaveLength(1);
    expect(navigations[0]).toHaveAccessibleName('Study');
  });

  it('adds no banner of its own to the frame’s', () => {
    renderStudyArea();

    expect(screen.getAllByRole('banner')).toHaveLength(1);
  });

  it('moves focus into the area’s main when the skip link is activated', () => {
    renderStudyArea();

    fireEvent.click(getSkipLink());

    const main = screen.getByRole('main');
    expect(main).toHaveFocus();
    // Past the sidebar, which is what the link is for: the destinations are
    // behind focus now, not ahead of it.
    expect(
      within(main).getByRole('heading', { name: 'Study overview' }),
    ).toBeInTheDocument();
  });
});

describe('AppFrame composed with an area that has no sidebar', () => {
  it('still renders exactly one main and no navigation at all', () => {
    const { container } = renderShell(
      <AppArea location="/gallery">
        <h1 {...routeFocusTargetProps}>Gallery</h1>
      </AppArea>,
    );

    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(resolveSkipTarget()).toBe(screen.getByRole('main'));
  });
});
