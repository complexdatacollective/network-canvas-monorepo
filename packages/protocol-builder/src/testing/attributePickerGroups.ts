import { useAppIntl } from '@codaco/app-i18n/react';
import {
  dynamicValueNameFor,
  parseDynamicValueName,
} from '@codaco/protocol-validation';

import { attributeGroupMessages } from '../fields/attributeGroups.ts';
import type { VariablePickerOption } from '../fields/VariablePickerField.tsx';
import type { VariablePickerGroup } from '../fields/VariablePickerList.tsx';
import {
  dynamicAttributePillName,
  type VariablePillProps,
} from '../fields/VariablePill.tsx';

// Story fixtures for the attribute picker and its list.

/** A reason for an attribute that cannot be used, as a caller words it. */
export const ANOTHER_FIELD =
  'Another field on this stage already uses this attribute.';
const UNVALIDATED =
  'The Household stage sets this attribute without validation, so it cannot also be collected here.';
const NO_LABELS = 'Add labels for its yes and no answers first.';

/** The names that text uses for the stage's two dynamic attributes. */
const PRONOUN = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: '0b6d4f3e-9a51-4c7e-8f2d-3e1a5b7c9d01',
});
const PLACE = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: '7c2e9a14-5d3b-4f86-a0e1-2b4c6d8e0f12',
});

/**
 * The groups of the Attribute menu of an Alter Form, in the order and words
 * that every list uses (`attributeGroups.ts`), with the attributes that cannot
 * be used here kept in place.
 */
export function useAttributeGroups(
  onCreateDynamic: () => void,
): readonly VariablePickerGroup[] {
  const intl = useAppIntl();
  return [
    {
      id: 'node',
      label: intl.formatMessage(attributeGroupMessages.node),
      options: [
        { value: 'name', label: 'name', type: 'text' },
        { value: 'gender', label: 'gender', type: 'categorical' },
        { value: 'age', label: 'age', type: 'number' },
        {
          value: 'sees_outside_work',
          label: 'sees_outside_work',
          type: 'boolean',
          unavailableReason: NO_LABELS,
        },
      ],
    },
    {
      id: 'ego',
      label: intl.formatMessage(attributeGroupMessages.ego),
      options: [
        {
          value: 'first_name',
          label: 'first_name',
          type: 'text',
          unavailableReason: ANOTHER_FIELD,
        },
        {
          value: 'household_role',
          label: 'household_role',
          type: 'categorical',
          unavailableReason: UNVALIDATED,
        },
        {
          value: 'employment_status',
          label: 'employment_status',
          type: 'categorical',
        },
      ],
    },
    {
      id: 'dynamic',
      label: intl.formatMessage(attributeGroupMessages.dynamic),
      options: [
        { value: PRONOUN, label: 'their / her / his' },
        { value: PLACE, label: 'school / work' },
      ],
      actions: [
        {
          id: 'create-dynamic',
          label: 'Create dynamic attribute',
          onSelect: onCreateDynamic,
        },
      ],
    },
    {
      id: 'interview',
      label: intl.formatMessage(attributeGroupMessages.interview),
      options: [{ value: 'now', label: 'Today’s date', type: 'datetime' }],
    },
  ];
}

/** A dynamic attribute's row shows its values in the navy of the kind. */
export const dynamicPill = (option: VariablePickerOption): VariablePillProps =>
  parseDynamicValueName(option.value)?.kind === 'dynamicAttribute'
    ? {
        name: dynamicAttributePillName(option.label.split(' / ')),
        kind: 'dynamic',
      }
    : { name: option.label };
