import {
  isArray,
  isEmpty,
  isNull,
  isObject,
  isUndefined,
  toPairs,
} from 'es-toolkit/compat';

type Prunable = Record<string, unknown> | unknown[];

const assignForType = (
  memo: Prunable,
  key: string,
  value: unknown,
): Prunable => {
  if (isArray(memo)) {
    return [...memo, value];
  }

  return {
    ...memo,
    [key]: value,
  };
};

const shouldPrune = (x: unknown) =>
  isNull(x) ||
  isUndefined(x) ||
  (isObject(x) && isEmpty(x)) ||
  (isArray(x) && (x as unknown[]).length === 0);

const pruneObjects = <T extends Prunable>(obj: T): T => {
  const getNextValue = (value: unknown): unknown => {
    if (isObject(value) || isArray(value)) {
      return pruneObjects(value as Prunable);
    }

    return value;
  };

  return toPairs(obj).reduce(
    (memo: Prunable, [key, value]: [string, unknown]) => {
      const nextValue = getNextValue(value);

      // Ditch nulls and empties
      if (shouldPrune(nextValue)) {
        return memo;
      }

      return assignForType(memo, key, nextValue);
    },
    isArray(obj) ? [] : {},
  ) as T;
};

export default pruneObjects;
