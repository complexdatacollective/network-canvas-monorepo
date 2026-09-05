import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CategoricalBinStageEditor } from '../CategoricalBinStageEditor.tsx';
import {
  type CensusEditorComponent,
  CensusEditorStoryHost,
} from '../censusEditorStoryHost.tsx';
import { DyadCensusStageEditor } from '../DyadCensusStageEditor.tsx';
import { OneToManyDyadCensusStageEditor } from '../OneToManyDyadCensusStageEditor.tsx';
import { OrdinalBinStageEditor } from '../OrdinalBinStageEditor.tsx';
import { TieStrengthCensusStageEditor } from '../TieStrengthCensusStageEditor.tsx';

/**
 * Every story in the family, as its arguments.
 *
 * The stories themselves are the same host with the same two arguments, and
 * their `play` is the pass below — so this is what proves each of them still
 * runs. Storybook builds a story that throws on mount just as happily as one
 * that works, and nothing in this package's gates opens the built pages.
 */
const STORIES: readonly (readonly [string, CensusEditorComponent])[] = [
  ['categorical-bin-1', CategoricalBinStageEditor],
  ['ordinal-bin-1', OrdinalBinStageEditor],
  ['dyad-census-1', DyadCensusStageEditor],
  ['one-to-many-dyad-census-1', OneToManyDyadCensusStageEditor],
  ['tie-strength-census-1', TieStrengthCensusStageEditor],
];

describe('the census editors in a host of their own', () => {
  it.each(STORIES)(
    'renames and saves the %s stage the story opens',
    async (stageId, editor) => {
      render(<CensusEditorStoryHost stageId={stageId} editor={editor} />);
      const user = userEvent.setup();

      const name = screen.getByRole('textbox', { name: 'Stage name' });
      await user.clear(name);
      await user.type(name, 'Renamed by the researcher');
      await user.click(screen.getByRole('button', { name: 'Save stage' }));

      await waitFor(() =>
        expect(
          screen.getByRole('status', { name: 'Save status' }),
        ).toHaveTextContent('Renamed by the researcher'),
      );
    },
  );

  it.each(STORIES)(
    'opens the %s stage read-only for a spectator',
    (stageId, editor) => {
      render(
        <CensusEditorStoryHost stageId={stageId} editor={editor} readOnly />,
      );

      expect(screen.getByRole('button', { name: 'Save stage' })).toBeDisabled();
    },
  );
});
