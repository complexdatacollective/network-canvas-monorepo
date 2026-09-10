import { screen, within } from '@testing-library/react';

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

/** Adds a row through the list's own add button and answers with its dialog. */
export const addRow = async (
  harness: StageEditorHarness,
  addLabel: string,
): Promise<ReturnType<typeof within>> => {
  await harness.user.click(screen.getByRole('button', { name: addLabel }));
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
