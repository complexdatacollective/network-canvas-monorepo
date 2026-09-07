import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import type { StageEditorActionContext } from '../../../form/StageEditorShell.tsx';
import type { StageEditorComponent } from '../../../stage-editor-contract.ts';
import { FamilyPedigreeStageEditor } from '../FamilyPedigreeStageEditor.tsx';
import { NarrativePedigreeStageEditor } from '../NarrativePedigreeStageEditor.tsx';

/**
 * The host chrome these tests put in the editor's action slot.
 *
 * Deliberately NOT disabled while the session is read-only. A control the
 * researcher cannot press proves nothing about what happens when the session
 * refuses a write, and the refusal is the behaviour under test: the editor has
 * to say the stage was not saved, not merely be impossible to submit.
 */
const saveActions = ({ formId }: StageEditorActionContext) => (
  <SubmitButton form={formId}>Save stage</SubmitButton>
);

/**
 * Each named editor as the harness mounts it.
 *
 * The harness's `editor` slot takes the registry's own contract, which is
 * generic over every stage type, while a named editor declares the one
 * interface it edits — so each is wrapped with the type it claims and the
 * host chrome a host would supply.
 */
export const familyPedigreeEditor: StageEditorComponent = ({ controller }) => (
  <FamilyPedigreeStageEditor
    controller={controller}
    stageType="FamilyPedigree"
    actions={saveActions}
  />
);

export const narrativePedigreeEditor: StageEditorComponent = ({
  controller,
}) => (
  <NarrativePedigreeStageEditor
    controller={controller}
    stageType="NarrativePedigree"
    actions={saveActions}
  />
);

/**
 * jsdom has no layout, and the markdown editor these stages write their prose
 * in measures the document on every change and every click: a Range, to scroll
 * the caret into view, and a point, to place the caret where the pointer went
 * down. Unshimmed it throws mid-transaction, and the text a researcher types
 * never reaches the field.
 *
 * Shimmed as "measured nothing" rather than worked around, because what these
 * tests are about is the editor's composition, not where a caret lands: the
 * markdown editor's own fallbacks handle an unmeasurable document, so it
 * behaves exactly as it does in a browser that has not laid it out yet.
 */
export function shimMarkdownEditorMeasurement(): void {
  const emptyRects = Object.assign([], {
    item: () => null,
  }) as unknown as DOMRectList;
  Range.prototype.getClientRects ??= () => emptyRects;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
  Document.prototype.elementFromPoint ??= () => null;
}
