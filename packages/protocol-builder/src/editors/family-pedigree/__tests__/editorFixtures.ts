import { mountedAs } from '../../__tests__/formEditorHarness.tsx';
import { familyPedigreeStageEditor } from '../FamilyPedigreeStageEditor.ts';

/**
 * The editor as the harness mounts it.
 *
 * The harness's `editor` slot takes an editor for ANY interface, while a named
 * editor declares the one it edits, so the entry is named with the type it
 * claims. No action chrome is supplied: an editor mounted without any falls
 * back to the shared save control, which is deliberately NOT disabled while
 * the editor is read-only — a control the researcher cannot press proves
 * nothing about what happens when the shell refuses a write, and the refusal
 * is the behaviour under test.
 */
export const familyPedigreeEditor = mountedAs(
  familyPedigreeStageEditor.FamilyPedigree,
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
