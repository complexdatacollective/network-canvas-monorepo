import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import ArchitectField from '~/components/Form/ArchitectField';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

vi.mock('~/components/Form/Fields/DataSource', () => ({
  default: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <input
      aria-label="Roster data source"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

import ExternalDataSource from '../ExternalDataSource';

// Minimal registered fields standing in for the actual leaf fields
// CardDisplayOptions/SortOptionsForExternalData/SearchOptionsForExternalData
// register (`cardOptions`/`sortOptions`/`searchOptions` themselves are never
// registered as fields) — this test mounts those exact leaf paths so
// `setFieldValue` writes into `fields` directly instead of parking an
// unregistered write in `dormantValues`.
const ValueProbe = (({ value }: { value?: unknown }) => (
  <span data-testid="value">{JSON.stringify(value)}</span>
)) as ComponentType<Record<string, unknown>>;

const DependentFields = () => (
  <>
    <ArchitectField
      name="cardOptions.additionalProperties"
      label="cardOptions.additionalProperties"
      component={ValueProbe}
      initialValue={[{ variable: 'x' }]}
    />
    <ArchitectField
      name="sortOptions.sortOrder"
      label="sortOptions.sortOrder"
      component={ValueProbe}
      initialValue={[{ property: 'x', direction: 'asc' }]}
    />
    <ArchitectField
      name="sortOptions.sortableProperties"
      label="sortOptions.sortableProperties"
      component={ValueProbe}
      initialValue={[{ variable: 'x' }]}
    />
    <ArchitectField
      name="searchOptions.matchProperties"
      label="searchOptions.matchProperties"
      component={ValueProbe}
      initialValue={['x']}
    />
    <ArchitectField
      name="searchOptions.fuzziness"
      label="searchOptions.fuzziness"
      component={ValueProbe}
      initialValue={0.5}
    />
  </>
);

const DEPENDENT_LEAF_PATHS = [
  'cardOptions.additionalProperties',
  'sortOptions.sortOrder',
  'sortOptions.sortableProperties',
  'searchOptions.matchProperties',
  'searchOptions.fuzziness',
];

const STAGE_PROPS = {
  stagePath: 'stages[0]',
  stagePosition: 0,
  interfaceType: 'NameGeneratorRoster' as const,
};

describe('ExternalDataSource', () => {
  it('does not reset dependent sections when an existing stage is simply loaded', () => {
    const { getFieldState } = renderStageForm({
      // `subject.type` set so `withDisabledSubjectRequired` leaves the
      // section enabled (it hides its fields entirely while disabled).
      committedStage: asStage({
        dataSource: 'asset-1',
        subject: { entity: 'node', type: 'person' },
      }),
      children: (
        <>
          <ExternalDataSource {...STAGE_PROPS} />
          <DependentFields />
        </>
      ),
    });

    for (const path of DEPENDENT_LEAF_PATHS) {
      expect(getFieldState(path)?.value).not.toBeUndefined();
    }
  });

  it('resets every dependent leaf field when the data source changes', async () => {
    const { getFieldState } = renderStageForm({
      // `subject.type` set so `withDisabledSubjectRequired` leaves the
      // section enabled (it hides its fields entirely while disabled).
      committedStage: asStage({
        dataSource: 'asset-1',
        subject: { entity: 'node', type: 'person' },
      }),
      children: (
        <>
          <ExternalDataSource {...STAGE_PROPS} />
          <DependentFields />
        </>
      ),
    });

    fireEvent.change(screen.getByLabelText('Roster data source'), {
      target: { value: 'asset-2' },
    });

    await waitFor(() => {
      expect(
        getFieldState('cardOptions.additionalProperties')?.value,
      ).toBeUndefined();
    });
    for (const path of DEPENDENT_LEAF_PATHS) {
      expect(getFieldState(path)?.value).toBeUndefined();
    }
  });

  describe('undo', () => {
    const renderRoster = () =>
      renderStageForm({
        committedStage: asStage({
          dataSource: 'asset-1',
          subject: { entity: 'node', type: 'person' },
        }),
        children: (
          <>
            <ExternalDataSource {...STAGE_PROPS} />
            <DependentFields />
          </>
        ),
      });

    const changeDataSource = (value: string) => {
      fireEvent.change(screen.getByLabelText('Roster data source'), {
        target: { value },
      });
    };

    /**
     * Stands in for `useStageDraftHistory`, whose `applyDiff` writes every
     * field named in the timeline snapshot inside a single `runRestore`.
     */
    const restore = (
      context: ReturnType<ReturnType<typeof renderRoster>['getContext']>,
      values: Record<string, unknown>,
    ) => {
      act(() => {
        context.draft.runRestore(() => {
          const { setFieldValue } = context.storeApi.getState();
          for (const [name, value] of Object.entries(values)) {
            setFieldValue(name, value as never);
          }
        });
      });
    };

    const ASSET_1_CONFIG = {
      'dataSource': 'asset-1',
      'cardOptions.additionalProperties': [{ variable: 'x' }],
      'sortOptions.sortOrder': [{ property: 'x', direction: 'asc' }],
      'sortOptions.sortableProperties': [{ variable: 'x' }],
      'searchOptions.matchProperties': ['x'],
      'searchOptions.fuzziness': 0.5,
    };

    it('keeps the configuration an undo restored alongside the data source', async () => {
      const { getFieldState, getContext } = renderRoster();

      changeDataSource('asset-2');
      await waitFor(() => {
        expect(getFieldState('searchOptions.fuzziness')?.value).toBeUndefined();
      });

      restore(getContext(), ASSET_1_CONFIG);

      expect(getFieldState('dataSource')?.value).toBe('asset-1');
      // The restore brought asset-1's configuration back with it; observing
      // the restored data source as "a change" must not clear it again.
      expect(getFieldState('searchOptions.fuzziness')?.value).toBe(0.5);
      expect(getFieldState('searchOptions.matchProperties')?.value).toEqual([
        'x',
      ]);
      expect(getFieldState('cardOptions.additionalProperties')?.value).toEqual([
        { variable: 'x' },
      ]);
    });

    it('still resets dependents on a user edit that follows a restore', async () => {
      const { getFieldState, getContext } = renderRoster();

      changeDataSource('asset-2');
      await waitFor(() => {
        expect(getFieldState('searchOptions.fuzziness')?.value).toBeUndefined();
      });

      restore(getContext(), ASSET_1_CONFIG);
      changeDataSource('asset-3');

      await waitFor(() => {
        expect(getFieldState('searchOptions.fuzziness')?.value).toBeUndefined();
      });
      for (const path of DEPENDENT_LEAF_PATHS) {
        expect(getFieldState(path)?.value).toBeUndefined();
      }
    });

    it('still resets dependents on a user edit after a restore that left the data source alone', async () => {
      const { getFieldState, getContext } = renderRoster();

      // A restore of some other field bumps the same counter, so the guard has
      // to be consumed even when `dataSource` did not move.
      restore(getContext(), { 'searchOptions.fuzziness': 0.9 });
      changeDataSource('asset-2');

      await waitFor(() => {
        expect(getFieldState('searchOptions.fuzziness')?.value).toBeUndefined();
      });
    });
  });

  // Four of the five dependent leaves are ARRAY-valued, and an array write
  // snapshots immediately, so an unbatched clear loop pushed one timeline
  // entry per clear — each one the new roster carrying some of the OLD
  // roster's attribute references. Those are saveable and reference columns
  // no validation layer can see, so they must never be reachable by undo.
  describe('timeline', () => {
    const ASSET_1_VALUES = {
      dataSource: 'asset-1',
      cardOptions: { additionalProperties: [{ variable: 'x' }] },
      sortOptions: {
        sortOrder: [{ property: 'x', direction: 'asc' }],
        sortableProperties: [{ variable: 'x' }],
      },
      searchOptions: { matchProperties: ['x'], fuzziness: 0.5 },
    };

    const renderRoster = () =>
      renderStageForm({
        committedStage: asStage({
          dataSource: 'asset-1',
          subject: { entity: 'node', type: 'person' },
        }),
        children: (
          <>
            <ExternalDataSource {...STAGE_PROPS} />
            <DependentFields />
          </>
        ),
      });

    const changeDataSource = (value: string) => {
      fireEvent.change(screen.getByLabelText('Roster data source'), {
        target: { value },
      });
    };

    it('records the roster switch and every dependent clear as one entry', async () => {
      const { snapshots, getFieldState, getPresent } = renderRoster();

      changeDataSource('asset-2');
      await waitFor(() => {
        expect(
          getFieldState('cardOptions.additionalProperties')?.value,
        ).toBeUndefined();
      });
      // Past the leaf debounce, so a trailing debounced entry would show up.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 450));
      });

      expect(snapshots).toHaveLength(1);
      // The cleared leaves still assemble their containers, with no value
      // inside — the new roster and nothing of the old one.
      expect(getPresent()).toEqual({
        dataSource: 'asset-2',
        cardOptions: {},
        sortOptions: {},
        searchOptions: {},
      });
    });

    it('takes the whole roster switch back in one undo, and redoes it whole', async () => {
      const { snapshots, getFieldState, getHistory, store } = renderRoster();

      changeDataSource('asset-2');
      await waitFor(() => {
        expect(
          getFieldState('cardOptions.additionalProperties')?.value,
        ).toBeUndefined();
      });

      act(() => {
        getHistory().undo();
      });

      // No half-reset stop in between: one press is the whole gesture.
      expect(getFieldState('dataSource')?.value).toBe('asset-1');
      for (const path of DEPENDENT_LEAF_PATHS) {
        expect(getFieldState(path)?.value).not.toBeUndefined();
      }
      expect(store.getState().stageEditorDraft.history.past).toHaveLength(0);
      expect(getHistory().canUndo).toBe(false);

      act(() => {
        getHistory().redo();
      });

      expect(getFieldState('dataSource')?.value).toBe('asset-2');
      for (const path of DEPENDENT_LEAF_PATHS) {
        expect(getFieldState(path)?.value).toBeUndefined();
      }
      // The restore must not have branched the timeline, and the undo/redo
      // round trip must not have added an entry of its own.
      expect(snapshots).toHaveLength(1);
      expect(store.getState().stageEditorDraft.history.future).toHaveLength(0);
      expect(getHistory().canUndo).toBe(true);
    });

    it('leaves the pre-gesture roster configuration reachable in one step', async () => {
      const { getHistory, store } = renderRoster();

      changeDataSource('asset-2');
      await waitFor(() =>
        expect(store.getState().stageEditorDraft.history.past).toHaveLength(1),
      );

      // The only stop behind the switch is the untouched asset-1 stage.
      expect(store.getState().stageEditorDraft.history.past[0]).toEqual(
        ASSET_1_VALUES,
      );
      expect(getHistory().canUndo).toBe(true);
    });
  });
});
