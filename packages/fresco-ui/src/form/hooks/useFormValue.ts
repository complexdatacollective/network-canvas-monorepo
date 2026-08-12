import { useShallow } from 'zustand/react/shallow';

import type { FieldValue } from '../Field/types';
import {
  type FieldNameMode,
  resolveFieldPath,
  useFieldNamespacePath,
} from '../FieldNamespace';
import useFormStore from './useFormStore';

/**
 * Hook to get form field values by field names.
 * Field names are resolved against the current FieldNamespace context.
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

  return useFormStore(
    useShallow((state) => {
      const values: Record<string, T | undefined> = {};
      for (const name of fieldNames) {
        const resolvedPath = resolveFieldPath(namespace, name, nameMode);
        const field = state.getFieldState(resolvedPath);
        values[name] = field?.value as T | undefined;
      }
      return values as Record<K[number], T | undefined>;
    }),
  );
}
