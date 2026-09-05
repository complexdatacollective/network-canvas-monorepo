import { useCallback, useMemo } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import type { RuleDraft } from './rule.ts';
import type { RuleTypeOption } from './RuleEditorDialog.tsx';
import RuleList from './RuleList.tsx';
import { asRuleSetValue, JOIN_OPTIONS, type RuleSetValue } from './ruleSet.ts';

const NODE_RULE: RuleTypeOption = {
  label: 'Node - match a node type or one of its attributes.',
  value: 'node',
};
const EDGE_RULE: RuleTypeOption = {
  label: 'Edge - match an edge type or one of its attributes.',
  value: 'edge',
};
const EGO_RULE: RuleTypeOption = {
  label: 'Ego - match one of the ego attributes.',
  value: 'ego',
};

export type RuleSetFieldProps = CreateFormFieldProps<
  RuleSetValue,
  'div',
  {
    /**
     * A network filter narrows the entities a stage works on; a query asks a
     * yes/no question about the whole network. Only a query can ask about the
     * ego, because only a query has anything to do with the answer.
     */
    variant?: 'filter' | 'query';
    allowEdgeRules?: boolean;
    /**
     * What this rule set's one add control is called.
     *
     * Required, and supplied as a whole string, so the two rule builders
     * commonly mounted in one stage editor stay distinguishable to screen
     * readers and voice control.
     */
    addRuleLabel: string;
  }
>;

/**
 * A rule builder as one form field.
 *
 * The whole rule set — the rules and how they combine — is ONE value of the
 * surrounding form, so the parts inside it are not registered fields. That is
 * why the join control below is an `UnconnectedField`, and why it carries no
 * validation of its own: a missing join is reported by the rule set's own
 * validation, and the same message shown twice is worse than shown once.
 *
 * The rule builder is not one control but a region of them, so the identity
 * `Field` injects has to land on a `role="group"` rather than on an input: the
 * group carries the `id` the field's `<label>` points at, takes its accessible
 * name from that label, and describes itself with the required marker and the
 * error region the field renders. Dropping these leaves the label pointing at
 * nothing and the rule builder anonymous and unmarked to assistive technology,
 * while the visible "Rules *" and its error message sit right beside it.
 *
 * The codebook comes from the editor's protocol context. Nothing about this
 * control knows where the protocol is stored, and a codebook change made
 * elsewhere reaches every rule preview and every control inside the rule
 * editor as soon as the session reports it.
 */
function RuleSetControl({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  variant = 'filter',
  allowEdgeRules = true,
  addRuleLabel,
  disabled = false,
  readOnly = false,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
}: RuleSetFieldProps) {
  const { protocolContext } = useStageEditorForm();
  const codebook = protocolContext.codebook;

  const ruleSet = asRuleSetValue(value);
  const rules = ruleSet?.rules ?? [];
  const join = ruleSet?.join;

  const ruleTypes = useMemo(() => {
    const types: RuleTypeOption[] = [NODE_RULE];
    if (allowEdgeRules) types.push(EDGE_RULE);
    if (variant === 'query') types.push(EGO_RULE);
    return types;
  }, [allowEdgeRules, variant]);

  const updateRules = useCallback(
    (nextRules: RuleDraft[]) => {
      // A single rule combines with nothing, so it carries no join. Keeping a
      // stale one would leave a key in the saved stage that describes a
      // combination the rule set no longer has.
      onChange?.(
        nextRules.length < 2
          ? { rules: nextRules }
          : { join, rules: nextRules },
      );
    },
    [join, onChange],
  );

  const updateJoin = useCallback(
    (nextJoin: string) => onChange?.({ join: nextJoin, rules: [...rules] }),
    [onChange, rules],
  );

  return (
    <div
      id={id}
      data-name={name}
      role="group"
      onBlur={onBlur}
      onFocus={onFocus}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-required={ariaRequired}
      aria-invalid={ariaInvalid}
      className="flex flex-col gap-8"
    >
      <RuleList
        rules={rules}
        codebook={codebook}
        ruleTypes={ruleTypes}
        addButtonLabel={addRuleLabel}
        onChange={updateRules}
        hasError={ariaInvalid === true}
        disabled={disabled}
        readOnly={readOnly}
      />

      {rules.length > 1 && (
        <UnconnectedField
          name="join"
          component={RadioGroupField}
          label="Rule Matching"
          hint="When you have multiple rules, how should matching work?"
          options={[...JOIN_OPTIONS]}
          value={join}
          disabled={disabled}
          readOnly={readOnly}
          onChange={(next) => {
            if (typeof next === 'string') updateJoin(next);
          }}
        />
      )}
    </div>
  );
}

/**
 * The two rule builders a stage editor mounts.
 *
 * Most editors mount BOTH — a network filter and a skip-logic query — so each
 * names its add control after the rule set it builds. The names follow the
 * convention the rest of the builder's list add controls use: "Add new …" for
 * a row assembled by choosing from material that already exists.
 */
export function FilterRuleSetField(
  props: Omit<RuleSetFieldProps, 'variant' | 'addRuleLabel'>,
) {
  return (
    <RuleSetControl
      {...props}
      variant="filter"
      addRuleLabel="Add new filter rule"
    />
  );
}

export function QueryRuleSetField(
  props: Omit<RuleSetFieldProps, 'variant' | 'addRuleLabel' | 'allowEdgeRules'>,
) {
  return (
    <RuleSetControl
      {...props}
      variant="query"
      addRuleLabel="Add new skip logic rule"
    />
  );
}
