import { act } from '@testing-library/react';
import type { DragControls } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArrayFieldItemProps } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

// `confirm` is the behaviour under test below, and the real provider would
// need a mounted dialog tree to resolve it.
const confirmMock = vi.fn<() => Promise<boolean>>();
vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm: confirmMock }),
}));

// Neither the data-source picker's asset list nor NetworkFilter's nested
// rule-builder tree is exercised by the reset behaviour below. Leaving
// NetworkFilter unmounted also leaves `panels[0].filter` unregistered, which
// is how the section resolves it whenever the filter row is collapsed.
vi.mock('~/components/Form/Fields/DataSource', () => ({
  default: ({ value }: { value?: string }) => (
    <span data-testid="data-source">{value ?? ''}</span>
  ),
}));
vi.mock('~/components/sections/fields/NetworkFilter', () => ({
  default: () => <div data-testid="network-filter" />,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { HiddenFieldValue } from '~/components/sections/Form/withFieldsHandlers';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

import NodePanel, {
  hasEdgeRules,
  type NodePanelValue,
  stripEdgeRules,
} from '../NodePanel';

const alterRule = { type: 'alter', id: 'a1' };
const edgeRule = { type: 'edge', id: 'e1' };

describe('hasEdgeRules', () => {
  it.each([
    ['an unset filter', undefined, false],
    ['a filter with no rules', { rules: [] }, false],
    ['a filter with only alter rules', { rules: [alterRule] }, false],
    ['a filter with an edge rule', { rules: [alterRule, edgeRule] }, true],
  ])('is %s → %s', (_label, filter, expected) => {
    expect(hasEdgeRules(filter)).toBe(expected);
  });
});

describe('stripEdgeRules', () => {
  it('removes edge rules and keeps the rest of the filter intact', () => {
    expect(
      stripEdgeRules({ join: 'AND', rules: [alterRule, edgeRule] }),
    ).toEqual({ join: 'AND', rules: [alterRule] });
  });

  it('clears the filter entirely when every rule was an edge rule', () => {
    expect(stripEdgeRules({ join: 'AND', rules: [edgeRule] })).toBeUndefined();
  });

  it('leaves a filter with no edge rules unchanged', () => {
    expect(stripEdgeRules({ join: 'AND', rules: [alterRule] })).toEqual({
      join: 'AND',
      rules: [alterRule],
    });
  });
});

const EDGE_FILTER = { join: 'AND', rules: [alterRule, edgeRule] };

const itemProps: ArrayFieldItemProps<NodePanelValue> = {
  // The id matters: a row renders its fields only while it still owns the slot
  // it is bound to, which it establishes by matching this against the id at
  // `panels[committedIndex]` (see usePanelSlot).
  item: { id: 'panel-1' },
  index: 0,
  committedIndex: 0,
  itemCount: 1,
  isNewItem: false,
  onChange: vi.fn(),
  onUpdate: vi.fn(),
  onCancel: vi.fn(),
  onDelete: vi.fn(),
  onEdit: vi.fn(),
  onMove: vi.fn(),
  isSortable: false,
  isBeingEdited: false,
  disabled: false,
  readOnly: false,
  // Only read by the drag handle, which `isSortable: false` never renders.
  dragControls: { start: () => undefined } as unknown as DragControls,
  // Only read by an item component that runs its own delete confirmation.
  getAddTrigger: () => null,
};

const renderPanel = () =>
  renderStageForm({
    committedStage: asStage({
      panels: [
        {
          id: 'panel-1',
          title: 'Existing people',
          dataSource: 'existing',
          filter: EDGE_FILTER,
        },
      ],
    }),
    children: <NodePanel {...itemProps} />,
  });

const setDataSource = (
  view: ReturnType<typeof renderStageForm>,
  value: string,
  index = 0,
) => {
  act(() => {
    view
      .getContext()
      .storeApi.getState()
      .setFieldValue(`panels[${index}].dataSource`, value);
  });
};

/**
 * Stands in for `useStageDraftHistory`, whose `applyDiff` writes every field
 * named in the timeline snapshot inside a single `runRestore`.
 */
const restore = (
  view: ReturnType<typeof renderStageForm>,
  values: Record<string, unknown>,
) => {
  act(() => {
    view.getContext().draft.runRestore(() => {
      const { setFieldValue } = view.getContext().storeApi.getState();
      for (const [name, value] of Object.entries(values)) {
        setFieldValue(name, value as never);
      }
    });
  });
};

describe('NodePanel edge-rule confirmation', () => {
  beforeEach(() => {
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
  });

  it('asks before dropping edge rules when the researcher picks an external file', () => {
    const view = renderPanel();

    setDataSource(view, 'asset-1');

    expect(confirmMock).toHaveBeenCalledOnce();
  });

  it('does not ask when a redo restores an external data source alongside the edge rules it was snapshotted with', () => {
    const view = renderPanel();

    // The confirmation is awaited, so the timeline can snapshot the
    // still-unstripped filter next to the new data source; stepping forward
    // onto that entry must not re-open the dialog.
    restore(view, {
      'panels[0].dataSource': 'asset-1',
      'panels[0].filter': EDGE_FILTER,
    });

    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('still asks on a user edit that follows a restore', () => {
    const view = renderPanel();

    restore(view, {
      'panels[0].dataSource': 'asset-1',
      'panels[0].filter': EDGE_FILTER,
    });
    setDataSource(view, 'asset-2');

    expect(confirmMock).toHaveBeenCalledOnce();
  });

  it('still asks on a user edit after a restore that left the data source alone', () => {
    const view = renderPanel();

    // A restore of some other field bumps the same counter, so the guard has
    // to be consumed even when the data source did not move.
    restore(view, { 'panels[0].title': 'Renamed' });
    setDataSource(view, 'asset-1');

    expect(confirmMock).toHaveBeenCalledOnce();
  });
});

/**
 * The leaves `NodePanels` — not `NodePanel` — registers for every slot.
 * `panels[N].synthetic` above all: `getFormValues()` reports registered fields
 * only, so a write to an unregistered name parks dormant where the save cannot
 * see it, and an assertion made against it would be about nothing.
 */
const NODE_PANELS_LEAVES = ['id', 'synthetic'] as const;

/** The sentinel naming the interview network itself (`PanelDataSourceSchema`). */
const EXISTING_DATA_SOURCE = 'existing';

type PanelFixture = Record<string, unknown> & { id: string };

const oddsPanel = (overrides: Record<string, unknown> = {}): PanelFixture => ({
  id: 'panel-1',
  title: 'Existing people',
  dataSource: EXISTING_DATA_SOURCE,
  synthetic: { nominationProbability: 0.8 },
  ...overrides,
});

const renderPanels = (panels: PanelFixture[]) =>
  renderStageForm({
    committedStage: asStage({ panels }),
    children: (
      <>
        {panels.map((panel, index) =>
          NODE_PANELS_LEAVES.map((leaf) => (
            <HiddenFieldValue
              key={`panels[${index}].${leaf}`}
              name={`panels[${index}].${leaf}`}
              initialValue={panel[leaf] as FieldValue}
            />
          )),
        )}
        {panels.map((panel, index) => (
          <NodePanel
            key={panel.id}
            {...itemProps}
            item={panel as unknown as NodePanelValue}
            index={index}
            committedIndex={index}
            itemCount={panels.length}
          />
        ))}
      </>
    ),
  });

const panelOdds = (
  view: ReturnType<typeof renderStageForm>,
  index: number,
): unknown => {
  const panels = view.getFormValues().panels as
    | { synthetic?: unknown }[]
    | undefined;
  return panels?.[index]?.synthetic;
};

const AUTHORED_ODDS = { nominationProbability: 0.8 };

/**
 * An edge-carrying filter the SCHEMA accepts, unlike the shorthand the
 * confirmation specs above use.
 *
 * It has to parse here. `panelSchema` refuses odds from a `superRefine`, and
 * Zod skips a refinement whose object already failed a field — so a panel
 * whose filter does not parse is one the schema declines to answer about at
 * all, and the component's own control follows the very same answer.
 */
const VALID_EDGE_FILTER = {
  join: 'AND',
  rules: [
    { type: 'node', id: 'a1', options: { type: 'person', operator: 'EXISTS' } },
    { type: 'edge', id: 'e1', options: { type: 'friend', operator: 'EXISTS' } },
  ],
};

describe('NodePanel nomination odds on a data-source change', () => {
  beforeEach(() => {
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
  });

  it('clears the odds when the panel leaves the interview network', () => {
    // No filter, so nothing is confirmed: the block still has to go, or the
    // stage carries odds `panelSchema` refuses with no control on screen that
    // could remove them.
    const view = renderPanels([oddsPanel()]);
    expect(panelOdds(view, 0)).toEqual(AUTHORED_ODDS);

    setDataSource(view, 'asset-1');

    expect(confirmMock).not.toHaveBeenCalled();
    expect(panelOdds(view, 0)).toBeUndefined();
  });

  it('leaves them alone while the panel still reads the interview network', () => {
    const view = renderPanels([oddsPanel()]);

    // Neither an unrelated edit nor a write of the value the field already
    // holds is a researcher moving the panel off the interview network.
    act(() => {
      view
        .getContext()
        .storeApi.getState()
        .setFieldValue('panels[0].title', 'Renamed');
    });
    setDataSource(view, EXISTING_DATA_SOURCE);

    expect(panelOdds(view, 0)).toEqual(AUTHORED_ODDS);
  });

  it('clears them once the edge-rule confirmation is accepted', async () => {
    const view = renderPanels([oddsPanel({ filter: VALID_EDGE_FILTER })]);

    setDataSource(view, 'asset-1');
    // The confirmation is awaited, so the write lands a microtask later.
    await act(async () => undefined);

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(panelOdds(view, 0)).toBeUndefined();
  });

  it('keeps them when that confirmation is cancelled', async () => {
    confirmMock.mockResolvedValue(false);
    const view = renderPanels([oddsPanel({ filter: VALID_EDGE_FILTER })]);

    setDataSource(view, 'asset-1');
    await act(async () => undefined);

    // Cancelling puts the panel back on the interview network, where the odds
    // are admissible again — so the panel is left exactly as it was found.
    expect(view.getFieldState('panels[0].dataSource')?.value).toBe(
      EXISTING_DATA_SOURCE,
    );
    expect(panelOdds(view, 0)).toEqual(AUTHORED_ODDS);
  });

  it('leaves a sibling panel’s odds alone', () => {
    const view = renderPanels([
      oddsPanel(),
      oddsPanel({ id: 'panel-2', title: 'People you are close to' }),
    ]);

    setDataSource(view, 'asset-1', 1);

    expect(panelOdds(view, 1)).toBeUndefined();
    expect(panelOdds(view, 0)).toEqual(AUTHORED_ODDS);
  });

  it('does not clear them when a restore steps onto an external data source', () => {
    // The same reasoning the edge-rule confirmation is guarded by: a restore
    // writes the snapshot's own values for every field it names, the panel's
    // odds among them, so reacting to it would delete what the step just
    // brought back.
    const view = renderPanels([oddsPanel()]);

    restore(view, {
      'panels[0].dataSource': 'asset-1',
      'panels[0].synthetic': AUTHORED_ODDS,
    });

    expect(panelOdds(view, 0)).toEqual(AUTHORED_ODDS);
  });
});
