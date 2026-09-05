import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import StageEditorShell from '../../form/StageEditorShell.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import { STAGE_TYPES } from '../../stage-types.ts';
import { fixtureStageIds, loadFixtureStage } from '../protocolFixture.ts';
import { StageEditorStoryHost } from '../StageEditorStoryHost.tsx';

/**
 * The smallest editor there is: the shell, and one shared section inside it.
 *
 * What is under test here is the HOST — that it can open every interface the
 * fixture holds — so the editor it mounts has to be one that works for all of
 * them, and has to be small enough that a failure is the host's.
 */
const renderHost = (stageId: string, readOnly = false) =>
  render(
    <StageEditorStoryHost
      stageId={stageId}
      readOnly={readOnly}
      renderEditor={({ controller, actions }) => (
        <StageEditorShell controller={controller} actions={actions}>
          <StageNameSection />
        </StageEditorShell>
      )}
    />,
  );

describe('the host every stage editor’s stories run in', () => {
  /**
   * Without this, the sweep below would be a sweep over whichever interfaces
   * somebody remembered to put in the fixture, and an interface added to the
   * schema with no fixture stage would be covered by nothing while every test
   * here went on passing.
   */
  it('opens a protocol with a stage of every interface in it', () => {
    const types = fixtureStageIds().map(
      (stageId) => loadFixtureStage(stageId).type,
    );

    expect([...new Set(types)].toSorted()).toEqual([...STAGE_TYPES].toSorted());
  });

  it.each(fixtureStageIds())('mounts an editor over %s', (stageId) => {
    renderHost(stageId);

    expect(
      screen.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');
    expect(
      screen.getByRole('textbox', { name: 'Stage name' }),
    ).toBeInTheDocument();
  });

  /**
   * The report a play function reads. An editor that saved and one that
   * quietly did nothing look identical on screen otherwise.
   */
  it('names the stage a save committed, and prints what was committed', async () => {
    const user = userEvent.setup();
    renderHost('information-1');

    const name = screen.getByRole('textbox', { name: 'Stage name' });
    await user.clear(name);
    await user.type(name, 'Renamed by the researcher');
    await user.click(screen.getByRole('button', { name: 'Save stage' }));

    await waitFor(() =>
      expect(
        screen.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Renamed by the researcher”.'),
    );
    const committed = screen.getByRole('region', {
      name: 'What the host was asked to commit',
    });
    expect(committed).toHaveTextContent('"label": "Renamed by the researcher"');
  });

  /** A spectator's chrome says so rather than offering a save that is refused. */
  it('disables the host’s save control for a spectator', () => {
    renderHost('information-1', true);

    expect(screen.getByRole('button', { name: 'Save stage' })).toBeDisabled();
  });
});
