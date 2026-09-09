import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { contentHash } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { FIXTURE_SESSION_OWNER } from '../../testing/fixtureSession.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import FormFieldsSection from '../FormFieldsSection.tsx';

/**
 * A form-field row's codebook side-effects, and everything that can move
 * underneath one.
 *
 * A row makes exactly two codebook writes — inventing the attribute it
 * collects, and recording which input control that attribute is collected with
 * — and both are round trips through the host that reach the WHOLE protocol:
 * an input control belongs to the attribute, so it is how that attribute is
 * asked for in every form that collects it. Each write is decided from a
 * snapshot (the stage's subject, the row's binding, the dialog's own value)
 * that a collaborator's authoritative update, or the row's own re-seat, may
 * have moved by the time the host answers.
 *
 * The machine, which is what this file enumerates:
 *
 *   row       × bound to A · rebound to B by a collaborator · rebound to the
 *               create sentinel by the researcher · removed · re-seated by the
 *               list (`reseatEditedRow`)
 *   dialog    × closed · open showing A · open with a create pending · open
 *               with a control write pending
 *   subject   × unchanged · repointed at another type
 *   lease     × held · lost
 *   answer    × applied · refused · thrown
 *
 * Events: the researcher changes the control, picks another attribute, asks
 * for one to be invented, saves, or cancels; a collaborator rebinds the row,
 * repoints the subject, removes the row, or deletes the bound attribute; the
 * host answers; the lease goes.
 *
 * Two rules hold it together, and both are asserted below.
 *
 * The row's picker follows the row until the researcher answers it
 * (`useAttributeThatFollowsTheRow`), so what the dialog shows is what the save
 * will commit — the dialog can never be writing a control for an attribute the
 * row stopped collecting while it was open.
 *
 * And every codebook write reads where its answer lands when it ARRIVES
 * (`useWhereTheAnswerLands`), because the row can move inside the round trip
 * itself. The write is never undone — it landed where it was addressed — but
 * the row is not committed over it, and what happened is said.
 *
 * The invariants, which the property runs at the bottom assert over every
 * interleaving they can reach:
 *
 *  (a) a codebook write lands only on an attribute the committed row collects;
 *  (b) the saved row's attribute and the attribute whose control was written
 *      are the same attribute;
 *  (c) one press makes at most one codebook write;
 *  (d) after the lease goes, nothing is written and the dialog says so;
 *  (e) a write nothing took is reported rather than swallowed.
 */

vi.mock('../../fields/RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

type Harness = ReturnType<typeof renderStageEditor>;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const CREATE_NEW_ATTRIBUTE = '#create-new-attribute';

const codebookOf = (harness: Harness, typeId: string) =>
  asRecord(
    harness.host.getSnapshot().protocolSections[
      sectionId({ kind: 'codebookNode', typeId })
    ],
  );

const personVariables = (harness: Harness) =>
  asRecord(codebookOf(harness, 'person').variables);

/** Every attribute of every type this stage can be pointed at, by control. */
const controlsHeld = (harness: Harness): Record<string, unknown> =>
  Object.fromEntries(
    ['person', 'family_member'].flatMap((typeId) =>
      Object.entries(asRecord(codebookOf(harness, typeId).variables)).map(
        ([id, variable]) => [id, asRecord(variable).component],
      ),
    ),
  );

/** The fields the session would save, which is what a row commits into. */
const committedFields = (harness: Harness): Record<string, unknown>[] => {
  const fields = asRecord(
    asRecord(harness.session.getSnapshot().editedSection.fields).form,
  ).fields;
  return Array.isArray(fields) ? fields.map(asRecord) : [];
};

/** A spare text attribute collected with a plain box. */
const SPARE_TEXT = 'seeded-spare-text';
/** A spare text attribute collected the OTHER way, so a write is visible. */
const SPARE_AREA = 'seeded-spare-area';

const seedSpareAttributes = (harness: Harness) => {
  harness.receiveCodebookUpdate({
    node: {
      person: {
        ...codebookOf(harness, 'person'),
        variables: {
          ...personVariables(harness),
          [SPARE_TEXT]: { name: 'nickname', type: 'text', component: 'Text' },
          [SPARE_AREA]: { name: 'notes', type: 'text', component: 'TextArea' },
        },
      },
      family_member: {
        ...codebookOf(harness, 'family_member'),
        variables: {
          ...asRecord(codebookOf(harness, 'family_member').variables),
          fm_notes: { name: 'fm_notes', type: 'text', component: 'Text' },
        },
      },
    },
  });
};

/** One stage edit made somewhere else, told to this session as authoritative. */
const collaboratorStageEdit = (
  harness: Harness,
  description: string,
  changes: Readonly<Record<string, unknown>>,
) => {
  const stageSection = sectionId({ kind: 'stage', stageId: harness.seeded.id });
  const sections = harness.host.getSnapshot().protocolSections;
  const result = harness.host.submit({
    id: `collaborator-${Object.keys(changes).join('-')}`,
    description,
    edits: [
      {
        kind: 'update',
        sectionId: stageSection,
        expectedContentHash: contentHash(sections[stageSection] ?? {}),
        commands: Object.entries(changes).map(([key, value]) => ({
          op: 'set' as const,
          key,
          value,
        })),
      },
    ],
    authority: {
      sectionId: stageSection,
      leaseOwner: FIXTURE_SESSION_OWNER,
      leaseEpoch: 1n,
    },
  });
  if (result.status !== 'applied') {
    throw new Error(`${description} did not apply: ${JSON.stringify(result)}`);
  }
  const { protocolSections, manifestRevision } = harness.host.getSnapshot();
  const stageDocument = asRecord(protocolSections[stageSection]);
  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections,
      manifestRevision,
    });
    harness.session.acknowledge({
      // Which stage this is belongs to the session, not to a draft.
      fields: Object.fromEntries(
        Object.entries(stageDocument).filter(
          ([key]) => key !== 'id' && key !== 'type',
        ),
      ),
      throughBatchId: 0,
      manifestRevision,
    });
  });
};

const stageForm = (harness: Harness): Record<string, unknown> => {
  const stageSection = sectionId({ kind: 'stage', stageId: harness.seeded.id });
  return asRecord(
    asRecord(harness.host.getSnapshot().protocolSections[stageSection]).form,
  );
};

const stageFields = (harness: Harness): Record<string, unknown>[] => {
  const fields = stageForm(harness).fields;
  return Array.isArray(fields) ? fields.map(asRecord) : [];
};

/** A collaborator points the row at another attribute. */
const rebindTheRow = (harness: Harness, variableId: string) => {
  const fields = stageFields(harness);
  fields[0] = { ...fields[0], variable: variableId };
  collaboratorStageEdit(
    harness,
    'Collect a different attribute, from another session',
    { form: { ...stageForm(harness), fields } },
  );
};

/** A collaborator takes the row out of the form. */
const removeTheRow = (harness: Harness) => {
  collaboratorStageEdit(harness, 'Take the field out, from another session', {
    form: { ...stageForm(harness), fields: stageFields(harness).slice(1) },
  });
};

/**
 * A collaborator points the whole stage at another type, carrying its fields
 * with it — a host refuses a stage whose fields name attributes the type it
 * collects about does not have.
 */
const repointTheStage = (harness: Harness) => {
  collaboratorStageEdit(
    harness,
    'Collect about family members instead, from another session',
    {
      subject: { entity: 'node', type: 'family_member' },
      form: { fields: [{ variable: 'fm_notes', prompt: 'Anything else?' }] },
    },
  );
};

/** A collaborator deletes an attribute out of the person's codebook. */
const deleteTheAttribute = (harness: Harness, variableId: string) => {
  const { [variableId]: _gone, ...rest } = personVariables(harness);
  harness.receiveCodebookUpdate({
    node: { person: { ...codebookOf(harness, 'person'), variables: rest } },
  });
};

const loseTheLease = (harness: Harness) => {
  act(() => {
    harness.session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
  });
};

/**
 * Holds the compound edit open, and hands back the release.
 *
 * The round trip through the host is where the protocol underneath can move,
 * and holding it is the only way to put anything in that window.
 */
const holdTheCompoundEdit = (harness: Harness) => {
  const send = harness.session.requestCompoundEdit.bind(harness.session);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(harness.session, 'requestCompoundEdit').mockImplementation(
    async (request) => {
      await held;
      return send(request);
    },
  );
  return () => {
    release();
  };
};

const openField = async (harness: Harness, name: string, index = 0) => {
  const trigger = screen.getAllByRole('button', { name })[index];
  if (trigger === undefined) throw new Error(`There is no "${name}" ${index}.`);
  await harness.user.click(trigger);
  return within(await screen.findByRole('dialog'));
};

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const controlLandedElsewhere = (attributeName: string) =>
  `The input control for “${attributeName}” was changed, but this field no longer collects that attribute, so the field was not saved.`;

const CONTROL_LANDED_ELSEWHERE = controlLandedElsewhere('relationship_to_ego');

describe('a codebook write a form-field row makes', () => {
  /**
   * The round-9 claim, said as a test.
   *
   * A collaborator rebinds the open row from one attribute to another. The
   * dialog used to go on showing the first one while the list held the second,
   * so the researcher's answer to "how is this collected?" was made about an
   * attribute the row had stopped collecting — and the save wrote it there,
   * for every form in the protocol that collects it, while committing a row
   * that named the other.
   */
  it('changes the control of the attribute the saved row collects', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    seedSpareAttributes(harness);

    const dialog = await openField(harness, 'Edit field');
    rebindTheRow(harness, SPARE_TEXT);

    // The picker follows the row, so the researcher is answering about the
    // attribute the row now collects rather than about the one it left.
    await waitFor(() =>
      expect(dialog.getByRole('combobox', { name: 'Attribute' })).toHaveValue(
        SPARE_TEXT,
      ),
    );

    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Input control' }),
      'TextArea',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(committedFields(harness)[0]).toEqual({
      variable: SPARE_TEXT,
      prompt: "What is this person's relationship to you?",
    });
    expect(asRecord(personVariables(harness)[SPARE_TEXT]).component).toBe(
      'TextArea',
    );
    // And the attribute the row used to collect is exactly as the collaborator
    // left it: the write reaches every form that collects an attribute, so a
    // write made about the wrong one is a change to the whole protocol.
    expect(
      asRecord(personVariables(harness).relationship_to_ego).component,
    ).toBe('Text');
  });

  /**
   * The same rebind, arriving INSIDE the write.
   *
   * Here the dialog was right when the researcher pressed Save and the row
   * moved while the request was with the host. The write landed where it was
   * addressed and stands; what must not happen is the row being committed over
   * it, naming one attribute while the control was recorded for another.
   */
  it('does not commit a row whose attribute moved while the control was being written', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    seedSpareAttributes(harness);

    const dialog = await openField(harness, 'Edit field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Input control' }),
      'TextArea',
    );

    const release = holdTheCompoundEdit(harness);
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    rebindTheRow(harness, SPARE_TEXT);
    release();

    // The write landed, in the attribute it was addressed to...
    await waitFor(() =>
      expect(
        asRecord(personVariables(harness).relationship_to_ego).component,
      ).toBe('TextArea'),
    );
    // ...and the row was not committed over it, so the field and the control
    // written for it can never name two different attributes.
    expect(await dialog.findByText(CONTROL_LANDED_ELSEWHERE)).toBeVisible();
    // The row the session holds is the collaborator's, untouched by a save
    // that was refused: no field names the attribute the control was written
    // for, which is exactly why the save could not be taken.
    expect(committedFields(harness)[0]).toEqual({
      variable: SPARE_TEXT,
      prompt: "What is this person's relationship to you?",
    });
    expect(asRecord(personVariables(harness)[SPARE_TEXT]).component).toBe(
      'Text',
    );
  });

  /**
   * A refusal has to land where the researcher can read it.
   *
   * An attribute deleted inside the write refuses it — there is nothing left
   * to record a control against — and it also takes the input-control field
   * off the screen, because an attribute that is not there offers no controls.
   * Filed against that absent field, the refusal reached the researcher as a
   * dialog that would not close, nothing said, and a warning in the console.
   */
  it('says why a control write was refused when the control it was made in has gone', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    seedSpareAttributes(harness);

    const dialog = await openField(harness, 'Edit field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      SPARE_TEXT,
    );
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Input control' }),
      'TextArea',
    );

    const warned: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warned.push(args.map((arg) => String(arg)).join(' '));
    });
    const release = holdTheCompoundEdit(harness);
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    deleteTheAttribute(harness, SPARE_TEXT);
    release();

    // Above the fields, where a refusal about a whole draft belongs — and not
    // against the control field, which the deletion has taken off the screen.
    expect(
      await dialog.findByText(
        'Someone else changed this while you were editing it, so nothing was saved. Close and reopen this editor to load their version, then make your change again.',
      ),
    ).toBeVisible();
    expect(warned.filter((line) => line.includes('focusFirstError'))).toEqual(
      [],
    );
    expect(committedFields(harness)[0]?.variable).toBe('relationship_to_ego');
  });

  /**
   * The researcher's own answer wins, which is the other half of the rule.
   *
   * A picker they have answered is theirs, whatever arrives afterwards — the
   * same rule a contested leaf follows when the row is re-seated. Without it,
   * "follows the row" would be a control that overwrote a deliberate choice.
   */
  it('keeps the attribute the researcher chose when the row is rebound under it', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    seedSpareAttributes(harness);

    const dialog = await openField(harness, 'Edit field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      SPARE_AREA,
    );
    rebindTheRow(harness, SPARE_TEXT);

    expect(dialog.getByRole('combobox', { name: 'Attribute' })).toHaveValue(
      SPARE_AREA,
    );
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Input control' }),
      'Text',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(committedFields(harness)[0]?.variable).toBe(SPARE_AREA);
    expect(asRecord(personVariables(harness)[SPARE_AREA]).component).toBe(
      'Text',
    );
    expect(asRecord(personVariables(harness)[SPARE_TEXT]).component).toBe(
      'Text',
    );
  });

  /**
   * A rebind the researcher's save has nothing to say about.
   *
   * Following the row re-seats the control from the codebook too, so a save
   * that changes only the question writes no control at all — and a row whose
   * codebook write never happened is committed exactly as the merge composed
   * it, with nothing to refuse and nothing to report.
   */
  it('commits the arrival, and writes nothing, when the control was not touched', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    seedSpareAttributes(harness);
    const before = controlsHeld(harness);

    const dialog = await openField(harness, 'Edit field');
    rebindTheRow(harness, SPARE_AREA);
    const question = dialog.getByRole('textbox', { name: 'Question text' });
    await harness.user.clear(question);
    await harness.user.type(question, 'How do you know them?');
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(committedFields(harness)[0]).toEqual({
      variable: SPARE_AREA,
      prompt: 'How do you know them?',
    });
    expect(controlsHeld(harness)).toEqual(before);
  });

  /**
   * Inventing an attribute is the researcher's own answer to the same picker,
   * so nothing arriving for the row displaces it.
   *
   * The guard reads where the answer lands, and for a create the answer lands
   * in a picker the researcher has already answered — so a rebind inside the
   * write changes nothing about it, and the row takes the attribute it asked
   * for. Refusing here would be the same defect from the other side.
   */
  it('binds a row to the attribute it invented, even when the row was rebound inside the write', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormFieldsSection subject="node" />,
    });
    seedSpareAttributes(harness);

    const dialog = await openField(harness, 'Edit field');
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      CREATE_NEW_ATTRIBUTE,
    );
    await harness.user.type(
      await dialog.findByRole('textbox', { name: 'Attribute name' }),
      'callsign',
    );
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Kind of answer' }),
      'text',
    );

    const release = holdTheCompoundEdit(harness);
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    rebindTheRow(harness, SPARE_AREA);
    release();

    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );
    const created = Object.entries(personVariables(harness)).find(
      ([, variable]) => asRecord(variable).name === 'callsign',
    );
    expect(created).toBeDefined();
    expect(committedFields(harness)[0]?.variable).toBe(created?.[0]);
  });
});

// ------------------------------------------------------------ the machine

/** What the researcher answers the picker with. */
const PICKS = ['keep', 'another', 'invent'] as const;
/** What arrives from somewhere else while they are answering. */
const ARRIVALS = [
  'nothing',
  'rebind',
  'removeRow',
  'deleteAttribute',
  'repoint',
  'loseLease',
] as const;
/** Before the press, or inside the round trip it starts. */
const TIMINGS = ['beforeSave', 'inFlight'] as const;
/** Whether the researcher answers the control question too. */
const CONTROLS = ['keep', 'switch'] as const;

type Interleaving = Readonly<{
  pick: (typeof PICKS)[number];
  arrival: (typeof ARRIVALS)[number];
  timing: (typeof TIMINGS)[number];
  control: (typeof CONTROLS)[number];
}>;

/**
 * The machine's cross product, enumerated rather than sampled.
 *
 * A seed picks a row of this table by its number, so every combination is
 * reached the same number of times however many seeds are run — sampled at
 * random, the interleaving that carried round 9 (a rebind arriving before an
 * untouched picker's save) is one draw in fifty and a green run says nothing.
 */
const INTERLEAVINGS: readonly Interleaving[] = PICKS.flatMap((pick) =>
  ARRIVALS.flatMap((arrival) =>
    TIMINGS.flatMap((timing) =>
      CONTROLS.map((control) => ({ pick, arrival, timing, control })),
    ),
  ),
);

/** Three runs of every combination. */
const SEQUENCES = INTERLEAVINGS.length * 3;

/**
 * The seeds to run: all of them, or exactly the ones named in
 * `FORM_FIELD_WRITE_SEEDS` (`FORM_FIELD_WRITE_SEEDS=137,204`).
 *
 * A reported failure names one seed, and replaying just that seed is how it is
 * worked on — `-t 'seed 137'` would still mount the other 215.
 */
const seedsUnderTest = (): number[] => {
  const requested = process.env.FORM_FIELD_WRITE_SEEDS;
  if (requested === undefined || requested.trim() === '') {
    return Array.from({ length: SEQUENCES }, (_, index) => index + 1);
  }
  return requested.split(',').map((entry) => {
    const seed = Number(entry.trim());
    if (!Number.isInteger(seed)) {
      throw new Error(
        `FORM_FIELD_WRITE_SEEDS holds "${entry.trim()}", not a seed.`,
      );
    }
    return seed;
  });
};

const interleavingFor = (seed: number): Interleaving => {
  const chosen = INTERLEAVINGS[(seed - 1) % INTERLEAVINGS.length];
  if (chosen === undefined) throw new Error(`Seed ${seed} names no run.`);
  return chosen;
};

/**
 * Whether the dialog is saying anything at all about a save it would not take.
 *
 * Asked of the two shapes a refusal has — the whole draft's, which is an
 * `Alert`, and one field's, which sits under that field — rather than of any
 * particular sentence, so a boundary that grows a new reason still counts as
 * reported while one that grows a silent path does not.
 */
const dialogSaysWhy = (dialog: HTMLElement): boolean =>
  within(dialog).queryAllByRole('alert').length > 0 ||
  [...dialog.querySelectorAll('[data-testid$="-field-error"]')].some(
    (node) => (node.textContent ?? '').trim() !== '',
  );

/** The shared list's sentence for a row there is nothing left to save to. */
const ROW_REMOVED = 'was removed while your changes were being saved';

async function runInterleaving(seed: number): Promise<string[]> {
  const { pick, arrival, timing, control } = interleavingFor(seed);
  const failures: string[] = [];
  const note = (message: string) =>
    failures.push(
      `seed ${seed} (pick ${pick}, ${arrival} ${timing}, control ${control}): ${message}`,
    );

  // A refusal filed against a control that is not in the document says
  // nothing to anybody, and the only trace of it is this warning.
  const warnings: string[] = [];
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  });

  const harness = renderStageEditor({
    stageId: 'alter-form-1',
    sections: <FormFieldsSection subject="node" />,
  });
  seedSpareAttributes(harness);
  const dialog = await openField(harness, 'Edit field');
  // Something of the researcher's own in the row, so that "was this field
  // saved?" is a question about the committed list rather than about a save
  // that happened to write nothing into it. A control is not part of a row —
  // it belongs to the attribute — so without this, a run that only answered
  // the control question would leave a row indistinguishable from the one an
  // arrival replaced it with.
  const mark = `~${seed}`;
  await harness.user.type(
    dialog.getByRole('textbox', { name: 'Question text' }),
    mark,
  );

  const applyArrival = () => {
    if (arrival === 'rebind') rebindTheRow(harness, SPARE_AREA);
    if (arrival === 'removeRow') removeTheRow(harness);
    if (arrival === 'deleteAttribute') deleteTheAttribute(harness, SPARE_TEXT);
    if (arrival === 'repoint') repointTheStage(harness);
    if (arrival === 'loseLease') loseTheLease(harness);
  };

  if (pick === 'another') {
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      SPARE_TEXT,
    );
  }
  if (pick === 'invent') {
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      CREATE_NEW_ATTRIBUTE,
    );
    await harness.user.type(
      await dialog.findByRole('textbox', { name: 'Attribute name' }),
      `made${seed}`,
    );
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Kind of answer' }),
      'text',
    );
  }
  const controlField = dialog.queryByRole('combobox', {
    name: 'Input control',
  });
  if (control === 'switch' && controlField instanceof HTMLSelectElement) {
    const other = [...controlField.options]
      .map((option) => option.value)
      .find((value) => value !== controlField.value);
    if (other !== undefined) {
      await harness.user.selectOptions(controlField, other);
    }
  }

  if (timing === 'beforeSave') applyArrival();

  const before = controlsHeld(harness);
  const release = timing === 'inFlight' ? holdTheCompoundEdit(harness) : null;
  // Re-queried rather than pressed through the handle this run opened: an
  // arrival can take the editor off the screen and put another one up, and a
  // handle bound to the node that has gone would press a button in a document
  // fragment nothing is watching.
  const editor = screen.queryAllByRole('dialog')[0];
  const save =
    editor === undefined
      ? null
      : within(editor).queryByRole('button', { name: 'Save' });
  if (save !== null) await harness.user.click(save);
  if (release !== null) {
    applyArrival();
    release();
  }
  await settle();
  await settle();

  const after = controlsHeld(harness);
  const changed = Object.keys(after).filter(
    (id) => id in before && after[id] !== before[id],
  );
  const created = Object.keys(after).filter((id) => !(id in before));
  const written = [...changed, ...created];
  const open = screen.queryAllByRole('dialog')[0];
  const rows = committedFields(harness);
  const savedTheDraft = rows.some(
    (row) => typeof row.prompt === 'string' && row.prompt.endsWith(mark),
  );
  const collects = new Set(
    rows.flatMap((row) =>
      typeof row.variable === 'string' ? [row.variable] : [],
    ),
  );

  if (save === null && written.length > 0) {
    note(`wrote ${written.join(', ')} with no save control to press`);
  }
  // (c) One press, at most one codebook write.
  if (written.length > 1) {
    note(`one press wrote ${written.length} attributes: ${written.join(', ')}`);
  }
  // (d) A lease that has gone is a session that writes nothing, and says so.
  if (arrival === 'loseLease' && timing === 'beforeSave') {
    if (written.length > 0) {
      note(`wrote ${written.join(', ')} after the lease went`);
    }
    if (open === undefined) {
      note('closed the dialog over a save the lease had already refused');
    } else if (!dialogSaysWhy(open)) {
      note('refused the save after the lease went without saying anything');
    }
  }
  if (open === undefined) {
    // (a) and (b) A row committed beside a write must be the row that write
    // was made about.
    for (const id of written) {
      if (!collects.has(id)) {
        note(
          `committed rows collecting ${[...collects].join(', ')} beside a write to ${id}`,
        );
      }
    }
  } else {
    // (e) A write the row could not take is reported rather than swallowed.
    if (written.length > 0 && !dialogSaysWhy(open)) {
      note(
        `wrote ${written.join(', ')}, kept the dialog open, and said nothing`,
      );
    }
    // (e) And what is reported is true of the draft the researcher is looking
    // at: the control write that landed beside another attribute really did
    // land, and really was not taken.
    const said = within(open);
    if (said.queryByText(controlLandedElsewhere('relationship_to_ego'))) {
      if (!written.includes('relationship_to_ego')) {
        note(
          'said a control was written for “relationship_to_ego” when none was',
        );
      }
      if (savedTheDraft) note('said the field was not saved, and saved it');
    }
    if (said.queryByText(ROW_REMOVED, { exact: false })) {
      if (arrival !== 'removeRow' && arrival !== 'repoint') {
        note('said the field had been removed while it was still in the form');
      }
    }
  }

  for (const warning of warnings) {
    if (warning.includes('focusFirstError')) {
      note(
        `filed a refusal against a control that is not on screen: ${warning}`,
      );
    }
  }

  vi.restoreAllMocks();
  harness.unmount();
  return failures;
}

/**
 * Every interleaving of the machine above, run against the real session and a
 * host whose answer can be held open.
 *
 * A property run rather than a case per row of the table: the table has more
 * combinations than are worth writing out by hand, most of them are
 * uninteresting, and the ones that are not are exactly the ones nobody thinks
 * to write. What is asserted is the five invariants, which hold for all of
 * them; a defect is reported as the seed that reached it, and that seed alone
 * can be replayed.
 */
describe('every interleaving of a row and its codebook write', () => {
  it.each(seedsUnderTest())(
    'holds the write to the row it was made on (seed %i)',
    async (seed) => {
      expect(await runInterleaving(seed)).toEqual([]);
    },
  );
});
