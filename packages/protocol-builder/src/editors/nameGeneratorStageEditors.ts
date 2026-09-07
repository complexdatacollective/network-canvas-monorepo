import { defineStageEditorPart } from '../stage-editor-contract.ts';
import { NameGeneratorStageEditor } from './nameGenerators/NameGeneratorStageEditor.tsx';

/**
 * The interfaces a participant names people with.
 *
 * One family, because they share their hard parts: the prompt list and its
 * attribute stamps, the nomination window, and the node type everything else
 * on the stage is described against. What differs between them is only how a
 * person gets into the network — a form, a single box, or a list they were
 * already on. The form-based one is here; the other two join it as they land.
 *
 * Declared through `defineStageEditorPart` so the exact set of interfaces this
 * family claims survives into the type system: see that function's comment for
 * what an annotation here would cost.
 */
export const nameGeneratorStageEditors = defineStageEditorPart({
  NameGenerator: NameGeneratorStageEditor,
});
