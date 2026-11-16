import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { validationRuleMessages } from '@codaco/protocol-validation/messages';

import { getValidationLabel } from '../variableValidation.ts';

/**
 * One rule, one name (parity audit candidate 21).
 *
 * `@codaco/protocol-validation` owns the rules and names them for the errors a
 * protocol's own validation reports; this package used to keep a second
 * catalogue of its own, so the rule a researcher ticked as "Minimum length"
 * came back from the validator as "Minimum text length" and read as a
 * different rule. The names are now the shared ones, and this fails if a copy
 * of any of them is reintroduced here.
 */
const intl = createAppIntl({ locale: 'en' });

/**
 * Every shared rule's English name, written out rather than read from the
 * shared catalogue, so a local copy that drifts from it is caught.
 */
const SHARED_NAMES: Readonly<Record<string, string>> = {
  required: 'Required answer',
  requiredAcceptsNull: 'Allow explicit missing answers',
  minLength: 'Minimum text length',
  maxLength: 'Maximum text length',
  minValue: 'Minimum value',
  maxValue: 'Maximum value',
  minSelected: 'Minimum selection',
  maxSelected: 'Maximum selection',
  unique: 'Unique value',
  differentFrom: 'Different from another attribute',
  sameAs: 'Same as another attribute',
  greaterThanVariable: 'Greater than another attribute',
  lessThanVariable: 'Less than another attribute',
  greaterThanOrEqualToVariable: 'Greater than or equal to another attribute',
  lessThanOrEqualToVariable: 'Less than or equal to another attribute',
  additionalAttributes: 'Fixed attributes',
  parameters: 'Input control settings',
  component: 'Input control',
  egoVariable: 'Participant indicator',
};

describe('what a validation rule is called', () => {
  it('names every rule the shared catalogue names', () => {
    expect(Object.keys(SHARED_NAMES).toSorted()).toEqual(
      Object.keys(validationRuleMessages).toSorted(),
    );
  });

  it.each(Object.entries(SHARED_NAMES))(
    'calls %s "%s", the shared name',
    (rule, name) => {
      expect(getValidationLabel(rule, intl)).toBe(name);
    },
  );
});
