import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import type { StageEditorComponent } from '../../../stage-editor-contract.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { DyadCensusStageEditor } from '../DyadCensusStageEditor.tsx';
import {
  CREATE_POSITION,
  destinationOptions,
  destinationsAfterInsertion,
  stageNameInput,
  switchSkipLogicOn,
} from './createMode.ts';

/**
 * The named editor as a host mounts it: the editor itself, plus the action
 * chrome the host puts in its slot. Never disabled, so that a refused save can
 * be asked for and reported rather than hidden behind an inert button.
 */
const editor: StageEditorComponent<'DyadCensus'> = (props) => (
  <DyadCensusStageEditor
    {...props}
    actions={({ formId }) => (
      <SubmitButton form={formId}>Save stage</SubmitButton>
    )}
  />
);

const openFixture = () => ({ stageId: 'dyad-census-1', editor });

const prompts = (stage: SectionDoc): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the Dyad Census stage editor', () => {
  it('saves the stage it opened, with every key still accounted for', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.roundTrip({ unowned: [] });
  });

  it('lists its sections in the order the plan standardises', async () => {
    const harness = renderStageEditor(openFixture());

    await waitFor(() => expect(harness.outline()).toHaveLength(7));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Stage filter',
      'Task introduction',
      'Prompts',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

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
      editor,
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
    ).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() =>
      expect(
        harness
          .outline()
          .find((section) => section.title === 'Task introduction')?.state,
      ).toBe('Has a problem'),
    );
  });

  it('leaves nothing pending when the researcher discards the edit', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      ' revised',
    );
    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
  });

  it('refuses to save once editing has been taken away, and says so', async () => {
    const harness = renderStageEditor(openFixture());

    harness.setReadOnly();

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This stage is read-only, so your changes were not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * A stage the host is CREATING rather than one the interview already contains.
 *
 * Nothing about it is a prop this editor passes: whether the stage exists yet
 * and where the host is about to insert it are facts only the session has, and
 * the shared sections read both out of it.
 */
describe('creating a Dyad Census stage', () => {
  it('opens on the interface template with a proposed name, and offers only the destinations its position allows', async () => {
    const harness = renderStageEditor({
      create: { type: 'DyadCensus', position: CREATE_POSITION },
      editor,
    });

    // Proposed, and unique in the interview: the fixture already holds a stage
    // called "Dyad Census", so an unqualified proposal would be a second.
    await waitFor(() => expect(stageNameInput()).toHaveValue('Dyad Census #2'));

    // This interface's template carries nothing, so the new stage opens with
    // nothing written for the researcher to find and undo.
    expect(getInterfaceTemplate('DyadCensus')).toEqual({});
    expect(screen.queryAllByRole('button', { name: /^Edit prompt/ })).toEqual(
      [],
    );

    await switchSkipLogicOn(harness);
    expect(destinationOptions()).toEqual(destinationsAfterInsertion());
  });

  /**
   * The other half of the same journey: the researcher writes what the
   * template does not carry, and the new stage saves.
   *
   * Separate from the assertion above because the two fail for different
   * reasons and writing an introduction and a prompt is most of what this
   * journey costs. The name is the one the editor PROPOSED, never typed, and
   * it follows the type the researcher picks on the way.
   */
  it('saves the new stage once its introduction and prompt are written', async () => {
    const harness = renderStageEditor({
      create: { type: 'DyadCensus', position: CREATE_POSITION },
      editor,
    });

    await waitFor(() => expect(stageNameInput()).toHaveValue('Dyad Census #2'));
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
      'Pairs',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Introduction text' }),
      'Two at a time.',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
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
   * host rejects. The sibling above refuses an introduction whose heading was
   * emptied; this is the introduction that was never there at all.
   */
  it('refuses a new stage that has no task introduction', async () => {
    const harness = renderStageEditor({
      create: {
        type: 'DyadCensus',
        position: CREATE_POSITION,
        fields: {
          label: 'Who knows who',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            { id: 'prompt-a', text: 'Do they know?', createEdge: 'knows' },
          ],
        },
      },
      editor,
    });

    expect(
      getInterfaceTemplate('DyadCensus').introductionPanel,
    ).toBeUndefined();
    expect(await harness.submit()).toBeNull();
  });
});

/**
 * A collaborator's codebook change reaches this editor as an authoritative
 * update. Following it must not write it back: a batch echoed here would be
 * saved as this session's own edit.
 */
describe('a codebook that changes while the Dyad Census editor is open', () => {
  it('offers a connection type a collaborator added, without echoing a command', async () => {
    const harness = renderStageEditor(openFixture());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      edge: {
        worksWith: { name: 'worksWith', color: 'edge-color-seq-2' },
      },
    });

    expect(
      await screen.findByRole('radio', { name: 'worksWith' }),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('reports a connection type a collaborator removed rather than blanking the pick', async () => {
    const harness = renderStageEditor(openFixture());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({ edge: { knows: null } });

    await waitFor(() =>
      expect(
        screen.queryByRole('radio', { name: 'knows' }),
      ).not.toBeInTheDocument(),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * The connection an affirmative answer creates lives in the codebook rather
 * than in the stage, so creating one from inside a prompt is a compound edit
 * against the codebook, after which the prompt naming it is saved with the
 * stage.
 *
 * Only the second half is asked here. That the host is asked ONCE, and with
 * what, is `DyadCensusPromptsSection.test.tsx`'s — it mounts the same section
 * and asks it in more detail. What is left for the named editor is that the
 * pick reaches the stage save.
 */
describe('creating a connection type from inside the Dyad Census editor', () => {
  it('saves the stage that names what it created', async () => {
    const harness = renderStageEditor(openFixture());

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
