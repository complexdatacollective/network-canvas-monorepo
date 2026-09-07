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
  expectStatesItsPosition,
  NEW_STAGE_POSITION,
} from '../../__tests__/creationSignal.ts';
import { NetworkComposerStageEditor } from '../NetworkComposerStageEditor.tsx';
import {
  deleteNodeVariable,
  expectAttributedTo,
  removeAsset,
} from './collaboratorChanges.ts';
import { harnessEditor } from './editorFixtures.tsx';

const networkComposerEditor = harnessEditor(
  NetworkComposerStageEditor,
  'NetworkComposer',
);

const openFixture = () =>
  renderStageEditor({
    stageId: 'network-composer-1',
    editor: networkComposerEditor,
  });

const openWithImageBackground = () =>
  renderStageEditor({
    stage: stageWithImageBackground('network-composer-1'),
    editor: networkComposerEditor,
    assets: canvasImageAssets,
  });

const openNewStage = () =>
  renderStageEditor({
    stage: {
      id: 'network-composer-new',
      type: 'NetworkComposer',
      fields: getInterfaceTemplate('NetworkComposer'),
    },
    editor: networkComposerEditor,
  });

describe('the network composer stage editor', () => {
  /**
   * A stage the host is CREATING, opened the way a host opens one: from this
   * interface's own template, not yet in the interview, and carrying the
   * position it is about to be inserted at. Everything an editor does
   * differently for a new stage follows from that one signal, which the
   * shared sections read from the editor's context rather than from a prop.
   */
  it('opens a stage being created on the creation the session carries', async () => {
    renderStageEditor({
      create: { type: 'NetworkComposer', position: NEW_STAGE_POSITION },
      editor: networkComposerEditor,
    });

    await expectOpenedAsANewStage('Network Composer');
  });

  /**
   * And the other way round: a stage the interview already holds says where in
   * it the researcher is. Asked here rather than only in the dispatch suite
   * because this editor composes the shared heading itself, so dropping it
   * would leave every other test in this file passing.
   */
  it('says where the stage sits in the interview', () => {
    openFixture();

    expectStatesItsPosition('network-composer-1');
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = openFixture();

    await harness.roundTrip({ unowned: [] });
  });

  it('composes its sections in the order the decisions are made', async () => {
    const harness = openFixture();

    await waitFor(() => expect(harness.outline()).toHaveLength(8));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Adding and arranging nodes',
      'Node attributes',
      'Connections',
      'Background',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  /**
   * A new stage arrives holding what the interface's template gives it, and
   * nothing else — here, the automatic layout the composer was designed
   * around. Split from the save below so neither claim can hide the other: a
   * template that arrived empty would still let a filled-in stage save.
   */
  it('opens a new stage on the layout mode its template ships', () => {
    openNewStage();

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue('');
    expect(
      screen.getByRole('switch', {
        name: 'Start with automatic layout switched on',
      }),
    ).toBeChecked();
  });

  /**
   * A composer's own minimum: a name, the type the participant builds with,
   * somewhere to put what they type when they add one, somewhere to remember
   * where they put it, and something behind the canvas.
   */
  it('saves a new stage once it has been given the minimum it needs', async () => {
    const harness = openNewStage();

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Build',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.selectOptions(
      await screen.findByRole('combobox', {
        name: 'Attribute filled in when a node is added',
      }),
      'composerName',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Position attribute' }),
      'layout',
    );
    await harness.user.type(
      screen.getByRole('spinbutton', {
        name: 'Number of concentric circles',
      }),
      '2',
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      label: 'Build',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'composerName',
      layoutVariable: 'layout',
      background: { concentricCircles: 2 },
      behaviours: { automaticLayout: true },
    });
  });

  it('refuses a stage with nowhere to remember node positions, and says where', async () => {
    const harness = openFixture();

    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Position attribute' }),
      '',
    );

    expect(await harness.submit()).toBeNull();
    expect(
      harness
        .outline()
        .filter((section) => section.state === 'Has a problem')
        .map((section) => section.title),
    ).toEqual(['Adding and arranging nodes']);
  });

  /**
   * The import is held outside the protocol until the stage is finished, so a
   * cancel has to leave the host holding none of it.
   *
   * The circles the image replaced are a different matter: leaving them behind
   * is an edit the researcher made with no staged resource behind it, so it
   * reached the host when it happened and the cancel has no claim on it. A
   * cancel drops what was WITHHELD; it is not an undo of the session.
   */
  it('leaves nothing imported, and nothing pending but the background switch, when the edit is abandoned', async () => {
    const harness = openFixture();

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'knows' }),
    );
    await harness.user.click(
      await screen.findByRole('option', { name: /Image/ }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await harness.user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'floorplan.png', { type: 'image/png' }),
    );
    await waitFor(() =>
      expect(harness.session.getSnapshot().stagedResources).not.toHaveLength(0),
    );

    await harness.cancel();

    expect(
      harness.pendingCommands().flatMap((batch) => [...batch.commands]),
    ).toEqual([{ op: 'unset', key: 'background' }]);
    expect(harness.session.getSnapshot().stagedResources).toEqual([]);
    expect(harness.gateway.getStagingResidue()).toEqual([]);
  });

  /**
   * The stage stores every node's position in one codebook attribute. A
   * collaborator deleting it leaves the stage unable to remember anything the
   * participant does, and the editor has to say so — and say whose change it
   * was — without writing anything back.
   */
  it('reports the deletion of its position attribute, and who made it', async () => {
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
    // The attribute stops being offered too, so the researcher is not invited
    // to keep choosing something the protocol no longer has.
    await waitFor(() =>
      expect(
        screen.queryByRole('option', { name: 'layout' }),
      ).not.toBeInTheDocument(),
    );
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
      screen.getByRole('switch', {
        name: 'Start with automatic layout switched on',
      }),
    ).toBeDisabled();
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(/read-only/, { exact: false }),
    ).toBeInTheDocument();
    expect(harness.pendingCommands()).toEqual([]);
  });
});
