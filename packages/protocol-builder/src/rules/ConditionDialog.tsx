import { useCallback, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import type { Codebook, ConditionRole } from '@codaco/protocol-validation';

import { ConditionRuleSetField } from '../fields/RuleSetField.tsx';
import DialogForm, { type DialogFormErrors } from '../form/DialogForm.tsx';
import {
  type ConditionDraft,
  type ConditionSubject,
  conditionCodebook,
  conditionTargets,
} from '../localization/conditionText.ts';
import { RuleCodebookProvider } from './ruleCodebookSource.ts';
import {
  asRuleSetValue,
  NO_RULES_MESSAGE,
  ruleSetValidationMessage,
} from './ruleSet.ts';

const messages = defineMessages({
  aboutLabel: {
    id: 'protocolBuilder.conditionDialog.aboutLabel',
    defaultMessage: 'Check rules against',
    description:
      'Label of the control where a researcher chooses which of the nodes on screen the rules of an “If” are asked of, for text shown with more than one (a pair of nodes).',
  },
  aboutHint: {
    id: 'protocolBuilder.conditionDialog.aboutHint',
    defaultMessage:
      'This text is shown alongside two nodes. Node rules and edge rules are checked against the node you choose here.',
    description:
      'Guidance under the control where a researcher chooses which node the rules of an “If” are asked of.',
  },
  rulesLabel: {
    id: 'protocolBuilder.conditionDialog.rulesLabel',
    defaultMessage: 'Rules',
    description:
      'Label of the rule builder in the dialog where a researcher sets when an “If” in a piece of text applies.',
  },
  rulesHint: {
    id: 'protocolBuilder.conditionDialog.rulesHint',
    defaultMessage: 'The text shows this version when the rules are met.',
    description:
      'Guidance under the rule builder in the dialog where a researcher sets when an “If” in a piece of text applies.',
  },
  submit: {
    id: 'protocolBuilder.conditionDialog.submit',
    defaultMessage: 'Save rules',
    description:
      'Button that saves the rules of an “If” in a piece of text and closes the dialog.',
  },
});

const ABOUT_LABELS = defineMessages({
  node: {
    id: 'protocolBuilder.conditionDialog.aboutNode',
    defaultMessage: 'The node',
    description:
      'Choice of what the rules of an “If” are asked of: the one node (network member) the text is shown with.',
  },
  edge: {
    id: 'protocolBuilder.conditionDialog.aboutEdge',
    defaultMessage: 'The edge',
    description:
      'Choice of what the rules of an “If” are asked of: the one edge (relationship) the text is shown with.',
  },
  dyadSource: {
    id: 'protocolBuilder.conditionDialog.aboutFirstNode',
    defaultMessage: 'The first node of the pair',
    description:
      'Choice of what the rules of an “If” are asked of, for text shown with a pair of nodes: the first of the two.',
  },
  dyadTarget: {
    id: 'protocolBuilder.conditionDialog.aboutSecondNode',
    defaultMessage: 'The second node of the pair',
    description:
      'Choice of what the rules of an “If” are asked of, for text shown with a pair of nodes: the second of the two.',
  },
  focal: {
    id: 'protocolBuilder.conditionDialog.aboutFocalNode',
    defaultMessage: 'The node being asked about',
    description:
      'Choice of what the rules of an “If” are asked of, for text shown while the participant is asked about one node in particular.',
  },
}) satisfies Record<ConditionRole, MessageDescriptor>;

const FORM_ID = 'text-condition';
const ABOUT_FIELD = 'about';
const RULES_FIELD = 'rules';

const conditionRoles: ReadonlySet<unknown> = new Set(Object.keys(ABOUT_LABELS));
const isConditionRole = (value: unknown): value is ConditionRole =>
  conditionRoles.has(value);

export type ConditionDialogProps = Readonly<{
  open: boolean;
  title: string;
  /** The condition to edit; one with no rules for a new one. */
  condition: ConditionDraft;
  /** What the rules can be asked of (`conditionAboutChoices`). */
  aboutChoices: readonly ConditionRole[];
  codebook: Readonly<Codebook> | undefined;
  subject: ConditionSubject;
  allowEgoRules: boolean;
  onSave: (condition: ConditionDraft) => void;
  onCancel: () => void;
}>;

type Scope = Pick<
  ConditionDialogProps,
  'aboutChoices' | 'codebook' | 'subject' | 'allowEgoRules'
>;

const aboutOf = (
  value: FieldValue | undefined,
  aboutChoices: readonly ConditionRole[],
): ConditionRole | undefined =>
  isConditionRole(value) && aboutChoices.includes(value)
    ? value
    : aboutChoices[0];

function ConditionFields({
  condition,
  aboutChoices,
  codebook,
  subject,
  allowEgoRules,
}: Scope & Pick<ConditionDialogProps, 'condition'>) {
  const intl = useAppIntl();
  const about = aboutOf(useFormValue([ABOUT_FIELD])[ABOUT_FIELD], aboutChoices);
  const ruleCodebook = useMemo(
    () => conditionCodebook(codebook, subject, about, allowEgoRules),
    [codebook, subject, about, allowEgoRules],
  );
  const targets = useMemo(
    () => conditionTargets(about, allowEgoRules),
    [about, allowEgoRules],
  );
  return (
    <>
      {aboutChoices.length > 1 && (
        <Field
          name={ABOUT_FIELD}
          label={intl.formatMessage(messages.aboutLabel)}
          hint={intl.formatMessage(messages.aboutHint)}
          component={NativeSelectField}
          options={aboutChoices.map((role) => ({
            value: role,
            label: intl.formatMessage(ABOUT_LABELS[role]),
          }))}
          initialValue={condition.about ?? aboutChoices[0]}
        />
      )}
      <RuleCodebookProvider value={ruleCodebook}>
        <Field
          name={RULES_FIELD}
          label={intl.formatMessage(messages.rulesLabel)}
          hint={intl.formatMessage(messages.rulesHint)}
          component={ConditionRuleSetField}
          targets={targets}
          aboutEdge={about === 'edge'}
          initialValue={
            condition.rules.length === 0
              ? undefined
              : {
                  rules: [...condition.rules],
                  ...(condition.join !== undefined && { join: condition.join }),
                }
          }
          required={NO_RULES_MESSAGE}
        />
      </RuleCodebookProvider>
    </>
  );
}

/**
 * Where a researcher sets when an “If” in a piece of text applies: its
 * rules, built with the rule builder that filters and skip logic use, and,
 * for text shown with more than one node, which of them the rules are asked
 * of.
 */
export default function ConditionDialog({
  open,
  title,
  condition,
  aboutChoices,
  codebook,
  subject,
  allowEgoRules,
  onSave,
  onCancel,
}: ConditionDialogProps) {
  const intl = useAppIntl();

  const validate = useCallback(
    (values: Record<string, FieldValue>): DialogFormErrors | undefined => {
      const about = aboutOf(values[ABOUT_FIELD], aboutChoices);
      const message = ruleSetValidationMessage(
        values[RULES_FIELD],
        conditionCodebook(codebook, subject, about, allowEgoRules),
        conditionTargets(about, allowEgoRules),
        { intl },
      );
      return message === undefined
        ? undefined
        : { fieldErrors: { [RULES_FIELD]: message } };
    },
    [aboutChoices, allowEgoRules, codebook, intl, subject],
  );

  const handleSubmit = useCallback(
    (values: Record<string, FieldValue>): undefined => {
      const about = aboutOf(values[ABOUT_FIELD], aboutChoices);
      const ruleSet = asRuleSetValue(values[RULES_FIELD]);
      const rules = ruleSet?.rules ?? [];
      onSave({
        // Only a node or edge rule is asked of anything on screen.
        ...(about !== undefined &&
          rules.some((rule) => rule.type !== 'ego') && { about }),
        ...(rules.length > 1 &&
          ruleSet?.join !== undefined && { join: ruleSet.join }),
        rules,
      });
      return undefined;
    },
    [aboutChoices, onSave],
  );

  return (
    <DialogForm
      open={open}
      onClose={onCancel}
      title={title}
      formId={FORM_ID}
      validate={validate}
      onSubmit={handleSubmit}
      submitLabel={intl.formatMessage(messages.submit)}
      size="editor"
    >
      <ConditionFields
        condition={condition}
        aboutChoices={aboutChoices}
        codebook={codebook}
        subject={subject}
        allowEgoRules={allowEgoRules}
      />
    </DialogForm>
  );
}
