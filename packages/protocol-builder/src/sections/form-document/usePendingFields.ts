import { useCallback, useEffect, useRef, useState } from 'react';

import type { StageFormStoreApi } from '../../form/stageEditorContext.ts';

const NO_FIELDS: ReadonlySet<string> = new Set();

type PendingFields = Readonly<{
  /** The fields being put in, as this render draws them. */
  pending: ReadonlySet<string>;
  /** The fields being put in now, for a rule that runs between renders. */
  pendingNow: () => ReadonlySet<string>;
  /** Marks a field as being put in. */
  start: (fieldId: string) => void;
  /** Marks every field as finished. */
  finishAll: () => void;
}>;

/**
 * The fields of a form that are still being put in: from the Field button
 * or its keyboard command until the researcher leaves the form or saves the
 * stage. Their problems are not shown while the researcher chooses the
 * attribute and types the question.
 *
 * A save judges every field: the form is marked as submitting before its
 * fields are validated, and that finishes them all.
 */
export function usePendingFields(storeApi: StageFormStoreApi): PendingFields {
  // Read by the rules as they run, between renders, so kept in a ref as well
  // as in state.
  const pendingRef = useRef<ReadonlySet<string>>(NO_FIELDS);
  const [pending, setPendingState] = useState<ReadonlySet<string>>(NO_FIELDS);
  const setPending = useCallback((next: ReadonlySet<string>) => {
    pendingRef.current = next;
    setPendingState(next);
  }, []);
  const start = useCallback(
    (fieldId: string) => setPending(new Set([...pendingRef.current, fieldId])),
    [setPending],
  );
  const finishAll = useCallback(() => {
    if (pendingRef.current.size > 0) setPending(NO_FIELDS);
  }, [setPending]);
  const pendingNow = useCallback(() => pendingRef.current, []);
  useEffect(
    () =>
      storeApi.subscribe((state) => {
        if (state.isSubmitting) finishAll();
      }),
    [finishAll, storeApi],
  );
  return { pending, pendingNow, start, finishAll };
}
