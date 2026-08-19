import { useVariableOptionsCommit } from '../useVariableOptionsCommit';

/**
 * The `DialogArrayField.onBeforeSave` replacement for the deleted
 * `withPromptChangeHandler` HOC.
 *
 * Unlike CategoricalBinPrompts's version, the edge variable's subject
 * (`{entity: 'edge', type: createEdge}`) is chosen INSIDE the prompt being
 * saved, not by the stage's own subject — so the subject is derived from the
 * row, and the shared commit reads the codebook fresh from the store at save
 * time (as the original enhancer did) rather than from a subject-scoped
 * selector memoised at mount.
 *
 * The prompt has no follow-up "other" attribute, so it configures no mirror
 * gate.
 */
export function useOnBeforeSaveTieStrengthPrompt() {
  return useVariableOptionsCommit({
    variableField: 'edgeVariable',
    originalVariableField: '_originalEdgeVariable',
    optionsField: 'variableOptions',
    subjectForRow: (row) => ({
      entity: 'edge',
      type: typeof row.createEdge === 'string' ? row.createEdge : '',
    }),
  });
}
