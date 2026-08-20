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

    fireEvent.click(screen.getByRole('switch', { name: 'Search Options' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('group', {
          name: 'Which attributes should be searchable?',
        }),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch', { name: 'Search Options' }));
    await screen.findByRole('group', {
      name: 'Which attributes should be searchable?',
    });

    expect(
      getFieldState('searchOptions.matchProperties')?.value,
    ).toBeUndefined();
    expect(getFieldState('searchOptions.fuzziness')?.value).toBeUndefined();
  });

  // The guidance opened "The selecting lots of attributes here…" (#1400).
  it('gives the searchable-attributes guidance a grammatical opening', () => {
    renderStageForm({
      committedStage: COMMITTED_STAGE,
      children: <SearchOptionsForExternalData {...STAGE_PROPS} />,
    });

    expect(
      screen.getByText(/^Selecting lots of attributes here may slow/),
    ).toBeInTheDocument();
  });

  /**
   * This section is where the Issues panel's start-cased field paths were most
   * visible: a roster with no searchable attribute selected listed "Search
   * Options Match Properties", which names nothing the researcher can see on
   * the page. The anchor now carries the field's own label (#1400) — including
   * for `fuzziness`, whose label is hidden on screen but is still the name the
   * control announces.
   */
  it('anchors its fields for the Issues panel under their own labels', () => {
    const { container } = renderStageForm({
      committedStage: COMMITTED_STAGE,
      children: <SearchOptionsForExternalData {...STAGE_PROPS} />,
    });

    expect(
      container.querySelector('#field_searchOptions_matchProperties__error'),
    ).toHaveAttribute('data-name', 'Which attributes should be searchable?');
    expect(
      container.querySelector('#field_searchOptions_fuzziness__error'),
    ).toHaveAttribute('data-name', 'Search accuracy');
  });
});
