import { screen, waitFor, within } from '@testing-library/react';

import type { StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { StageEditorComponent } from '../../../stage-editor-contract.ts';
import type { renderStageEditor } from '../../../testing/renderStageEditor.tsx';

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

/** Opens a form field's dialog, and scopes queries to it. */
export const openField = async (harness: Harness, name: string) => {
  await harness.user.click(screen.getByRole('button', { name }));
  return within(await screen.findByRole('dialog'));
};

/**
 * Removes one row from a list the editor mounts.
 *
 * Two clicks, because the removal is confirmed first — and the confirmation's
 * own button carries the same name as the control that opened it, so the
 * second click has to name the one the dialog added rather than the one still
 * sitting in the row.
 */
export const removeRow = async (harness: Harness, itemLabel: string) => {
  const name = `Remove ${itemLabel}`;
  const [rowControl] = screen.getAllByRole('button', { name });
  if (rowControl === undefined) throw new Error(`There is no "${name}".`);
  await harness.user.click(rowControl);

  // The row's own control is hidden from assistive technology while the modal
  // is open, so the confirmation is whichever control with that name is NOT
  // the one just clicked — asked that way rather than by count, so a
  // confirmation that never opened is waited for rather than clicked past.
  const confirmation = await waitFor(() => {
    const [confirm] = screen
      .getAllByRole('button', { name })
      .filter((control) => control !== rowControl);
    if (confirm === undefined) {
      throw new Error(`Nothing asked whether to ${name.toLowerCase()}.`);
    }
    return confirm;
  });
  await harness.user.click(confirmation);
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
