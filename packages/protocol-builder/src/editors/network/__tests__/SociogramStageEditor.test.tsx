import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { sociogramStage } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import {
  CANVAS_IMAGE_ID,
  canvasImageAssets,
  stageWithImageBackground,
} from '../../../sections/network/__tests__/canvasFixtures.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import {
  expectOpenedAsANewStage,
  expectStatesItsPosition,
  NEW_STAGE_POSITION,
} from '../../__tests__/creationSignal.ts';
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

/**
 * Every behaviour the Sociogram schema allows, on one stage.
 *
 * Written out here rather than taken from the fixture, which carries only
 * `automaticLayout`. The list is the schema's own `canvasBehavioursSchema`; a
 * key added there and not here would leave these tests passing about two
 * behaviours out of three, which is what `schemaBehaviourKeys` guards against.
 */
const ALL_BEHAVIOURS: SectionDoc = {
  behaviours: {
    automaticLayout: true,
    allowRepositioning: true,
    freeDraw: true,
  },
};

/** Every behaviour key the Sociogram stage schema itself allows. */
const schemaBehaviourKeys = (): string[] =>
  Object.keys(sociogramStage.shape.behaviours.unwrap().shape).toSorted();

const BEHAVIOURS_PREFIX = 'behaviours.';

/**
 * The behaviours this editor has a control for, by key.
 *
 * Read from `data-field-path` — the canonical name the form store files a
 * field under, and the same string `ProtocolField` registers with the
 * outline — because a save can no longer answer the question. A submit writes
 * each mounted field at its own path and leaves the keys beside it alone, so a
 * behaviour no section renders round-trips untouched and a stage carrying one
 * comes back intact whether or not the researcher could see it.
 */
const behavioursOnScreen = (harness: StageEditorHarness): string[] =>
  [...harness.baseElement.querySelectorAll('[data-field-path]')]
    .flatMap((field) => {
      const path = field.getAttribute('data-field-path') ?? '';
      return path.startsWith(BEHAVIOURS_PREFIX)
        ? [path.slice(BEHAVIOURS_PREFIX.length)]
        : [];
    })
    .toSorted();

const openWithEveryBehaviour = () => {
  const { type, fields } = loadFixtureStage('sociogram-1');
  return renderStageEditor({
    stage: {
      id: 'sociogram-behaviours',
      type,
      fields: { ...fields, ...ALL_BEHAVIOURS },
    },
    editor: sociogramEditor,
  });
};

describe('the sociogram stage editor', () => {
  /**
   * A stage the host is CREATING, opened the way a host opens one: from this
   * interface's own template, not yet in the interview, and carrying the
   * position it is about to be inserted at. Everything an editor does
   * differently for a new stage follows from that one signal, which the
   * shared sections read from the editor's context rather than from a prop.
   */
  it('opens a stage being created on the creation the session carries', async () => {
    renderStageEditor({
      create: { type: 'Sociogram', position: NEW_STAGE_POSITION },
      editor: sociogramEditor,
    });

    await expectOpenedAsANewStage('Sociogram');
  });

  /**
   * And the other way round: a stage the interview already holds says where in
   * it the researcher is. Asked here rather than only in the dispatch suite
   * because this editor composes the shared heading itself, so dropping it
   * would leave every other test in this file passing.
   */
  it('says where the stage sits in the interview', () => {
    openFixture();

    expectStatesItsPosition('sociogram-1');
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = openFixture();

    await harness.roundTrip({ unowned: [] });
  });

  it('composes its sections in the order the decisions are made', async () => {
    const harness = openFixture();

    await waitFor(() => expect(harness.outline()).toHaveLength(9));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Stage filter',
      'Prompts',
      'Background',
      'Node layout',
      'Canvas interaction',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  /**
   * The list below is only as good as its agreement with the schema, so it is
   * checked against it: a behaviour added to `canvasBehavioursSchema` and not
   * here would leave the round-trip test passing while the editor silently
   * dropped the new key.
   */
  it('asks about every behaviour the schema allows', () => {
    expect(Object.keys(ALL_BEHAVIOURS.behaviours ?? {}).toSorted()).toEqual(
      schemaBehaviourKeys(),
    );
  });

  /**
   * Each of them has a control the researcher can reach.
   *
   * Asked of the mounted fields rather than of a save, because a save cannot
   * tell the difference: a behaviour no section renders is left alone, so a
   * stage carrying one round-trips intact whether or not anything on screen
   * offers it. What a missing section costs is the decision — a stage somebody
   * else authored opening with a behaviour switched on that the researcher can
   * neither see nor change.
   */
  it('gives every behaviour the schema allows a control of its own', async () => {
    const harness = openWithEveryBehaviour();

    await waitFor(() =>
      expect(behavioursOnScreen(harness)).toEqual(schemaBehaviourKeys()),
    );
  });

  /** And a save gives every one of them back exactly as it arrived. */
  it('keeps every behaviour the schema allows when a stage carrying them is re-saved', async () => {
    const harness = openWithEveryBehaviour();

    const request = await harness.roundTrip({ unowned: [] });

    expect(request.stageDocument.behaviours).toEqual(ALL_BEHAVIOURS.behaviours);
  });

  it('saves each canvas permission the researcher grants', async () => {
    const harness = openFixture();

    await harness.user.click(
      screen.getByRole('switch', { name: 'Allow drawing on the canvas' }),
    );
    await harness.user.click(
      screen.getByRole('switch', { name: 'Allow moving nodes' }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({
      automaticLayout: true,
      freeDraw: true,
      allowRepositioning: true,
    });
  });

  /**
   * What a new stage opens on, before the researcher has decided anything.
   *
   * A sociogram's template is empty — the interface has no authored default to
   * give — so every one of these is still the researcher's to supply. Split
   * from the save below so neither claim can hide the other: a stage that
   * opened already holding a prompt would still save, and a save that worked
   * would say nothing about what the researcher was first shown.
   */
  it('opens a new stage with nothing chosen for the researcher', () => {
    openNewStage();

    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: 'Edit prompt' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'person' })).not.toBeChecked();
  });

  /**
   * A sociogram's own minimum: a name, the type it arranges, one task for the
   * participant to do, and something behind the nodes while they do it.
   *
   * Every string typed here is as short as it can be while still being the
   * thing asserted: each character is a keystroke through a controlled field,
   * and a prompt's wording is the prompts section's business rather than this
   * editor's.
   */
  it('saves a new stage once it has been given the minimum it needs', async () => {
    const harness = openNewStage();

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Places',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new prompt' }),
    );
    const prompt = within(await screen.findByRole('dialog'));
    await harness.user.type(
      prompt.getByRole('textbox', { name: 'Prompt text' }),
      'Who?',
    );
    await harness.user.selectOptions(
      prompt.getByRole('combobox', { name: 'Position attribute' }),
      'layout',
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    // The nodes need something to be placed against, and a sociogram with no
    // background does not save.
    await harness.user.type(
      screen.getByRole('spinbutton', {
        name: 'Number of concentric circles',
      }),
      '3',
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      label: 'Places',
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
