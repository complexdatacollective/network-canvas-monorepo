import { act, screen, within } from '@testing-library/react';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';
import { mountedAs } from '../../__tests__/formEditorHarness.tsx';
import { networkComposerStageEditor } from '../NetworkComposerStageEditor.ts';
import { composerConnections } from '../sections/composerConnections.tsx';
import { composerNodes } from '../sections/composerNodes.tsx';

/**
 * The editor as the harness mounts it.
 *
 * The harness's `editor` slot takes an editor for ANY interface, while a named
 * editor declares the one it edits, so the entry is named with the type it
 * claims.
 */
export const composerEditor = mountedAs(
  networkComposerStageEditor.NetworkComposer,
);

const Nodes = composerNodes();
const Connections = composerConnections();

/** Every section a network composer composes that is not one of the shared six. */
const composerSections = (
  <>
    <Nodes />
    <Connections />
  </>
);

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const SOCIOGRAM_SECTION = sectionId({ kind: 'stage', stageId: 'sociogram-1' });

const ALTER_FORM_SECTION = sectionId({
  kind: 'stage',
  stageId: 'alter-form-1',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const rowsOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

/** The connection entries of a saved stage, read as tolerantly as the editor. */
export const edgesOf = (
  stage: Record<string, unknown>,
): Record<string, unknown>[] => rowsOf(stage.edges);

/** The node form's fields of a saved stage, read the same way. */
export const nodeFormFieldsOf = (
  stage: Record<string, unknown>,
): Record<string, unknown>[] =>
  isRecord(stage.nodeForm) ? rowsOf(stage.nodeForm.fields) : [];

/** One connection entry's own fields. */
export const edgeFormFieldsOf = (
  entry: Record<string, unknown>,
): Record<string, unknown>[] =>
  isRecord(entry.form) ? rowsOf(entry.form.fields) : [];

/** A composer holding whatever a case needs, over the fixture's own codebook. */
export const composerHolding = (fields: SectionDoc) => ({
  stage: {
    type: 'NetworkComposer' as const,
    fields: {
      label: 'Network Composer',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'composerName',
      layoutVariable: 'layout',
      background: { concentricCircles: 4 },
      ...fields,
    },
  },
  sections: composerSections,
});

/**
 * Opens one row's dialog and answers with the dialog itself.
 *
 * Every query inside a row editor is made through this, so a wait covers ONE
 * thing: the dialog arriving. A `findByRole('combobox')` at document level
 * would be waiting for the editor to boot AND the dialog to open AND that
 * control's own data, and a failure could not say which did not happen — nor
 * could it tell a control inside the dialog from one of the same name behind
 * it.
 */
export const openRow = async (
  harness: StageEditorHarness,
  editLabel: string,
  index = 0,
): Promise<ReturnType<typeof within>> => {
  const editButtons = screen.getAllByRole('button', { name: editLabel });
  await harness.user.click(editButtons[index] as HTMLElement);
  return within(await screen.findByRole('dialog'));
};

/**
 * Adds a row through the list's own add button and answers with its dialog.
 *
 * The button is waited for rather than read synchronously. A caller usually
 * reaches it by turning a capability on first — `switchOnNodeForm` flips the
 * "Node attributes" switch — and the list it adds to is rendered by the section
 * that switch reveals, which is a render later. `getByRole` happened to find it
 * on an unloaded machine and missed it under a full suite run, which is a
 * failure of the helper rather than of the editor. `findByRole` still throws
 * when the button never appears, so nothing is weakened by the wait.
 */
export const addRow = async (
  harness: StageEditorHarness,
  addLabel: string,
): Promise<ReturnType<typeof within>> => {
  await harness.user.click(
    await screen.findByRole('button', { name: addLabel }),
  );
  return within(await screen.findByRole('dialog'));
};

/**
 * One more attribute on the type this composer builds, put there from outside
 * this editor.
 *
 * The pickers subscribe to the codebook sections, so where an attribute came
 * from makes no difference to what they offer — and arriving this way costs a
 * single revision on the protocol's own channel rather than a trip through the
 * create dialog. The revision reaches the components over the channel, which
 * is a microtask, so a caller reads what it changed with `waitFor` or `findBy`.
 */
export const addPersonVariable = (
  harness: StageEditorHarness,
  variableId: string,
  variable: Readonly<Record<string, unknown>>,
): void => {
  const section = harness.protocolSections()[PERSON_SECTION];
  if (section === undefined) {
    throw new Error('the fixture protocol has no person node type');
  }
  const variables = isRecord(section.variables) ? section.variables : {};
  if (Object.hasOwn(variables, variableId)) {
    throw new Error(
      `"person" already has a "${variableId}" attribute, so adding one proves nothing.`,
    );
  }
  harness.receiveCodebookUpdate({
    node: {
      person: {
        ...section,
        variables: { ...variables, [variableId]: variable },
      },
    },
  });
};

/**
 * One of this type's attributes given a different kind of answer, put there by
 * a collaborator while this editor is open.
 *
 * The protocol is read live, so the attribute a row is recording into can stop
 * being the kind the control that row names knows how to ask for — which is a
 * pairing the protocol schema refuses outright.
 */
export const retypePersonVariable = (
  harness: StageEditorHarness,
  variableId: string,
  type: string,
): void => {
  const section = harness.protocolSections()[PERSON_SECTION];
  if (section === undefined) {
    throw new Error('the fixture protocol has no person node type');
  }
  const variables = isRecord(section.variables) ? section.variables : {};
  const held = variables[variableId];
  if (!isRecord(held)) {
    throw new Error(`"person" has no "${variableId}" attribute to retype.`);
  }
  if (held.type === type) {
    throw new Error(
      `"person"’s "${variableId}" is already a "${type}" attribute, so retyping it proves nothing.`,
    );
  }
  harness.receiveCodebookUpdate({
    node: {
      person: {
        ...section,
        variables: { ...variables, [variableId]: { ...held, type } },
      },
    },
  });
};

/**
 * Another stage in the protocol starting to WRITE one of this type's
 * attributes without the codebook's rules running, put there by a
 * collaborator while this editor is open.
 *
 * A sociogram prompt that allows highlighting stamps its attribute onto every
 * node the participant taps, which is the opposite writer class from a form
 * field — so the composer's role map has to see it arrive. Written as a
 * collaborator's edit because that is what it is: the protocol is read live,
 * and this is the only way the conflict can appear while a row dialog is
 * holding a pick the picker offered a moment ago.
 */
export const highlightInASociogram = (
  harness: StageEditorHarness,
  ...variableIds: readonly string[]
): void => {
  const stage = harness.protocolSections()[SOCIOGRAM_SECTION];
  if (stage === undefined) throw new Error('the fixture has no sociogram');
  const prompts = Array.isArray(stage.prompts) ? stage.prompts : [];
  // The fixture's own marking prompt, repointed rather than a new prompt
  // appended: what makes this a conflict is the attribute, and the prompt
  // around it stays a prompt the schema already accepts. A caller asking for
  // more than one gets copies of that same prompt, which is how a test that
  // cannot watch its own claim arrive — a picker goes on offering the value it
  // is holding, whatever the filters say — can watch a second one instead.
  const marking = prompts.findIndex(
    (prompt) =>
      isRecord(prompt) &&
      isRecord(prompt.highlight) &&
      prompt.highlight.allowHighlighting === true,
  );
  const held = prompts[marking];
  if (!isRecord(held)) {
    throw new Error('the fixture sociogram has no marking prompt');
  }
  const marked = variableIds.map((variableId, index) => ({
    ...held,
    id: index === 0 ? held.id : `${String(held.id)}-marking-${String(index)}`,
    highlight: { allowHighlighting: true, variable: variableId },
  }));
  const updated: SectionDoc = {
    ...stage,
    prompts: [...prompts.with(marking, marked[0] ?? held), ...marked.slice(1)],
  };
  act(() => {
    harness.host.store.applyAsCollaborator(SOCIOGRAM_SECTION, updated);
  });
};

/**
 * A form in ANOTHER stage starting to collect some of this type's attributes,
 * put there by a collaborator while this editor is open.
 *
 * The opposite writer class from the composer's grouping tool, which writes
 * what the participant lassoes straight onto the node. The protocol is read
 * live, so this is how the conflict a composer can only be REPOINTED out of
 * reaches an editor that is already open — and, for a test, the only way to
 * put it there at all: the fixture protocol collects no categorical attribute
 * of `person` anywhere.
 */
export const collectInAnAlterForm = (
  harness: StageEditorHarness,
  ...variableIds: readonly string[]
): void => {
  const stage = harness.protocolSections()[ALTER_FORM_SECTION];
  if (stage === undefined) throw new Error('the fixture has no alter form');
  const form = isRecord(stage.form) ? stage.form : {};
  const fields = Array.isArray(form.fields) ? form.fields : [];
  const updated: SectionDoc = {
    ...stage,
    form: {
      ...form,
      fields: [
        ...fields,
        ...variableIds.map((variable) => ({
          variable,
          prompt: `What is this person's ${variable}?`,
        })),
      ],
    },
  };
  act(() => {
    harness.host.store.applyAsCollaborator(ALTER_FORM_SECTION, updated);
  });
};
