import { useMemo } from 'react';

import { useVariableOptionsCommit } from '../useVariableOptionsCommit';

/**
 * The `DialogArrayField.onBeforeSave` replacement for the deleted
 * `withPromptChangeHandler` HOC. Shared with `OrdinalBinPrompts`, exactly as
 * that HOC was.
 *
 * It owns the OPTION LIST half of a bin prompt's save: the draft's
 * contradiction check, the interface-owned option refusal, and the codebook
 * write. The cross-class exclusivity gates on the prompt's own variable picks
 * are `useCrossClassEditorValidate`'s, wired as `editorValidate` in each
 * section — see `CategoricalBinPrompts.tsx`.
 */
export function useOnBeforeSavePrompt(
  entity: 'node' | 'edge' | 'ego',
  type: string | null,
) {
  const subject = useMemo(
    () => ({ entity, type: type ?? undefined }),
    [entity, type],
  );

  return useVariableOptionsCommit({
    variableField: 'variable',
    optionsField: 'variableOptions',
    // The bin writes the stage's own subject, fixed for the whole editor.
    subjectForRow: () => subject,
  });
}
