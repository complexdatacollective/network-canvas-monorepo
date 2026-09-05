import { useCallback, useMemo } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';

import PreviewRules from './PreviewRules';
import type { RuleTypeOption } from './ruleCodebook';
import type { Rule } from './validateRule';

/**
 * The identity `Field` hands its control, forwarded to the rule builder's
 * `role="group"` because a rule set is a region rather than a single input.
 * `RuleSetFields` fills these in; a caller outside a form may omit them.
 *
 * `aria-invalid` is global in ARIA 1.2, so the group may carry it.
 * `aria-required` is not: `group` is not among the roles that support it, and
 * axe reports it there as a critical `aria-allowed-attr` failure whatever the
 * value. So the required state is deliberately absent from this type, and
 * reaches assistive technology through the description instead — the visually
 * hidden "Required" marker `BaseField` renders and `aria-describedby` names.
 */
export type RuleSetGroupProps = {
  'id'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};

/**
 * Which rule set this builder is, and what its one list-add control is called.
 *
 * The label is required and supplied as a whole string so the two builders
 * commonly mounted in one stage editor remain distinguishable to screen
 * readers and voice control. The rule's target is selected in the editor,
 * instead of representing one editable list with three unrelated add buttons.
 */
type RuleSetVariantProps =
  | {
      type?: 'filter';
      addRuleLabel: string;
    }
  | {
      type: 'query';
      addRuleLabel: string;
    };

export type RulesOuterProps = RuleSetGroupProps &
  RuleSetVariantProps & {
    rules?: Rule[];
    join?: string;
    onChange?: (value: unknown) => void;
    codebook?: Record<string, unknown>;
    allowEdgeRules?: boolean;
  };

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

const JOIN_OPTIONS = [
  { label: 'All rules must match', value: 'AND' },
  { label: 'Any rule can match', value: 'OR' },
];

const Rules = ({
  allowEdgeRules = true,
  rules = [],
  join,
  codebook = {},
  id,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  addRuleLabel,
  onChange = () => {},
  ...variantProps
}: RulesOuterProps) => {
  const ruleTypes = useMemo(() => {
    const options = [NODE_RULE];
    if (allowEdgeRules) options.push(EDGE_RULE);
    if (variantProps.type === 'query') options.push(EGO_RULE);
    return options;
  }, [allowEdgeRules, variantProps.type]);

  const updateJoin = useCallback(
    (nextJoin: string) =>
      onChange({
        join: nextJoin,
        rules,
      }),
    [onChange, rules],
  );

  const updateRules = useCallback(
    (nextRules: Rule[]) => {
      if (nextRules.length < 2) {
        onChange({ rules: nextRules });
        return;
      }

      onChange({
        join,
        rules: nextRules,
      });
    },
    [join, onChange],
  );

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      className="flex flex-col gap-8"
    >
      <PreviewRules
        rules={rules}
        codebook={codebook}
        ruleTypes={ruleTypes}
        addButtonLabel={addRuleLabel}
        onChange={updateRules}
        hasError={!!ariaInvalid}
      />

      {rules.length > 1 && (
        /*
          The whole rule set is ONE value of the surrounding form (see
          `RuleSetFields`), so its parts are not registered fields — hence
          `UnconnectedField` rather than `ArchitectField`. It carries no rules
          of its own either: a missing join is reported by `ruleValidator` on
          the rule set itself, and the same message shown twice is worse than
          shown once.
        */
        <UnconnectedField
          name="join"
          component={RadioGroupField}
          label="Rule Matching"
          hint="When you have multiple rules, how should matching work?"
          options={JOIN_OPTIONS}
          value={join}
          onChange={(value) => {
            if (typeof value === 'string') updateJoin(value);
          }}
        />
      )}
    </div>
  );
};

export default Rules;
