import type { Meta, StoryObj } from '@storybook/react-vite';
import { Menu } from 'lucide-react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Button, { IconButton } from '../Button';
import AppFrame, { DEFAULT_SKIP_TARGET_ID } from './AppFrame';

/**
 * Stands in for the host's header contents. `AppFrame` renders the `<header>`
 * element; everything inside it is the application's own information
 * architecture.
 */
const DemoHeader = ({ study }: { study: string }) => (
  <div className="border-surface-2 flex flex-wrap items-center gap-3 border-b px-4 py-3">
    <span className="font-heading text-lg font-bold">Studio</span>
    <Button size="sm" variant="text">
      Bergen Cohort
    </Button>
    <Button size="sm" variant="text">
      {study}
    </Button>
    <Button size="sm" variant="text" className="ms-auto">
      Account
    </Button>
  </div>
);

/**
 * Stands in for `layout/AppArea` until it lands: the labelled `<nav>` on a wide
 * region, the area bar on a narrow one, and the `<main id="main-content">` the
 * skip link targets. All three are the AREA's to render — `AppFrame` renders
 * none of them.
 *
 * The wide/narrow switch is a container query against the frame's area region,
 * so it answers to the width the area is actually given rather than to the
 * width of the browser window.
 */
const DemoArea = ({
  areaName,
  destinations,
}: {
  areaName: string;
  destinations: string[];
}) => (
  <div className="flex min-h-0 flex-col @min-[48rem]/app-area:flex-row">
    <div className="border-surface-2 flex items-center gap-2 border-b px-4 py-2 @min-[48rem]/app-area:hidden">
      <IconButton
        size="sm"
        variant="text"
        icon={<Menu aria-hidden className="size-5" />}
        aria-label={`Open ${areaName} navigation`}
      />
      <span className="font-heading font-bold">{areaName}</span>
    </div>
    <nav
      aria-label={areaName}
      className="border-surface-2 hidden w-56 shrink-0 flex-col gap-1 border-e p-4 @min-[48rem]/app-area:flex"
    >
      {destinations.map((destination) => (
        <a
          key={destination}
          href={`#${destination}`}
          className="focusable rounded px-3 py-2 no-underline"
        >
          {destination}
        </a>
      ))}
    </nav>
    {/*
      The id an area layout gives its `<main>` is the frame's skip target: the
      link and the landmark are rendered by different components, so the pair is
      held together by this constant rather than by a repeated literal.
    */}
    <main id={DEFAULT_SKIP_TARGET_ID} className="min-w-0 flex-1 p-6">
      <h1 className="font-heading text-2xl font-bold">{destinations[0]}</h1>
      <p className="mt-2">
        The area owns this landmark, and the skip link in the frame above moves
        focus straight to it.
      </p>
    </main>
  </div>
);

const documentation = `
The application shell's outer frame: the skip link, the \`<header>\` and the
area region every area layout renders into. Rendered once, above the areas, so
the header survives every area transition.

\`\`\`tsx
<AppFrame header={<StudioHeader />} skipLinkLabel={t('skipToMainContent')}>
  <Outlet />
</AppFrame>
\`\`\`

- **It renders no \`<nav>\` and no \`<main>\`.** Both belong to the area, because
  an area's sidebar and the \`<main>\` that sidebar labels replace each other
  wholesale when the researcher moves between areas. A \`<main>\` here would nest
  the editor's inside the study's and give the skip link two candidates.
- **The skip link is the first focusable element**, ahead of the header, and it
  moves focus programmatically. A fragment link scrolls to its target but only
  focuses it when the target is already focusable, and \`<main>\` is not — so a
  plain \`href="#main-content"\` would leave the next Tab restarting at the top
  of the document, on the link just used.
- **The area region is the container-query context**, so an area sizes itself to
  the width it is actually given rather than to the viewport — the same area in
  a narrow frame and a wide one answers differently with nothing passed down to
  say so.
`;

const meta = {
  title: 'Layout/AppFrame',
  component: AppFrame,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: documentation } },
  },
  args: {
    header: <DemoHeader study="Social Support" />,
    skipLinkLabel: 'Skip to main content',
    className: 'h-[26rem]',
    children: (
      <DemoArea
        areaName="Study"
        destinations={['Overview', 'Editor', 'Participants', 'Sessions']}
      />
    ),
  },
} satisfies Meta<typeof AppFrame>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The frame as every app route sees it: a header across the top and one area
 * below it. Tab once to reveal the skip link.
 */
export const Default: Story = {};

/**
 * Translation expands navigation labels by roughly a third, and the skip link
 * is no exception. The frame sizes to its content: nothing here is clipped or
 * truncated.
 */
export const LongLabels: Story = {
  args: {
    header: <DemoHeader study="Kartierung sozialer Unterstützungsnetzwerke" />,
    skipLinkLabel: 'Zum Hauptinhalt der Seite springen',
    children: (
      <DemoArea
        areaName="Studienverwaltung"
        destinations={[
          'Übersicht',
          'Protokoll-Editor',
          'Teilnehmendenverwaltung',
          'Erhebungssitzungen',
        ]}
      />
    ),
  },
};

/**
 * The same frame in a narrow region. The area drops its sidebar for an area bar
 * — and it does so on the width of the region, not the width of the browser
 * window — which is why this story's 24rem harness decides it and the width of
 * the Storybook canvas does not.
 */
export const NarrowContainer: Story = {
  decorators: [
    (Story) => (
      <div className="w-[24rem]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole('navigation')).toBeNull();
    await expect(
      canvas.getByRole('button', { name: 'Open Study navigation' }),
    ).toBeVisible();
  },
};

/**
 * The same frame in a wide region, where the area shows its sidebar and no area
 * bar. The harness is wider than the Storybook canvas on purpose: a container
 * query reads the region's own width, so the result does not depend on the
 * window the story happens to run in.
 */
export const WideContainer: Story = {
  decorators: [
    (Story) => (
      <div className="w-[64rem]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('navigation', { name: 'Study' }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Open Study navigation' }),
    ).toBeNull();
  },
};

/**
 * The skip link is parked off-screen until it takes focus, is the first thing
 * Tab reaches, and lands focus inside the area's `<main>` — which is the part a
 * bare fragment link does not do, because `<main>` is not focusable on its own.
 */
export const SkipLinkMovesFocusToMain: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: 'Skip to main content' });

    // Off-screen but still in the tab order and in the accessibility tree —
    // never `display: none`, which would take it out of both.
    await expect(link.getBoundingClientRect().top).toBeLessThan(0);

    await userEvent.tab();
    await expect(link).toHaveFocus();
    await waitFor(() =>
      expect(link.getBoundingClientRect().top).toBeGreaterThanOrEqual(0),
    );

    await userEvent.click(link);

    await expect(canvas.getByRole('main')).toHaveFocus();
  },
};
