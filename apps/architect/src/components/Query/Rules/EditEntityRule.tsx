import { isArray, isNil } from 'es-toolkit/compat';
import type { ComponentType } from 'react';
import { compose } from 'react-recompose';

import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import Section from '../../EditorLayout/Section';
import IssueAnchor from '../../IssueAnchor';
import { EntitySelectControl } from '../../sections/fields/EntitySelectField/EntitySelectField';
import { makeGetOptionsWithDefaults } from './defaultRule';
import EditValue from './EditValue';
import {
  operatorsWithOptionCount,
  operatorsWithRegExp,
  operatorsWithValue,
} from './options';
import RuleField from './RuleField';
import {
  entityRuleTypeOptions,
  entityRuleTypes,
  withEntityRuleType,
} from './withEntityRuleType';
import withOptions from './withOptions';
import withRuleChangeHandler from './withRuleChangeHandler';

const FrescoNativeSelectField = NativeSelectField as ComponentType<
  Record<string, unknown>
>;
const FrescoRadioGroupField = RadioGroupField as ComponentType<
  Record<string, unknown>
>;
const FrescoEntitySelectControl = EntitySelectControl as ComponentType<
  Record<string, unknown>
>;

// Categorical operands are arrays of selected option values, so they must reach
// EditValue intact rather than being coerced to a scalar (which would drop the
// saved selections on save/reopen). Scalars pass through; anything else defaults
// to an empty string.
export const toEditValue = (
  value: unknown,
): string | number | boolean | (string | number)[] => {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string | number =>
        typeof item === 'string' || typeof item === 'number',
    );
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return '';
};

type OptionItem = {
  value: string | number;
  label: string;
};
type EditEntityRuleProps = {
  entityRuleType?: string;
  handleChangeEntityRuleType: (value: string) => void;
  rule: {
    options?: Record<string, unknown>;
    type: string;
  };
  typeOptions: OptionItem[];
  variableType?: string;
  variablesAsOptions: OptionItem[];
  variableOptions?: OptionItem[];
  operatorOptions: OptionItem[];
  handleRuleChange: (
    event: unknown,
    value: unknown,
    oldValue: unknown,
    name: string | null,
  ) => void;
  codebook?: Record<string, unknown>;
  onChange?: (value: Record<string, unknown>) => void;
};
const EditEntityRule = ({
  entityRuleType,
  handleChangeEntityRuleType,
  rule,
  typeOptions,
  variableType,
  variablesAsOptions,
  variableOptions = [],
  operatorOptions,
  handleRuleChange,
}: EditEntityRuleProps) => {
  const { type: entityType } = rule;
  const options = rule?.options;
  const getOptionsWithDefaults = makeGetOptionsWithDefaults(variableType, [
    'type',
    'operator',
    'attributes',
    'value',
  ]);
  const optionsWithDefaults = getOptionsWithDefaults(options);
  const operatorNeedsValue =
    optionsWithDefaults.operator &&
    typeof optionsWithDefaults.operator === 'string'
      ? operatorsWithValue.has(optionsWithDefaults.operator)
      : false;
  const operatorNeedsRegExp =
    optionsWithDefaults.operator &&
    typeof optionsWithDefaults.operator === 'string'
      ? operatorsWithRegExp.has(optionsWithDefaults.operator)
      : false;
  const isVariableRule = entityRuleType === entityRuleTypes.VARIABLE_RULE;
  const isTypeRule = entityRuleType === entityRuleTypes.TYPE_RULE;
  const operatorNeedsOptionCount =
    optionsWithDefaults.operator &&
    typeof optionsWithDefaults.operator === 'string'
      ? operatorsWithOptionCount.has(optionsWithDefaults.operator)
      : false;
  const countFriendlyValue = !isNil(optionsWithDefaults.value)
    ? optionsWithDefaults.value
    : '';
  const optionsWithCounts = {
    ...optionsWithDefaults,
    value: isArray(optionsWithDefaults.value) ? '' : countFriendlyValue,
  };
  // `rule.type` is the entity CLASS ('node' or 'edge' — 'ego' rules render
  // EditEgoRule instead), so it is an internal token and never display copy.
  // Interpolating it produced "node Type" and "Choose an node type…" (#1400).
  // Each heading and sentence is written out whole rather than assembled from
  // the token, because the indefinite article differs between the two and a
  // sentence built from fragments cannot be localised.
  const isNodeRule = entityType === 'node';
  const typeSectionTitle = isNodeRule ? 'Node Type' : 'Edge Type';
  return (
    <>
      <Section
        title={typeSectionTitle}
        summary={
          <Paragraph>
            {isNodeRule
              ? 'Choose a node type to base your rule on. Remember you can add multiple rules if you need to cover different types.'
              : 'Choose an edge type to base your rule on. Remember you can add multiple rules if you need to cover different types.'}
          </Paragraph>
        }
        layout="vertical"
      >
        {/*
          Kept identical to the heading above so the two cannot drift. This
          anchor is not currently reachable from the Issues panel — rule-dialog
          fields live outside the stage form store (see RuleField.tsx), so no
          stage-form error is ever keyed by this `type` path — but the panel
          harvests `data-name` wherever it does resolve, and a heading and its
          anchor disagreeing is a defect waiting for the day it does.
        */}
        <IssueAnchor fieldName="type" description={typeSectionTitle} />
        <RuleField
          component={FrescoEntitySelectControl}
          entityType={isNodeRule ? 'node' : 'edge'}
          label={isNodeRule ? 'Node type' : 'Edge type'}
          labelHidden
          name="type"
          options={typeOptions}
          onChange={handleRuleChange}
          value={optionsWithDefaults.type}
          validation={{ required: true }}
        />
      </Section>
      <Section
        title="Rule Type"
        disabled={!optionsWithDefaults.type}
        layout="vertical"
      >
        <RuleField
          component={FrescoRadioGroupField}
          label="Rule type"
          labelHidden
          options={entityRuleTypeOptions(entityType)}
          value={entityRuleType}
          onChange={(_event, value) =>
            handleChangeEntityRuleType(value as string)
          }
        />
      </Section>
      {isTypeRule && optionsWithDefaults.type && (
        <Section title="Operator" layout="vertical">
          <RuleField
            component={FrescoRadioGroupField}
            label="Operator"
            labelHidden
            name="operator"
            options={operatorOptions}
            onChange={handleRuleChange}
            value={optionsWithDefaults.operator}
            validation={{ required: true }}
          />
        </Section>
      )}
      {isVariableRule && optionsWithDefaults.type && (
        <Section
          title="Variable"
          summary={<Paragraph>Select a variable to query.</Paragraph>}
          layout="vertical"
        >
          <RuleField
            component={FrescoNativeSelectField}
            label="Variable"
            labelHidden
            name="attribute"
            placeholder="Select a variable…"
            options={variablesAsOptions}
            onChange={handleRuleChange}
            value={optionsWithDefaults.attribute}
            validation={{ required: true }}
          />
        </Section>
      )}
      {isVariableRule && optionsWithDefaults.attribute && (
        <Section title="Operator" layout="vertical">
          <RuleField
            component={FrescoNativeSelectField}
            label="Operator"
            labelHidden
            name="operator"
            placeholder="Select an operator…"
            options={operatorOptions}
            onChange={handleRuleChange}
            value={optionsWithDefaults.operator}
            validation={{ required: true }}
          />
        </Section>
      )}
      {isVariableRule && operatorNeedsValue && (
        <Section title="Attribute Value" layout="vertical">
          <EditValue
            variableType={variableType}
            placeholder="Enter a value..."
            onChange={handleRuleChange}
            value={toEditValue(optionsWithDefaults.value)}
            options={variableOptions}
            validation={{ required: true }}
            labelHidden
          />
        </Section>
      )}
      {isVariableRule && operatorNeedsRegExp && (
        <Section title="Attribute Value">
          <EditValue
            variableType={variableType}
            placeholder="Enter a regular expression..."
            onChange={handleRuleChange}
            value={toEditValue(optionsWithDefaults.value)}
            options={variableOptions}
            validation={{ required: true, validRegExp: true }}
            labelHidden
          />
        </Section>
      )}
      {isVariableRule && operatorNeedsOptionCount && (
        <Section title="Selected Option Count" layout="vertical">
          <EditValue
            variableType="count"
            placeholder="Enter a value..."
            onChange={handleRuleChange}
            value={
              typeof optionsWithCounts.value === 'string' ||
              typeof optionsWithCounts.value === 'number' ||
              typeof optionsWithCounts.value === 'boolean'
                ? optionsWithCounts.value
                : 0
            }
            validation={{ requiredAcceptsZero: true }}
          />
        </Section>
      )}
    </>
  );
};
export default compose<
  EditEntityRuleProps,
  {
    rule?: {
      options?: Record<string, unknown>;
      type?: string;
    };
    codebook?: Record<string, unknown>;
    onChange?: (value: Record<string, unknown>) => void;
  }
>(
  withEntityRuleType,
  withRuleChangeHandler,
  withOptions,
)(EditEntityRule);
