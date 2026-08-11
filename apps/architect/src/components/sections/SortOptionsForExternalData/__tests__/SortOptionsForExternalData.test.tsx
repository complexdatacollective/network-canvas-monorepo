import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

// Sidesteps `getAssetManifest`'s `state.activeProtocol` read, which the
// stage-form test harness's minimal store (only `stageEditorDraft`) doesn't
// provide — this test exercises the toggle/clear behaviour, not the
// variable-option listing.
vi.mock('~/hooks/useVariablesFromExternalData', () => ({
  default: () => ({
    variables: [{ value: 'name', label: 'Name' }],
    isVariablesLoading: false,
    variablesError: null,
  }),
}));

import SortOptionsForExternalData from '../SortOptionsForExternalData';

const STAGE_PROPS = {
  stagePath: null,
  stagePosition: 0,
  interfaceType: 'NameGeneratorRoster' as const,
};

const COMMITTED_STAGE = asStage({
  dataSource: 'asset-1',
  sortOptions: {
    sortOrder: [{ property: 'name', direction: 'asc' }],
    sortableProperties: [{ variable: 'name', label: 'Name' }],
  },
});

describe('SortOptionsForExternalData', () => {
  it('starts expanded and hydrates both leaf fields from the committed stage', () => {
    const { getFieldState } = renderStageForm({
      committedStage: COMMITTED_STAGE,
      children: <SortOptionsForExternalData {...STAGE_PROPS} />,
    });

    expect(getFieldState('sortOptions.sortOrder')?.value).toEqual([
      { property: 'name', direction: 'asc' },
    ]);
    expect(getFieldState('sortOptions.sortableProperties')?.value).toEqual([
      { variable: 'name', label: 'Name' },
    ]);
  });

  it('does not resurrect sortOrder/sortableProperties when reopened after a clear', async () => {
    const { getFieldState } = renderStageForm({
      committedStage: COMMITTED_STAGE,
      children: <SortOptionsForExternalData {...STAGE_PROPS} />,
    });

    fireEvent.click(screen.getByTitle('Turn this feature on or off'));
    await waitFor(() => {
      expect(getFieldState('sortOptions.sortOrder')?.value).toBeUndefined();
    });
    expect(
      getFieldState('sortOptions.sortableProperties')?.value,
    ).toBeUndefined();

    fireEvent.click(screen.getByTitle('Turn this feature on or off'));
    await waitFor(() => {
      expect(getFieldState('sortOptions.sortOrder')).not.toBeUndefined();
    });

    expect(getFieldState('sortOptions.sortOrder')?.value).toBeUndefined();
    expect(
      getFieldState('sortOptions.sortableProperties')?.value,
    ).toBeUndefined();
  });
});
