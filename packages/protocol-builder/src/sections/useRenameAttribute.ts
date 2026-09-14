import { useCallback } from 'react';

import { useRenameCodebookVariable } from '../codebook/useCodebookVariableEdits.ts';
import type { RenameOutcome } from '../fields/VariablePickerField.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import type { CodebookSubject } from '../protocol-context.ts';

/**
 * What a section hands its attribute pickers so the attribute they hold can be
 * renamed from the pill that shows it.
 *
 * Architect renamed an attribute from that pill and nowhere else — its
 * codebook screen had no row editor — so every picker's held value offered it
 * (`components/VariablePicker.tsx`). Handed down as a prop rather than read
 * inside the field, because the field is host-neutral by design: it is given
 * what a section knows about the protocol, and one that read the protocol for
 * itself could not be rendered outside a stage editor at all.
 *
 * Absent while the stage editor is read-only, which is also what takes the
 * pill's button away: a control that cannot write is a statement.
 */
export function useRenameAttributeProps(
  subject: CodebookSubject | undefined,
): Readonly<{
  onRename?: (variableId: string, name: string) => Promise<RenameOutcome>;
}> {
  const rename = useRenameCodebookVariable();
  const { readOnly } = useStageEditorForm();

  const onRename = useCallback(
    async (variableId: string, name: string): Promise<RenameOutcome> => {
      const outcome = await rename(subject, variableId, name);
      return outcome.status === 'refused'
        ? { status: 'refused', message: outcome.message }
        : { status: 'written' };
    },
    [rename, subject],
  );

  return readOnly || subject === undefined ? {} : { onRename };
}
