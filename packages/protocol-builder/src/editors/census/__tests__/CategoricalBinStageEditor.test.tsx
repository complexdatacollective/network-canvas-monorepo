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
import { CategoricalBinStageEditor } from '../CategoricalBinStageEditor.tsx';

/**
 * The named editor as a host mounts it: the editor itself, plus the action
 * chrome the host puts in its slot.
 *
 * Written here rather than inside the editor because the slot is the whole
 * contract for a host's own buttons — an editor that rendered its own save
 * button would leave a host with two.
 */
const editor: StageEditorComponent = ({ controller }) => (
  <CategoricalBinStageEditor
    controller={controller}
    // Deliberately never disabled: a chrome that hides the control cannot
    // show that the EDITOR refuses a save it is asked for, which is the
    // refusal a host with its own toolbar depends on.
    actions={({ formId }) => (
      <SubmitButton form={formId}>Save stage</SubmitButton>
    )}
  />
);

const openFixture = () => ({ stageId: 'categorical-bin-1', editor });

const prompts = (stage: SectionDoc): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the Categorical Bin stage editor', () => {
  it('saves the stage it opened, with every key still accounted for', async () => {
    const harness = renderStageEditor(openFixture());

    // No exceptions: every key this interface's schema gives a Categorical Bin
    // is edited by a section this editor mounts.
    await harness.roundTrip({ unowned: [] });
  });

  it('lists its sections in the order the plan standardises', async () => {
    const harness = renderStageEditor(openFixture());

    await waitFor(() => expect(harness.outline()).toHaveLength(6));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Stage filter',
      'Prompts',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  it('saves a stage created from the interface template once it says what it asks', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'CategoricalBin',
        fields: getInterfaceTemplate('CategoricalBin'),
      },
      editor,
    });

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Kinds of contact',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'What kind of contact do you have?',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Attribute' }),
      'contactType',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'CategoricalBin',
      label: 'Kinds of contact',
      subject: { entity: 'node', type: 'person' },
    });
    expect(prompts(request?.stageDocument ?? {})).toHaveLength(1);
  });

  it('refuses a stage with no name, and says which section is missing one', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'CategoricalBin',
        fields: {
          label: '',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            { id: 'prompt-a', text: 'First question', variable: 'contactType' },
          ],
        },
      },
      editor,
    });

    expect(await harness.submit()).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Stage name')
          ?.state,
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
 * The codebook is a different section of the protocol from the stage, so a
 * collaborator's change to it reaches this editor as an authoritative update.
 * Following it must not write it back: a batch echoed here would be saved as
 * this session's own edit.
 */
describe('a codebook that changes while the Categorical Bin editor is open', () => {
  it('follows an attribute a collaborator renamed, without echoing a command', async () => {
    const harness = renderStageEditor(openFixture());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...personDocument(harness),
          variables: {
            ...personVariables(harness),
            contactType: {
              ...(personVariables(harness).contactType as object),
              name: 'contactKind',
            },
          },
        },
      },
    });

    const picker = await screen.findByRole('combobox', { name: 'Attribute' });
    await waitFor(() =>
      expect(
        within(picker).getByRole('option', { name: 'contactKind' }),
      ).toBeInTheDocument(),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('reports an attribute a collaborator removed rather than blanking the pick', async () => {
    const harness = renderStageEditor(openFixture());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      node: { person: { ...personDocument(harness), variables: {} } },
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
 * The bins are an attribute's values, so creating one from inside a prompt is
 * a compound edit against the codebook — it lands whole or not at all — after
 * which the prompt naming it is saved with the stage.
 */
describe('creating a bin attribute from inside the Categorical Bin editor', () => {
  it('asks the host once, then saves the stage that names what it created', async () => {
    const harness = renderStageEditor(openFixture());
    const submit = vi.spyOn(harness.host, 'submit');

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How do you know this person?',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create a new attribute' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
      'howKnown',
    );
    await addOption(harness, 1, 'Through work', 'work');
    await addOption(harness, 2, 'Through family', 'family');
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );

    const picker = await screen.findByRole('combobox', { name: 'Attribute' });
    await waitFor(() =>
      expect(
        within(picker).getByRole('option', { name: 'howKnown' }),
      ).toBeInTheDocument(),
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]?.[0].edits).toHaveLength(1);
    expect(submit.mock.calls[0]?.[0].edits[0]?.sectionId).toBe(
      'codebook:node:person',
    );

    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const added = prompts(request?.stageDocument ?? {}).at(-1);
    expect(added?.text).toBe('How do you know this person?');
    expect(typeof added?.variable).toBe('string');
  });
});

type SessionReader = Readonly<{
  session: { getSnapshot(): { protocolSections: Record<string, unknown> } };
}>;

function personDocument(harness: SessionReader): Record<string, unknown> {
  const document =
    harness.session.getSnapshot().protocolSections['codebook:node:person'];
  if (typeof document !== 'object' || document === null) {
    throw new Error('the fixture has no person type');
  }
  return { ...document };
}

function personVariables(harness: SessionReader): Record<string, unknown> {
  const variables = personDocument(harness).variables;
  if (typeof variables !== 'object' || variables === null) {
    throw new Error('the fixture’s person type has no attributes');
  }
  return { ...variables };
}

/** Adds one option to the attribute editor that is open. */
async function addOption(
  harness: StageEditorHarness,
  position: number,
  label: string,
  value: string,
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
  await harness.user.type(valueField, value);
}
