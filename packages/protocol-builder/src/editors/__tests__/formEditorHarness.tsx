import { screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId, type SectionRef } from '@codaco/studio-sync/taxonomy';

import type { StageEditorComponent } from '../../stage-editor-contract.ts';
import type {
  CodebookPatch,
  renderStageEditor,
} from '../../testing/renderStageEditor.tsx';

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

/** Opens a form field's dialog, and scopes queries to it. */
export const openField = async (harness: Harness, name: string) => {
  await harness.user.click(screen.getByRole('button', { name }));
  return within(await screen.findByRole('dialog'));
};

/**
 * The same, for the LAST row carrying that control — the one a journey has
 * just added. Asked for by position from the end because each editor's fixture
 * arrives with a different number of fields, and the row just added is the one
 * past all of them whatever that number is.
 */
const openLastField = async (harness: Harness, name: string) => {
  const triggers = screen.getAllByRole('button', { name });
  const trigger = triggers[triggers.length - 1];
  if (trigger === undefined) throw new Error(`There is no "${name}".`);
  await harness.user.click(trigger);
  return within(await screen.findByRole('dialog'));
};

/**
 * Removes one row from a list the editor mounts.
 *
 * Two clicks, because the removal is confirmed first: the row's own control
 * asks, and the confirmation the list raises names what is going.
 */
export const removeRow = async (harness: Harness, itemLabel: string) => {
  const name = `Remove ${itemLabel}`;
  const [rowControl] = screen.getAllByRole('button', { name });
  if (rowControl === undefined) throw new Error(`There is no "${name}".`);
  await harness.user.click(rowControl);

  await harness.user.click(
    await screen.findByRole('button', { name: `Delete ${itemLabel}` }),
  );
};

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
export const fieldsOf = (document: SectionDoc): Record<string, unknown>[] => {
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
 * The attributes the protocol holds for one codebook subject.
 *
 * Read from the protocol rather than from the stage: an attribute a form field
 * collects belongs to the codebook, and a form editor writing it there — not
 * into its own stage document — is the whole claim these journeys make. Each
 * form editor asks about a different subject, which is why the section is a
 * parameter and not a constant.
 */
const codebookVariables = (harness: Harness, subject: SectionRef) =>
  asRecord(asRecord(harness.protocolSections()[sectionId(subject)]).variables);

/** One attribute of that subject, by the name the researcher gave it. */
const attributeNamed = (harness: Harness, subject: SectionRef, name: string) =>
  Object.entries(codebookVariables(harness, subject)).find(
    ([, variable]) => asRecord(variable).name === name,
  );

/** The same, waited for: the codebook write it comes from is asynchronous. */
const savedAttribute = (harness: Harness, subject: SectionRef, name: string) =>
  waitFor(() => {
    const entry = attributeNamed(harness, subject, name);
    if (entry === undefined) throw new Error(`${name} was not created`);
    return entry;
  });

/**
 * Adds one value to the attribute list a codebook editor is showing. The
 * editor opens on the values the attribute already has, so a new one lands in
 * the row past them.
 */
const addOption = async (
  harness: Harness,
  position: number,
  label: string,
  value: string,
) => {
  await harness.user.click(screen.getByRole('button', { name: 'Add option' }));
  await harness.user.type(
    screen.getByRole('textbox', { name: `Option ${position} label` }),
    label,
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: `Option ${position} value` }),
    value,
  );
};

/** The id the seeded categorical attribute below is filed under. */
const SEEDED_CATEGORICAL = 'seeded-contact-setting';

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
 * a render of the open dialog. That journey is the SUBJECT of
 * `FormFieldsSection`'s own create tests, and only setup for a journey about
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
            { label: 'At home', value: 'home' },
            { label: 'At work', value: 'work' },
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
 * type, an edge type, or the participant — and writes there rather than into
 * its own stage document.
 */
export const authorsValuesFromField = async (
  harness: Harness,
  subject: SectionRef,
) => {
  const categoricalId = seedCategoricalAttribute(harness, subject);

  const creating = await openField(harness, 'Create new form field');
  await harness.user.selectOptions(
    creating.getByRole('combobox', { name: 'Attribute' }),
    categoricalId,
  );

  await harness.user.click(
    await creating.findByRole('button', {
      name: 'Change this attribute’s values',
    }),
  );
  await addOption(harness, 3, 'Somewhere else', 'elsewhere');
  await harness.user.click(
    screen.getByRole('button', { name: 'Save attribute' }),
  );

  await waitFor(() =>
    expect(
      asRecord(codebookVariables(harness, subject)[categoricalId]).options,
    ).toEqual([
      { label: 'At home', value: 'home' },
      { label: 'At work', value: 'work' },
      { label: 'Somewhere else', value: 'elsewhere' },
    ]),
  );
};

/**
 * Sets, from the row that collects it, what a date attribute accepts — which
 * is no list of values at all.
 *
 * Two steps, because the settings belong to an attribute: there is nothing to
 * configure until it exists, and it is the row's save that creates it.
 */
export const authorsDateSettingsFromField = async (
  harness: Harness,
  subject: SectionRef,
) => {
  const dating = await openField(harness, 'Create new form field');
  await harness.user.selectOptions(
    dating.getByRole('combobox', { name: 'Attribute' }),
    '#create-new-attribute',
  );
  await harness.user.selectOptions(
    await dating.findByRole('combobox', { name: 'Kind of answer' }),
    'datetime',
  );
  await harness.user.type(
    await dating.findByRole('textbox', { name: 'Attribute name' }),
    'met_on',
  );
  await harness.user.selectOptions(
    await dating.findByRole('combobox', { name: 'Input control' }),
    'DatePicker',
  );
  await harness.user.type(
    dating.getByRole('textbox', { name: 'Question text' }),
    'When did you first meet?',
  );
  await harness.user.click(dating.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
  const [dateId] = await savedAttribute(harness, subject, 'met_on');

  const editing = await openLastField(harness, 'Edit field');
  await harness.user.click(
    await editing.findByRole('button', { name: 'Set what this field accepts' }),
  );
  await screen.findByRole('button', { name: 'Save attribute' });
  await harness.user.selectOptions(
    screen.getByRole('combobox', { name: 'Date resolution' }),
    'year',
  );
  await harness.user.click(
    screen.getByRole('button', { name: 'Save attribute' }),
  );

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
