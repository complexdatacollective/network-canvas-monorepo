import { useMemo } from 'react';

import { useVariableOptionsCommit } from '../useVariableOptionsCommit';

/**
 * The `DialogArrayField.onBeforeSave` replacement for the deleted
 * `withPromptChangeHandler` HOC. Shared with `OrdinalBinPrompts`, exactly as
 * that HOC was.
 *
 * A prompt row's PRE-EDIT `variable`/`otherVariable` no longer arrive as a
 * dialog-form `initialValues` prop — `CategoricalBinPrompts.tsx`'s
 * `itemSelector` stashes them on the row under `_originalVariable`/
 * `_originalOtherVariable` (distinct from the real field names, so a save
 * cannot resurrect them), which is where the shared commit reads its
 * unchanged-pick escape from.
 *
 * `otherVariable`'s mirror gate is a no-op for OrdinalBin prompts, which have
 * no follow-up option: the field is simply never present on the row.
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
    originalVariableField: '_originalVariable',
    optionsField: 'variableOptions',
    // The bin writes the stage's own subject, fixed for the whole editor.
    subjectForRow: () => subject,
    validatedPick: {
      field: 'otherVariable',
      originalField: '_originalOtherVariable',
    },
  });
}
