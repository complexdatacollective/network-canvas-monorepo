import { describe, expect, it } from 'vitest';

import { VARIABLE_TYPE_VALIDATIONS } from '@codaco/protocol-validation';

import {
  getGroupedValidationsForVariableType,
  getValidationOptionsForVariableType,
  isValidationWithListValue,
  isValidationWithNumberValue,
  isValidationWithoutValue,
} from '../options';

describe('Validation options', () => {
  // The dropdown is built from the protocol schema's own per-type `validation`
  // picks. Assert the two agree, so a rule can never be offered that would make
  // the saved protocol fail validation.
  describe('agreement with the protocol schema', () => {
    it.each(Object.entries(VARIABLE_TYPE_VALIDATIONS))(
      'offers exactly the rules the schema accepts for %s',
      (variableType, acceptedRules) => {
        const offered = getValidationOptionsForVariableType(
          variableType,
          'node',
        ).map((option) => option.value);

        expect(offered).toEqual(Object.keys(acceptedRules));
      },
    );

    it('offers nothing for a type the schema does not know', () => {
      expect(getValidationOptionsForVariableType('nonsense', 'node')).toEqual(
        [],
      );
    });
  });

  describe('grouping partitions the schema-accepted rules', () => {
    const everyAcceptedRule = [
      ...new Set(
        Object.values(VARIABLE_TYPE_VALIDATIONS).flatMap((mask) =>
          Object.keys(mask),
        ),
      ),
    ];

    it.each(everyAcceptedRule)(
      '%s is claimed by exactly one group predicate',
      (rule) => {
        const claims = [
          isValidationWithoutValue,
          isValidationWithNumberValue,
          isValidationWithListValue,
        ].filter((predicate) => predicate(rule));

        expect(claims).toHaveLength(1);
      },
    );

    it.each(Object.keys(VARIABLE_TYPE_VALIDATIONS))(
      'groups every offered rule for %s exactly once',
      (variableType) => {
        const flat = getValidationOptionsForVariableType(
          variableType,
          'node',
        ).map((option) => option.value);
        const grouped = getGroupedValidationsForVariableType(
          variableType,
          'node',
        ).flatMap((group) => group.rules.map((rule) => rule.value));

        expect(grouped.toSorted()).toEqual(flat.toSorted());
        expect(new Set(grouped).size).toBe(grouped.length);
      },
    );

    it('offers only length limits for the anonymisation passphrase', () => {
      const groups = getGroupedValidationsForVariableType('passphrase', 'node');

      expect(groups.map((group) => group.id)).toEqual(['limits']);
      expect(groups[0]?.rules.map((rule) => rule.value)).toEqual([
        'minLength',
        'maxLength',
      ]);
    });

    it.each(['layout', 'location', 'nonsense'])(
      'renders no group at all for %s',
      (variableType) => {
        expect(
          getGroupedValidationsForVariableType(variableType, 'node'),
        ).toEqual([]);
      },
    );

    it('drops unique from the requirements group for ego', () => {
      const requirementsFor = (entity: string) =>
        getGroupedValidationsForVariableType('text', entity)
          .find((group) => group.id === 'requirements')
          ?.rules.map((rule) => rule.value);

      expect(requirementsFor('node')).toEqual(['required', 'unique']);
      expect(requirementsFor('ego')).toEqual(['required']);
    });
  });

  describe('getValidationOptionsForVariableType', () => {
    describe('comparison variable validations availability', () => {
      const typesWithComparisonValidations = ['number', 'datetime', 'scalar'];
      const typesWithoutComparisonValidations = [
        'text',
        'boolean',
        'ordinal',
        'categorical',
        'passphrase',
      ];

      it.each(typesWithComparisonValidations)(
        'includes all comparison validations for %s type',
        (variableType) => {
          const options = getValidationOptionsForVariableType(
            variableType,
            'node',
          );
          const optionValues = options.map((o) => o.value);

          expect(optionValues).toContain('lessThanVariable');
          expect(optionValues).toContain('greaterThanVariable');
          expect(optionValues).toContain('lessThanOrEqualToVariable');
          expect(optionValues).toContain('greaterThanOrEqualToVariable');
        },
      );

      it.each(typesWithoutComparisonValidations)(
        'does not include comparison validations for %s type',
        (variableType) => {
          const options = getValidationOptionsForVariableType(
            variableType,
            'node',
          );
          const optionValues = options.map((o) => o.value);

          expect(optionValues).not.toContain('lessThanVariable');
          expect(optionValues).not.toContain('greaterThanVariable');
          expect(optionValues).not.toContain('lessThanOrEqualToVariable');
          expect(optionValues).not.toContain('greaterThanOrEqualToVariable');
        },
      );
    });

    describe('entity-specific validation filtering', () => {
      it('excludes unique validation for ego entity', () => {
        const nodeOptions = getValidationOptionsForVariableType('text', 'node');
        const egoOptions = getValidationOptionsForVariableType('text', 'ego');

        expect(nodeOptions.map((o) => o.value)).toContain('unique');
        expect(egoOptions.map((o) => o.value)).not.toContain('unique');
      });
    });
  });

  describe('isValidationWithListValue', () => {
    it('returns true for lessThanVariable', () => {
      expect(isValidationWithListValue('lessThanVariable')).toBe(true);
    });

    it('returns true for greaterThanVariable', () => {
      expect(isValidationWithListValue('greaterThanVariable')).toBe(true);
    });

    it('returns true for lessThanOrEqualToVariable', () => {
      expect(isValidationWithListValue('lessThanOrEqualToVariable')).toBe(true);
    });

    it('returns true for greaterThanOrEqualToVariable', () => {
      expect(isValidationWithListValue('greaterThanOrEqualToVariable')).toBe(
        true,
      );
    });

    it('returns true for differentFrom and sameAs', () => {
      expect(isValidationWithListValue('differentFrom')).toBe(true);
      expect(isValidationWithListValue('sameAs')).toBe(true);
    });

    it('returns false for number-based validations', () => {
      expect(isValidationWithListValue('minValue')).toBe(false);
      expect(isValidationWithListValue('maxValue')).toBe(false);
      expect(isValidationWithListValue('minLength')).toBe(false);
    });
  });

  describe('isValidationWithNumberValue', () => {
    it('returns true for number-based validations', () => {
      expect(isValidationWithNumberValue('minValue')).toBe(true);
      expect(isValidationWithNumberValue('maxValue')).toBe(true);
      expect(isValidationWithNumberValue('minLength')).toBe(true);
      expect(isValidationWithNumberValue('maxLength')).toBe(true);
      expect(isValidationWithNumberValue('minSelected')).toBe(true);
      expect(isValidationWithNumberValue('maxSelected')).toBe(true);
    });

    it('returns false for list-based validations', () => {
      expect(isValidationWithNumberValue('lessThanVariable')).toBe(false);
      expect(isValidationWithNumberValue('greaterThanVariable')).toBe(false);
      expect(isValidationWithNumberValue('lessThanOrEqualToVariable')).toBe(
        false,
      );
      expect(isValidationWithNumberValue('greaterThanOrEqualToVariable')).toBe(
        false,
      );
      expect(isValidationWithNumberValue('differentFrom')).toBe(false);
      expect(isValidationWithNumberValue('sameAs')).toBe(false);
    });
  });

  describe('isValidationWithoutValue', () => {
    it('returns true for required and unique', () => {
      expect(isValidationWithoutValue('required')).toBe(true);
      expect(isValidationWithoutValue('unique')).toBe(true);
    });

    it('returns false for validations that require values', () => {
      expect(isValidationWithoutValue('minValue')).toBe(false);
      expect(isValidationWithoutValue('lessThanVariable')).toBe(false);
    });
  });
});
