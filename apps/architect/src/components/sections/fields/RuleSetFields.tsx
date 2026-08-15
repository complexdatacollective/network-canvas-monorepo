import { useSelector } from 'react-redux';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { Filter, Query } from '~/components/Query';
import type { RuleSetGroupProps } from '~/components/Query/Rules/Rules';
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
 * The rule builder is not one control but a region of them, so `Field`'s
 * injected identity has to land on a `role="group"` rather than on an input:
 * the group carries the `id` the field's `<label>` points at, takes its
 * accessible name from that label, and describes itself with the required
 * marker and the error region `BaseField` renders. Dropping these — as this
 * adapter used to — left the label pointing at nothing and the rule builder
 * anonymous and unmarked to assistive technology, while the visible "Rules *"
 * and its error message sat right beside it.
 */
const toRuleSetGroupProps = ({
  id,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
}: RuleSetFieldProps): RuleSetGroupProps => ({
  id,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
});

/**
 * Rule-builder field components.
 *
 * `Filter`/`Query` predate the form system: they take `rules`/`join`/`onChange`
 * rather than a value pair, and are handed the codebook as a prop. These
 * adapters replace the `withFieldConnector`/`withStoreConnector` HOC pair so
 * the rule builders can be driven by `ArchitectField` like any other control.
 *
 * The rule builders show no error message of their own: the surrounding
 * `BaseField` renders the field's errors, and showing one message twice is
 * worse than showing it once. `aria-invalid` is what marks the rule list
 * itself, in the same way it marks any other invalid control.
 *
 * Most stage editors mount BOTH of these — the Skip Logic section and the
 * Filter section — so each names its add buttons after the rule set it builds.
 * Sharing one set of names left ten interfaces offering two buttons called
 * "Add alter rule" and two called "Add edge rule", which to anyone navigating
 * by a list of controls is one control repeated (#1391). The names follow the
 * convention the rest of Architect's list add buttons use: "Add new …" for a
 * row assembled by choosing from material that already exists, which is what a
 * rule is — a variable and an operator picked out of the codebook.
 */
export const FilterField = (props: RuleSetFieldProps) => {
  const { value, onChange, allowEdgeRules } = props;
  const codebook = useRuleSetCodebook();
  const groupProps = toRuleSetGroupProps(props);

  return (
    <Filter
      {...groupProps}
      rules={value?.rules ?? []}
      join={value?.join}
      codebook={codebook}
      onChange={(nextValue) => onChange?.(asRuleSetValue(nextValue))}
      allowEdgeRules={allowEdgeRules}
      addAlterRuleLabel="Add new filter alter rule"
      addEdgeRuleLabel="Add new filter edge rule"
    />
  );
};

export const QueryField = (props: RuleSetFieldProps) => {
  const { value, onChange } = props;
  const codebook = useRuleSetCodebook();
  const groupProps = toRuleSetGroupProps(props);

  return (
    <Query
      {...groupProps}
      rules={value?.rules ?? []}
      join={value?.join}
      codebook={codebook}
      onChange={(nextValue) => onChange?.(asRuleSetValue(nextValue))}
      addAlterRuleLabel="Add new skip logic alter rule"
      addEdgeRuleLabel="Add new skip logic edge rule"
      addEgoRuleLabel="Add new skip logic ego rule"
    />
  );
};
