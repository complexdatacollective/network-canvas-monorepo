import type { VariableValue } from '@codaco/shared-consts';

export function isVariableValue(value: unknown): value is VariableValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(
      (item) =>
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean',
    );
  }

  if (typeof value !== 'object') return false;

  const x = Object.getOwnPropertyDescriptor(value, 'x');
  const y = Object.getOwnPropertyDescriptor(value, 'y');
  return (
    x !== undefined &&
    'value' in x &&
    typeof x.value === 'number' &&
    y !== undefined &&
    'value' in y &&
    typeof y.value === 'number'
  );
}

export function writeOwnAttribute(
  target: Record<string, VariableValue>,
  key: string,
  value: VariableValue,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function writeOwnAttributes(
  target: Record<string, VariableValue>,
  attributes: Record<string, VariableValue>,
): void {
  Object.entries(attributes).forEach(([key, value]) => {
    writeOwnAttribute(target, key, value);
  });
}

export function mergeOwnAttributes(
  existing: Record<string, VariableValue>,
  updates: Record<string, VariableValue>,
): Record<string, VariableValue> {
  const merged: Record<string, VariableValue> = {};
  writeOwnAttributes(merged, existing);
  writeOwnAttributes(merged, updates);
  return merged;
}
