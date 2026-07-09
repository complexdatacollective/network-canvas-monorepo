import { get } from 'es-toolkit/compat';
import { useCallback, type ComponentType } from 'react';
import { compose } from 'react-recompose';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import Heading from '@codaco/fresco-ui/typography/Heading';
import DetachedField from '~/components/DetachedField';
import { FrescoReduxField } from '~/components/Form';
import FieldError from '~/components/Form/FieldError';

import EditRule from './EditRule';
import PreviewRules from './PreviewRules';
import validateRule, { type Rule } from './validateRule';
import withDraftRule from './withDraftRule';
const FrescoRadioGroupField = RadioGroupField as ComponentType<
  Record<string, unknown>
>;
type RulesProps = {
  type?: 'filter' | 'query';
  rules?: Rule[];
  join?: string | null;
  error?: string | null;
  meta?: Record<string, unknown>;
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
const Rules = ({
  type = 'filter',
  rules = [],
  join = null,
  error = null,
  meta = {},
  codebook,
  draftRule = null,
  resetDraft,
  handleChangeDraft,
  handleCancelDraft,
  handleClickRule,
  handleCreateAlterRule,
  handleCreateEdgeRule,
  handleCreateEgoRule,
  onChange = () => {},
}: RulesProps) => {
  const { confirm, openDialog } = useDialog();
  // Default to true as may not be defined if used without redux-form
  const isTouched = get(meta, 'touched', true) as boolean;
  const hasError = isTouched && !!error;
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
    <div>
      <EditRule
        codebook={codebook}
        rule={draftRule || undefined}
        onChange={(value) => handleChangeDraft(value as Rule)}
        onCancel={handleCancelDraft}
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
        <FieldError show={hasError} error={error || ''} />
      </div>

      <div className="mt-5 [&_button]:mr-5">
        <Button type="button" color="info" onClick={handleCreateAlterRule}>
          Add alter rule
        </Button>
        <Button
          type="button"
          color="destructive"
          onClick={handleCreateEdgeRule}
        >
          Add edge rule
        </Button>
        {type === 'query' && (
          <Button type="button" color="warning" onClick={handleCreateEgoRule}>
            Add ego rule
          </Button>
        )}
      </div>

      {rules.length > 1 && (
        <div className="mt-10">
          <Heading level="h4">Must match</Heading>
          <DetachedField
            component={FrescoReduxField}
            fieldComponent={FrescoRadioGroupField}
            label="Rule matching"
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
export default compose<
  RulesProps,
  {
    rules?: Rule[];
    join?: string;
    onChange?: (value: unknown) => void;
    codebook?: Record<string, unknown>;
    type?: 'filter' | 'query';
    error?: string | null;
    meta?: Record<string, unknown>;
  }
>(withDraftRule)(Rules);
