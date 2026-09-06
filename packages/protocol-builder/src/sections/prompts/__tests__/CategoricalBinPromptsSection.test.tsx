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

/** What a host says about a refusal, in the words a log reader would want. */
const HOST_WORDS = 'expected object, received undefined';

/**
 * The package's own words for that refusal, from `compoundFailureCopy`.
 *
 * Written out rather than imported: the point of the copy is that it is NOT
 * the message the host sent, and a test reading the same table as the
 * component would still pass if that table were replaced by a passthrough.
 */
const REFUSED_INVALID_REQUEST =
  'This change could not be sent, and nothing was saved. Close this editor and try again.';

/**
 * The codebook schema's own sentence about a rule the options can no longer
 * satisfy, naming the rule and both numbers.
 *
 * The one refusal shown in the words it arrived in — see `VariableEditor` —
 * because it is already written for a researcher and says what to change.
 * Written out rather than imported, for the reason above: a test that read the
 * schema's own message would still pass if the editor rendered none of it.
 */
const OPTION_COUNT_CONTRADICTION =
  'Attribute "contactType": minSelected (3) is greater than the number of options (2)';

/** What that refusal would read like if it fell through to the generic copy. */
const UNEXPLAINED_FAILURE =
  'This change could not be saved, and nothing was altered. Wait a moment and try again.';

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

    // The stage's name and the type its bins sort belong to sections this
    // mount does not include.
    await harness.roundTrip({ unowned: ['label', 'subject'] });
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

  /**
   * A group the researcher already used opens switched on, holding what they
   * put in it.
   *
   * The other direction — a group that cannot be switched on until the bins
   * are chosen — is tested above, and it is the direction that fails loudly.
   * This one fails silently: a follow-up bin that opened switched off would
   * look exactly like a prompt that never had one, and closing a `Section`
   * clears the fields inside it, so a researcher who opened the prompt to
   * change its wording and pressed Save would lose the bin, its label and its
   * question without being told.
   */
  it('opens a prompt’s follow-up bin switched on, holding what it was saved with', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'CategoricalBin',
        fields: {
          label: 'Categorical Bin',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'prompt-a',
              text: 'What kind of contact?',
              variable: 'contactType',
              otherVariable: 'relationship_to_ego',
              otherOptionLabel: 'Other',
              otherVariablePrompt: 'Which?',
            },
          ],
        },
      },
      sections: <CategoricalBinPromptsSection />,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('dialog');

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'A bin for anything else' }),
      ).toBeChecked(),
    );
    expect(
      screen.getByRole('combobox', {
        name: 'Attribute the answer is stored in',
      }),
    ).toHaveValue('relationship_to_ego');
    expect(
      screen.getByRole('textbox', { name: 'Bin label' }),
    ).toHaveTextContent('Other');
    expect(
      screen.getByRole('textbox', { name: 'Follow-up question' }),
    ).toHaveTextContent('Which?');
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

    await harness.roundTrip({ unowned: ['label', 'subject'] });
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
      message: HOST_WORDS,
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

    // The package's own words about the refusal, never the host's: the
    // sentence a host sends is about a path in a protocol document, and the
    // researcher was creating an attribute.
    const report = await screen.findByRole('alert');
    expect(report).toHaveTextContent(REFUSED_INVALID_REQUEST);
    expect(report).not.toHaveTextContent(HOST_WORDS);
    expect(personVariables(harness)).toEqual(before);

    // Nothing was staged locally either: a refused compound edit leaves the
    // session with nothing half-applied to send on.
    expect(harness.pendingCommands()).toEqual([]);
  });

  /**
   * Values the attribute's own committed rules could never be satisfied by
   * never reach the host.
   *
   * An attribute told to require three answers cannot be left with two values
   * to choose from, and the refusal happens before anything is sent: the
   * request is built by validating the whole entity document, so the protocol
   * schema's own contradiction rules refuse it where it is written. A host
   * applying a compound edit is not asked to reason about validation rules, so
   * by the time one could refuse this it would be refusing it for the wrong
   * reason.
   *
   * The words the researcher gets are the schema's own, shown through by
   * `VariableEditor`: they name the rule and both numbers, so the researcher
   * can see which of the two things they wrote to change. The generic "this
   * could not be sent" copy would be wrong twice over here — nothing was sent,
   * and it asks for a retry that cannot succeed until something changes — so
   * this asserts the sentence rather than merely that an alert appeared.
   */
  it('never asks the host to leave the values a committed rule needs', async () => {
    const harness = renderStageEditor(openEditor());
    const submit = vi.spyOn(harness.host, 'submit');

    // The attribute the prompt already bins by is given a rule its three
    // values can only just satisfy.
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...personDocument(harness),
          variables: {
            ...personVariables(harness),
            contactType: {
              ...(personVariables(harness).contactType as object),
              validation: { minSelected: 3 },
            },
          },
        },
      },
    });
    const before = personVariables(harness);

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: "Change this attribute's values",
      }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove option 3' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save attribute' }),
    );

    // Refused in the schema's own words, naming the rule and both numbers,
    // with the editor still holding their draft.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(OPTION_COUNT_CONTRADICTION);
    expect(alert).not.toHaveTextContent(UNEXPLAINED_FAILURE);
    expect(
      screen.getByRole('button', { name: 'Save attribute' }),
    ).toBeInTheDocument();

    // Nothing was sent and nothing was kept: the codebook still holds the
    // three values the rule needs.
    expect(submit).not.toHaveBeenCalled();
    expect(personVariables(harness)).toEqual(before);
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

/**
 * The follow-up bin is the one place in this interface where the PARTICIPANT
 * types an answer, so the attribute's own validation rules are the only thing
 * standing between them and an answer the study cannot use.
 *
 * Architect mounts a `CodebookVariableValidationSection` here for the same
 * reason ("Enable validation of the other attribute",
 * `CategoricalBinPrompts/PromptFields.tsx`).
 */
describe('the rules the follow-up bin’s answers have to satisfy', () => {
  const openWithFollowUpBin = () => ({
    stage: {
      type: 'CategoricalBin' as const,
      fields: {
        label: 'Categorical Bin',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          {
            id: 'prompt-a',
            text: 'What kind of contact?',
            variable: 'contactType',
            otherVariable: 'relationship_to_ego',
            otherOptionLabel: 'Other',
            otherVariablePrompt: 'Which?',
          },
        ],
      },
    },
    sections: <CategoricalBinPromptsSection />,
  });

  const openFollowUpBin = async (harness: StageEditorHarness) => {
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'A bin for anything else' }),
      ).toBeChecked(),
    );
  };

  it('saves a rule for the attribute the answers are stored in', async () => {
    const harness = renderStageEditor(openWithFollowUpBin());
    const submit = vi.spyOn(harness.host, 'submit');

    await openFollowUpBin(harness);
    await harness.user.click(
      screen.getByRole('button', {
        name: 'Set rules for what the participant types',
      }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Edit validation for relationship_to_ego',
      }),
    ).toBeInTheDocument();
    await harness.user.click(
      screen.getByRole('checkbox', { name: 'Required' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save validation' }),
    );

    // One compound edit, against the codebook section the attribute lives in.
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]?.[0]?.edits[0]?.sectionId).toBe(
      'codebook:node:person',
    );
    await waitFor(() =>
      expect(personVariables(harness).relationship_to_ego).toMatchObject({
        validation: { required: true },
      }),
    );
  });

  /**
   * There is nothing to edit about a text attribute's VALUES — it has none —
   * so the values control this picker offers everywhere else is not offered
   * here. It used to be named and never rendered, which read like a control a
   * researcher could not find.
   */
  it('offers no values control for an attribute that has no values', async () => {
    const harness = renderStageEditor(openWithFollowUpBin());

    await openFollowUpBin(harness);

    expect(
      screen.getByRole('button', { name: "Change this attribute's values" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit this attribute' }),
    ).not.toBeInTheDocument();
  });
});

/**
 * How many bins the participant is shown, which is not how many values the
 * attribute has: the follow-up bin is a bin too.
 *
 * Ported from Architect's `CategoricalBinPrompts/PromptFields.tsx`, which
 * counts `currentVariableOptions.length + (currentOtherVariable ? 1 : 0)`
 * against the same eight.
 */
describe('a categorical bin with more bins than fit on one screen', () => {
  const WARNING = 'More bins than fit on one screen';

  /** Opens the prompt with `count` values in the codebook, and reads the alert. */
  async function warnsWith(count: number, followUpBin: boolean) {
    const harness = renderStageEditor({
      stage: {
        type: 'CategoricalBin',
        fields: {
          label: 'Categorical Bin',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'prompt-a',
              text: 'What kind of contact?',
              variable: 'contactType',
              ...(followUpBin
                ? {
                    otherVariable: 'relationship_to_ego',
                    otherOptionLabel: 'Other',
                    otherVariablePrompt: 'Which?',
                  }
                : {}),
            },
          ],
        },
      },
      sections: <CategoricalBinPromptsSection />,
    });
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...personDocument(harness),
          variables: {
            ...personVariables(harness),
            contactType: {
              name: 'contactType',
              type: 'categorical',
              options: Array.from({ length: count }, (_unused, index) => ({
                label: `Option ${index + 1}`,
                value: `option_${index + 1}`,
              })),
            },
          },
        },
      },
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    if (followUpBin) {
      await waitFor(() =>
        expect(
          screen.getByRole('switch', { name: 'A bin for anything else' }),
        ).toBeChecked(),
      );
    }
    return screen.queryByText(WARNING) !== null;
  }

  it('warns about nine values on their own', async () => {
    expect(await warnsWith(9, false)).toBe(true);
  });

  /**
   * The bin the follow-up question fills is drawn on the same screen as the
   * rest, so eight values and a follow-up bin is nine bins — which is what
   * the warning's own words already promise to count.
   */
  it('warns about eight values and a follow-up bin', async () => {
    expect(await warnsWith(8, true)).toBe(true);
  });

  /** And says nothing about the eight bins the interface is designed for. */
  it('says nothing about eight values on their own', async () => {
    expect(await warnsWith(8, false)).toBe(false);
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
