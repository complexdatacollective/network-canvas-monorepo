import type { Variable, Variables } from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import type { VariableEntry } from '../types';
import type { ValueGenerator } from '../ValueGenerator';

export function toVariableEntry(id: string, variable: Variable): VariableEntry {
  const options =
    'options' in variable
      ? variable.options?.filter(
          (o): o is { label: string; value: string | number } =>
            typeof o.value !== 'boolean',
        )
      : undefined;

  return {
    id,
    name: variable.name,
    type: variable.type,
    component: 'component' in variable ? variable.component : undefined,
    options,
    validation: 'validation' in variable ? variable.validation : undefined,
  };
}

export function generateAttributes(
  variables: Variables | undefined,
  valueGen: ValueGenerator,
  index: number,
): Record<string, VariableValue> {
  if (!variables) return {};
  const attrs: Record<string, VariableValue> = {};
  for (const [varId, variable] of Object.entries(variables)) {
    const entry = toVariableEntry(varId, variable);
    attrs[varId] = valueGen.generateForVariable(entry, index);
  }
  return attrs;
}
