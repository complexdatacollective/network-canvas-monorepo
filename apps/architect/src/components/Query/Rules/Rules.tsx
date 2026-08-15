import { isEqual } from 'es-toolkit/compat';
import { useCallback, useState, type ComponentType } from 'react';
import { compose } from 'react-recompose';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { confirmDiscardNestedDraft } from '~/components/DialogForm/confirmDiscardNestedDraft';
import { useNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';

import EditRule from './EditRule';
import PreviewRules from './PreviewRules';
import RuleField from './RuleField';
import validateRule, { type Rule } from './validateRule';
import withDraftRule from './withDraftRule';
const FrescoRadioGroupField = RadioGroupField as ComponentType<
  Record<string, unknown>
>;
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
 * Which rule set this builder is, and what its add buttons are called.
 *
 * The labels are REQUIRED and whole strings — not an `Add new ${entity} rule`
 * template — so they can be localised and so no call site can fall back to a
 * shared default. A shared default was the defect: `RuleSetFields` mounts this
 * builder twice per stage editor, once for Skip Logic and once for Filter, so
 * ten of the interfaces offered two buttons called "Add alter rule" and two
 * called "Add edge rule". To anyone navigating by a list of controls — a
 * screen reader's elements list, a voice-control "click Add alter rule" — they
 * were one control (#1391).
 *
 * `type` stays an explicit declaration rather than being inferred from which
 * labels turned up: the ego button is offered because a caller asked for skip
 * logic, not because it happened to supply a third string. The two shapes
 * differ so that the ego label is required exactly where the button renders
 * and rejected where it cannot — a filter has no ego rules, and so has no name
 * for one to write.
 */
type RuleSetVariantProps =
  | {
      type?: 'filter';
      addAlterRuleLabel: string;
      addEdgeRuleLabel: string;
      addEgoRuleLabel?: never;
    }
  | {
      type: 'query';
      addAlterRuleLabel: string;
      addEdgeRuleLabel: string;
      addEgoRuleLabel: string;
    };

export type RulesOuterProps = RuleSetGroupProps &
  RuleSetVariantProps & {
    rules?: Rule[];
    join?: string;
    onChange?: (value: unknown) => void;
    codebook?: Record<string, unknown>;
    allowEdgeRules?: boolean;
  };

type RulesProps = RuleSetGroupProps &
  RuleSetVariantProps & {
    allowEdgeRules?: boolean;
    rules?: Rule[];
    join?: string | null;
    codebook: Record<string, unknown>;
    draftRule?: Rule | null;
    resetDraft: () => void;
    handleChangeDraft: (value: Rule) => void;
    handleCancelDraft: () => void;
    handleClickRule: (id: string) => void;
    handleCreateAlterRule: () => void;
    handleCreateEdgeRule: () => void;
    handleCreateEgoRule: () => void;
    onChange?: (value: unknown) => void;
  };
/**
 * `type` and `addEgoRuleLabel` are read off `props` rather than destructured
 * because destructuring flattens the variant union and loses the narrowing
 * that makes the ego label guaranteed wherever the ego button renders.
 */
const Rules = (props: RulesProps) => {
  const {
    allowEdgeRules = true,
    rules = [],
    join = null,
    codebook,
    id,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-required': ariaRequired,
    'aria-invalid': ariaInvalid,
    addAlterRuleLabel,
    addEdgeRuleLabel,
    draftRule = null,
    resetDraft,
    handleChangeDraft,
    handleCancelDraft,
    handleClickRule,
    handleCreateAlterRule,
    handleCreateEdgeRule,
    handleCreateEgoRule,
    onChange = () => {},
  } = props;
  const { confirm, openDialog } = useDialog();

  /**
   * The rule editor seeds a non-null draft the instant it opens (a type and its
   * default options), so "a draft exists" says nothing about whether the
   * researcher has entered anything. Dirtiness is a comparison against that
   * seeded draft — or, when editing, against the rule as it already stood.
   */
  const [draftSession, setDraftSession] = useState<{ seed: Rule } | null>(null);
  if (draftRule && !draftSession) setDraftSession({ seed: draftRule });
  if (!draftRule && draftSession) setDraftSession(null);

  const isDraftDirty = useCallback(
    () =>
      !!draftRule && !!draftSession && !isEqual(draftRule, draftSession.seed),
    [draftRule, draftSession],
  );

  useNestedDraft(!!draftRule, isDraftDirty);

  const handleRequestCancelDraft = useCallback(() => {
    if (!isDraftDirty()) {
      handleCancelDraft();
      return;
    }
    void confirmDiscardNestedDraft(openDialog).then((confirmed) => {
      if (confirmed) handleCancelDraft();
    });
  }, [handleCancelDraft, isDraftDirty, openDialog]);
  // The rule list shows the field's invalidity the same way any other control
  // does. The message itself belongs to `BaseField`, which renders it once,
  // below the group — the region this group already points `aria-describedby`
  // at.
  const hasError = !!ariaInvalid;
  const updateJoin = useCallback(
    (nextJoin: string) =>
      onChange({
        join: nextJoin,
        rules,
      }),
    [onChange, rules],
  );
  const updateRule = useCallback(
    (rule: Rule) => {
      let updatedRules: Rule[] = [];
      if (!rule.id) {
        updatedRules = [...rules, { ...rule, id: uuid() }];
      } else {
        updatedRules = rules.map((existingRule) => {
          if (existingRule.id === rule.id) {
            return rule;
          }
          return existingRule;
        });
      }
      onChange({
        join: join ?? undefined,
        rules: updatedRules,
      });
    },
    [join, onChange, rules],
  );
  const deleteRule = useCallback(
    (ruleId: string) => {
      const updatedRules = rules.filter((rule) => rule.id !== ruleId);
      if (updatedRules.length < 2) {
        onChange({
          rules: updatedRules,
        });
        return;
      }
      onChange({
        join: join ?? undefined,
        rules: updatedRules,
      });
    },
    [join, onChange, rules],
  );
  const handleSaveDraft = useCallback(() => {
    if (!validateRule(draftRule)) {
      void openDialog({
        type: 'acknowledge',
        intent: 'warning',
        title: 'Please complete all fields',
        description:
          'To create your rule, all fields are required. Please complete all fields before clicking save, or use cancel to abandon this rule.',
        actions: { primary: { label: 'OK', value: true } },
      });
      return;
    }
    if (draftRule) {
      updateRule(draftRule);
    }
    resetDraft();
  }, [draftRule, openDialog, resetDraft, updateRule]);
  const handleDeleteRule = useCallback(
    (ruleId: string) => {
      void confirm({
        title: 'Are you sure you want to delete this rule?',
        description: 'This rule will be removed from the list.',
        confirmLabel: 'Delete rule',
        cancelLabel: 'Cancel',
        intent: 'destructive',
        onConfirm: () => deleteRule(ruleId),
      });
    },
    [confirm, deleteRule],
  );
  return (
    <div
      id={id}
      role="group"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-required={ariaRequired}
      aria-invalid={ariaInvalid}
    >
      <EditRule
        codebook={codebook}
        rule={draftRule || undefined}
        onChange={(value) => handleChangeDraft(value as Rule)}
        onCancel={handleRequestCancelDraft}
        onSave={handleSaveDraft}
      />

      <div>
        <Heading level="h4">Rules</Heading>
        <PreviewRules
          rules={
            rules as Array<
              Record<string, unknown> & {
                id: string;
              }
            >
          }
          join={join}
          onClickRule={handleClickRule}
          onDeleteRule={handleDeleteRule}
          codebook={codebook}
          hasError={hasError}
        />
      </div>

      <div className="mt-5 [&_button]:mr-5">
        <Button type="button" color="info" onClick={handleCreateAlterRule}>
          {addAlterRuleLabel}
        </Button>
        {allowEdgeRules && (
          <Button
            type="button"
            color="destructive"
            onClick={handleCreateEdgeRule}
          >
            {addEdgeRuleLabel}
          </Button>
        )}
        {props.type === 'query' && (
          <Button type="button" color="warning" onClick={handleCreateEgoRule}>
            {props.addEgoRuleLabel}
          </Button>
        )}
      </div>

      {rules.length > 1 && (
        <div className="mt-10">
          <Heading level="h4">Must match</Heading>
          <RuleField
            component={FrescoRadioGroupField}
            label="Rule matching"
            labelHidden
            options={[
              { label: 'All rules', value: 'AND' },
              { label: 'Any rule', value: 'OR' },
            ]}
            value={join}
            onChange={(_event, value) => updateJoin(value as string)}
          />
        </div>
      )}
    </div>
  );
};
export default compose<RulesProps, RulesOuterProps>(withDraftRule)(Rules);
