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
});
