import { act, screen, within } from '@testing-library/react';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { background } from '../../../../../sections/background/background.tsx';
import { nodeLayout } from '../../../../../sections/canvas-behaviours/nodeLayout.tsx';
import type { StageEditorHarness } from '../../../../../testing/renderStageEditor.tsx';
import { sociogramPrompts } from '../sociogramPrompts.tsx';

const Prompts = sociogramPrompts();
const NodeLayout = nodeLayout();
const Background = background({ allowsImage: true });

/** Every section a sociogram composes that is not one of the shared five. */
export const sociogramSections = (
  <>
    <Prompts />
    <NodeLayout />
    <Background />
  </>
);

export const PERSON_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'person',
});

/** The prompt rows of a saved stage, read as tolerantly as the editor reads them. */
export const promptsOf = (
  stage: Record<string, unknown>,
): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

/** A sociogram holding exactly one prompt, so a save can be read whole. */
export const sociogramHolding = (prompt: Record<string, unknown>) => ({
  stage: {
    type: 'Sociogram' as const,
    fields: {
      label: 'Sociogram',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4, skewedTowardCenter: true },
      behaviours: { automaticLayout: true },
      prompts: [prompt],
    },
  },
  sections: sociogramSections,
});

/**
 * Opens one prompt's dialog and answers with the dialog itself.
 *
 * Every query inside a prompt editor is made through this, so a wait covers
 * ONE thing: the dialog arriving. A `findByRole('combobox')` at document level
 * would be waiting for the editor to boot AND the dialog to open AND that
 * control's own data, and a failure could not say which of the three did not
 * happen — nor could it tell a control inside the dialog from one of the same
 * name on the stage behind it.
 */
export const openPrompt = async (
  harness: StageEditorHarness,
  index = 0,
  /** The row's own affordance, in the language the editor was opened in. */
  editLabel = 'Edit prompt',
): Promise<ReturnType<typeof within>> => {
  const editButtons = screen.getAllByRole('button', { name: editLabel });
  await harness.user.click(editButtons[index] as HTMLElement);
  return within(await screen.findByRole('dialog'));
};

/** Every attribute of the type this sociogram collects, as the protocol holds it. */
export const personVariables = (
  harness: StageEditorHarness,
): [string, { type?: unknown }][] => {
  const person = harness.protocolSections()[PERSON_SECTION];
  const variables = person?.variables;
  if (typeof variables !== 'object' || variables === null) {
    throw new Error('the fixture person type has no attributes');
  }
  return Object.entries(variables) as [string, { type?: unknown }][];
};

/**
 * A form somewhere else in the protocol, started while this dialog is open.
 *
 * Written as a collaborator's edit, which is what it is: the write reaches the
 * protocol without this editor's lock, and the revision travels the channel
 * every other change does.
 */
export const collectInAForm = (
  harness: StageEditorHarness,
  variableId: string,
): void => {
  const id = sectionId({ kind: 'stage', stageId: 'alter-form-1' });
  const stage = harness.protocolSections()[id];
  if (stage === undefined) throw new Error('the fixture has no alter form');
  const form = stage.form;
  const held =
    typeof form === 'object' && form !== null
      ? Reflect.get(form, 'fields')
      : undefined;
  const fields: unknown[] = Array.isArray(held) ? held : [];
  const updated: SectionDoc = {
    ...stage,
    form: {
      fields: [...fields, { variable: variableId, prompt: 'Is this so?' }],
    },
  };
  act(() => {
    harness.host.store.applyAsCollaborator(id, updated);
  });
};
