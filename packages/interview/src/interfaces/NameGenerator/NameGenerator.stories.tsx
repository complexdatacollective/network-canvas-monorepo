import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

type StageType = 'NameGenerator' | 'NameGeneratorQuickAdd';

type StoryArgs = {
  stageType: StageType;
  initialNodeCount: number;
  promptCount: number;
  panelCount: number;
  minNodes: number;
  maxNodes: number;
  /**
   * Panel 1 content. `0` keeps it an existing-network panel; any value `> N`
   * makes it an external-data panel pre-loaded with that many nodes. Set this
   * unequal to {@link panel2NodeCount} to reproduce the lopsided split where one
   * open panel takes nearly all the space and its sibling collapses to a sliver.
   */
  panel1NodeCount: number;
  /** Panel 2 content; see {@link panel1NodeCount}. */
  panel2NodeCount: number;
  /** Per-panel title overrides (index-aligned); falls back to `Panel N`. */
  panelTitles?: string[];
};

type PanelHost = {
  addPanel: (config: { title: string; dataSource?: string }) => void;
};

/**
 * Add `args.panelCount` side panels to a stage. A panel whose per-index node
 * count (`panel1NodeCount` / `panel2NodeCount`) is `> 0` becomes an
 * external-data panel loaded with exactly that many nodes, giving each panel an
 * independently controllable content height; a count of `0` leaves it as a
 * plain existing-network panel.
 */
function addConfiguredPanels(
  interview: SyntheticInterview,
  stage: PanelHost,
  args: StoryArgs,
) {
  const nodeCounts = [args.panel1NodeCount, args.panel2NodeCount];

  for (let i = 0; i < args.panelCount; i++) {
    const title = args.panelTitles?.[i] ?? `Panel ${i + 1}`;
    const nodeCount = nodeCounts[i] ?? 0;

    if (nodeCount <= 0) {
      stage.addPanel({ title });
      continue;
    }

    const assetId = `panel-${i}-data`;
    const names = Array.from(
      { length: nodeCount },
      (_, n) => `${title} ${n + 1}`,
    );
    interview.addAsset({
      key: assetId,
      assetId,
      name: `${assetId}.json`,
      type: 'network',
      url: buildExternalDataUrl(names),
      size: 0,
    });
    stage.addPanel({ title, dataSource: assetId });
  }
}

/**
 * When `initialNodeCount > 0`, prepend a one-prompt "Setup" NameGenerator stage
 * that creates those nodes and assigns them to its prompt. This mirrors the
 * production state in which alters always carry at least one promptID — it's
 * also what makes the existing-network panel's "drag back to remove from this
 * prompt" round-trip work in the demo stage.
 */
function buildInterview(args: StoryArgs): {
  interview: SyntheticInterview;
  demoStageStep: number;
} {
  const interview = new SyntheticInterview();

  const nodeType = interview.addNodeType({ name: 'Person' });
  const nameVar = nodeType.addVariable({ type: 'text', name: 'Name' });

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const hasSetupStage = args.initialNodeCount > 0;
  if (hasSetupStage) {
    const setup = interview.addStage('NameGeneratorQuickAdd', {
      label: 'Prior contacts',
      initialNodes: { count: args.initialNodeCount, promptIndex: 0 },
      subject: { entity: 'node', type: nodeType.id },
      quickAdd: nameVar.id,
    });
    setup.addPrompt({ text: 'People named in earlier interview activity.' });
  }

  const behaviours =
    args.minNodes > 0 || args.maxNodes > 0
      ? {
          ...(args.minNodes > 0 ? { minNodes: args.minNodes } : {}),
          ...(args.maxNodes > 0 ? { maxNodes: args.maxNodes } : {}),
        }
      : undefined;

  if (args.stageType === 'NameGenerator') {
    const stage = interview.addStage('NameGenerator', {
      label: 'Name Generator',
      subject: { entity: 'node', type: nodeType.id },
      behaviours,
    });

    stage.addFormField({ component: 'Text', prompt: 'What is their name?' });
    stage.addFormField({ component: 'Number', prompt: 'How old are they?' });
    stage.addFormField({
      component: 'Text',
      prompt: 'Do they have a nickname?',
    });

    for (let i = 0; i < args.promptCount; i++) {
      stage.addPrompt({
        text: `Prompt ${i + 1}: Please name the people you know.`,
      });
    }

    addConfiguredPanels(interview, stage, args);
  } else {
    const stage = interview.addStage('NameGeneratorQuickAdd', {
      label: 'Name Generator',
      subject: { entity: 'node', type: nodeType.id },
      quickAdd: nameVar.id,
      behaviours,
    });

    for (let i = 0; i < args.promptCount; i++) {
      stage.addPrompt({
        text: `Prompt ${i + 1}: Please name the people you know.`,
      });
    }

    addConfiguredPanels(interview, stage, args);
  }

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  // Welcome (0) → [Setup (1)?] → Demo → Complete. Land on Demo.
  return { interview, demoStageStep: hasSetupStage ? 2 : 1 };
}

const NameGeneratorStoryWrapper = (args: StoryArgs) => {
  const configKey = JSON.stringify(args);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { interview, demoStageStep } = useMemo(
    () => buildInterview(args),
    [configKey],
  );
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        interview.getInterviewPayload({ currentStep: demoStageStep }),
      ),
    [interview, demoStageStep],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/NameGenerator',
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    stageType: {
      control: 'radio',
      options: ['NameGeneratorQuickAdd', 'NameGenerator'],
      description: 'Quick-add input or form dialog',
    },
    initialNodeCount: {
      control: { type: 'range', min: 0, max: 15 },
      description: 'Pre-populated nodes assigned to prompt 1',
    },
    promptCount: {
      control: { type: 'range', min: 1, max: 4 },
      description: 'Number of prompts (pips appear for 2+)',
    },
    panelCount: {
      control: { type: 'range', min: 0, max: 2 },
      description:
        'Number of side panels (per-panel data source set by panel1/2NodeCount)',
    },
    panel1NodeCount: {
      control: { type: 'range', min: 0, max: 20 },
      description:
        'Panel 1 nodes: 0 = existing-network panel; >0 = external-data panel with N nodes. Set unequal to panel 2 to reproduce the lopsided split.',
    },
    panel2NodeCount: {
      control: { type: 'range', min: 0, max: 20 },
      description:
        'Panel 2 nodes: 0 = existing-network panel; >0 = external-data panel with N nodes.',
    },
    minNodes: {
      control: 'number',
      description: 'Min node constraint (0 = disabled)',
    },
    maxNodes: {
      control: 'number',
      description: 'Max node constraint (0 = no limit)',
    },
  },
  args: {
    stageType: 'NameGeneratorQuickAdd',
    initialNodeCount: 3,
    promptCount: 2,
    panelCount: 1,
    panel1NodeCount: 0,
    panel2NodeCount: 0,
    minNodes: 0,
    maxNodes: 0,
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  render: (args) => <NameGeneratorStoryWrapper {...args} />,
};

/**
 * Two stacked side panels with *unequal* content (12 nodes vs 2). When both
 * panels are open they should each take ~50% of the column regardless of how
 * much content each holds. This is the regression guard for the lopsided-split
 * bug: because `Panel` grows from a content-derived `flex-basis: auto` (rather
 * than `basis-0`) the fuller panel keeps nearly all the space and its sibling
 * collapses to a sliver — the `play` below fails until `components/Panel.tsx`
 * gives panels a zero basis.
 *
 * Use the `panel1NodeCount` / `panel2NodeCount` controls to vary the imbalance,
 * or set both to the same value. Setting a count to `0` reverts that panel to an
 * existing-network panel.
 */
export const TwoPanels: Story = {
  args: {
    stageType: 'NameGenerator',
    initialNodeCount: 0,
    promptCount: 1,
    panelCount: 2,
    panel1NodeCount: 12,
    panel2NodeCount: 2,
    minNodes: 0,
    maxNodes: 0,
    panelTitles: ['in progress interview', 'previous interview'],
  },
  render: (args) => <NameGeneratorStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Wait until both panels have rendered and their external data has loaded,
    // so measured heights reflect real content (12 vs 2 nodes).
    const panels = await waitFor(
      async () => {
        const found = canvas.getAllByTestId('node-panel');
        await expect(found.length).toBe(2);
        await expect(within(found[0]!).getAllByRole('option').length).toBe(12);
        await expect(within(found[1]!).getAllByRole('option').length).toBe(2);
        return found;
      },
      { timeout: 10000 },
    );

    // Surface (the panel root) mounts with its own entrance animation that
    // drives the node-panel element's opacity 0 → 1; measuring before it settles
    // reports transient zero heights, so wait for it to finish. (The ratio below
    // is scale-invariant, but the height read itself is not reliable mid-anim.)
    await waitFor(
      async () => {
        for (const p of panels) {
          await expect(getComputedStyle(p).opacity).toBe('1');
        }
      },
      { timeout: 5000 },
    );

    const [tall, short] = panels.map((p) => p.getBoundingClientRect().height);
    const ratio = Math.min(tall!, short!) / Math.max(tall!, short!);

    // Two open panels should split the rail evenly irrespective of content.
    // Pre-fix (`grow` + content-derived `basis-auto`) the fuller panel keeps
    // almost all the height and this ratio collapses toward 0; post-fix
    // (`basis-0`) both grow from a zero baseline and it sits near 1.
    await expect(
      ratio,
      `Open panels should be within 15% of each other in height, got ${tall!.toFixed(0)}px vs ${short!.toFixed(0)}px`,
    ).toBeGreaterThan(0.85);
  },
};

export const MinNodesValidation: Story = {
  args: {
    stageType: 'NameGeneratorQuickAdd',
    initialNodeCount: 0,
    promptCount: 1,
    panelCount: 0,
    minNodes: 3,
    maxNodes: 0,
  },
  render: (args) => <NameGeneratorStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const forwardButton = canvas.getByRole('button', { name: 'Next Step' });
    await userEvent.click(forwardButton);

    await waitFor(async () => {
      await expect(
        screen.getByText(/must create at least/i),
      ).toBeInTheDocument();
    });

    await expect(screen.getByText('3')).toBeInTheDocument();
  },
};

export const MaxNodesReached: Story = {
  args: {
    stageType: 'NameGeneratorQuickAdd',
    initialNodeCount: 3,
    promptCount: 1,
    panelCount: 0,
    minNodes: 0,
    maxNodes: 3,
  },
  render: (args) => <NameGeneratorStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const forwardButton = canvas.getByRole('button', { name: 'Next Step' });
    await waitFor(
      async () => {
        await expect(forwardButton.className).toMatch(/animate-pulse-glow/);
      },
      { timeout: 3000 },
    );
  },
};

/**
 * Tests keyboard drag-and-drop from an "existing" side panel to the main node list.
 *
 * The 3 initial nodes are created by `buildInterview`'s prepended Setup stage,
 * so they reach the demo stage's existing panel already carrying a prior
 * promptID. The main list starts empty; dragging a node into it adds the
 * current prompt.
 */
export const DragFromPanelToMainList: Story = {
  args: {
    stageType: 'NameGeneratorQuickAdd',
    initialNodeCount: 3,
    promptCount: 1,
    panelCount: 1,
    minNodes: 0,
    maxNodes: 0,
  },
  render: (args) => <NameGeneratorStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Wait for the panel to render with nodes.
    // Nodes inside the Collection are role="option" (within a role="listbox").
    const panel = await waitFor(
      async () => {
        const p = canvas.getByTestId('node-panel');
        const nodes = within(p).getAllByRole('option');
        // With 3 initial nodes and empty promptIDs, the existing panel
        // shows all 3.
        await expect(nodes.length).toBe(3);
        return p;
      },
      { timeout: 5000 },
    );

    // Main list should start empty (no nodes assigned to this prompt).
    const mainList = canvas.getByTestId('node-list');
    const mainNodesBefore = within(mainList).queryAllByRole('option').length;
    await expect(mainNodesBefore).toBe(0);

    // Focus the first panel node and initiate a keyboard drag.
    const firstPanelNode = within(panel).getAllByRole('option')[0]!;
    firstPanelNode.focus();

    // Ctrl+D starts keyboard drag mode.
    await userEvent.keyboard('{Control>}d{/Control}');

    // Arrow key navigates to the next compatible drop target (main list).
    await userEvent.keyboard('{ArrowRight}');

    // Enter confirms the drop.
    await userEvent.keyboard('{Enter}');

    // Assert: panel lost one node, main list gained one.
    await waitFor(
      async () => {
        const panelNodesAfter = within(panel).queryAllByRole('option').length;
        const mainNodesAfter = within(mainList).queryAllByRole('option').length;
        await expect(panelNodesAfter).toBe(2);
        await expect(mainNodesAfter).toBe(1);
      },
      { timeout: 5000 },
    );
  },
};

/**
 * Round-trip: a node dragged from the existing panel into the main list can be
 * dragged back into the panel to remove it from the current prompt while
 * keeping it in the network.
 *
 * `buildInterview` prepends a Setup stage that creates the initial nodes and
 * assigns them to its prompt, so they reach the demo stage's panel with a real
 * promptID — letting the round-trip leave them at length 1 (still on the Setup
 * prompt) rather than orphaning them.
 */
export const ExistingPanelRoundTrip: Story = {
  args: {
    stageType: 'NameGeneratorQuickAdd',
    initialNodeCount: 3,
    promptCount: 2,
    panelCount: 1,
    minNodes: 0,
    maxNodes: 0,
  },
  render: (args) => <NameGeneratorStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const panel = await waitFor(
      async () => {
        const p = canvas.getByTestId('node-panel');
        await expect(within(p).getAllByRole('option').length).toBe(3);
        return p;
      },
      { timeout: 5000 },
    );

    const mainList = canvas.getByTestId('node-list');
    await expect(within(mainList).queryAllByRole('option').length).toBe(0);

    // Forward: panel → main list.
    within(panel).getAllByRole('option')[0]!.focus();
    await userEvent.keyboard('{Control>}d{/Control}');
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');

    await waitFor(
      async () => {
        await expect(within(panel).queryAllByRole('option').length).toBe(2);
        await expect(within(mainList).queryAllByRole('option').length).toBe(1);
      },
      { timeout: 5000 },
    );

    // Round-trip: main list → panel. The dragged EXISTING_NODE has two
    // compatible targets (the panel and the NodeBin trash). The keyboard
    // delegate cycles them in registration order, which isn't guaranteed,
    // so cycle arrow keys until the live region announces the panel before
    // pressing Enter.
    within(mainList).getAllByRole('option')[0]!.focus();
    await userEvent.keyboard('{Control>}d{/Control}');

    const panelTitle = 'Panel 1';
    const seenAnnouncements: string[] = [];

    const maxCycles = 6;
    let landedOnPanel = false;
    for (let i = 0; i < maxCycles; i++) {
      await userEvent.keyboard('{ArrowLeft}');
      const liveRegions = Array.from(
        document.querySelectorAll('[role="status"][aria-live="polite"]'),
      );
      const announcement = liveRegions
        .map((r) => r.textContent ?? '')
        .join(' | ');
      seenAnnouncements.push(announcement);
      if (announcement.includes(panelTitle)) {
        landedOnPanel = true;
        break;
      }
    }
    await expect(
      landedOnPanel,
      `Did not navigate to "${panelTitle}". Saw: ${JSON.stringify(seenAnnouncements)}`,
    ).toBe(true);
    await userEvent.keyboard('{Enter}');

    await waitFor(
      async () => {
        await expect(within(panel).queryAllByRole('option').length).toBe(3);
        await expect(within(mainList).queryAllByRole('option').length).toBe(0);
      },
      { timeout: 5000 },
    );
  },
};

// --- External data panel ---

/**
 * Build an external data JSON payload as a blob: URL.
 * `loadExternalData` calls `fetch(url)` which supports blob: URLs.
 */
function buildExternalDataUrl(names: string[]) {
  const nodes = names.map((name) => ({
    [entityAttributesProperty]: { Name: name },
  }));
  const blob = new Blob([JSON.stringify({ nodes })], {
    type: 'application/json',
  });
  return URL.createObjectURL(blob);
}

function buildExternalDataInterview() {
  const interview = new SyntheticInterview();

  const nodeType = interview.addNodeType({ name: 'Person' });
  const nameVar = nodeType.addVariable({ type: 'text', name: 'Name' });

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const stage = interview.addStage('NameGeneratorQuickAdd', {
    label: 'Name Generator',
    subject: { entity: 'node', type: nodeType.id },
    quickAdd: nameVar.id,
  });

  stage.addPrompt({ text: 'Name the people you know.' });

  const externalNames = [
    'Alice',
    'Bob',
    'Charlie',
    'Diana',
    'Eve',
    'Frank',
    'Grace',
    'Hector',
    'Iris',
    'Jack',
    'Karen',
    'Leo',
    'Mona',
    'Nate',
    'Olivia',
    'Pete',
    'Quinn',
    'Rosa',
    'Sam',
    'Tina',
  ];

  const assetId = 'external-contacts';
  interview.addAsset({
    key: assetId,
    assetId,
    name: 'contacts.json',
    type: 'network',
    url: buildExternalDataUrl(externalNames),
    size: 0,
  });

  stage.addPanel({ title: 'Imported Contacts', dataSource: assetId });

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return interview;
}

const ExternalDataStoryWrapper = () => {
  const interview = useMemo(() => buildExternalDataInterview(), []);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

/**
 * Tests keyboard drag-and-drop from an external data panel to the main node list.
 *
 * 20 contacts (Alice–Tina) are loaded from a blob: URL into the side panel.
 * Dragging one to the main list adds it to the network and current prompt.
 */
export const DragFromExternalDataPanel: Story = {
  args: {
    stageType: 'NameGeneratorQuickAdd',
    initialNodeCount: 0,
    promptCount: 1,
    panelCount: 0,
    minNodes: 0,
    maxNodes: 0,
  },
  render: () => <ExternalDataStoryWrapper />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const getPanel = () => canvas.getByTestId('node-panel');
    const getMainList = () => canvas.getByTestId('node-list');

    // Wait for the external data panel to load and render all 20 nodes.
    await waitFor(
      async () => {
        const nodes = within(getPanel()).getAllByRole('option');
        await expect(nodes.length).toBe(20);
      },
      { timeout: 10000 },
    );

    await expect(within(getMainList()).queryAllByRole('option').length).toBe(0);

    // Drag from panel → main list via keyboard.
    // Focus the first panel node and use Ctrl+D to start keyboard drag.
    within(getPanel()).getAllByRole('option')[0]!.focus();
    await userEvent.keyboard('{Control>}d{/Control}');
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');

    // Verify: panel lost one node, main list gained one.
    await waitFor(
      async () => {
        await expect(within(getPanel()).queryAllByRole('option').length).toBe(
          19,
        );
        await expect(within(getMainList()).getAllByRole('option').length).toBe(
          1,
        );
      },
      { timeout: 5000 },
    );
  },
};
