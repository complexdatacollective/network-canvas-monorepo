import { type RefObject, useContext, useEffect } from 'react';

import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { focusFirstError } from '@codaco/fresco-ui/form/utils/focusFirstError';

/** What the steps of the dialog that starts a review share. */

export const textOf = (value: unknown, fallback: string) =>
  typeof value === 'string' ? value : fallback;

/**
 * Sends focus to the first invalid field once Continue has been refused. The
 * wizard validates the step's fields itself and only scrolls to the first
 * error; this answers the moment that validation ends with errors.
 */
export const useFocusFirstErrorOnRefusal = (
  root: RefObject<HTMLElement | null>,
) => {
  const store = useContext(FormStoreContext);
  useEffect(
    () =>
      store?.subscribe((state, previous) => {
        if (
          previous.isValidating &&
          !state.isValidating &&
          Object.keys(state.errors.fieldErrors).length > 0
        ) {
          focusFirstError(state.errors, root.current);
        }
      }),
    [store, root],
  );
};
