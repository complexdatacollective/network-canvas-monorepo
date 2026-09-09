import { defineStageEditorPart } from '../stage-editor-contract.ts';
import { AlterEdgeFormStageEditor } from './forms/AlterEdgeFormStageEditor.tsx';
import { AlterFormStageEditor } from './forms/AlterFormStageEditor.tsx';
import { EgoFormStageEditor } from './forms/EgoFormStageEditor.tsx';
import { InformationStageEditor } from './forms/InformationStageEditor.tsx';

/**
 * The interfaces built out of a page of content or a form.
 *
 * One family because they share their hard parts: three of them are the same
 * form fields section asked of a different subject, and the fourth shares the
 * page-content machinery the introduction screens of other interfaces will
 * reuse. Nothing outside this file needs to know which of them is which — the
 * dispatcher reads the claim, and `defineStageEditorPart` keeps the exact set
 * of interfaces this family claims a fact the type system still knows.
 */
export const formStageEditors = defineStageEditorPart({
  Information: InformationStageEditor,
  EgoForm: EgoFormStageEditor,
  AlterForm: AlterFormStageEditor,
  AlterEdgeForm: AlterEdgeFormStageEditor,
});
