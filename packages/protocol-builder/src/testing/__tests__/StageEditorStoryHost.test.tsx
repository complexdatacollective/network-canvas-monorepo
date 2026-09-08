import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import StageEditorShell from '../../form/StageEditorShell.tsx';
import ContentBlockEditor from '../../sections/contentBlocks/ContentBlockEditor.tsx';
import ContentBlockPreview from '../../sections/contentBlocks/ContentBlockPreview.tsx';
import { contentBlockSlots } from '../../sections/contentBlocks/contentBlockTypes.ts';
import PageContentSection from '../../sections/PageContentSection.tsx';
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
    // A stage with a long line makes this box scroll sideways, and the end of
    // that line is only reachable by scrolling it. So it has to take focus: a
    // reader who cannot use a pointer has no other way there.
    committed.focus();
    expect(committed).toHaveFocus();
  });

  /** A spectator's chrome says so rather than offering a save that is refused. */
  it('disables the host’s save control for a spectator', () => {
    renderHost('information-1', true);

    expect(screen.getByRole('button', { name: 'Save stage' })).toBeDisabled();
  });
});

/**
 * The two options a family's story needs from the host, and the two nothing
 * else in this package passes yet.
 *
 * Both are spreads into the session the host opens, so a typo in either would
 * be invisible here and would surface in a family PR as a story that renders
 * the wrong thing. `assets` has to reach BOTH the protocol's manifest and the
 * gateway — a stage pointing at an entry only one of them holds is a stage a
 * host would refuse — and `createResourceId` has to reach the gateway, because
 * a fresh uuid on every run would make a story's page differ from itself in
 * every visual comparison.
 */
describe('what a family’s story tells the host', () => {
  const renderPageHost = () =>
    render(
      <StageEditorStoryHost
        stageId="information-1"
        assets={{
          extra_photo: {
            name: 'Extra photo',
            type: 'image',
            source: 'extra.png',
          },
        }}
        createResourceId={() => 'story-resource-1'}
        renderEditor={({ controller, actions }) => (
          <StageEditorShell controller={controller} actions={actions}>
            <StageNameSection />
            <PageContentSection
              ItemEditor={ContentBlockEditor}
              ItemPreview={ContentBlockPreview}
              slots={contentBlockSlots}
            />
          </StageEditorShell>
        )}
      />,
    );

  it('offers an asset the story added, and names a staged file the way the story asked', async () => {
    const user = userEvent.setup();
    renderPageHost();

    await user.click(
      await screen.findByRole('button', { name: 'Create new content block' }),
    );
    await user.click(await screen.findByRole('radio', { name: 'Image' }));

    // The manifest half: the story's own entry is offered beside the
    // fixture's.
    await user.click(
      await screen.findByRole('button', { name: /^(Change the|Select an?) /u }),
    );
    expect(await screen.findByText('Extra photo')).toBeInTheDocument();

    // The gateway half: a file imported here is staged under the id the story
    // named, and that id is what the saved block points at.
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['a picture'], 'skyline.png', { type: 'image/png' }),
    );
    await screen.findAllByText('skyline.png');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Save stage' }));

    await waitFor(() =>
      expect(
        screen.getByRole('region', {
          name: 'What the host was asked to commit',
        }),
      ).toHaveTextContent('"content": "story-resource-1"'),
    );
  });
});
