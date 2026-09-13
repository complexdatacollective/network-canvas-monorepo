import { screen, within } from '@testing-library/react';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';
import { mountedAs } from '../../__tests__/formEditorHarness.tsx';
import { narrativeStageEditor } from '../NarrativeStageEditor.ts';
import { canvasPermissions } from '../sections/permissions/canvasPermissions.tsx';
import { narrativePresets } from '../sections/presets/narrativePresets.tsx';

/**
 * The editor as the harness mounts it.
 *
 * The harness's `editor` slot takes an editor for ANY interface, while a named
 * editor declares the one it edits, so the entry is named with the type it
 * claims.
 */
export const narrativeEditor = mountedAs(narrativeStageEditor.Narrative);

const Presets = narrativePresets();
const Permissions = canvasPermissions();

/** Every section a narrative stage composes that is not one of the shared six. */
export const narrativeSections = (
  <>
    <Presets />
    <Permissions />
  </>
);

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

/** The presets of a saved stage, read as tolerantly as the editor reads them. */
export const presetsOf = (
  stage: Record<string, unknown>,
): Record<string, unknown>[] =>
  Array.isArray(stage.presets)
    ? stage.presets.filter(
        (row): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

/** A narrative stage holding exactly one preset, so a save can be read whole. */
export const narrativeHolding = (preset: Record<string, unknown>) => ({
  stage: {
    type: 'Narrative' as const,
    fields: {
      label: 'Narrative',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4, skewedTowardCenter: true },
      behaviours: { freeDraw: true, allowRepositioning: true },
      presets: [preset],
    },
  },
  sections: narrativeSections,
});

/**
 * Opens one preset's dialog and answers with the dialog itself.
 *
 * Every query inside a preset editor is made through this, so a wait covers
 * ONE thing: the dialog arriving. A `findByRole('combobox')` at document level
 * would be waiting for the editor to boot AND the dialog to open AND that
 * control's own data, and a failure could not say which of the three did not
 * happen — nor could it tell a control inside the dialog from one of the same
 * name on the stage behind it.
 */
export const openPreset = async (
  harness: StageEditorHarness,
  index = 0,
  /** The row's own affordance, in the language the editor was opened in. */
  editLabel = 'Edit preset',
): Promise<ReturnType<typeof within>> => {
  const editButtons = screen.getAllByRole('button', { name: editLabel });
  await harness.user.click(editButtons[index] as HTMLElement);
  return within(await screen.findByRole('dialog'));
};

/** Opens the dialog for a preset that does not exist yet, and scopes to it. */
export const addPreset = async (
  harness: StageEditorHarness,
  addLabel = 'Create new preset',
): Promise<ReturnType<typeof within>> => {
  await harness.user.click(screen.getByRole('button', { name: addLabel }));
  return within(await screen.findByRole('dialog'));
};

/**
 * The `person` node type with one more attribute, as a collaborator's own
 * revision of it.
 */
export const personWithVariable = (
  harness: StageEditorHarness,
  variableId: string,
  variable: Record<string, unknown>,
): SectionDoc => {
  const document = harness.protocolSections()[PERSON_SECTION];
  if (document === undefined) throw new Error('the fixture has no person type');
  const held = document.variables;
  const variables =
    typeof held === 'object' && held !== null && !Array.isArray(held)
      ? (held as Record<string, unknown>)
      : {};
  return { ...document, variables: { ...variables, [variableId]: variable } };
};
