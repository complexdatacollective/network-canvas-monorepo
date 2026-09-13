import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { dyadCensusStageEditor } from '../DyadCensusStageEditor.ts';

/**
 * The editor as a host reaches it: through its own registry entry, so every
 * mount here also says this interface is dispatched to THIS editor.
 */
const mountFixture = () =>
  renderStageEditor({
    stageId: 'dyad-census-1',
    registry: dyadCensusStageEditor,
  });

/** Where a host would insert a new one: over the stage the fixture holds. */
const DYAD_CENSUS_INDEX = fixtureStageIds().indexOf('dyad-census-1');

const createFixture = () => ({
  create: { type: 'DyadCensus' as const, position: DYAD_CENSUS_INDEX },
  registry: dyadCensusStageEditor,
});

const stageNameInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

/**
 * Nothing the researcher did reached the protocol.
 *
 * The draft lives in the form and nowhere else until a save hands the whole
 * section back, so the protocol is where an edit that escaped would show up.
 */
const expectStageUntouched = (harness: StageEditorHarness): void => {
  expect(
    harness.protocolSections()[
      sectionId({ kind: 'stage', stageId: harness.seeded.id })
    ],
  ).toEqual({
    id: harness.seeded.id,
    type: harness.seeded.type,
    ...harness.seeded.fields,
  });
};

describe('the dyad census editor', () => {
  /**
   * The refusal has to say which part of the stage is unfinished. An
   * introduction with no heading reaches the schema as
   * `stages.N.introductionPanel.title`, which is a path rather than a place on
   * the page.
   */
  it('refuses a stage whose introduction has no heading, and says which section', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'DyadCensus',
        fields: {
          label: 'Dyad Census',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: '', text: 'Something to read.' },
          prompts: [
            { id: 'prompt-a', text: 'First question', createEdge: 'knows' },
          ],
        },
      },
      registry: dyadCensusStageEditor,
    });

    expect(await harness.submit()).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await waitFor(() =>
      expect(
        harness
          .outline()
          .find((section) => section.title === 'Task introduction')?.state,
      ).toBe('Has a problem'),
    );
  });

  it('leaves nothing behind when the editor is closed without saving', async () => {
    const harness = mountFixture();

    await harness.user.type(stageNameInput(), ' (revised)');
    await harness.cancel();

    expectStageUntouched(harness);
  });

  it('refuses to save while someone else holds the stage', async () => {
    const harness = renderStageEditor({
      stageId: 'dyad-census-1',
      registry: dyadCensusStageEditor,
      readOnly: true,
    });
    await screen.findByRole('textbox', { name: 'Title' });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This stage is read-only, so your change was not made. Somebody else is editing it.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * A connection type a collaborator adds appears here, and the editor writes
   * nothing back: their change is not this researcher's edit, and echoing it
   * would save their work as ours.
   */
  it('follows a codebook change made elsewhere without writing anything', async () => {
    const harness = mountFixture();
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });

    harness.receiveCodebookUpdate({
      edge: { worksWith: { name: 'worksWith', color: 'edge-color-seq-2' } },
    });

    expect(
      await screen.findByRole('radio', { name: 'worksWith' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'knows' })).toBeChecked();
    expectStageUntouched(harness);
  });

  /**
   * The connection an affirmative answer creates lives in the codebook rather
   * than in the stage, so creating one from inside a prompt writes the
   * codebook and the prompt is then pointed at it.
   *
   * Only the second half is asked here — that the pick reaches the STAGE save.
   * What the codebook is asked, and what it refuses, is
   * `DyadCensusPromptsSection.test.tsx`'s, which mounts the same section and
   * asks it in more detail.
   */
  it('saves a stage that names the connection type it just created', async () => {
    const harness = mountFixture();

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create a new connection type',
      }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Edge type name' }),
      'worksWith',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );

    expect(
      await screen.findByRole('radio', { name: 'worksWith' }),
    ).toBeChecked();

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const saved = prompts(request?.stageDocument ?? {})[0];
    expect(saved?.createEdge).toEqual(expect.any(String));
    expect(saved?.createEdge).not.toBe('knows');
  });
});

/**
 * A stage the host is CREATING rather than one the interview already contains.
 *
 * Nothing about it is a prop this editor passes: whether the stage exists yet
 * and where the host is about to insert it are facts only the edit has, and
 * the shared sections read both out of it.
 */
describe('creating a dyad census stage', () => {
  it('opens on the interface template with a name proposed for it', async () => {
    renderStageEditor(createFixture());

    // Proposed, and unique in the interview: the fixture already holds a stage
    // called "Dyad Census", so an unqualified proposal would be a second.
    await waitFor(() => expect(stageNameInput()).toHaveValue('Dyad Census #2'));

    // This interface's template carries nothing, so the new stage opens with
    // nothing written for the researcher to find and undo.
    expect(getInterfaceTemplate('DyadCensus')).toEqual({});
    expect(screen.queryAllByRole('button', { name: /^Edit prompt/ })).toEqual(
      [],
    );
  });

  /**
   * The other half of the same journey: the researcher writes what the template
   * does not carry, and the new stage saves. The name is the one the editor
   * PROPOSED, never typed, and it follows the type they pick on the way.
   */
  it('saves the new stage once its introduction and prompt are written', async () => {
    const harness = renderStageEditor(createFixture());

    await waitFor(() => expect(stageNameInput()).toHaveValue('Dyad Census #2'));
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Title' }),
      'Pairs',
    );
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Introduction text' }),
      'Two at a time.',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Do they know?',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'DyadCensus',
      label: 'Person Dyad Census',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'Pairs', text: 'Two at a time.' },
    });
    expect(prompts(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'Do they know?',
        createEdge: 'knows',
      },
    ]);
  });

  /**
   * And it refuses one that is otherwise complete, because the template does
   * not carry the task introduction this interface's schema requires — so a
   * researcher who wrote everything else would otherwise be sending a stage a
   * host rejects. The case above refuses an introduction whose heading was
   * emptied; this is the introduction that was never there at all.
   */
  it('refuses a new stage that has no task introduction', async () => {
    const harness = renderStageEditor({
      create: {
        type: 'DyadCensus',
        position: DYAD_CENSUS_INDEX,
        fields: {
          label: 'Who knows who',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            { id: 'prompt-a', text: 'Do they know?', createEdge: 'knows' },
          ],
        },
      },
      registry: dyadCensusStageEditor,
    });

    expect(
      getInterfaceTemplate('DyadCensus').introductionPanel,
    ).toBeUndefined();
    expect(await harness.submit()).toBeNull();
  });
});
