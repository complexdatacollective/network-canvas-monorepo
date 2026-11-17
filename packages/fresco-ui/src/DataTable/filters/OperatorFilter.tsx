'use client';

import { X } from 'lucide-react';
import { useId, useState } from 'react';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { IconButton, Button } from '../../Button';
import InputField from '../../form/fields/InputField';
import SelectField from '../../form/fields/Select/Native';
import Paragraph from '../../typography/Paragraph';
import { formatFilterNumber } from './formatFilterNumber';
import {
  type OperatorCondition,
  type OperatorFilterConfig,
  type OperatorFilterValue,
} from './types';

type OperatorFilterProps = {
  'value': OperatorFilterValue | undefined;
  'onChange': (value: OperatorFilterValue | undefined) => void;
  'config': OperatorFilterConfig;
  'data': unknown[];
  /** The id of the visible label naming what is filtered. */
  'aria-labelledby'?: string;
};

const messages = defineMessages({
  operatorEq: {
    id: 'frescoUi.operatorFilter.operatorEq',
    defaultMessage: 'is equal to (=)',
    description: 'Comparison operator option in the network-data filter.',
  },
  operatorGt: {
    id: 'frescoUi.operatorFilter.operatorGt',
    defaultMessage: 'is greater than (>)',
    description: 'Comparison operator option in the network-data filter.',
  },
  operatorLt: {
    id: 'frescoUi.operatorFilter.operatorLt',
    defaultMessage: 'is less than (<)',
    description: 'Comparison operator option in the network-data filter.',
  },
  operatorGte: {
    id: 'frescoUi.operatorFilter.operatorGte',
    defaultMessage: 'is at least (≥)',
    description: 'Comparison operator option in the network-data filter.',
  },
  operatorLte: {
    id: 'frescoUi.operatorFilter.operatorLte',
    defaultMessage: 'is at most (≤)',
    description: 'Comparison operator option in the network-data filter.',
  },
  showInterviewsWhere: {
    id: 'frescoUi.operatorFilter.showInterviewsWhere',
    defaultMessage: 'Show interviews where:',
    description:
      'Heading above the list of network-data filter conditions on the interviews table.',
  },
  and: {
    id: 'frescoUi.operatorFilter.and',
    defaultMessage: 'and',
    description:
      'Conjunction displayed on its own line between two filter conditions that both apply.',
  },
  selectType: {
    id: 'frescoUi.operatorFilter.selectType',
    defaultMessage: 'Select type...',
    description:
      'Placeholder for the entity-type selector in the network-data filter.',
  },
  add: {
    id: 'frescoUi.operatorFilter.add',
    defaultMessage: 'Add',
    description:
      'Button that adds the composed condition to the network-data filter.',
  },
  emptyHint: {
    id: 'frescoUi.operatorFilter.emptyHint',
    defaultMessage: 'Add a condition to filter by network data',
    description:
      'Hint shown in the network-data filter before any condition exists.',
  },
});

const operatorMessages = {
  eq: messages.operatorEq,
  gt: messages.operatorGt,
  lt: messages.operatorLt,
  gte: messages.operatorGte,
  lte: messages.operatorLte,
} satisfies Record<OperatorCondition['operator'], MessageDescriptor>;

const operatorSymbols: Record<OperatorCondition['operator'], string> = {
  eq: '=',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
};

function isOperator(value: string): value is OperatorCondition['operator'] {
  return value in operatorMessages;
}

export default function OperatorFilter({
  value,
  onChange,
  config,
  data,
  'aria-labelledby': ariaLabelledBy,
}: OperatorFilterProps) {
  const intl = useAppIntl();
  // The comparison and the number have no visible label of their own, so they
  // are named for screen readers only, which is English.
  const labelIds = useId();
  const operatorLabelId = `${labelIds}-operator`;
  const valueLabelId = `${labelIds}-value`;
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  const [selectedOperator, setSelectedOperator] = useState<
    OperatorCondition['operator']
  >(config.operators[0]!);
  const [inputValue, setInputValue] = useState<string>('');

  const entityOptions = config.entitySelector?.getOptions(data) ?? [];
  const conditions = value?.conditions ?? [];

  const handleAddCondition = () => {
    if (!selectedEntity || inputValue === '') return;

    const numericValue = Number(inputValue);
    if (Number.isNaN(numericValue)) return;

    const [entityKind, entityType] = selectedEntity.split('.');
    if (!entityType || (entityKind !== 'nodes' && entityKind !== 'edges'))
      return;

    const entityLabel =
      entityOptions.find((o) => o.value === selectedEntity)?.label ??
      entityType;

    const newCondition: OperatorCondition = {
      entityType,
      entityLabel,
      entityKind,
      operator: selectedOperator,
      value: numericValue,
    };

    const newConditions = [...conditions, newCondition];
    onChange({ conditions: newConditions });

    setInputValue('');
  };

  const handleRemoveCondition = (index: number) => {
    const newConditions = conditions.filter((_, i) => i !== index);
    if (newConditions.length === 0) {
      onChange(undefined);
    } else {
      onChange({ conditions: newConditions });
    }
  };

  const operatorOptions = config.operators.map((op) => ({
    value: op,
    label: intl.formatMessage(operatorMessages[op]),
  }));

  return (
    <div
      role="group"
      aria-labelledby={ariaLabelledBy}
      className="flex w-72 flex-col gap-3"
    >
      <span id={operatorLabelId} className="sr-only" lang="en">
        Comparison
      </span>
      <span id={valueLabelId} className="sr-only" lang="en">
        Value
      </span>
      <Paragraph intent="smallText" emphasis="muted" margin="none">
        {intl.formatMessage(messages.showInterviewsWhere)}
      </Paragraph>

      {conditions.length > 0 && (
        <div className="flex flex-col gap-1">
          {conditions.map((condition, index) => (
            <div
              key={`${condition.entityKind}-${condition.entityType}-${condition.operator}-${condition.value.toString()}-${index.toString()}`}
            >
              {index > 0 && (
                <Paragraph
                  intent="smallText"
                  emphasis="muted"
                  margin="none"
                  className="py-0.5 text-center text-xs"
                >
                  {intl.formatMessage(messages.and)}
                </Paragraph>
              )}
              <div className="bg-surface-1 flex items-center justify-between gap-3 rounded-sm px-3 py-1.5">
                <span className="text-sm">
                  {condition.entityLabel} {operatorSymbols[condition.operator]}{' '}
                  {formatFilterNumber(intl, condition.value)}
                </span>
                <IconButton
                  size="sm"
                  variant="text"
                  aria-label="Remove condition"
                  lang="en"
                  onClick={() => handleRemoveCondition(index)}
                  icon={<X />}
                  className="size-5! shrink-0"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <SelectField
          name="entity-type"
          aria-label={config.entitySelector?.label}
          size="sm"
          options={entityOptions}
          value={selectedEntity}
          placeholder={intl.formatMessage(messages.selectType)}
          onChange={(val) => {
            if (typeof val === 'string' || typeof val === 'number') {
              setSelectedEntity(String(val));
            } else {
              setSelectedEntity('');
            }
          }}
        />

        <SelectField
          name="filter-operator"
          aria-labelledby={operatorLabelId}
          size="sm"
          options={operatorOptions}
          value={selectedOperator}
          onChange={(val) => {
            const op = String(val);
            if (isOperator(op)) {
              setSelectedOperator(op);
            }
          }}
        />

        <div className="flex items-center gap-2">
          <InputField
            type="number"
            name="filter-value"
            aria-labelledby={valueLabelId}
            size="sm"
            value={inputValue}
            onChange={(val) => setInputValue(val ?? '')}
            // A sample digit rather than copy, but a Western `0` beside the
            // conditions above — which now carry the reader's digits — reads
            // as a different numbering system.
            placeholder={intl.formatNumber(0)}
          />

          <Button size="sm" className="shrink-0" onClick={handleAddCondition}>
            {intl.formatMessage(messages.add)}
          </Button>
        </div>
      </div>

      {conditions.length === 0 && (
        <Paragraph
          intent="smallText"
          emphasis="muted"
          margin="none"
          className="text-center"
        >
          {intl.formatMessage(messages.emptyHint)}
        </Paragraph>
      )}
    </div>
  );
}
