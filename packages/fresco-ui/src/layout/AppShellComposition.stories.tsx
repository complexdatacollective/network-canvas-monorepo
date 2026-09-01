import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download, LayoutDashboard, PencilRuler, Users } from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import NavItem from '../navigation/NavItem';
import NavList, { NavListGroup } from '../navigation/NavList';
import { routeFocusTargetProps } from '../navigation/RouteFocus';
import AppArea from './AppArea';
import AppFrame from './AppFrame';

/**
 * `AppFrame` and `AppArea` composed as a host composes them, in a real browser.
 *
 * Both components have their own stories, and both size themselves against the
 * `app-area` container — but each of those suites declares that container
 * itself, so between them nothing checks that the container the FRAME declares
 * is the one the AREA queries. Rename it on one side and both suites stay
 * green while every app route loses its sidebar. These stories are the pair
 * under test, so that rename fails here.
 *
 * They also carry the two clauses jsdom cannot answer, because both are
 * decided by CSS: which presentation of the navigation region exists at a given
 * width, and that the other one is gone from the accessibility tree rather than
 * merely out of sight.
 */
const documentation = `
The app shell as a host assembles it: \`AppFrame\` owning the skip link, the
header and the responsive grid, with one \`AppArea\` rendered into its region.

The frame renders no \`<nav>\` and no \`<main>\`; the area renders both, and the
frame's skip link resolves to the area's \`<main>\`. Whether the area shows its
sidebar or its area bar is a container query against the region the frame
establishes — never a viewport breakpoint — so the same area answers differently
to a wide and a narrow frame with no host involvement.
`;

const studySidebar = (
  <NavList>
    <NavItem href="/study/1" label="Overview" icon={LayoutDashboard} current />
    <NavListGroup heading="Design">
      <NavItem href="/study/1/editor" label="Editor" icon={PencilRuler} />
    </NavListGroup>
    <NavListGroup heading="Collect">
      <NavItem
        href="/study/1/participants"
        label="Participants"
        icon={Users}
        count={84}
      />
    </NavListGroup>
    <NavListGroup heading="Data">
      <NavItem href="/study/1/export" label="Export" icon={Download} />
    </NavListGroup>
  </NavList>
);

/**
 * Stands in for the host: it owns the committed location, which is all the
 * shell is ever told about routing.
 */
const Shell = ({
  width,
  withRail = false,
}: {
  width: string;
  withRail?: boolean;
}) => {
  const [location, setLocation] = useState('/study/1');

  const commitNavigation = (event: MouseEvent<HTMLDivElement>) => {
    const link =
      event.target instanceof Element ? event.target.closest('a') : null;
    // The skip link is the frame's own control, not a destination: it moves
    // focus within the current route and commits nothing.
    if (!link || link.getAttribute('href')?.startsWith('#')) return;

    event.preventDefault();
    setLocation(link.getAttribute('href') ?? location);
  };

  return (
    <div
      // Stands in for the router: activation is caught on the way up so the
      // stories keep rendering the plain-anchor destinations every other
      // navigation story does. Presentational, exactly as `AppArea`'s own
      // stories mark their equivalent.
      role="presentation"
      onClick={commitNavigation}
      style={{ width }}
      className="border-surface-2 bg-surface text-surface-contrast publish-colors h-[28rem] overflow-hidden rounded border"
    >
      <AppFrame
        header={
          <div className="border-surface-2 flex items-center gap-3 border-b px-4 py-3">
            <span className="font-heading font-bold">Studio</span>
            <span className="text-text/70 text-sm">{location}</span>
          </div>
        }
        skipLinkLabel="Skip to main content"
        leadingRail={
          withRail ? (
            <div className="border-surface-2 flex h-full w-14 flex-col items-center gap-2 border-e py-3">
              <a href="/gallery" aria-label="Gallery" className="focusable p-2">
                <Download aria-hidden className="size-5" />
              </a>
            </div>
          ) : undefined
        }
      >
        <AppArea
          location={location}
          navigation={{
            label: 'Study',
            openLabel: 'Open study navigation',
            closeLabel: 'Close study navigation',
            content: studySidebar,
          }}
        >
          <RouteContent heading="Study overview" />
        </AppArea>
      </AppFrame>
    </div>
  );
};

const RouteContent = ({ heading }: { heading: ReactNode }) => (
  <div className="flex flex-col gap-3 p-6">
    <h1 {...routeFocusTargetProps} className="font-heading text-2xl font-bold">
      {heading}
    </h1>
    <p className="text-text/80 max-w-[60ch]">
      The frame owns the skip link and the header; this landmark and the
      navigation region beside it belong to the area.
    </p>
  </div>
);

/**
 * The frame's own children, read positionally — which is the claim about the
 * rail slot as much as it is a way to find things: skip link, header, then the
 * rail only when there is one, then the area region.
 */
const frameParts = (canvasElement: HTMLElement) => {
  const header = canvasElement.querySelector('header');
  if (!header?.parentElement) throw new Error('frame not rendered');
  const root = header.parentElement;
  const children = [...root.children];

  return { root, header, children };
};

/** Track count of a resolved `grid-template-columns` ("240px 800px" → 2). */
const columnCount = (element: Element) =>
  getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean)
    .length;

const meta = {
  title: 'Layout/AppShellComposition',
  component: Shell,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: { description: { component: documentation } },
  },
  args: { width: '64rem' },
} satisfies Meta<typeof Shell>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * A wide frame: the area's labelled `<nav>` beside its `<main>`, and no area
 * bar — the trigger for a drawer nobody can reach is out of the accessibility
 * tree, not merely out of sight.
 */
export const WideFrame: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Exactly one of each landmark, and the area owns both.
    await expect(canvas.getAllByRole('navigation')).toHaveLength(1);
    await expect(
      canvas.getByRole('navigation', { name: 'Study' }),
    ).toBeVisible();
    await expect(canvas.getAllByRole('main')).toHaveLength(1);
    await expect(canvas.getByRole('main')).toHaveAttribute(
      'id',
      'main-content',
    );

    await expect(
      canvas.queryByRole('button', { name: 'Open study navigation' }),
    ).toBeNull();
  },
};

/**
 * The frame's skip link and the area's `<main>` are rendered by different
 * components, so the pair is asserted at runtime: the link's fragment names the
 * landmark that exists, and activating it lands focus there.
 */
export const SkipLinkReachesTheAreaMain: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const skipLink = canvas.getByRole('link', {
      name: 'Skip to main content',
    });
    const main = canvas.getByRole('main');

    await expect(skipLink).toHaveAttribute('href', `#${main.id}`);

    skipLink.focus();
    await userEvent.keyboard('{Enter}');

    await expect(main).toHaveFocus();
  },
};

/**
 * The same area in a narrow frame. The sidebar is replaced by the area bar, and
 * the destinations move into the drawer — decided by the width the FRAME gives
 * the area, with nothing passed down to say so.
 */
export const NarrowFrame: Story = {
  args: { width: '24rem' },
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

    // Still one navigation region in the accessibility tree: the sidebar is
    // `display: none`, so the drawer's is the only one.
    await expect(screen.getAllByRole('navigation')).toHaveLength(1);
  },
};

/**
 * Activating a destination in the drawer, through the whole shell: the
 * navigation commits, the drawer closes over it, and focus is handed to the
 * route's landing point rather than back to the area bar's trigger.
 */
export const DrawerHandsOffToTheRoute: Story = {
  args: { width: '24rem' },
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
 * With no rail supplied, nothing at all stands in for it: no element, and no
 * grid column holding the space one would have taken. The area region starts at
 * the frame's own inline-start edge.
 */
export const WithoutLeadingRail: Story = {
  play: async ({ canvasElement }) => {
    const { root, children } = frameParts(canvasElement);

    // Skip link, header, area region.
    await expect(children).toHaveLength(3);
    await expect(columnCount(root)).toBe(1);

    const area = children[2]!;
    await expect(area.getBoundingClientRect().left).toBeCloseTo(
      root.getBoundingClientRect().left,
      0,
    );
  },
};

/**
 * The rail slot filled. It takes a column of its own beside the area region,
 * both below the header, which still spans the full width — the seam §5.6
 * leaves open, exercised so that adopting it later is a change to one host and
 * not to the frame.
 */
export const WithLeadingRail: Story = {
  args: { withRail: true },
  play: async ({ canvasElement }) => {
    const { root, header, children } = frameParts(canvasElement);

    // Skip link, header, rail, area region — in that order.
    await expect(children).toHaveLength(4);
    await expect(columnCount(root)).toBe(2);

    const rail = children[2]!.getBoundingClientRect();
    const area = children[3]!.getBoundingClientRect();
    const banner = header.getBoundingClientRect();
    const frame = root.getBoundingClientRect();

    // The rail is beside the area, not above or over it.
    await expect(rail.right).toBeLessThanOrEqual(area.left + 1);
    await expect(rail.top).toBeGreaterThanOrEqual(banner.bottom - 1);
    await expect(area.top).toBeGreaterThanOrEqual(banner.bottom - 1);
    // The header still spans both columns.
    await expect(banner.width).toBeCloseTo(frame.width, 0);
    // And the area still reaches the frame's far edge.
    await expect(area.right).toBeCloseTo(frame.right, 0);

    // The sidebar is still there: the area's wide/narrow decision is measured
    // against the region the rail narrowed, not against the viewport.
    await expect(
      within(canvasElement).getByRole('navigation', { name: 'Study' }),
    ).toBeVisible();
  },
};
