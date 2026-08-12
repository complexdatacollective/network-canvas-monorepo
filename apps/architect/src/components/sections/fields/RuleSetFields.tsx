import { useSelector } from 'react-redux';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { Filter, Query } from '~/components/Query';
import type { Rule } from '~/components/Query/Rules/validateRule';
import { getCodebook } from '~/selectors/protocol';

/** The stored shape of a filter/query field: one opaque object value. */
export type RuleSetValue = {
  rules?: Rule[];
  join?: string;
};

type RuleSetFieldProps = CreateFormFieldProps<
  RuleSetValue,
  'div',
  { allowEdgeRules?: boolean }
>;

const asRuleSetValue = (value: unknown): RuleSetValue | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RuleSetValue)
    : undefined;

const useRuleSetCodebook = () =>
  useSelector(getCodebook) as unknown as Record<string, unknown>;

/**
 * Rule-builder field components.
 *
 * `Filter`/`Query` predate the form system: they take `rules`/`join`/`onChange`
 * rather than a value pair, and are handed the codebook as a prop. These
 * adapters replace the `withFieldConnector`/`withStoreConnector` HOC pair so
 * the rule builders can be driven by `ArchitectField` like any other control.
 *
 * The rule builders' own inline error display is deliberately left unfed: the
 * surrounding `BaseField` renders the field's errors, and showing one message
 * twice is worse than showing it once.
 */
export const FilterField = ({
  value,
  onChange,
  allowEdgeRules,
}: RuleSetFieldProps) => {
  const codebook = useRuleSetCodebook();

  return (
    <Filter
      rules={value?.rules ?? []}
      join={value?.join}
      codebook={codebook}
      onChange={(nextValue) => onChange?.(asRuleSetValue(nextValue))}
      allowEdgeRules={allowEdgeRules}
    />
  );
};

export const QueryField = ({ value, onChange }: RuleSetFieldProps) => {
  const codebook = useRuleSetCodebook();

  return (
    <Query
      rules={value?.rules ?? []}
      join={value?.join}
      codebook={codebook}
      onChange={(nextValue) => onChange?.(asRuleSetValue(nextValue))}
    />
  );
};
