import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import NavItem from './NavItem';
import NavList, { NavListGroup } from './NavList';

/** The shape of Studio's study sidebar: ungrouped, grouped, ungrouped. */
const studySidebar = (
  <NavList>
    <NavItem href="/study/1" label="Overview" current />
    <NavListGroup heading="Design">
      <NavItem href="/study/1/editor" label="Editor" />
      <NavItem href="/study/1/versions" label="Versions" count={6} />
    </NavListGroup>
    <NavListGroup heading="Collect">
      <NavItem href="/study/1/participants" label="Participants" count={84} />
      <NavItem href="/study/1/sessions" label="Sessions" />
    </NavListGroup>
    <NavItem href="/study/1/settings" label="Study settings" />
  </NavList>
);

describe('NavList', () => {
  it('renders one list per group', () => {
    render(studySidebar);

    // Overview, Design, Collect, Study settings.
    expect(screen.getAllByRole('list')).toHaveLength(4);
  });

  it('never nests one list inside another', () => {
    const { container } = render(studySidebar);

    // A nested list announces a depth ("level 2") that these destinations do
    // not have: every one of them is a peer.
    expect(container.querySelectorAll('ul ul')).toHaveLength(0);
  });

  it('names each group list from its heading', () => {
    render(studySidebar);

    const design = screen.getByRole('list', { name: 'Design' });
    expect(
      within(design)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Editor', 'Versions6']);
  });

  it('counts only real destinations in each list', () => {
    render(studySidebar);

    // The failure this pins: a heading rendered as an <li> would make this
    // three, and a screen reader would announce a list of three with one row
    // that goes nowhere.
    expect(
      within(screen.getByRole('list', { name: 'Collect' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(2);
  });

  it('collects each run of ungrouped destinations into its own list', () => {
    render(studySidebar);

    const lists = screen.getAllByRole('list');
    const first = lists[0];
    const last = lists[lists.length - 1];

    expect(first).not.toHaveAccessibleName();
    expect(within(first!).getAllByRole('link')).toHaveLength(1);
    expect(within(first!).getByRole('link')).toHaveAccessibleName('Overview');
    expect(within(last!).getByRole('link')).toHaveAccessibleName(
      'Study settings',
    );
  });

  it('keeps every destination in the order it was written', () => {
    render(studySidebar);

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      [
        'Overview',
        'Editor',
        'Versions6',
        'Participants84',
        'Sessions',
        'Study settings',
      ],
    );
  });

  it('does not put group headings in the document heading outline', () => {
    render(studySidebar);

    // The sidebar precedes <main>, so headings here would sit above the
    // route's own <h1> in the heading rotor on every route.
    expect(screen.queryAllByRole('heading')).toHaveLength(0);
    expect(screen.getByText('Design')).toBeInTheDocument();
  });

  it('keeps list semantics that WebKit drops from an unbulleted flex list', () => {
    const { container } = render(studySidebar);

    for (const list of container.querySelectorAll('ul')) {
      expect(list).toHaveAttribute('role', 'list');
    }
  });

  it('renders an ungrouped list of items with no groups at all', () => {
    render(
      <NavList>
        <NavItem href="/team/1/members" label="Members" />
        <NavItem href="/team/1/roles" label="Roles" />
      </NavList>,
    );

    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(1);
    expect(within(lists[0]!).getAllByRole('listitem')).toHaveLength(2);
  });

  it('groups the same way through a fragment as it does directly', () => {
    render(
      <NavList>
        <>
          <NavItem href="/study/1" label="Overview" />
          <NavListGroup heading="Design">
            <NavItem href="/study/1/editor" label="Editor" />
          </NavListGroup>
        </>
      </NavList>,
    );

    // Without flattening, the fragment is one opaque child: the group would be
    // swept into the ungrouped list and end up nested inside it.
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getByRole('list', { name: 'Design' })).toBeInTheDocument();
  });

  it('keeps keys unique across sibling fragments', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <NavList>
        <>
          <NavItem href="/a" label="A" />
          <NavItem href="/b" label="B" />
        </>
        <>
          <NavItem href="/c" label="C" />
          <NavItem href="/d" label="D" />
        </>
      </NavList>,
    );

    // Both fragments hand back children keyed `.0`, `.1`; landing them in one
    // list unprefixed is a duplicate-key collision, and React resolves it by
    // dropping rows.
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('keeps a component that renders a destination in the surrounding list', () => {
    // A component's element hides what it renders, and for a destination that
    // does not matter: it is a row, which is what an ungrouped run is made of.
    // This is the shape Studio's `ManifestNav` uses.
    const Destination = ({ label }: { label: string }) => (
      <NavItem href={`/team/1/${label}`} label={label} />
    );

    render(
      <NavList>
        <Destination label="Members" />
        <Destination label="Roles" />
      </NavList>,
    );

    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(1);
    expect(within(lists[0]!).getAllByRole('listitem')).toHaveLength(2);
  });

  it('refuses a group that arrives inside a component', () => {
    // Not a style rule: grouping is decided from the element handed to
    // NavList, so a group inside a component is taken for a row and rendered
    // into the ungrouped `<ul>` — `ul > div > ul`, which is invalid markup and
    // the nested-list announcement this component exists to prevent.
    const DesignSection = () => (
      <NavListGroup heading="Design">
        <NavItem href="/study/1/editor" label="Editor" />
      </NavListGroup>
    );
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(() =>
      render(
        <NavList>
          <NavItem href="/study/1" label="Overview" />
          <DesignSection />
        </NavList>,
      ),
    ).toThrow(/NavListGroup was rendered inside a NavList run/);

    error.mockRestore();
  });

  it('lets a group render on its own outside any ungrouped run', () => {
    // The guard reads a context NavList sets on the contents of an ungrouped
    // list, so it cannot fire on a group that is nobody's row.
    expect(() =>
      render(
        <NavList>
          <NavListGroup heading="Design">
            <NavItem href="/study/1/editor" label="Editor" />
          </NavListGroup>
        </NavList>,
      ),
    ).not.toThrow();
  });

  it('renders a group used on its own', () => {
    render(
      <NavListGroup heading="Data">
        <NavItem href="/study/1/export" label="Export" />
      </NavListGroup>,
    );

    expect(
      within(screen.getByRole('list', { name: 'Data' })).getByRole('link'),
    ).toHaveAccessibleName('Export');
  });
});
