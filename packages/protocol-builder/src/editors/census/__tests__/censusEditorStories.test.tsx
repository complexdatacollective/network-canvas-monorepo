import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { StageEditorStoryHost } from '../../../testing/StageEditorStoryHost.tsx';
import categoricalBin, {
  Spectating as categoricalBinSpectating,
} from '../CategoricalBinStageEditor.stories.tsx';
import dyadCensus, {
  Spectating as dyadCensusSpectating,
} from '../DyadCensusStageEditor.stories.tsx';
import oneToManyDyadCensus, {
  Spectating as oneToManyDyadCensusSpectating,
} from '../OneToManyDyadCensusStageEditor.stories.tsx';
import ordinalBin, {
  Spectating as ordinalBinSpectating,
} from '../OrdinalBinStageEditor.stories.tsx';
import tieStrengthCensus, {
  Spectating as tieStrengthCensusSpectating,
} from '../TieStrengthCensusStageEditor.stories.tsx';

/**
 * Every story in the family, as the story files themselves declare it.
 *
 * The arguments are IMPORTED rather than restated, which is the whole point:
 * Storybook builds a story that throws on mount just as happily as one that
 * works, nothing in this package's gates opens the built pages, and a copy of
 * the arguments written here would go on passing after the story beside it had
 * been broken.
 *
 * Each story is the shared `StageEditorStoryHost` with the family's editor in
 * its render prop, so what this mounts is exactly what a reader of the
 * Storybook sees — and the pass below is the `play` those stories run.
 */
const STORIES = [
  {
    name: 'Categorical Bin',
    meta: categoricalBin,
    spectating: categoricalBinSpectating,
  },
  {
    name: 'Ordinal Bin',
    meta: ordinalBin,
    spectating: ordinalBinSpectating,
  },
  {
    name: 'Dyad Census',
    meta: dyadCensus,
    spectating: dyadCensusSpectating,
  },
  {
    name: 'One to Many Dyad Census',
    meta: oneToManyDyadCensus,
    spectating: oneToManyDyadCensusSpectating,
  },
  {
    name: 'Tie-Strength Census',
    meta: tieStrengthCensus,
    spectating: tieStrengthCensusSpectating,
  },
] as const;

describe('the census and bin editor stories', () => {
  /**
   * The standing rule this file holds in place: every editor the family names
   * has a story, opened over the shared all-interfaces protocol. A family that
   * added a sixth editor and no story would leave that editor with no page a
   * researcher or a visual comparison can look at.
   */
  it('has one story per interface the family claims, over the fixture', () => {
    expect(STORIES.map(({ meta }) => meta.args.stageId).toSorted()).toEqual([
      'categorical-bin-1',
      'dyad-census-1',
      'one-to-many-dyad-census-1',
      'ordinal-bin-1',
      'tie-strength-census-1',
    ]);
  });

  it.each(STORIES)(
    'renames and saves the stage the $name story opens',
    async ({ meta }) => {
      render(<StageEditorStoryHost {...meta.args} />);
      const user = userEvent.setup();

      const name = screen.getByRole('textbox', { name: 'Stage name' });
      await user.clear(name);
      await user.type(name, 'Renamed by the researcher');
      await user.click(screen.getByRole('button', { name: 'Save stage' }));

      await waitFor(() =>
        expect(
          screen.getByRole('status', { name: 'Save status' }),
        ).toHaveTextContent('Saved “Renamed by the researcher”.'),
      );
      // The status alone cannot tell a save that committed the rename from one
      // that committed the stage as it was found.
      expect(
        screen.getByRole('region', {
          name: 'What the host was asked to commit',
        }),
      ).toHaveTextContent('"label": "Renamed by the researcher"');
    },
  );

  it.each(STORIES)(
    'opens the $name story read-only for a spectator',
    ({ meta, spectating }) => {
      render(<StageEditorStoryHost {...meta.args} {...spectating.args} />);

      expect(screen.getByRole('button', { name: 'Save stage' })).toBeDisabled();
    },
  );
});
