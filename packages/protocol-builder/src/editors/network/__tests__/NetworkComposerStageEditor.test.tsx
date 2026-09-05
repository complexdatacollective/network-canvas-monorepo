import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import {
  CANVAS_IMAGE_ID,
  canvasImageAssets,
  stageWithImageBackground,
} from '../../../sections/network/__tests__/canvasFixtures.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
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
  it('saves the stage it opened, unchanged', async () => {
    const harness = openFixture();

    await harness.roundTrip({ unowned: [] });
  });

  it('composes its sections in the order the decisions are made', async () => {
    const harness = openFixture();

    await waitFor(() => expect(harness.outline()).toHaveLength(7));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Adding and arranging nodes',
      'Connections',
      'Background',
      'Skip logic',
      'Interviewer guidance',
    ]);
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
      'Building the network',
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
      label: 'Building the network',
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

  it('leaves nothing pending, and nothing imported, when the edit is abandoned', async () => {
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

    expect(harness.pendingCommands()).toEqual([]);
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
