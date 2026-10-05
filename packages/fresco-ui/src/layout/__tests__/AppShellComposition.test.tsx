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
 *
 * The last suite is the counterexample the route tree is shaped to avoid — two
 * areas nested one inside the other — and it asserts the damage rather than
 * asserting it away: the shape has to be prevented in the ROUTE TREE (the
 * editor is a sibling of the study area, under a component-less parent), and a
 * test that could not see the breakage would be no evidence that the tree shape
 * matters.
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

const editorNavigation = {
  label: 'Protocol outline',
  openLabel: 'Open protocol outline',
  closeLabel: 'Close protocol outline',
  content: (
    <NavList>
      <NavItem href="/study/1/editor/codebook" label="Codebook" />
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

  it('renders one banner, and the skip link ahead of it', () => {
    renderStudyArea();

    const banners = screen.getAllByRole('banner');
    expect(banners).toHaveLength(1);
    expect(
      getSkipLink().compareDocumentPosition(banners[0]!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

describe('two areas nested inside one another', () => {
  /**
   * The editor rendered as a DESCENDANT of the study area rather than as its
   * sibling — the arrangement §5.3 rejects. Reproduced here so the reason is
   * evidence rather than assertion.
   */
  const renderNestedAreas = () =>
    renderShell(
      <AppArea location="/study/1/editor" navigation={studyNavigation}>
        <AppArea location="/study/1/editor" navigation={editorNavigation}>
          <h1 {...routeFocusTargetProps}>Codebook</h1>
        </AppArea>
      </AppArea>,
    );

  it('produces two mains sharing one id', () => {
    const { container } = renderNestedAreas();

    const mains = container.querySelectorAll('main');
    expect(mains).toHaveLength(2);
    for (const main of mains) {
      expect(main).toHaveAttribute('id', DEFAULT_SKIP_TARGET_ID);
    }
  });

  it('leaves the skip link resolving to the OUTER main', () => {
    const { container } = renderNestedAreas();

    const [outer, inner] = container.querySelectorAll('main');
    // `getElementById` answers with the first match in document order, so the
    // researcher is dropped at the top of the study area — with the editor's
    // own sidebar still ahead of them — rather than into the editor.
    expect(resolveSkipTarget()).toBe(outer);
    expect(resolveSkipTarget()).not.toBe(inner);

    fireEvent.click(getSkipLink());
    expect(outer).toHaveFocus();
    expect(inner).not.toHaveFocus();
  });

  it('produces two navigation regions where the design allows one', () => {
    renderNestedAreas();

    // Both sidebars render: the study's remains beside the editor's outline
    // instead of being replaced by it.
    expect(screen.getAllByRole('navigation')).toHaveLength(2);
    expect(
      screen.getByRole('navigation', { name: 'Study' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Protocol outline' }),
    ).toBeInTheDocument();
  });
});
