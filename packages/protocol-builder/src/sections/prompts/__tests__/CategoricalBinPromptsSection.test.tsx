import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import CategoricalBinPromptsSection from '../CategoricalBinPromptsSection.tsx';

const openEditor = () => ({
  stageId: 'categorical-bin-1',
  sections: <CategoricalBinPromptsSection />,
});

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the questions a categorical bin asks', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.roundTrip();
  });

  it('offers only the categorical attributes of the type the stage is about', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );

    const picker = await screen.findByRole('combobox', { name: 'Attribute' });
    expect(
      [...picker.querySelectorAll('option')]
        .map((option) => option.value)
        .filter((value) => value !== ''),
    ).toEqual(['contactType']);
    expect(picker).toHaveValue('contactType');
  });

  it('refuses a prompt that names no attribute, and says which one', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Who do you see most?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText(
        'Choose the attribute whose values become the bins.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('leaves the follow-up bin out of a prompt that does not use one', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Who do you see most?',
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
    const added = prompts(request?.stageDocument ?? {}).at(-1);
    expect(added).toEqual({
      id: expect.any(String) as unknown as string,
      text: 'Who do you see most?',
      variable: 'contactType',
    });
    for (const key of [
      'otherVariable',
      'otherOptionLabel',
      'otherVariablePrompt',
      'binSortOrder',
      'bucketSortOrder',
    ]) {
      expect(Object.hasOwn(added as object, key)).toBe(false);
    }
  });

  it('keeps each prompt’s identity when one is added and another moved', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'CategoricalBin',
        fields: {
          label: 'Categorical Bin',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            { id: 'prompt-a', text: 'First question', variable: 'contactType' },
            {
              id: 'prompt-b',
              text: 'Second question',
              variable: 'contactType',
            },
          ],
        },
      },
      sections: <CategoricalBinPromptsSection />,
    });

    screen.getByRole('button', { name: 'Reorder prompt 1 of 2' }).focus();
    await harness.user.keyboard('{ArrowDown}');

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {}).map((row) => row.id)).toEqual([
      'prompt-b',
      'prompt-a',
    ]);
  });

  it('discards an edit the researcher cancelled', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    const text = await screen.findByRole('textbox', { name: 'Prompt text' });
    await harness.user.clear(text);
    await harness.user.type(text, 'Something else entirely');
    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await harness.roundTrip();
  });
});

/**
 * The attribute lives in a different section of the protocol from the stage,
 * so creating one is a compound edit against the codebook — landing whole or
 * not at all — after which the prompt points at it as an ordinary unsaved
 * change.
 */
describe('creating a bin attribute from inside a prompt', () => {
  it('asks the host once, and points the prompt at what it created', async () => {
    const harness = renderStageEditor(openEditor());
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

    // One request, against the codebook alone, carrying the hash of what it
    // was built from — so a host applies both halves of the attribute or
    // neither, and never half of a stage with it.
    expect(submit).toHaveBeenCalledTimes(1);
    const submission = submit.mock.calls[0]?.[0];
    expect(submission?.edits).toHaveLength(1);
    const edit = submission?.edits[0];
    expect(edit?.kind).toBe('update');
    expect(edit?.sectionId).toBe('codebook:node:person');
    expect(edit?.kind === 'update' ? edit.expectedContentHash : '').toEqual(
      expect.any(String),
    );
    expect(submit.mock.results[0]?.value).toMatchObject({ status: 'applied' });

    // The attribute is in the codebook now; the prompt naming it is not yet
    // saved anywhere.
    expect(
      personVariables(harness).howKnown ??
        Object.values(personVariables(harness)).find(
          (variable) =>
            typeof variable === 'object' &&
            variable !== null &&
            Reflect.get(variable, 'name') === 'howKnown',
        ),
    ).toBeDefined();

    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const added = prompts(request?.stageDocument ?? {}).at(-1);
    expect(added?.variable).toBe(
      picker.getAttribute('value') ?? added?.variable,
    );
    expect(typeof added?.variable).toBe('string');
    expect(added?.text).toBe('How do you know this person?');
  });

  it('leaves the codebook alone when the host refuses', async () => {
    const harness = renderStageEditor(openEditor());
    const before = personVariables(harness);
    vi.spyOn(harness.host, 'submit').mockReturnValue({
      status: 'failed',
      reason: 'invalid-request',
      message: 'The codebook rejected that attribute.',
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create a new attribute' }),
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

    expect(
      await screen.findByText(/The codebook rejected that attribute\./),
    ).toBeInTheDocument();
    expect(personVariables(harness)).toEqual(before);

    // Nothing was staged locally either: a refused compound edit leaves the
    // session with nothing half-applied to send on.
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * The attributes are read from the editor's own protocol context, so a change
 * made anywhere else reaches an open prompt without this section doing
 * anything — and, above all, without writing that change back as if this
 * session had made it.
 */
describe('a codebook that changes while a bin prompt is open', () => {
  it('follows a rename a collaborator made, without echoing a command', async () => {
    const harness = renderStageEditor(openEditor());
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

  it('reports an attribute a collaborator deleted rather than blanking the pick', async () => {
    const harness = renderStageEditor(openEditor());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      node: {
        person: { ...personDocument(harness), variables: {} },
      },
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

function personDocument(harness: {
  session: { getSnapshot(): { protocolSections: Record<string, unknown> } };
}): Record<string, unknown> {
  const document =
    harness.session.getSnapshot().protocolSections['codebook:node:person'];
  if (typeof document !== 'object' || document === null) {
    throw new Error('the fixture has no person type');
  }
  return { ...document };
}

function personVariables(harness: {
  session: { getSnapshot(): { protocolSections: Record<string, unknown> } };
}): Record<string, unknown> {
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
