import { useShallow } from 'zustand/react/shallow';

import type { FieldValue } from '../Field/types';
import {
  type FieldNameMode,
  resolveFieldPath,
  useFieldNamespace,
  useFieldNamespacePath,
} from '../FieldNamespace';
import useFormStore from './useFormStore';

/**
 * Hook to get form field values by field names.
 * Field names are resolved against the current FieldNamespace context.
 *
 * A name the form holds somewhere other than at a field of that name reads as
 * the assembled value: a CONTAINER of leaves (`parameters`, when only
 * `parameters.type` and `parameters.min` are registered) and a sub-path of a
 * compound field (`parameters.type`, when only `parameters` is registered)
 * both resolve — see the store's `getValue`, which also owns keeping that
 * assembled object referentially stable, so such a read here re-renders no
 * more often than a leaf one.
 *
 * @param fieldNames - Array of field names to watch (relative to current namespace)
 * @returns Record of field names (as provided, not resolved) to their values
 */
export function useFormValue<
  const K extends readonly string[],
  T extends FieldValue = FieldValue,
>(
  fieldNames: K,
  nameMode: FieldNameMode = 'legacy',
): Record<K[number], T | undefined> {
  const namespace = useFieldNamespacePath();
  const namespaceName = useFieldNamespace();

  return useFormStore(
    useShallow((state) => {
      const values: Record<string, T | undefined> = {};
      for (const name of fieldNames) {
        const resolvedPath = resolveFieldPath(namespace, name, nameMode);
        const publicName = namespaceName ? `${namespaceName}.${name}` : name;
        const value = state.pathOperations
          ? state.pathOperations.getValue(resolvedPath)
          : state.getValue(publicName);
        Object.defineProperty(values, name, {
          configurable: true,
          enumerable: true,
          value,
          writable: true,
        });
      }
      return values as Record<K[number], T | undefined>;
    }),
  );
}

/**
 * Hook to ask whether the form holds anything for each of `fieldNames` — see
 * the store's `hasValue`. Container names and sub-paths of a compound field
 * count, on the same terms `useFormValue` reads them.
 *
 * The companion to `useFormValue` for a caller layering live values over
 * committed ones: a value read alone reports the same `undefined` for a field
 * that has not registered yet as for one the person has deliberately emptied,
 * and merging on that revives the value they just cleared.
 *
 * @param fieldNames - Array of field names to watch (relative to current namespace)
 * @returns Record of field names (as provided, not resolved) to whether the form holds a value
 */
export function useFormHasValue<const K extends readonly string[]>(
  fieldNames: K,
  nameMode: FieldNameMode = 'legacy',
): Record<K[number], boolean> {
  const namespace = useFieldNamespacePath();
  const namespaceName = useFieldNamespace();

  return useFormStore(
    useShallow((state) => {
      const present: Record<string, boolean> = {};
      for (const name of fieldNames) {
        const resolvedPath = resolveFieldPath(namespace, name, nameMode);
        const publicName = namespaceName ? `${namespaceName}.${name}` : name;
        Object.defineProperty(present, name, {
          configurable: true,
          enumerable: true,
          value: state.pathOperations
            ? state.pathOperations.hasValue(resolvedPath)
            : state.hasValue(publicName),
          writable: true,
        });
      }
      return present as Record<K[number], boolean>;
    }),
  );
}
