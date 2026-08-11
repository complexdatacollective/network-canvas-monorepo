import { useCallback, useContext } from 'react';

import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { StageFormStoreApi } from '~/components/StageEditor/stageFormContext';

/**
 * Clears a value that may be held as a CONTAINER of registered leaves.
 *
 * The form store's `fields`/`dormantValues` are exact-string-keyed maps with
 * no hierarchy: `parameters` is never registered, only `parameters.type`,
 * `parameters.min` and friends. So `setFieldValue('parameters', undefined)`
 * clears nothing — and because an unregistered field's last value is parked
 * dormant and preferred over `initialValue` when it next registers, the
 * previous input control's parameters would come straight back the moment a
 * control that uses the same leaf is chosen again.
 *
 * Clearing every registered AND dormant descendant (plus the path itself, for
 * the values that really are one opaque field) is the container-safe reset.
 */
export const clearFieldValue = (storeApi: StageFormStoreApi, path: string) => {
  const state = storeApi.getState();
  const isDescendant = (name: string) =>
    name.startsWith(`${path}.`) || name.startsWith(`${path}[`);

  const names = new Set<string>([path]);
  for (const name of state.fields.keys()) {
    if (isDescendant(name)) names.add(name);
  }
  for (const name of state.dormantValues.keys()) {
    if (isDescendant(name)) names.add(name);
  }

  for (const name of names) {
    state.setFieldValue(name, undefined);
  }
};

/** `clearFieldValue` bound to the nearest form store. */
export const useClearValue = () => {
  const storeApi = useContext(FormStoreContext);

  return useCallback(
    (path: string) => {
      if (!storeApi) return;
      clearFieldValue(storeApi, path);
    },
    [storeApi],
  );
};
