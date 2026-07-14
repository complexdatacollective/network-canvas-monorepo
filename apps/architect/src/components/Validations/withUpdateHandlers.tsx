import { omit } from 'es-toolkit/compat';
import { withHandlers } from 'react-recompose';

type ValidationValue = boolean | number | string | null;

/**
 * Applies a committed (key, value) pair to the validation map, renaming the
 * row from `oldKey` if given. `Validation.tsx` owns deciding whether a value
 * survives a rule-type change (and forces `true` for value-less rule types)
 * before this is ever called, via its own draft state and `isDraftComplete`
 * gate — so the value handed in here is already final and is stored as-is,
 * with no further "does this look stale" heuristic re-applied.
 */
export const getUpdatedValue = (
  previousValue: Record<string, ValidationValue>,
  key: string,
  value: ValidationValue,
  oldKey: string | null = null,
): Record<string, ValidationValue> => {
  // A disabled option should make this unreachable in the UI, but keep the
  // update lossless if a stale/programmatic event still requests a key that
  // belongs to another row. The old behavior overwrote the existing rule and
  // then removed the edited one.
  if (oldKey && key !== oldKey && Object.hasOwn(previousValue, key)) {
    return previousValue;
  }

  if (!oldKey) {
    return { ...previousValue, [key]: value };
  }

  return {
    ...omit(previousValue, oldKey),
    [key]: value,
  };
};

type HandlerProps = {
  update: (value: Record<string, ValidationValue>) => void;
  value: Record<string, ValidationValue>;
  setAddNew?: (value: boolean) => void;
};

const withUpdateHandlers = withHandlers<HandlerProps, object>({
  handleDelete:
    ({ update, value: previousValue }: HandlerProps) =>
    (key: string) => {
      const newValue = omit(previousValue, key);
      update(newValue);
    },
  handleChange:
    ({ update, value: previousValue }: HandlerProps) =>
    (key: string, value: ValidationValue, oldKey?: string) => {
      const newValue = getUpdatedValue(
        previousValue,
        key,
        value,
        oldKey ?? null,
      );
      update(newValue);
    },
  handleAddNew:
    ({ update, value: previousValue, setAddNew }: HandlerProps) =>
    (key: string, value: ValidationValue) => {
      const newValue = getUpdatedValue(previousValue, key, value);
      update(newValue);
      setAddNew?.(false);
    },
});

export default withUpdateHandlers;
