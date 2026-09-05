import { useCallback, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { type MessageConfig, formatConfig } from '~/i18n/formatConfig';

import PreviewRules from './PreviewRules';
import type { RuleTypeOption } from './ruleCodebook';
import type { Rule } from './validateRule';
const configMessages = defineMessages({
  nodeMatchANodeType: {
    id: 'architect.query.rules.rules.config.nodeMatchANodeType',
    defaultMessage: 'Node - match a node type or one of its attributes.',
    description:
      'Presentation label or description in components/Query/Rules/Rules.tsx. Identifiers are not translated.',
  },
  edgeMatchAnEdgeType: {
    id: 'architect.query.rules.rules.config.edgeMatchAnEdgeType',
    defaultMessage: 'Edge - match an edge type or one of its attributes.',
    description:
      'Presentation label or description in components/Query/Rules/Rules.tsx. Identifiers are not translated.',
  },
  egoMatchOneOfThe: {
    id: 'architect.query.rules.rules.config.egoMatchOneOfThe',
    defaultMessage: 'Ego - match one of the ego attributes.',
    description:
      'Presentation label or description in components/Query/Rules/Rules.tsx. Identifiers are not translated.',
  },
  allRulesMustMatch: {
    id: 'architect.query.rules.rules.config.allRulesMustMatch',
    defaultMessage: 'All rules must match',
    description:
      'Presentation label or description in components/Query/Rules/Rules.tsx. Identifiers are not translated.',
  },
  anyRuleCanMatch: {
    id: 'architect.query.rules.rules.config.anyRuleCanMatch',
    defaultMessage: 'Any rule can match',
    description:
      'Presentation label or description in components/Query/Rules/Rules.tsx. Identifiers are not translated.',
  },
});
const messages = defineMessages({
  ruleMatching: {
    id: 'architect.query.rules.rules.ruleMatching',
    defaultMessage: 'Rule Matching',
    description: 'The label text in components / Query / Rules / Rules.',
  },
  whenYouHaveMultipleRulesHow: {
    id: 'architect.query.rules.rules.whenYouHaveMultipleRulesHow',
    defaultMessage: 'When you have multiple rules, how should matching work?',
    description: 'The hint text in components / Query / Rules / Rules.',
  },
});

/**
 * The identity `Field` hands its control, forwarded to the rule builder's
 * `role="group"` because a rule set is a region rather than a single input.
 * `RuleSetFields` fills these in; a caller outside a form may omit them.
 */
export type RuleSetGroupProps = {
  'id'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
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

const NODE_RULE: MessageConfig<RuleTypeOption> = {
  label: configMessages.nodeMatchANodeType,
  value: 'node',
};
const EDGE_RULE: MessageConfig<RuleTypeOption> = {
  label: configMessages.edgeMatchAnEdgeType,
  value: 'edge',
};
const EGO_RULE: MessageConfig<RuleTypeOption> = {
  label: configMessages.egoMatchOneOfThe,
  value: 'ego',
};

const JOIN_OPTIONS = [
  { label: configMessages.allRulesMustMatch, value: 'AND' },
  { label: configMessages.anyRuleCanMatch, value: 'OR' },
];

const Rules = ({
  allowEdgeRules = true,
  rules = [],
  join,
  codebook = {},
  id,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  addRuleLabel,
  onChange = () => {},
  ...variantProps
}: RulesOuterProps) => {
  const intl = useAppIntl();
  const ruleTypes = useMemo(() => {
    const options = [formatConfig(NODE_RULE, intl)];
    if (allowEdgeRules) options.push(formatConfig(EDGE_RULE, intl));
    if (variantProps.type === 'query')
      options.push(formatConfig(EGO_RULE, intl));
    return options;
  }, [allowEdgeRules, variantProps.type, intl]);

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
      aria-required={ariaRequired}
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
          label={intl.formatMessage(messages.ruleMatching)}
          hint={intl.formatMessage(messages.whenYouHaveMultipleRulesHow)}
          options={formatConfig(JOIN_OPTIONS, intl)}
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
