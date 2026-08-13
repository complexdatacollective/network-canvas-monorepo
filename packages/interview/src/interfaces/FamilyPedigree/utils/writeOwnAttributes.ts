import type { VariableValue } from '@codaco/shared-consts';

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
