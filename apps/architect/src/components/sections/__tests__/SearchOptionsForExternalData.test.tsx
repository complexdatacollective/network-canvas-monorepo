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

import SearchOptionsForExternalData from '../SearchOptionsForExternalData';

const STAGE_PROPS = {
  stagePath: null,
  stagePosition: 0,
  interfaceType: 'NameGeneratorRoster' as const,
};

const COMMITTED_STAGE = asStage({
  dataSource: 'asset-1',
  searchOptions: { matchProperties: ['name'], fuzziness: 0.5 },
});

describe('SearchOptionsForExternalData', () => {
  it('starts expanded and hydrates both leaf fields from the committed stage', () => {
    const { getFieldState } = renderStageForm({
      committedStage: COMMITTED_STAGE,
      children: <SearchOptionsForExternalData {...STAGE_PROPS} />,
    });

    expect(
      screen.getByRole('group', {
        name: 'Which attributes should be searchable?',
      }),
    ).toBeInTheDocument();
    expect(getFieldState('searchOptions.matchProperties')?.value).toEqual([
      'name',
    ]);
    expect(getFieldState('searchOptions.fuzziness')?.value).toBe(0.5);
  });

  it('does not resurrect matchProperties/fuzziness when reopened after a clear', async () => {
    const { getFieldState } = renderStageForm({
      committedStage: COMMITTED_STAGE,
      children: <SearchOptionsForExternalData {...STAGE_PROPS} />,
    });

    fireEvent.click(screen.getByTitle('Turn this feature on or off'));
    await waitFor(() => {
      expect(
        screen.queryByRole('group', {
          name: 'Which attributes should be searchable?',
        }),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Turn this feature on or off'));
    await screen.findByRole('group', {
      name: 'Which attributes should be searchable?',
    });

    expect(
      getFieldState('searchOptions.matchProperties')?.value,
    ).toBeUndefined();
    expect(getFieldState('searchOptions.fuzziness')?.value).toBeUndefined();
  });
});
