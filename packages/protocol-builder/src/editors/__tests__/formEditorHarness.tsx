import { screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';

import type { Codebook, StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId, type SectionRef } from '@codaco/studio-sync/taxonomy';

import {
  blockFor,
  caretInQuestion,
  fieldSettings,
  formEditor,
  insertPicker,
  selectField,
} from '../../sections/form-document/__tests__/formDocumentTesting.ts';
import type { StageEditorComponent } from '../../stage-editor-contract.ts';
import {
  findCreateRow,
  searchAttributes,
} from '../../testing/attributePicker.ts';
import { MINTED_ID } from '../../testing/mintedId.ts';
import type {
  CodebookPatch,
  renderStageEditor,
} from '../../testing/renderStageEditor.tsx';
import { testOptionId, testVariableId } from '../../testing/testId.ts';

type Harness = ReturnType<typeof renderStageEditor>;

/**
 * A named editor, as the harness's editor slot types it.
 *
 * The slot takes an editor for ANY interface, and a named editor is declared
 * against exactly the one it edits — which is what stops it being registered
 * under another interface — so neither is assignable to the other. The
 * dispatcher resolves that properly, by looking the editor up under the type
 * it is about to render; a test naming the editor directly cannot, so it says
 * here that it means the editor to be handed the stage it seeded, which is of
 * that same type.
 */
export const mountedAs = <T extends StageType>(
  editor: StageEditorComponent<T>,
): StageEditorComponent => editor as StageEditorComponent;

/**
 * Every file here stands the rich-text editor in for a plain input of its own,
 * inline: `vi.mock` is hoisted above the imports, so a factory shared from
 * this module cannot be reached from one. ProseMirror is what makes the
 * stand-in necessary — it places the caret through `elementFromPoint` and
 * `getClientRects`, neither of which jsdom implements, so typing throws rather
 * than producing text.
 */

/**
 * The stage's name control, as the input it is.
 *
 * A stage that is being CREATED opens with a name already proposed for it,
 * so a create-mode test asks what the value looks like rather than what it
 * equals — the proposal is deduplicated against the interview it is joining.
 */
export const stageNameInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

/**
 * The stage as the PROTOCOL holds it, which is the only place an edit can have
 * reached: the draft lives in the form and nowhere else until a save hands the
 * whole section back.
 */
const stageInProtocol = (harness: Harness): SectionDoc | undefined =>
  harness.protocolSections()[
    sectionId({ kind: 'stage', stageId: harness.seeded.id })
  ];

/**
 * Nothing the researcher did reached the protocol.
 *
 * Compared against the seeded document rather than against a snapshot taken
 * during the test, so a stage that was rewritten and put back would still fail.
 */
export const expectStageUntouched = (harness: Harness): void => {
  expect(stageInProtocol(harness)).toEqual({
    id: harness.seeded.id,
    type: harness.seeded.type,
    ...harness.seeded.fields,
  });
};

/** The fields a saved stage collects, whatever else the document holds. */
const fieldsOf = (document: SectionDoc): Record<string, unknown>[] => {
  const form = document.form;
  const fields =
    typeof form === 'object' && form !== null
      ? Reflect.get(form, 'fields')
      : [];
  return Array.isArray(fields) ? (fields as Record<string, unknown>[]) : [];
};

/**
 * A codebook node type as the fixture protocol's own definitions are shaped:
 * a change made elsewhere has to be a definition a host would have accepted,
 * or the editor would be following something no collaborator could have sent.
 */
export const personDefinition = (
  variables: Record<string, unknown>,
): SectionDoc => ({
  name: 'person',
  color: 'node-color-seq-1',
  icon: 'add-a-person',
  shape: { default: 'circle' },
  variables,
});

/** The same, for the fixture's `knows` edge type. */
export const knowsDefinition = (
  variables: Record<string, unknown>,
): SectionDoc => ({
  name: 'knows',
  color: 'edge-color-seq-2',
  variables,
});

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * The attributes of one codebook subject, in a codebook read off the harness.
 *
 * An attribute a form field collects belongs to the codebook, and a form
 * editor keeping it there — not in its own stage document — is the whole claim
 * these journeys make. Each form editor asks about a different subject, which
 * is why the section is a parameter and not a constant.
 */
const variablesOf = (codebook: Codebook, subject: SectionRef) => {
  switch (subject.kind) {
    case 'codebookEgo':
      return asRecord(codebook.ego?.variables);
    case 'codebookNode':
      return asRecord(codebook.node?.[subject.typeId]?.variables);
    case 'codebookEdge':
      return asRecord(codebook.edge?.[subject.typeId]?.variables);
    case 'assets':
    case 'settings':
    case 'stage':
    case 'stageOrder':
    default:
      throw new Error(`"${subject.kind}" is not a codebook subject.`);
  }
};

/**
 * The attributes the PROTOCOL holds for a subject: nothing an editor does
 * reaches it before the stage is saved, because everything changed inside a
 * stage editor is part of that stage's draft.
 */
const codebookVariables = (harness: Harness, subject: SectionRef) =>
  variablesOf(harness.hostCodebook(), subject);

/** The attributes the EDITOR shows for a subject: the protocol's, plus the draft's. */
const draftVariables = (harness: Harness, subject: SectionRef) =>
  variablesOf(harness.editorCodebook(), subject);

/** One attribute of that subject, by the name the researcher gave it. */
const attributeNamed = (variables: Record<string, unknown>, name: string) =>
  Object.entries(variables).find(
    ([, variable]) => asRecord(variable).name === name,
  );

/** The same, waited for in the stage draft. */
const draftedAttribute = (
  harness: Harness,
  subject: SectionRef,
  name: string,
) =>
  waitFor(() => {
    const entry = attributeNamed(draftVariables(harness, subject), name);
    if (entry === undefined) throw new Error(`${name} was not created`);
    return entry;
  });

/** Adds one answer to the list of answers the options dialog shows. */
const addOption = async (harness: Harness, label: string, value: string) => {
  await harness.user.click(
    screen.getByRole('button', { name: 'Create new option' }),
  );
  await harness.user.type(
    await screen.findByRole('textbox', { name: 'Label' }),
    label,
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: 'Value' }),
    value,
  );
  await harness.user.click(
    screen.getByRole('button', { name: 'Finish editing option' }),
  );
};

/** The id the seeded categorical attribute below is filed under. */
const SEEDED_CATEGORICAL = testVariableId('seeded-contact-setting');

/** A codebook patch that replaces one subject's definition, whichever it is. */
const patchReplacing = (
  subject: SectionRef,
  definition: SectionDoc,
): CodebookPatch => {
  switch (subject.kind) {
    case 'codebookEgo':
      return { ego: definition };
    case 'codebookNode':
      return { node: { [subject.typeId]: definition } };
    case 'codebookEdge':
      return { edge: { [subject.typeId]: definition } };
    case 'assets':
    case 'settings':
    case 'stage':
    case 'stageOrder':
    default:
      throw new Error(`"${subject.kind}" is not a codebook subject.`);
  }
};

/**
 * Puts a categorical attribute with two values into the codebook a form
 * editor is about, already there when the editor opens.
 *
 * Authoring one through the create dialog instead is a journey of its own —
 * two pickers, a name, two option rows, four fields of typing, each keystroke
 * a render of the open dialog. That journey is the SUBJECT of the form
 * section's own create tests (`FieldInsertPicker.test.tsx`), and only setup for a journey about
 * an attribute that ALREADY offers values: paid for three times over, once per
 * form editor, these were the three slowest tests in this directory and the
 * ones at risk of the 20s timeout on a runner tens of times slower than a
 * developer's machine.
 *
 * Seeded through the protocol rather than written onto the fixture, so the
 * revision reaches the pickers over the same channel a collaborator's change
 * would — see `receiveCodebookUpdate`.
 *
 * Filed under an id no stage names, which is what makes it collectable: the
 * fixture's own categorical and ordinal attributes are written unvalidated by
 * a bin stage, so the picker offers neither.
 */
const seedCategoricalAttribute = (
  harness: Harness,
  subject: SectionRef,
): string => {
  const definition = asRecord(harness.protocolSections()[sectionId(subject)]);
  harness.receiveCodebookUpdate(
    patchReplacing(subject, {
      ...definition,
      variables: {
        ...asRecord(definition.variables),
        [SEEDED_CATEGORICAL]: {
          name: 'contact_setting',
          type: 'categorical',
          // One of the two controls the schema lets a categorical be collected
          // with. A control belonging to another type — `RadioGroup` is the
          // ordinal one — makes this variable invalid, and an entity
          // definition is parsed whole, so the picker would then offer NONE of
          // this subject's attributes rather than complain about this one.
          component: 'CheckboxGroup',
          options: [
            {
              id: testOptionId(SEEDED_CATEGORICAL, 'home'),
              label: { 'en-US': 'At home' },
              value: 'home',
            },
            {
              id: testOptionId(SEEDED_CATEGORICAL, 'work'),
              label: { 'en-US': 'At work' },
              value: 'work',
            },
          ],
        },
      },
    }),
  );
  return SEEDED_CATEGORICAL;
};

/**
 * Changes, from the row that collects it, the values a categorical attribute
 * offers — while that row is still being written.
 *
 * Shared because it is one journey asked of three editors. The section's own
 * tests prove the control; what each editor's copy proves is that the section
 * it mounts reaches the codebook for the subject THAT editor is about — a node
 * type, an edge type, or the participant — holding the change with the stage
 * and writing it there when the stage is saved, rather than into the stage
 * document itself.
 */
export const authorsValuesFromField = async (
  harness: Harness,
  subject: SectionRef,
) => {
  const categoricalId = seedCategoricalAttribute(harness, subject);
  const editor = await formEditor();

  // A new field, from the Field button, collecting the seeded attribute.
  const fieldId = await addFieldFromToolbar(harness, editor, (picker) =>
    picker.querySelector<HTMLElement>(
      `[role="option"][data-attribute-id="${categoricalId}"]:not([aria-disabled="true"])`,
    ),
  );
  await harness.user.keyboard('Where do you usually meet?');

  // Its settings open the attribute's answers in a dialog of their own,
  // written to the codebook for THIS editor's subject.
  await selectField(harness, editor, fieldId);
  await harness.user.click(
    (await fieldSettings()).getByRole('button', { name: 'Edit options' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Options and settings of contact_setting',
  });
  await addOption(harness, 'Somewhere else', 'elsewhere');
  await harness.user.click(
    within(dialog).getByRole('button', { name: 'Save' }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', {
        name: 'Options and settings of contact_setting',
      }),
    ).toBeNull(),
  );

  // Part of the stage's draft, like everything changed inside the editor: the
  // editor reads it at once, and the protocol does not until the stage is
  // saved.
  const authored = [
    {
      id: testOptionId(SEEDED_CATEGORICAL, 'home'),
      label: { 'en-US': 'At home' },
      value: 'home',
    },
    {
      id: testOptionId(SEEDED_CATEGORICAL, 'work'),
      label: { 'en-US': 'At work' },
      value: 'work',
    },
    // The value typed here is given a new id.
    { id: MINTED_ID, label: { 'en-US': 'Somewhere else' }, value: 'elsewhere' },
  ];
  await waitFor(() =>
    expect(
      asRecord(draftVariables(harness, subject)[categoricalId]).options,
    ).toEqual(authored),
  );
  expect(
    asRecord(codebookVariables(harness, subject)[categoricalId]).options,
  ).toEqual(authored.slice(0, 2));

  const saved = await harness.submit();
  expect(saved).not.toBeNull();
  expect(
    asRecord(codebookVariables(harness, subject)[categoricalId]).options,
  ).toEqual(authored);
  expect(fieldsOf(saved?.stageDocument ?? {}).at(-1)).toEqual({
    id: fieldId,
    variable: categoricalId,
    prompt: { 'en-US': 'Where do you usually meet?' },
  });
};

/**
 * Sets, from the row that collects it, what a date attribute accepts — which
 * is no list of values at all.
 */
export const authorsDateSettingsFromField = async (
  harness: Harness,
  subject: SectionRef,
) => {
  const editor = await formEditor();

  // A new field, from the Field button, collecting a new date attribute: the
  // name is typed into the list's search box, and the type chosen after it.
  const fieldId = await addFieldFromToolbar(harness, editor, async (picker) => {
    await searchAttributes(harness.user, picker, 'met_on');
    const create = findCreateRow(picker);
    if (create === null) throw new Error('No create row for "met_on".');
    await harness.user.click(create);
    return within(picker).findByRole('button', { name: /^Date/ });
  });
  await harness.user.keyboard('When did you first meet?');
  const [dateId] = await draftedAttribute(harness, subject, 'met_on');
  await selectField(harness, editor, fieldId);
  await harness.user.click(
    (await fieldSettings()).getByRole('button', {
      name: 'Edit control settings',
    }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Options and settings of met_on',
  });
  await harness.user.selectOptions(
    within(dialog).getByRole('combobox', { name: 'Date resolution' }),
    'year',
  );
  await harness.user.click(
    within(dialog).getByRole('button', { name: 'Save' }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Options and settings of met_on' }),
    ).toBeNull(),
  );

  // The attribute is the stage draft's until the stage is saved.
  expect(attributeNamed(codebookVariables(harness, subject), 'met_on')).toBe(
    undefined,
  );
  expect(await harness.submit()).not.toBeNull();

  await waitFor(() =>
    expect(
      asRecord(codebookVariables(harness, subject)[dateId]).parameters,
    ).toEqual({ type: 'year' }),
  );
  // Written on the attribute, beside the control they were authored for — not
  // on the form field, which holds only its question.
  expect(asRecord(codebookVariables(harness, subject)[dateId])).toMatchObject({
    name: 'met_on',
    type: 'datetime',
    component: 'DatePicker',
  });
};

/**
 * Adds a field from the Field button, after the form's first field, and
 * finishes it with the attribute list's row that `rowOf` finds. Answers with
 * the new field's id, once its block has the attribute and the caret is in
 * its question.
 */
const addFieldFromToolbar = async (
  harness: Harness,
  editor: HTMLElement,
  rowOf: (
    picker: HTMLElement,
  ) => HTMLElement | null | Promise<HTMLElement | null>,
): Promise<string> => {
  const first = editor
    .querySelector('[data-field-id]')
    ?.getAttribute('data-field-id');
  if (first === null || first === undefined) {
    throw new Error('The form has no field to start from.');
  }
  await caretInQuestion(harness, editor, first);
  await harness.user.click(screen.getByRole('button', { name: 'Field' }));
  const picker = await insertPicker();
  const fieldId = picker.getAttribute('data-field-insert-picker') ?? '';
  const row = await rowOf(picker);
  if (row === null) throw new Error('The attribute list has no such row.');
  await harness.user.click(row);
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Attribute of the new field' }),
    ).toBeNull(),
  );
  await waitFor(() =>
    expect(blockFor(editor, fieldId)).not.toHaveAttribute('data-indeterminate'),
  );
  // The keyboard is back in the new field's question once the list has gone.
  await waitFor(() => {
    expect(editor).toHaveFocus();
    const anchor = document.getSelection()?.anchorNode ?? null;
    const label = blockFor(editor, fieldId).querySelector('[data-field-label]');
    expect(label?.contains(anchor)).toBe(true);
  });
  return fieldId;
};
