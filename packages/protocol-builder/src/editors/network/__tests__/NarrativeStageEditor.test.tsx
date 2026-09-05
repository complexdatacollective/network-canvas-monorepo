import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import {
  CANVAS_IMAGE_ID,
  canvasImageAssets,
  stageWithImageBackground,
} from '../../../sections/network/__tests__/canvasFixtures.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  expectOpenedAsANewStage,
  NEW_STAGE_POSITION,
} from '../../__tests__/creationSignal.ts';
import { NarrativeStageEditor } from '../NarrativeStageEditor.tsx';
import {
  deleteNodeVariable,
  expectAttributedTo,
  removeAsset,
} from './collaboratorChanges.ts';
import { harnessEditor } from './editorFixtures.tsx';

const narrativeEditor = harnessEditor(NarrativeStageEditor, 'Narrative');

const openFixture = () =>
  renderStageEditor({ stageId: 'narrative-1', editor: narrativeEditor });

const openWithImageBackground = () =>
  renderStageEditor({
    stage: stageWithImageBackground('narrative-1'),
    editor: narrativeEditor,
    assets: canvasImageAssets,
  });

/** A stage of this interface as the package's own template creates one. */
const openNewStage = () =>
  renderStageEditor({
    stage: {
      id: 'narrative-new',
      type: 'Narrative',
      fields: getInterfaceTemplate('Narrative'),
    },
    editor: narrativeEditor,
  });

describe('the narrative stage editor', () => {
  /**
   * A stage the host is CREATING, opened the way a host opens one: from this
   * interface's own template, not yet in the interview, and carrying the
   * position it is about to be inserted at. Everything an editor does
   * differently for a new stage follows from that one signal, which the
   * shared sections read from the editor's context rather than from a prop.
   */
  it('opens a stage being created on the creation the session carries', async () => {
    renderStageEditor({
      create: { type: 'Narrative', position: NEW_STAGE_POSITION },
      editor: narrativeEditor,
    });

    await expectOpenedAsANewStage('Narrative');
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = openFixture();

    // Nothing is excused: every key the fixture's narrative stage holds has a
    // section on this page that edits it.
    await harness.roundTrip({ unowned: [] });
  });

  it('composes its sections in the order the decisions are made', async () => {
    const harness = openFixture();

    await waitFor(() => expect(harness.outline()).toHaveLength(9));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Stage filter',
      'Visualisation presets',
      'Background',
      'Node layout',
      'Canvas interaction',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  /**
   * A new stage arrives holding only what the interface's template gives it.
   * What it still needs is the interface's own minimum: a name, the type it
   * draws, one way of looking at the network, and something behind the nodes.
   */
  it('saves a new stage once it has been given the minimum it needs', async () => {
    const harness = openNewStage();

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Telling the story',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new preset' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Preset name' }),
      'Everyone',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Position attribute' }),
      'layout',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await harness.user.type(
      screen.getByRole('spinbutton', {
        name: 'Number of concentric circles',
      }),
      '4',
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      label: 'Telling the story',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4 },
      // The template's own defaults survive the first save rather than being
      // dropped by a section that renders only part of `behaviours`.
      behaviours: { allowRepositioning: true, automaticLayout: true },
    });
  });

  /**
   * The refusal has to be attributable: a researcher looking at the outline
   * has to be told which section is holding the save up, not only that
   * something is.
   */
  it('refuses a stage that shows the participant nothing, and says where', async () => {
    const harness = openFixture();

    await harness.user.click(
      screen.getByRole('button', { name: 'Remove preset' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove preset' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Default layout')).not.toBeInTheDocument(),
    );

    expect(await harness.submit()).toBeNull();
    // The outline blames exactly the section that refused, and nothing else:
    // "something is wrong somewhere" is not an account a researcher can act on.
    expect(
      harness
        .outline()
        .filter((section) => section.state === 'Has a problem')
        .map((section) => section.title),
    ).toEqual(['Visualisation presets']);
    expect(
      await screen.findByText(/Create at least one preset/),
    ).toBeInTheDocument();
  });

  it('leaves nothing pending, and nothing imported, when the edit is abandoned', async () => {
    const harness = openFixture();

    await harness.user.click(
      screen.getByRole('switch', { name: 'Allow drawing on the canvas' }),
    );
    await harness.user.click(
      await screen.findByRole('option', { name: /Image/ }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await harness.user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );
    await waitFor(() =>
      expect(harness.session.getSnapshot().stagedResources).not.toHaveLength(0),
    );

    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
    expect(harness.session.getSnapshot().stagedResources).toEqual([]);
    expect(harness.gateway.getStagingResidue()).toEqual([]);
  });

  /**
   * A collaborator deleting the attribute every preset positions its nodes
   * with is THEIR change. The editor has to follow it and report the problem
   * it creates, without issuing a command of its own: echoing it back would
   * write their change into this stage's pending batches and save it as ours.
   */
  it('reports the deletion of the attribute its presets position by, and who made it', async () => {
    const harness = openFixture();
    const dispatch = vi.spyOn(harness.session, 'dispatch');
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('valid'),
    );

    deleteNodeVariable(harness, 'person', 'layout');

    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );
    expectAttributedTo(harness, 'layoutVariable');
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('reports a background image a collaborator removed, and who removed it', async () => {
    const harness = openWithImageBackground();
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('valid'),
    );

    removeAsset(harness, CANVAS_IMAGE_ID);

    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );
    expectAttributedTo(harness, 'image');
    // The removal is theirs, so it leaves nothing of ours outstanding.
    expect(harness.pendingCommands()).toEqual([]);
    expect(await harness.submit()).toBeNull();
  });

  it('refuses to save while somebody else holds the stage', async () => {
    const harness = openFixture();
    harness.setReadOnly();

    expect(
      screen.getByRole('switch', { name: 'Allow drawing on the canvas' }),
    ).toBeDisabled();
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(/read-only/, { exact: false }),
    ).toBeInTheDocument();
    expect(harness.pendingCommands()).toEqual([]);
  });
});
