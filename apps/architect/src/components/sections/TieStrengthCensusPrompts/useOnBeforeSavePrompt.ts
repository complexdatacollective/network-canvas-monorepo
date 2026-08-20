import { useVariableOptionsCommit } from '../useVariableOptionsCommit';

/**
 * The edge subject a Tie-Strength Census prompt writes, which the prompt
 * chooses for itself rather than inheriting from the stage.
 *
 * Shared by this editor's two save-time surfaces — the option-list commit and
 * the cross-class `editorValidate` — so they cannot judge the same row
 * against different edge types.
 */
export const tieStrengthPromptSubject = (row: Record<string, unknown>) => ({
  entity: 'edge' as const,
  type: typeof row.createEdge === 'string' ? row.createEdge : '',
});

/**
 * The `DialogArrayField.onBeforeSave` replacement for the deleted
 * `withPromptChangeHandler` HOC.
 *
 * Unlike CategoricalBinPrompts's version, the edge variable's subject is
 * chosen INSIDE the prompt being saved, not by the stage's own subject — so
 * the subject is derived from the row, and the shared commit reads the
 * codebook fresh from the store at save time (as the original enhancer did)
 * rather than from a subject-scoped selector memoised at mount.
 */
export function useOnBeforeSaveTieStrengthPrompt() {
  return useVariableOptionsCommit({
    variableField: 'edgeVariable',
    optionsField: 'variableOptions',
    subjectForRow: tieStrengthPromptSubject,
  });
}
