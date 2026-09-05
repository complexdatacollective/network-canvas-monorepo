import { defineStageEditorPart } from '../stage-editor-contract.ts';
import { NameGeneratorQuickAddStageEditor } from './nameGenerators/NameGeneratorQuickAddStageEditor.tsx';
import { NameGeneratorRosterStageEditor } from './nameGenerators/NameGeneratorRosterStageEditor.tsx';
import { NameGeneratorStageEditor } from './nameGenerators/NameGeneratorStageEditor.tsx';

/**
 * The three interfaces a participant names people with.
 *
 * One family, because they share their hard parts: the prompt list and its
 * attribute stamps, the nomination window, and the node type everything else
 * on the stage is described against. What differs is only how a person gets
 * into the network — a form, a single box, or a list they were already on.
 *
 * Declared through `defineStageEditorPart` so the exact set of interfaces this
 * family claims survives into the type system: see that function's comment for
 * what an annotation here would cost.
 */
export const nameGeneratorStageEditors = defineStageEditorPart({
  NameGenerator: NameGeneratorStageEditor,
  NameGeneratorQuickAdd: NameGeneratorQuickAddStageEditor,
  NameGeneratorRoster: NameGeneratorRosterStageEditor,
});
