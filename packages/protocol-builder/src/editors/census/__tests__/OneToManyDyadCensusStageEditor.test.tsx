import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import type { StageEditorComponent } from '../../../stage-editor-contract.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { OneToManyDyadCensusStageEditor } from '../OneToManyDyadCensusStageEditor.tsx';
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
const editor: StageEditorComponent<'OneToManyDyadCensus'> = (props) => (
  <OneToManyDyadCensusStageEditor
    {...props}
    actions={({ formId }) => (
      <SubmitButton form={formId}>Save stage</SubmitButton>
    )}
  />
);

const openFixture = () => ({
  stageId: 'one-to-many-dyad-census-1',
  editor,
});

const prompts = (stage: SectionDoc): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the One-to-Many Dyad Census stage editor', () => {
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
      'Prompts',
      'Node availability',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  /**
   * The one interface in this family whose template carries a value. It is an
   * authored default rather than a schema one, so it has to survive from the
   * new stage into the saved document without anybody touching the control.
   *
   * Everything the stage needs BESIDES that behaviour is seeded on top of the
   * template, so the only thing this can be answering for is the template's
   * own value: it is on screen unasked for, and it is in the saved document
   * with nothing in between having written it.
   */
  it('saves the behaviour its template seeded, without the researcher setting it', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'OneToManyDyadCensus',
        fields: {
          ...getInterfaceTemplate('OneToManyDyadCensus'),
          label: 'Who each person knows',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            { id: 'prompt-a', text: 'Who do they know?', createEdge: 'knows' },
          ],
        },
      },
      editor,
    });

    expect(
      screen.getByRole('radio', { name: 'Remove them from the list' }),
    ).toBeChecked();

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'OneToManyDyadCensus',
      behaviours: { removeAfterConsideration: true },
    });
  });

  it('refuses a stage that does not say what becomes of a person', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'OneToManyDyadCensus',
        fields: {
          label: 'One to Many Dyad Census',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            { id: 'prompt-a', text: 'First question', createEdge: 'knows' },
          ],
        },
      },
      editor,
    });

    expect(await harness.submit()).toBeNull();
    await waitFor(() =>
      expect(
        harness
          .outline()
          .find((section) => section.title === 'Node availability')?.state,
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
describe('creating a One-to-Many Dyad Census stage', () => {
  it('opens on the interface template with a proposed name, and offers only the destinations its position allows', async () => {
    const harness = renderStageEditor({
      create: { type: 'OneToManyDyadCensus', position: CREATE_POSITION },
      editor,
    });

    // Proposed, and unique in the interview: the fixture already holds a stage
    // called "One to Many Dyad Census", so an unqualified proposal would be a
    // second.
    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('One to Many Dyad Census #2'),
    );

    // The one template in this family that carries a value, on screen before
    // the researcher has touched the control that holds it.
    expect(getInterfaceTemplate('OneToManyDyadCensus')).toEqual({
      behaviours: { removeAfterConsideration: true },
    });
    expect(
      screen.getByRole('radio', { name: 'Remove them from the list' }),
    ).toBeChecked();

    await switchSkipLogicOn(harness);
    expect(destinationOptions()).toEqual(destinationsAfterInsertion());
  });

  /**
   * The other half of the same journey: the researcher writes the one thing
   * the template does not carry, and the new stage saves.
   *
   * Separate from the assertion above because the two fail for different
   * reasons and writing a prompt is most of what this journey costs. The name
   * is the one the editor PROPOSED, never typed, and it follows the type the
   * researcher picks on the way.
   */
  it('saves the new stage once its prompt is written', async () => {
    const harness = renderStageEditor({
      create: { type: 'OneToManyDyadCensus', position: CREATE_POSITION },
      editor,
    });

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('One to Many Dyad Census #2'),
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Who do they know?',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'OneToManyDyadCensus',
      label: 'Person One to Many Dyad Census',
      subject: { entity: 'node', type: 'person' },
      behaviours: { removeAfterConsideration: true },
    });
    expect(prompts(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'Who do they know?',
        createEdge: 'knows',
      },
    ]);
  });
});

/**
 * A collaborator's codebook change reaches this editor as an authoritative
 * update. Following it must not write it back: a batch echoed here would be
 * saved as this session's own edit.
 */
describe('a codebook that changes while the One-to-Many editor is open', () => {
  it('offers a connection type a collaborator added, without echoing a command', async () => {
    const harness = renderStageEditor(openFixture());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      edge: { worksWith: { name: 'worksWith', color: 'edge-color-seq-2' } },
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
 * what, is asked of the same section by the prompt-section tests; what is left
 * for the named editor is that the pick reaches the stage save.
 */
describe('creating a connection type from inside the One-to-Many editor', () => {
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
