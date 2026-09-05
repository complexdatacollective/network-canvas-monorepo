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
    codebookControls: ['Create a new attribute'],
  },
  {
    name: 'Ordinal Bin',
    meta: ordinalBin,
    spectating: ordinalBinSpectating,
    codebookControls: ['Create a new attribute'],
  },
  {
    name: 'Dyad Census',
    meta: dyadCensus,
    spectating: dyadCensusSpectating,
    codebookControls: ['Create a new connection type'],
  },
  {
    name: 'One to Many Dyad Census',
    meta: oneToManyDyadCensus,
    spectating: oneToManyDyadCensusSpectating,
    codebookControls: ['Create a new connection type'],
  },
  {
    name: 'Tie-Strength Census',
    meta: tieStrengthCensus,
    spectating: tieStrengthCensusSpectating,
    // Both, because the scale hangs off the connection this prompt creates.
    codebookControls: [
      'Create a new connection type',
      'Create a new attribute',
    ],
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

  /**
   * The controls in each prompt that write to the CODEBOOK rather than to the
   * stage, reachable in the story an author opens.
   *
   * This is the half that makes the spectator assertion below mean anything:
   * these labels are the ones that must be missing there, and a label that had
   * been renamed or a control that had been dropped would go on being missing
   * for a spectator forever.
   */
  it.each(STORIES)(
    'reaches the codebook controls in a $name prompt as an author',
    async ({ meta, codebookControls }) => {
      render(<StageEditorStoryHost {...meta.args} />);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'Edit prompt' }));
      await screen.findByRole('dialog');

      for (const name of codebookControls) {
        expect(await screen.findByRole('button', { name })).toBeInTheDocument();
      }
    },
  );

  /**
   * A spectator can read the stage and change nothing — including the
   * codebook, which is a different protocol section and would otherwise be
   * reachable from inside a prompt while the stage itself stayed untouched.
   *
   * A disabled Save alone does not say that: every control that writes the
   * codebook does so through a compound edit of its own, which no stage save
   * is involved in. So both halves are asserted — the controls that lead into
   * a prompt are inert, and the codebook controls a prompt would have held are
   * nowhere on the page.
   */
  it.each(STORIES)(
    'offers a spectator of the $name story nothing that writes',
    ({ meta, spectating, codebookControls }) => {
      render(<StageEditorStoryHost {...meta.args} {...spectating.args} />);

      expect(screen.getByRole('button', { name: 'Save stage' })).toBeDisabled();
      for (const name of [
        'Create new prompt',
        'Edit prompt',
        'Remove prompt',
      ]) {
        expect(screen.getByRole('button', { name })).toBeDisabled();
      }
      for (const name of codebookControls) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
    },
  );
});
