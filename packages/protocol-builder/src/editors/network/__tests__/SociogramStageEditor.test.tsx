import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import {
  CANVAS_IMAGE_ID,
  canvasImageAssets,
  stageWithImageBackground,
} from '../../../sections/network/__tests__/canvasFixtures.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { shimMarkdownEditorMeasurement } from '../../pedigree/__tests__/editorFixtures.tsx';
import { SociogramStageEditor } from '../SociogramStageEditor.tsx';
import {
  deleteNodeVariable,
  expectAttributedTo,
  removeAsset,
} from './collaboratorChanges.ts';
import { harnessEditor } from './editorFixtures.tsx';

// A sociogram writes its prompts in the package's markdown editor, which
// measures the document as it is typed into. See the shim's own note.
shimMarkdownEditorMeasurement();

const sociogramEditor = harnessEditor(SociogramStageEditor, 'Sociogram');

const openFixture = () =>
  renderStageEditor({ stageId: 'sociogram-1', editor: sociogramEditor });

const openWithImageBackground = () =>
  renderStageEditor({
    stage: stageWithImageBackground('sociogram-1'),
    editor: sociogramEditor,
    assets: canvasImageAssets,
  });

const openNewStage = () =>
  renderStageEditor({
    stage: {
      id: 'sociogram-new',
      type: 'Sociogram',
      fields: getInterfaceTemplate('Sociogram'),
    },
    editor: sociogramEditor,
  });

describe('the sociogram stage editor', () => {
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
      'Stage filter',
      'Prompts',
      'Background',
      'Node layout',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  /**
   * A sociogram's own minimum: a name, the type it arranges, one task for the
   * participant to do, and something behind the nodes while they do it.
   */
  it('saves a new stage once it has been given the minimum it needs', async () => {
    const harness = openNewStage();

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Placing people',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Place the people you see most often nearest to you',
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
      '3',
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      label: 'Placing people',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 3 },
    });
    const prompts = request?.stageDocument.prompts;
    expect(Array.isArray(prompts) ? prompts : []).toHaveLength(1);
  });

  it('refuses a stage that asks the participant nothing, and says where', async () => {
    const harness = openFixture();

    // Removing a row asks first, and the confirmation's own button carries the
    // same name; the list behind it is inert while the question is open, so
    // only the confirmation is reachable.
    for (const _ of [0, 1]) {
      await harness.user.click(
        screen.getAllByRole('button', {
          name: 'Remove prompt',
        })[0] as HTMLElement,
      );
      await harness.user.click(
        await screen.findByRole('button', { name: 'Remove prompt' }),
      );
    }
    await waitFor(() =>
      expect(
        screen.queryByText('Highlight the people you feel closest to'),
      ).not.toBeInTheDocument(),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      harness
        .outline()
        .filter((section) => section.state === 'Has a problem')
        .map((section) => section.title),
    ).toEqual(['Prompts']);
  });

  it('leaves nothing pending, and nothing imported, when the edit is abandoned', async () => {
    const harness = openFixture();

    await harness.user.click(
      await screen.findByRole('option', { name: /Manual mode/ }),
    );
    await harness.user.click(
      await screen.findByRole('option', { name: /Image/ }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await harness.user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'campus.png', { type: 'image/png' }),
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
   * A prompt marks nodes with an attribute of the codebook's. A collaborator
   * deleting that attribute breaks the prompt, and the editor has to say so —
   * and say whose change it was — without writing anything of its own.
   */
  it('reports the deletion of the attribute a prompt marks nodes with, and who made it', async () => {
    const harness = openFixture();
    const dispatch = vi.spyOn(harness.session, 'dispatch');
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('valid'),
    );

    deleteNodeVariable(harness, 'person', 'highlighted');

    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );
    expectAttributedTo(harness, 'highlight');
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
      screen.getAllByRole('button', { name: 'Create new prompt' })[0],
    ).toBeDisabled();
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(/read-only/, { exact: false }),
    ).toBeInTheDocument();
    expect(harness.pendingCommands()).toEqual([]);
  });
});
