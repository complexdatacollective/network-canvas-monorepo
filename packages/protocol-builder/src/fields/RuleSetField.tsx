import { useCallback, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';

import type { RuleDraft } from '../rules/rule.ts';
import type { RuleTargetType } from '../rules/ruleCodebook.ts';
import {
  EdgeCountRulesProvider,
  useRuleCodebook,
} from '../rules/ruleCodebookSource.ts';
import type { RuleTypeOption } from '../rules/RuleEditorDialog.tsx';
import RuleList from '../rules/RuleList.tsx';
import {
  asRuleSetValue,
  joinOptions,
  ruleSetAllowsEncryptedAttributes,
  type RuleSetValue,
  type RuleSetVariant,
  ruleSetTargets,
} from '../rules/ruleSet.ts';

/**
 * What each target is offered as, in the sentence that says what it matches.
 *
 * Keyed by target and read through the set of targets this variant may hold,
 * so which rules the editor OFFERS and which rules it ACCEPTS are the same
 * list read twice rather than two lists that can disagree — which is how an
 * ego rule came to be unbuildable in a filter and unreported inside one.
 */
const RULE_TYPE_LABELS = defineMessages({
  node: {
    id: 'protocolBuilder.ruleSet.targetNode',
    defaultMessage: 'Node - match a node type or one of its attributes.',
    description:
      'Choice offered when a researcher starts a rule: the rule will be about a node — a member of the interview network — either that a node of some type exists at all, or that one of its attributes has a particular value.',
  },
  edge: {
    id: 'protocolBuilder.ruleSet.targetEdge',
    defaultMessage: 'Edge - match an edge type or one of its attributes.',
    description:
      'Choice offered when a researcher starts a rule: the rule will be about an edge — a relationship between two network members — either that an edge of some type exists at all, or that one of its attributes has a particular value.',
  },
  ego: {
    id: 'protocolBuilder.ruleSet.targetEgo',
    defaultMessage: 'Ego - match one of the ego attributes.',
    description:
      'Choice offered when a researcher starts a rule: the rule will be about the ego — the interview participant themselves — and about one of the attributes recorded for them.',
  },
}) satisfies Record<RuleTargetType, MessageDescriptor>;

const messages = defineMessages({
  joinLabel: {
    id: 'protocolBuilder.ruleSet.joinLabel',
    defaultMessage: 'Rule Matching',
    description:
      'Label of the control where a researcher says whether every rule in a set has to match or any one of them will do.',
  },
  joinHint: {
    id: 'protocolBuilder.ruleSet.joinHint',
    defaultMessage: 'When you have multiple rules, how should matching work?',
    description:
      'Guidance under the control where a researcher says whether every rule in a set has to match or any one of them will do.',
  },
  addFilterRule: {
    id: 'protocolBuilder.ruleSet.addFilterRule',
    defaultMessage: 'Add new filter rule',
    description:
      'Action that adds a rule to the set narrowing which parts of the interview network a stage works on. A stage is one step of an interview. Named for its own rule set because a stage editor commonly shows two rule builders at once.',
  },
  addConditionRule: {
    id: 'protocolBuilder.ruleSet.addConditionRule',
    defaultMessage: 'Add new rule',
    description:
      'Action that adds a rule to the rules of an “If” in a piece of text that a participant reads. The text shows one wording when the rules are met and another when they are not.',
  },
  conditionTargetNode: {
    id: 'protocolBuilder.ruleSet.conditionTargetNode',
    defaultMessage: 'Node - compare one of the attributes of the node.',
    description:
      'Choice offered when a researcher starts a rule for an “If” in a piece of text: the rule will compare an attribute of the node (network member) the text is shown with.',
  },
  conditionTargetEdge: {
    id: 'protocolBuilder.ruleSet.conditionTargetEdge',
    defaultMessage:
      'Edges - whether the node has an edge, how many it has, or an attribute of one.',
    description:
      'Choice offered when a researcher starts a rule for an “If” in a piece of text: the rule will be about the edges (relationships) that join the node the text is shown with to other nodes.',
  },
  conditionTargetOwnEdge: {
    id: 'protocolBuilder.ruleSet.conditionTargetOwnEdge',
    defaultMessage: 'Edge - compare one of the attributes of the edge.',
    description:
      'Choice offered when a researcher starts a rule for an “If” in a piece of text shown with one edge (a relationship between two network members): the rule will compare an attribute of that edge.',
  },
  conditionTargetEgo: {
    id: 'protocolBuilder.ruleSet.conditionTargetEgo',
    defaultMessage:
      'Participant - compare one of the participant’s attributes.',
    description:
      'Choice offered when a researcher starts a rule for an “If” in a piece of text: the rule will compare an attribute recorded for the participant themselves.',
  },
  addSkipLogicRule: {
    id: 'protocolBuilder.ruleSet.addSkipLogicRule',
    defaultMessage: 'Add new skip logic rule',
    description:
      'Action that adds a rule to the set deciding whether a stage is shown to a participant at all. A stage is one step of an interview. Named for its own rule set because a stage editor commonly shows two rule builders at once.',
  },
});

export type RuleSetFieldProps = CreateFormFieldProps<
  RuleSetValue,
  'div',
  {
    /**
     * What this set narrows, which is what decides the targets it may offer
     * and hold: a stage's network filter, a skip-logic query, or one of the
     * two side-panel sources. See `RULE_SET_TARGETS`, which states what each
     * of them may be about and why — a stored rule this variant cannot be
     * about is reported here rather than refused by the schema alone.
     */
    variant?: RuleSetVariant;
    /**
     * What this rule set's one add control is called.
     *
     * Required, and supplied as a whole string, so the two rule builders
     * commonly mounted in one stage editor stay distinguishable to screen
     * readers and voice control.
     */
    addRuleLabel: string;
    /**
     * What the set's rules may be about, in place of what `variant` allows:
     * a condition's follow from what its text is shown with.
     */
    targets?: readonly RuleTargetType[];
    /** What each target is offered as, in place of the usual sentences. */
    targetLabels?: Readonly<Partial<Record<RuleTargetType, string>>>;
    /**
     * The label of the control that says whether all of the rules or any one
     * of them must match. With a label, the control is shown as soon as there
     * is a rule, side by side, without a hint; without one, it is shown only
     * for more than one rule.
     */
    joinLabel?: string;
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
 * The codebook comes from the package's protocol read model, which this
 * control subscribes to where it renders. Nothing about it knows where the
 * protocol is stored, and a codebook edit committed elsewhere reaches every
 * rule preview and every control inside the rule editor as it lands.
 */
const NO_RULES: readonly RuleDraft[] = [];

function RuleSetControl({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  variant = 'filter',
  addRuleLabel,
  targets,
  targetLabels,
  joinLabel,
  disabled = false,
  readOnly = false,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: RuleSetFieldProps) {
  const codebook = useRuleCodebook();
  const intl = useAppIntl();

  // Read once per value: the reader builds a new array of rules each time it
  // runs, and the callbacks below depend on that array.
  const ruleSet = useMemo(() => asRuleSetValue(value), [value]);
  const rules = ruleSet?.rules ?? NO_RULES;
  const join = ruleSet?.join;

  // What the rules in this set may be ABOUT, which is both what it offers to
  // build and what a stored rule is held to. One answer rather than two: a
  // target this set cannot be about is one the researcher must not be offered
  // AND one a stored rule is reported for, and a set that offered less than it
  // accepted would leave a rule it will not let anyone rebuild.
  const allowedTargets = targets ?? ruleSetTargets(variant);

  const ruleTypes = useMemo(
    () =>
      allowedTargets.map<RuleTypeOption>((target) => ({
        label:
          targetLabels?.[target] ??
          intl.formatMessage(RULE_TYPE_LABELS[target]),
        value: target,
      })),
    [allowedTargets, intl, targetLabels],
  );

  const updateRules = useCallback(
    (nextRules: RuleDraft[]) => {
      // A single rule combines with nothing, so it carries no join. Keeping a
      // stale one would leave a key in the saved stage that describes a
      // combination the rule set no longer has.
      onChange?.(
        nextRules.length === 0
          ? undefined
          : nextRules.length === 1
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
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- focus and blur bubble up from the controls inside the set; the fieldset only reports them to the form and is not itself operated
    <fieldset
      id={id}
      data-name={name}
      onBlur={onBlur}
      onFocus={onFocus}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      // No `aria-required` here: a fieldset's `group` role may not carry it (axe
      // reports `aria-allowed-attr`), and a rule set that announced it that
      // way would be announcing it in a place assistive technology is entitled
      // to ignore. The field's own "Required" marker is in the description
      // above, which is where it is read.
      aria-invalid={ariaInvalid}
      className="flex min-w-0 flex-col gap-8"
    >
      <RuleList
        rules={rules}
        codebook={codebook}
        ruleTypes={ruleTypes}
        allowedTargets={allowedTargets}
        allowEncryptedAttributes={ruleSetAllowsEncryptedAttributes(variant)}
        addButtonLabel={addRuleLabel}
        onChange={updateRules}
        hasError={ariaInvalid === true}
        disabled={disabled}
        readOnly={readOnly}
      />

      {rules.length > (joinLabel === undefined ? 1 : 0) && (
        <UnconnectedField
          name="join"
          component={RadioGroupField}
          label={joinLabel ?? intl.formatMessage(messages.joinLabel)}
          {...(joinLabel === undefined && {
            hint: intl.formatMessage(messages.joinHint),
          })}
          orientation={joinLabel === undefined ? 'vertical' : 'horizontal'}
          options={[...joinOptions(intl)]}
          value={join ?? (joinLabel === undefined ? undefined : 'AND')}
          disabled={disabled}
          readOnly={readOnly}
          onChange={(next) => {
            if (typeof next === 'string') updateJoin(next);
          }}
        />
      )}
    </fieldset>
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
export function FilterRuleSetField({
  variant = 'filter',
  ...props
}: Omit<RuleSetFieldProps, 'variant' | 'addRuleLabel'> &
  Readonly<{
    /**
     * Which filter this is: a stage's own, or one of the two a side panel can
     * be. All three are filters — same builder, same add control — and differ
     * only in what their rules may be about, so they are the same field asked
     * what it is narrowing rather than three fields.
     */
    variant?: Exclude<RuleSetVariant, 'query'>;
  }>) {
  const intl = useAppIntl();
  return (
    <RuleSetControl
      {...props}
      variant={variant}
      addRuleLabel={intl.formatMessage(messages.addFilterRule)}
    />
  );
}

export function QueryRuleSetField(
  props: Omit<RuleSetFieldProps, 'variant' | 'addRuleLabel'>,
) {
  const intl = useAppIntl();
  return (
    <RuleSetControl
      {...props}
      variant="query"
      addRuleLabel={intl.formatMessage(messages.addSkipLogicRule)}
    />
  );
}

/**
 * The rule builder of a condition: what a piece of text chooses its wording
 * by. Its rules are asked where the text is shown: a node rule about the
 * node it is shown with, an edge rule about the edges that join that node to
 * others (or about the edge itself, for an edge's form), an ego rule about
 * the participant. `targets` says which of these this text has. The codebook
 * it builds against is the one a `RuleCodebookProvider` gives.
 */
export function ConditionRuleSetField({
  aboutEdge = false,
  ...props
}: Omit<RuleSetFieldProps, 'variant' | 'addRuleLabel' | 'targetLabels'> &
  Readonly<{
    /** Whether the rules are asked of an edge rather than of a node. */
    aboutEdge?: boolean;
  }>) {
  const intl = useAppIntl();
  const targetLabels = useMemo(
    () => ({
      node: intl.formatMessage(messages.conditionTargetNode),
      edge: intl.formatMessage(
        aboutEdge
          ? messages.conditionTargetOwnEdge
          : messages.conditionTargetEdge,
      ),
      ego: intl.formatMessage(messages.conditionTargetEgo),
    }),
    [aboutEdge, intl],
  );
  return (
    // Edges are counted for a node, so only its rules may count them.
    <EdgeCountRulesProvider value={!aboutEdge}>
      <RuleSetControl
        {...props}
        variant="query"
        targetLabels={targetLabels}
        addRuleLabel={intl.formatMessage(messages.addConditionRule)}
      />
    </EdgeCountRulesProvider>
  );
}
