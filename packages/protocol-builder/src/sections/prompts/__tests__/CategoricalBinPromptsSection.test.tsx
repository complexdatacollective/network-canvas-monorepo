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

/** A prompt whose follow-up bin is already in use, so every control is on. */
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
  await harness.user.click(screen.getByRole('button', { name: 'Edit prompt' }));
  await waitFor(() =>
    expect(
      screen.getByRole('switch', { name: 'A bin for anything else' }),
    ).toBeChecked(),
  );
};

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
      'Who most?',
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
      'Who most?',
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
      text: 'Who most?',
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
 * so writing one from inside a prompt is a compound edit against the codebook
 * — landing whole or not at all — after which the prompt points at it as an
 * ordinary unsaved change.
 */
describe('writing the codebook from inside a bin prompt', () => {
  /**
   * This is the codebook half of the journey and stops where the codebook
   * does. That the prompt naming the new attribute then reaches the STAGE save
   * is `CategoricalBinStageEditor.test.tsx`'s, over the whole editor, which is
   * where a save belongs; running it here too paid for a second commit and a
   * second save to answer the same question.
   */
  it('asks the host once, and points the prompt at what it created', async () => {
    const harness = renderStageEditor(openEditor());
    const submit = vi.spyOn(harness.host, 'submit');

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create a new attribute' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
      'howKnown',
    );
    await addOption(harness, 1, 'Work', 'work');
    await addOption(harness, 2, 'Home', 'home');
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

    // And the prompt is pointing at it, rather than at whatever it held
    // before — the researcher does not have to find it in the list.
    expect(picker).not.toHaveValue('');
    expect(
      within(picker).getByRole('option', { selected: true }),
    ).toHaveTextContent('howKnown');
    expect(harness.pendingCommands()).toEqual([]);
  });

  /**
   * The refusal is asked of the values editor rather than of a whole new
   * attribute: both send the same kind of compound edit, and the values editor
   * opens on an attribute the fixture already has, so the change that gets
   * refused is a removed option rather than a name and two values typed in.
   */
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

    // The package's own words about the refusal, never the host's: the
    // sentence a host sends is about a path in a protocol document, and the
    // researcher was editing an attribute.
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

/** How many dialogs are stacked on screen right now. */
const openDialogs = () => screen.queryAllByRole('dialog').length;

/**
 * A codebook dialog opened from inside a prompt is a form INSIDE the prompt's
 * form, so saving it would submit the prompt around it: the row would close,
 * and close carrying whatever the researcher had half-written in it.
 *
 * What stops that is not this family's doing. It is the `stopPropagation` each
 * nested codebook editor puts on its own submit — `VariableEditor`,
 * `CodebookVariableValidationEditor` and `CodebookEntityEditor` — so these
 * cases are the ones that say that fix is still in place. Three of them, plus
 * a fourth in `TieStrengthCensusPromptsSection.test.tsx`, are what would fail
 * again if a nested editor ever let its submit escape.
 */
describe('a codebook dialog saved from inside a prompt', () => {
  it('leaves the prompt open when the attribute’s values are saved', async () => {
    const harness = renderStageEditor(openWithFollowUpBin());

    await openFollowUpBin(harness);
    expect(openDialogs()).toBe(1);

    await harness.user.click(
      screen.getByRole('button', { name: "Change this attribute's values" }),
    );
    const attributeName = await screen.findByRole('textbox', {
      name: 'Attribute name',
    });
    expect(openDialogs()).toBe(2);
    await harness.user.clear(attributeName);
    await harness.user.type(attributeName, 'renamedAttribute');
    await harness.user.click(
      screen.getByRole('button', { name: 'Save attribute' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Attribute name' }),
      ).not.toBeInTheDocument(),
    );

    expect(openDialogs()).toBe(1);
  });

  it('leaves the prompt open when the attribute’s rules are saved', async () => {
    const harness = renderStageEditor(openWithFollowUpBin());

    await openFollowUpBin(harness);
    expect(openDialogs()).toBe(1);

    await harness.user.click(
      screen.getByRole('button', {
        name: 'Set rules for what the participant types',
      }),
    );
    await screen.findByRole('button', { name: 'Save validation' });
    expect(openDialogs()).toBe(2);

    await harness.user.click(
      screen.getByRole('checkbox', { name: 'Required' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save validation' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save validation' }),
      ).not.toBeInTheDocument(),
    );

    expect(openDialogs()).toBe(1);
  });

  /**
   * And the row would not merely be closed — it would be COMMITTED, with
   * whatever the researcher had half-typed in it, by a submit they never asked
   * for.
   *
   * Read from the stage the host is asked to save rather than from the list
   * behind the dialog: an open row dialog holds the row it is editing, so
   * there is nothing in that list to read while the question is being asked.
   * The half-written prompt is abandoned the way a researcher abandons one —
   * the dialog's own Cancel — and a save that had already swallowed it would
   * carry it through anyway.
   */
  it('leaves a half-written prompt uncommitted', async () => {
    const harness = renderStageEditor(openWithFollowUpBin());

    await openFollowUpBin(harness);
    const promptText = screen.getByRole('textbox', { name: 'Prompt text' });
    await harness.user.clear(promptText);
    await harness.user.type(promptText, 'Half finished');

    await harness.user.click(
      screen.getByRole('button', {
        name: 'Set rules for what the participant types',
      }),
    );
    await screen.findByRole('button', { name: 'Save validation' });
    await harness.user.click(
      screen.getByRole('checkbox', { name: 'Required' }),
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save validation' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save validation' }),
      ).not.toBeInTheDocument(),
    );

    // The prompt is still open, and still holds the half-written change — it
    // asks before throwing one away.
    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await waitFor(() => expect(openDialogs()).toBe(0));

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})).toHaveLength(1);
    expect(prompts(request?.stageDocument ?? {})[0]).toMatchObject({
      id: 'prompt-a',
      text: 'What kind of contact?',
    });
  });
});

/**
 * An attribute a sort rule names is not the attribute the bins come from, and
 * it can be deleted without this prompt noticing: `SortRuleSchema.property` is
 * `existence: 'unchecked'`, so the protocol keeps such a rule rather than
 * making a collaborator's stage unopenable.
 *
 * Both of this prompt's orders come from the shared `SortOrderRows`, which is
 * where the handling lives so that every family holding a sort order says the
 * same thing. What this case proves is that this family reaches it — the
 * committed rules are handed over, so the orphan is found and the save refused
 * rather than writing the dangling reference straight back.
 */
describe('a bin sort rule whose attribute the codebook has lost', () => {
  /**
   * `nickname` is an attribute the person type in the fixture protocol does
   * not have, so a rule naming it is exactly the state a deletion leaves.
   */
  const MISSING_ATTRIBUTE = 'nickname';

  /**
   * How `SortOrderRows` labels it. Written out rather than imported, as the
   * refusal below is: a test reading the same helper as the component would
   * still pass if the label said nothing a researcher could act on.
   */
  const MISSING_ATTRIBUTE_OPTION = `${MISSING_ATTRIBUTE} — this attribute is no longer in the codebook`;

  const MISSING_ATTRIBUTE_MESSAGE =
    'This rule points at an attribute no longer in the codebook. Choose another or delete the rule.';

  const openWithADanglingSortRule = () => ({
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
            binSortOrder: [{ property: MISSING_ATTRIBUTE, direction: 'asc' }],
          },
        ],
      },
    },
    sections: <CategoricalBinPromptsSection />,
  });

  it('shows the rule disabled, and refuses to save it', async () => {
    const harness = renderStageEditor(openWithADanglingSortRule());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );

    // The cell renders from the option list, so an id no option carries would
    // leave the control blank while the value behind it stayed saved.
    const property = await screen.findByRole('combobox', { name: 'Property' });
    expect(property).toHaveValue(MISSING_ATTRIBUTE);
    expect(
      within(property).getByRole('option', { name: MISSING_ATTRIBUTE_OPTION }),
    ).toBeDisabled();

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    // Not "every row needs a value in each column": the row HAS a value in
    // each column, and the researcher told to fill one in has nothing to do.
    expect(
      await screen.findByText(MISSING_ATTRIBUTE_MESSAGE),
    ).toBeInTheDocument();
    expect(openDialogs()).toBe(1);
  });
});

/**
 * Every control in this prompt that writes the CODEBOOK, which is a different
 * protocol section from the stage and is written by a compound edit of its
 * own — so a disabled stage save says nothing about them.
 *
 * All four are `PromptAttributeField`'s: two on the attribute the bins come
 * from, two on the attribute the follow-up bin stores.
 */
const CODEBOOK_CONTROLS = [
  'Create a new attribute',
  "Change this attribute's values",
  'Create a new text attribute',
  'Set rules for what the participant types',
] as const;

/**
 * Editing taken away while a prompt is OPEN, which is the only way a read-only
 * session ever sees the inside of one.
 *
 * A spectator cannot open a prompt at all, so the controls above are absent
 * for them however this guard is written — and were once asserted that way,
 * which proved nothing. Losing the lease mid-prompt is the case that can tell
 * the two apart.
 */
describe('a bin prompt open when editing is taken away', () => {
  it('takes every codebook control out of it', async () => {
    const harness = renderStageEditor(openWithFollowUpBin());

    await openFollowUpBin(harness);
    for (const name of CODEBOOK_CONTROLS) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }

    harness.setReadOnly();

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: CODEBOOK_CONTROLS[0] }),
      ).not.toBeInTheDocument(),
    );
    for (const name of CODEBOOK_CONTROLS) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    // Still open and still readable: the prompt is not torn down, only the
    // controls that would write another section of the protocol.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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

/**
 * Adds one option to the attribute editor that is open.
 *
 * The value is typed rather than cleared first: a new option's value starts
 * empty, and the attribute is refused without one.
 */
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
  await harness.user.type(
    screen.getByRole('textbox', { name: `Option ${position} value` }),
    value,
  );
}
