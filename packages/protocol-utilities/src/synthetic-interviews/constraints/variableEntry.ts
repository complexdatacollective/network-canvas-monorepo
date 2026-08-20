import type {
  ComponentType,
  Variable,
  VariableSynthetic,
  VariableType,
} from '@codaco/protocol-validation';

export type VariableOptionInput = {
  label: string;
  value: string | number | boolean;
  negative?: boolean;
};

/**
 * The shape this engine reasons about: a codebook variable together with the id
 * it is filed under.
 *
 * Declared here rather than imported from the protocol builder, which is where
 * it used to live. The engine's input is a VARIABLE — its type, its options,
 * its validation rules — and nothing about that belongs to whatever assembled
 * the protocol. Keeping the definition local is what lets the engine be driven
 * from a parsed `Codebook` (see {@link toVariableEntry}) as readily as from a
 * builder's internal entries.
 */
export type VariableEntry = {
  id: string;
  name: string;
  type: VariableType;
  component?: ComponentType;
  options?: VariableOptionInput[];
  validation?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  /**
   * The author's statement about the DISTRIBUTION this variable's values are
   * drawn from, as distinct from `validation`, which says which values are
   * legal. The engine reads both: the descriptor chooses among the values the
   * rules allow.
   */
  synthetic?: VariableSynthetic;
  // Only meaningful on node text variables; the variable schema rejects
  // `encrypted` on ego/edge variables, so only the node codebook emits it.
  encrypted?: boolean;
};

/**
 * Read a codebook variable as an engine entry.
 *
 * The two shapes differ only in that a codebook files a variable under a record
 * key while an entry carries its own id, so this is a rename rather than a
 * translation — which is why the constraint analysis can run against a parsed
 * protocol without anything having to assemble builder entries first.
 */
export function toVariableEntry(id: string, variable: Variable): VariableEntry {
  const options =
    'options' in variable
      ? variable.options?.map((option) => ({
          label: option.label,
          value: option.value,
          ...('negative' in option && option.negative !== undefined
            ? { negative: option.negative }
            : {}),
        }))
      : undefined;

  return {
    id,
    name: variable.name,
    type: variable.type,
    component: 'component' in variable ? variable.component : undefined,
    options,
    validation: 'validation' in variable ? variable.validation : undefined,
    parameters: 'parameters' in variable ? variable.parameters : undefined,
    synthetic: 'synthetic' in variable ? variable.synthetic : undefined,
    ...('encrypted' in variable && variable.encrypted !== undefined
      ? { encrypted: variable.encrypted }
      : {}),
  };
}
