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
    ['a null filter', null, false],
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
    expect(stripEdgeRules({ join: 'AND', rules: [edgeRule] })).toBeNull();
  });

  it('leaves a filter with no edge rules unchanged', () => {
    expect(stripEdgeRules({ join: 'AND', rules: [alterRule] })).toEqual({
      join: 'AND',
      rules: [alterRule],
    });
  });

  it('handles a null filter', () => {
    expect(stripEdgeRules(null)).toBeNull();
  });
});

const EDGE_FILTER = { join: 'AND', rules: [alterRule, edgeRule] };

const itemProps: ArrayFieldItemProps<NodePanelValue> = {
  item: {},
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

const setDataSource = (view: ReturnType<typeof renderPanel>, value: string) => {
  act(() => {
    view
      .getContext()
      .storeApi.getState()
      .setFieldValue('panels[0].dataSource', value);
  });
};

/**
 * Stands in for `useStageDraftHistory`, whose `applyDiff` writes every field
 * named in the timeline snapshot inside a single `runRestore`.
 */
const restore = (
  view: ReturnType<typeof renderPanel>,
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
