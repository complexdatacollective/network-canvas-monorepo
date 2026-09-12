import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../../__tests__/writeInto.ts';
import CategoricalBinPromptsSection from '../CategoricalBinPromptsSection.tsx';

const openSection = () => ({
  stageId: 'categorical-bin-1' as const,
  sections: <CategoricalBinPromptsSection />,
});

/** The same section over a stage built for the case, rather than the fixture's. */
const openStage = (fields: Record<string, unknown>) => ({
  stage: { type: 'CategoricalBin' as const, fields },
  sections: <CategoricalBinPromptsSection />,
});

const binningPeople = (prompt: Record<string, unknown>) =>
  openStage({
    label: 'Categorical Bin',
    subject: { entity: 'node', type: 'person' },
    prompts: [prompt],
  });

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the questions a categorical bin asks', () => {
  it('offers only the categorical attributes of the type the stage is about', async () => {
    const harness = renderStageEditor(openSection());

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

  /**
   * A stage whose STORED subject names the wrong part of the network.
   *
   * This interface is node-based — the schema pins its subject to
   * `NodeStageSubjectSchema`, and the subject section offers node types alone
   * — so a subject saying `edge` is something only a tolerant import or a
   * half-written draft can hold. Read as written, it would point the picker
   * and the codebook edits behind it at a connection type's codebook, and the
   * researcher would be binning people by an attribute their connections
   * carry.
   */
  it('reads only the TYPE of a subject that says it is a connection', async () => {
    const harness = renderStageEditor(
      openStage({
        label: 'Categorical Bin',
        subject: { entity: 'edge', type: 'knows' },
        prompts: [{ id: 'prompt-a', text: 'What kind of contact?' }],
      }),
    );
    // An attribute the connection type has and nothing else claims, so what
    // the picker would offer if it read the stored entity is on the table.
    harness.receiveCodebookUpdate({
      edge: {
        knows: {
          name: 'knows',
          color: 'edge-color-seq-2',
          variables: {
            contactStyle: {
              name: 'contactStyle',
              type: 'categorical',
              options: [
                { label: 'In person', value: 'person' },
                { label: 'Online', value: 'online' },
              ],
            },
          },
        },
      },
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );

    // Nothing to bin by, said in the family's own words — rather than the
    // connection type's `contactStyle`, which is what reading the stored
    // entity would have put on offer.
    const dialog = within(await screen.findByRole('dialog'));
    expect(
      await dialog.findByText(
        'This type has no categorical attributes yet. Create one to say what the bins are.',
      ),
    ).toBeInTheDocument();
    expect(dialog.queryByRole('combobox', { name: 'Attribute' })).toBeNull();
    expect(dialog.queryByText('contactStyle')).toBeNull();
  });

  it('refuses a prompt that names no attribute, and says which one', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
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

  /**
   * The schema's own rule about the follow-up bin is that a prompt carries all
   * three of the fields describing it or none of them, so a prompt that never
   * switched the group on has to reach the stage carrying none.
   */
  it('leaves the follow-up bin out of a prompt that does not use one', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
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

  /** A prompt with no bins has nothing for a follow-up bin to be beside. */
  it('withholds the follow-up bin until the bins are chosen', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    expect(
      screen.getByRole('switch', { name: 'Follow-up other option' }),
    ).toBeDisabled();

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Attribute' }),
      'contactType',
    );

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Follow-up other option' }),
      ).toBeEnabled(),
    );
  });

  /**
   * A group the researcher already used opens switched on, holding what they
   * put in it.
   *
   * The other direction — a group that cannot be switched on until the bins
   * are chosen — is the test above, and it is the direction that fails loudly.
   * This one fails silently: a follow-up bin that opened switched off would
   * look exactly like a prompt that never had one, and closing a `Section`
   * clears the fields inside it, so a researcher who opened the prompt to
   * change its wording and pressed Save would lose the bin, its label and its
   * question without being told.
   */
  it('opens a prompt’s follow-up bin switched on, holding what it was saved with', async () => {
    const harness = renderStageEditor(
      binningPeople({
        id: 'prompt-a',
        text: 'What kind of contact?',
        variable: 'contactType',
        otherVariable: 'relationship_to_ego',
        otherOptionLabel: 'Other',
        otherVariablePrompt: 'Which?',
      }),
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('dialog');

    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Follow-up other option' }),
      ).toBeChecked(),
    );
    expect(
      screen.getByRole('combobox', {
        name: 'Other attribute',
      }),
    ).toHaveValue('relationship_to_ego');
    expect(
      screen.getByRole('textbox', { name: 'Other bin label' }),
    ).toHaveTextContent('Other');
    expect(
      screen.getByRole('textbox', { name: 'Follow-up question' }),
    ).toHaveTextContent('Which?');
  });

  /**
   * And switching it back off takes all three of its fields with it.
   *
   * The schema holds the three as one variant: a prompt carries the follow-up
   * attribute, its bin label and its question, or none of them — half of each
   * is a prompt it refuses. Saving a row MERGES what the dialog collected over
   * the row it opened on, so a field the closed group merely stopped
   * rendering would keep its old value through that merge and leave a prompt
   * naming a bin the researcher had just taken away.
   */
  it('drops the follow-up bin’s three fields together when it is switched off', async () => {
    const harness = renderStageEditor(
      binningPeople({
        id: 'prompt-a',
        text: 'What kind of contact?',
        variable: 'contactType',
        otherVariable: 'relationship_to_ego',
        otherOptionLabel: 'Other',
        otherVariablePrompt: 'Which?',
      }),
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('dialog');
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Follow-up other option' }),
      ).toBeChecked(),
    );

    await harness.user.click(
      screen.getByRole('switch', { name: 'Follow-up other option' }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {}).at(0)).toEqual({
      id: 'prompt-a',
      text: 'What kind of contact?',
      variable: 'contactType',
    });
  });
});

/**
 * The rules the follow-up answer has to satisfy belong to the attribute it is
 * stored in, and are reached from the control that picked that attribute.
 *
 * This bin is the one place in the interface where the participant TYPES an
 * answer, so those rules are all that stand between them and an answer the
 * study cannot use. Architect mounts a validation section here for the same
 * reason.
 *
 * It is also the one prompt in the package binding TWO attributes in one row,
 * so it is what proves the shared controls follow the field they were given
 * rather than the row's `variable`: the editor opened from the follow-up bin
 * has to be about the follow-up attribute.
 */
describe('the attribute the follow-up bin’s answers are stored in', () => {
  const openFollowUp = async (harness: StageEditorHarness): Promise<void> => {
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('dialog');
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Follow-up other option' }),
      ).toBeChecked(),
    );
  };

  const followUpGroup = (): HTMLElement =>
    screen.getByRole('region', { name: 'Follow-up other option' });

  it('opens its rules rather than the bins’ own', async () => {
    const harness = renderStageEditor(
      binningPeople({
        id: 'prompt-a',
        text: 'What kind of contact?',
        variable: 'contactType',
        otherVariable: 'relationship_to_ego',
        otherOptionLabel: 'Other',
        otherVariablePrompt: 'Which?',
      }),
    );
    await openFollowUp(harness);

    await harness.user.click(
      within(followUpGroup()).getByRole('button', {
        name: 'Set rules for this answer',
      }),
    );

    // The attribute the editor opened on is the FOLLOW-UP's, not the bins':
    // both controls are in the same row, and only the field each was given
    // tells them apart. The editor says which one it is about in its own
    // heading, which is the researcher's evidence too.
    expect(
      await screen.findByRole('heading', {
        name: 'Edit validation for relationship_to_ego',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Edit validation for contactType',
      }),
    ).toBeNull();
  });

  /**
   * And no values control, because a text attribute has no values: what the
   * participant types is the answer.
   */
  it('offers no values control for an attribute that has no values', async () => {
    const harness = renderStageEditor(
      binningPeople({
        id: 'prompt-a',
        text: 'What kind of contact?',
        variable: 'contactType',
        otherVariable: 'relationship_to_ego',
        otherOptionLabel: 'Other',
        otherVariablePrompt: 'Which?',
      }),
    );
    await openFollowUp(harness);

    const group = within(followUpGroup());
    expect(
      group.getByRole('button', { name: 'Set rules for this answer' }),
    ).toBeInTheDocument();
    expect(
      group.queryByRole('button', { name: 'Change this attribute’s values' }),
    ).toBeNull();
  });

  /**
   * And the bins' own attribute is offered no rules at all.
   *
   * A bin is filled by dragging, which writes the attribute as it stands
   * without asking the participant anything a form could check — the schema
   * says so by declaring that reference `unvalidatedAttribute`, and its writer
   * exclusivity then keeps a form elsewhere from collecting the same
   * attribute. Rules authored there would never run, so offering them under a
   * button reading "for this answer" would promise a check nothing performs.
   * Architect offers them on the follow-up alone, for the same reason.
   */
  it('offers no rules on the attribute the bins are, only on the typed answer', async () => {
    const harness = renderStageEditor(
      binningPeople({
        id: 'prompt-a',
        text: 'What kind of contact?',
        variable: 'contactType',
        otherVariable: 'relationship_to_ego',
        otherOptionLabel: 'Other',
        otherVariablePrompt: 'Which?',
      }),
    );
    await openFollowUp(harness);

    const bins = within(
      screen.getByRole('region', { name: 'Categorical response' }),
    );
    // The values behind the bins stay editable: those the interview does read.
    expect(
      bins.getByRole('button', { name: 'Change this attribute’s values' }),
    ).toBeInTheDocument();
    expect(
      bins.queryByRole('button', { name: 'Set rules for this answer' }),
    ).toBeNull();
    // Both attributes are picked in this one dialog, so counting is what says
    // the remaining control belongs to the follow-up rather than to the bins.
    expect(
      within(screen.getByRole('dialog')).getAllByRole('button', {
        name: 'Set rules for this answer',
      }),
    ).toHaveLength(1);
  });
});

/**
 * A bin prompt naming an attribute this interface cannot draw as bins, or one
 * whose follow-up answer cannot be typed into, is refused rather than saved.
 *
 * The picker keeps a stored pick on offer so reopening a prompt never loses
 * it, and all it can say of one it was not given is that it is not available
 * here. This is the other half: the save that would otherwise commit it, in
 * words that say what has to change.
 */
describe('a categorical bin prompt whose attributes are not the kind it needs', () => {
  it('refuses a prompt binned by an attribute with no named values', async () => {
    const harness = renderStageEditor(
      binningPeople({
        id: 'prompt-a',
        text: 'What kind of contact?',
        // Ordinal: its values run in an order this interface does not draw.
        variable: 'contactFreq',
      }),
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'The attribute whose values become the bins is no longer available on this type. Choose another one.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * The bins are asked about first: with no attribute behind them the
   * follow-up is a bin added to a set that does not exist, and a sentence
   * about where its answers are stored would say nothing the researcher can
   * act on yet.
   */
  it('refuses a follow-up bin the participant could not type into, once the bins are sound', async () => {
    const harness = renderStageEditor(
      binningPeople({
        id: 'prompt-a',
        text: 'What kind of contact?',
        variable: 'contactType',
        // A number, which the follow-up input cannot collect free text into.
        otherVariable: 'age',
        otherOptionLabel: 'Other',
        otherVariablePrompt: 'Which?',
      }),
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('dialog');
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        "The attribute this bin's answers are stored in is no longer available on this type. Choose another one.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

/**
 * A bin prompt whose attribute offers more values than the interview screen
 * can draw.
 */
describe('a categorical bin with more bins than fit on one screen', () => {
  const WARNING = 'More bins than fit on one screen';

  /** Opens a prompt over an attribute with `count` values, and reads the alert. */
  async function warnsWith(count: number, followUpBin: boolean) {
    const harness = renderStageEditor(
      openStage({
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
      }),
    );
    const person = harness.hostCodebook().node?.person;
    if (person === undefined) throw new Error('the fixture has no person type');
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...person,
          variables: {
            ...person.variables,
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
          screen.getByRole('switch', { name: 'Follow-up other option' }),
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
   * rest, so eight values and a follow-up bin is nine bins — which is what the
   * warning's own words already promise to count.
   */
  it('warns about eight values and a follow-up bin', async () => {
    expect(await warnsWith(8, true)).toBe(true);
  });

  /** And says nothing about the eight bins the interface is designed for. */
  it('says nothing about eight values on their own', async () => {
    expect(await warnsWith(8, false)).toBe(false);
  });
});

/**
 * A prompt binned by an attribute whose values another interface owns.
 *
 * The interview and the genetics engine branch on those exact values, so the
 * list belongs to that interface however the attribute is reached — but
 * binning family members by their sex is legitimate authoring, so the
 * attribute stays on offer and only its values are fixed.
 */
describe('a prompt whose attribute’s values an interface owns', () => {
  /** The canonical set the pedigree schema fixes, written out. */
  const BIOLOGICAL_SEX_OPTIONS = [
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
    {
      value: 'intersex',
      label: 'Intersex or a variation in sex characteristics',
    },
    { value: 'unknown', label: 'Don’t know' },
    { value: 'preferNotToSay', label: 'Prefer not to say' },
  ] as const;

  /** The sentence over the read-only list, which names its table. */
  const LOCKED_VALUES =
    'These values are set by the interface that uses this attribute, so they cannot be changed here.';

  /** The label/value pairs one read-only list shows, in the order it shows them. */
  const lockedRows = (table: HTMLElement): string[][] =>
    within(table)
      .getAllByRole('row')
      .map((row) =>
        within(row)
          .queryAllByRole('cell')
          .map((cell) => cell.textContent ?? ''),
      )
      .filter((cells) => cells.length > 0);

  it('shows the values the prompt will offer, not only the reason they are fixed', async () => {
    const harness = renderStageEditor(
      openStage({
        label: 'Categorical Bin',
        // The type the pedigree describes, which is where the claim is made.
        subject: { entity: 'node', type: 'family_member' },
        prompts: [
          {
            id: 'prompt-a',
            text: 'Which of these are they?',
            variable: 'biologicalSex',
          },
        ],
      }),
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );

    // The bins themselves: a researcher who cannot read them cannot tell what
    // this prompt asks, and the explanation alone says only that they are not
    // theirs to change.
    const locked = await screen.findByRole('table', { name: LOCKED_VALUES });
    expect(lockedRows(locked)).toEqual(
      BIOLOGICAL_SEX_OPTIONS.map(({ label, value }) => [label, value]),
    );
    // And still read-only: the list is shown INSTEAD of the control that would
    // edit it, rather than beside it.
    expect(
      screen.queryByRole('button', { name: 'Change this attribute’s values' }),
    ).not.toBeInTheDocument();
  });
});
