import { defineStageEditorPart } from '../stage-editor-contract.ts';
import { FamilyPedigreeStageEditor } from './pedigree/FamilyPedigreeStageEditor.tsx';
import { NarrativePedigreeStageEditor } from './pedigree/NarrativePedigreeStageEditor.tsx';

/**
 * The interfaces that write into the codebook as much as into their own stage.
 *
 * They are one family because they share that: an anonymisation stage's
 * encrypted attributes and a pedigree's structural slots are both codebook
 * properties a stage editor has to be able to set, through compound edits the
 * host applies atomically, rather than stage fields. The two pedigrees
 * additionally share their subject — a narrative pedigree draws the family a
 * Family Pedigree stage collected — so neither can be reasoned about without
 * the other.
 *
 * The part is named for anonymisation as well as for the pedigrees because
 * that is the family it belongs to; its editor is the one still listed on
 * `AWAITING_STAGE_EDITORS`, and joins this object when it lands.
 *
 * Declared through `defineStageEditorPart` rather than annotated, so the type
 * system keeps the exact set of interfaces this family claims: see that
 * function's own comment for what an annotation would destroy.
 */
export const pedigreeAndAnonymisationStageEditors = defineStageEditorPart({
  FamilyPedigree: FamilyPedigreeStageEditor,
  NarrativePedigree: NarrativePedigreeStageEditor,
});
