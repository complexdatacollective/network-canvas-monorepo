import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Panel from './Panel';
import Panels from './Panels';

/**
 * Isolated harness for the side-panel collapse/expand behaviour, decoupled from
 * the interview store, external data, and drag-and-drop. Each `Panel` owns its
 * own collapsed state and toggles it when its title bar is clicked; `Panels` is
 * the `flex flex-col` vertical container they stack inside.
 *
 * Use the `TwoFullPanels` story to reproduce the reported glitch where, with two
 * fully-populated panels, collapsing one does not let the sibling expand to fill
 * the freed space (and vice versa).
 */

const FillerList = ({ count }: { count: number }) => (
  <div className="flex flex-col gap-2 overflow-auto p-4">
    {Array.from({ length: count }, (_, i) => (
      <div
        key={i}
        className="bg-surface-1 flex h-12 shrink-0 items-center rounded px-3"
      >
        Item {i + 1}
      </div>
    ))}
  </div>
);

const meta: Meta<typeof Panels> = {
  title: 'Components/Panels',
  component: Panels,
  parameters: {
    layout: 'fullscreen',
  },
  // Constrain height so collapse/expand is observable: panels grow to fill the
  // available column height, mirroring the Name Generator side rail.
  decorators: [
    (Story) => (
      <div className="bg-background flex h-dvh w-80 flex-col p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Two stacked, fully-populated panels. Click either header to collapse it; the
 * sibling should expand to fill the freed space.
 */
export const TwoFullPanels: Story = {
  render: () => (
    <Panels>
      <Panel title="in progress interview" panelNumber={0}>
        <FillerList count={12} />
      </Panel>
      <Panel title="previous interview" panelNumber={1}>
        <FillerList count={12} />
      </Panel>
    </Panels>
  ),
};

/**
 * Two stacked panels holding *different* amounts of content. Both should still
 * take ~50% of the column: each `Panel` grows from a zero `flex-basis` (`basis-0`)
 * so the split ignores content height. Before that fix they grew from a
 * content-derived `flex-basis: auto`, so the fuller panel kept most of the space
 * and the sibling collapsed to a sliver — the asymmetry `TwoFullPanels` masks by
 * giving both panels identical content.
 */
export const UnequalPanels: Story = {
  render: () => (
    <Panels>
      <Panel title="in progress interview" panelNumber={0} testId="panel-0">
        <FillerList count={12} />
      </Panel>
      <Panel title="previous interview" panelNumber={1} testId="panel-1">
        <FillerList count={1} />
      </Panel>
    </Panels>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Deterministic isolated mirror of NameGenerator's `TwoPanels` even-split
    // guard: no store, external data, or entrance animation to settle.
    const [tall, short] = await waitFor(
      async () => {
        const heights = ['panel-0', 'panel-1'].map(
          (id) => canvas.getByTestId(id).getBoundingClientRect().height,
        );
        for (const h of heights) await expect(h).toBeGreaterThan(0);
        return heights;
      },
      { timeout: 2000 },
    );

    const ratio = Math.min(tall!, short!) / Math.max(tall!, short!);
    await expect(
      ratio,
      `Open panels should split ~evenly despite unequal content, got ${tall!.toFixed(0)}px vs ${short!.toFixed(0)}px`,
    ).toBeGreaterThan(0.85);
  },
};

/**
 * Clicking a panel's title bar collapses it. The collapsed panel must shrink to
 * just its title bar — the whole title stays visible — rather than collapsing to
 * zero height and clipping the title behind `overflow-hidden`. Regression guard
 * for the `basis-0` interaction: a collapsed `grow-0` panel with a zero basis
 * shrinks all the way to nothing, so `Panel` must restore an auto basis while
 * collapsed.
 */
export const CollapseKeepsTitle: Story = {
  render: () => (
    <Panels>
      <Panel title="in progress interview" panelNumber={0} testId="panel-0">
        <FillerList count={12} />
      </Panel>
      <Panel title="previous interview" panelNumber={1} testId="panel-1">
        <FillerList count={12} />
      </Panel>
    </Panels>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const panel = canvas.getByTestId('panel-0');
    const header = within(panel).getByRole('button', {
      name: /in progress interview/i,
    });
    const fullHeight = panel.getBoundingClientRect().height;
    // Capture the header's natural height while the panel is still open — once
    // collapsed a buggy panel would clip the header too, so measuring it
    // afterwards could read a misleadingly small value.
    const headerHeight = header.getBoundingClientRect().height;

    // Collapse the panel via its title bar.
    await userEvent.click(header);

    // Collapse runs a 500ms transition — wait for the height to stop changing
    // before measuring so we don't read a mid-animation value.
    let prev = -1;
    await waitFor(
      async () => {
        const h = panel.getBoundingClientRect().height;
        const settled = h < fullHeight && Math.abs(h - prev) < 1;
        prev = h;
        await expect(settled).toBe(true);
      },
      { timeout: 3000, interval: 150 },
    );

    // A correctly collapsed panel stays at least as tall as its title bar,
    // keeping the whole title visible; the bug shrinks it to ~0 (just the
    // bottom border). Guard both against the header height and an absolute floor
    // so the assertion can't be satisfied by a degenerate near-zero panel.
    const collapsedHeight = panel.getBoundingClientRect().height;
    await expect(
      collapsedHeight,
      `Collapsed panel should still show its full title bar (>= ${headerHeight.toFixed(0)}px), got ${collapsedHeight.toFixed(0)}px`,
    ).toBeGreaterThanOrEqual(headerHeight - 1);
    await expect(collapsedHeight).toBeGreaterThan(20);
  },
};

/**
 * Single panel baseline — collapse/expand of one panel in isolation works as a
 * reference for the two-panel case.
 */
export const SinglePanel: Story = {
  render: () => (
    <Panels>
      <Panel title="in progress interview" panelNumber={0}>
        <FillerList count={12} />
      </Panel>
    </Panels>
  ),
};
