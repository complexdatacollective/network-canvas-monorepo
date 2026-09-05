import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import type { StageEditorComponent } from '../../../stage-editor-contract.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { TieStrengthCensusStageEditor } from '../TieStrengthCensusStageEditor.tsx';
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
const editor: StageEditorComponent<'TieStrengthCensus'> = (props) => (
  <TieStrengthCensusStageEditor
    {...props}
    actions={({ formId }) => (
      <SubmitButton form={formId}>Save stage</SubmitButton>
    )}
  />
);

const openFixture = () => ({ stageId: 'tie-strength-census-1', editor });

const prompts = (stage: SectionDoc): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the Tie-Strength Census stage editor', () => {
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

  it('saves a stage created from the interface template once it says what it asks', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'TieStrengthCensus',
        fields: getInterfaceTemplate('TieStrengthCensus'),
      },
      editor,
    });

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'How close each pair is',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
      'About to compare pairs',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Introduction text' }),
      'You will see two people at a time.',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How close are these two people?',
    );

    // The scale belongs to the connection, so there is nothing to choose from
    // until the connection type is known.
    expect(
      screen.queryByRole('combobox', { name: 'Attribute' }),
    ).not.toBeInTheDocument();
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Attribute' }),
      'closeness',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Decline answer' }),
      'They do not know each other',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'TieStrengthCensus',
      label: 'How close each pair is',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: {
        title: 'About to compare pairs',
        text: 'You will see two people at a time.',
      },
    });
    expect(prompts(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'How close are these two people?',
        createEdge: 'knows',
        edgeVariable: 'closeness',
        negativeLabel: 'They do not know each other',
      },
    ]);
  });

  it('refuses a stage whose introduction has no heading, and says which section', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'TieStrengthCensus',
        fields: {
          label: 'Tie-Strength Census',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: '', text: 'Something to read.' },
          prompts: [
            {
              id: 'prompt-a',
              text: 'First question',
              createEdge: 'knows',
              edgeVariable: 'closeness',
              negativeLabel: 'They do not know each other',
            },
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
describe('creating a Tie-Strength Census stage', () => {
  it('opens on the interface template with a proposed name, and offers only the destinations its position allows', async () => {
    const harness = renderStageEditor({
      create: { type: 'TieStrengthCensus', position: CREATE_POSITION },
      editor,
    });

    // Proposed, and unique in the interview: the fixture already holds a stage
    // called "Tie-Strength Census", so an unqualified proposal would be a
    // second.
    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Tie-Strength Census #2'),
    );

    // This interface's template carries nothing, so the new stage opens with
    // nothing written for the researcher to find and undo.
    expect(getInterfaceTemplate('TieStrengthCensus')).toEqual({});
    expect(screen.queryAllByRole('button', { name: /^Edit prompt/ })).toEqual(
      [],
    );

    await switchSkipLogicOn(harness);
    expect(destinationOptions()).toEqual(destinationsAfterInsertion());
  });
});

/**
 * A collaborator's codebook change reaches this editor as an authoritative
 * update. Following it must not write it back: a batch echoed here would be
 * saved as this session's own edit.
 */
describe('a codebook that changes while the Tie-Strength editor is open', () => {
  it('follows a scale a collaborator renamed, without echoing a command', async () => {
    const harness = renderStageEditor(openFixture());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      edge: {
        knows: {
          ...knowsDocument(harness),
          variables: {
            ...knowsVariables(harness),
            closeness: {
              ...(knowsVariables(harness).closeness as object),
              name: 'strength',
            },
          },
        },
      },
    });

    const picker = await screen.findByRole('combobox', { name: 'Attribute' });
    await waitFor(() =>
      expect(
        within(picker).getByRole('option', { name: 'strength' }),
      ).toBeInTheDocument(),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('reports a scale a collaborator removed rather than blanking the pick', async () => {
    const harness = renderStageEditor(openFixture());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      edge: { knows: { ...knowsDocument(harness), variables: {} } },
    });

    expect(
      await screen.findByText(
        'This attribute is no longer in the codebook. Choose another one.',
      ),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * The scale hangs off the connection the prompt creates, so creating one from
 * inside a prompt is a compound edit against that connection type's own
 * codebook section — landing whole or not at all — after which the prompt
 * naming it is saved with the stage.
 */
describe('creating a scale from inside the Tie-Strength editor', () => {
  it('asks the host once, then saves the stage that names what it created', async () => {
    const harness = renderStageEditor(openFixture());
    const submit = vi.spyOn(harness.host, 'submit');

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create a new attribute' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
      'trust',
    );
    await addOption(harness, 1, 'A little', 1);
    await addOption(harness, 2, 'A lot', 2);
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );

    const picker = await screen.findByRole('combobox', { name: 'Attribute' });
    await waitFor(() =>
      expect(
        within(picker).getByRole('option', { name: 'trust' }),
      ).toBeInTheDocument(),
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]?.[0].edits).toHaveLength(1);
    expect(submit.mock.calls[0]?.[0].edits[0]?.sectionId).toBe(
      'codebook:edge:knows',
    );

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const saved = prompts(request?.stageDocument ?? {})[0];
    expect(saved?.edgeVariable).toEqual(expect.any(String));
    expect(saved?.edgeVariable).not.toBe('closeness');
    expect(saved?.createEdge).toBe('knows');
  });
});

type SessionReader = Readonly<{
  session: { getSnapshot(): { protocolSections: Record<string, unknown> } };
}>;

function knowsDocument(harness: SessionReader): Record<string, unknown> {
  const document =
    harness.session.getSnapshot().protocolSections['codebook:edge:knows'];
  if (typeof document !== 'object' || document === null) {
    throw new Error('the fixture has no knows edge type');
  }
  return { ...document };
}

function knowsVariables(harness: SessionReader): Record<string, unknown> {
  const variables = knowsDocument(harness).variables;
  if (typeof variables !== 'object' || variables === null) {
    throw new Error('the fixture’s knows edge type has no attributes');
  }
  return { ...variables };
}

/** Adds one option to the attribute editor that is open. */
async function addOption(
  harness: StageEditorHarness,
  position: number,
  label: string,
  value: number,
) {
  await harness.user.click(screen.getByRole('button', { name: 'Add option' }));
  await harness.user.type(
    await screen.findByRole('textbox', { name: `Option ${position} label` }),
    label,
  );
  const valueField = screen.getByRole('textbox', {
    name: `Option ${position} value`,
  });
  await harness.user.clear(valueField);
  await harness.user.type(valueField, String(value));
}
