import { describe, expect, it } from 'vitest';
import { z } from 'zod/mini';

import type { StageSubject } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import type { FieldValue, ValidationContext } from '../store/types';
import { required, validations } from './functions';
import { makeValidationFunction } from './helpers';

describe('Validation Functions', () => {
  const createMockContext = (
    overrides: Partial<ValidationContext> = {},
  ): ValidationContext => ({
    stageSubject: { entity: 'node', type: 'person' } as StageSubject,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            testAttribute: {
              name: 'Test Attribute',
              type: 'text',
            },
            numberAttribute: {
              name: 'Number Attribute',
              type: 'number',
            },
            dateAttribute: {
              name: 'Date Attribute',
              type: 'datetime',
            },
            toString: {
              name: 'Prototype-named Attribute',
              type: 'number' as const,
            },
          },
        },
      },
    },
    network: {
      nodes: [],
      edges: [],
      ego: {
        _uid: 'ego',
        [entityAttributesProperty]: {},
      },
    } as NcNetwork,
    ...overrides,
  });

  describe('required', () => {
    it('should reject null values', () => {
      const validator = required()(); // required()() returns a function that takes formValues

      const result = validator.safeParse(null);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'You must answer this question before continuing.',
        );
      }
    });

    it('should reject undefined values', () => {
      const validator = required()();

      const result = validator.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it('should reject empty strings', () => {
      const validator = required()();

      const result = validator.safeParse('  ');
      expect(result.success).toBe(false);
    });

    it('should accept non-empty strings', () => {
      const validator = required()();

      const result = validator.safeParse('valid text');
      expect(result.success).toBe(true);
    });

    it('should reject NaN for number fields', () => {
      const validator = required()();

      const result = validator.safeParse(Number.NaN);
      expect(result.success).toBe(false);
    });

    it('should accept zero for number fields', () => {
      const validator = required()();

      const result = validator.safeParse(0);
      expect(result.success).toBe(true);
    });

    it('should reject empty arrays', () => {
      const validator = required()();

      const result = validator.safeParse([]);
      expect(result.success).toBe(false);
    });

    it('should accept non-empty arrays', () => {
      const validator = required()();

      const result = validator.safeParse(['item1', 'item2']);
      expect(result.success).toBe(true);
    });

    it('should accept boolean values', () => {
      const validator = required()();

      expect(validator.safeParse(true).success).toBe(true);
      expect(validator.safeParse(false).success).toBe(true);
    });

    it('is a no-op when explicitly disabled', () => {
      const validator = required(false)();

      expect(validator.safeParse(undefined).success).toBe(true);
      expect(validator.safeParse('').success).toBe(true);
      expect(validator.safeParse([]).success).toBe(true);
    });
  });

  describe('maxLength', () => {
    it('should reject strings longer than max', () => {
      const validator = validations.maxLength(5, createMockContext())({});

      const result = validator.safeParse('too long');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Too long. Enter fewer than 5 characters.',
        );
      }
    });

    it('should accept strings at max length', () => {
      const validator = validations.maxLength(5, createMockContext())({});

      const result = validator.safeParse('12345');
      expect(result.success).toBe(true);
    });

    it('should accept strings shorter than max', () => {
      const validator = validations.maxLength(10, createMockContext())({});

      const result = validator.safeParse('short');
      expect(result.success).toBe(true);
    });

    it('should throw error when max is not specified', () => {
      expect(() => {
        validations.maxLength(
          null as unknown as number,
          createMockContext(),
        )({});
      }).toThrow('Max length must be specified');
    });
  });

  describe('minLength', () => {
    it('should reject strings shorter than min', () => {
      const validator = validations.minLength(5, createMockContext())({});

      const result = validator.safeParse('hi');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Too short. Enter at least 5 characters.',
        );
      }
    });

    it('should accept strings at min length', () => {
      const validator = validations.minLength(5, createMockContext())({});

      const result = validator.safeParse('12345');
      expect(result.success).toBe(true);
    });

    it('should accept strings longer than min', () => {
      const validator = validations.minLength(3, createMockContext())({});

      const result = validator.safeParse('longer text');
      expect(result.success).toBe(true);
    });

    it('should throw error when min is not specified', () => {
      expect(() => {
        validations.minLength(
          null as unknown as number,
          createMockContext(),
        )({});
      }).toThrow('Min length must be specified');
    });
  });

  describe('pattern', () => {
    const NMTOKEN = {
      regex: '^[a-zA-Z0-9._:-]+$',
      errorMessage:
        'Not a valid node type name. Only letters, numbers and the symbols ._-: are supported',
      hint: 'Use letters, numbers and the symbols ._-: only.',
    };

    it('rejects a non-empty value that does not match', () => {
      const validator = validations.pattern(NMTOKEN, createMockContext())({});

      const result = validator.safeParse('not valid!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(NMTOKEN.errorMessage);
      }
    });

    it('accepts a non-empty value that matches', () => {
      const validator = validations.pattern(NMTOKEN, createMockContext())({});

      expect(validator.safeParse('Person_1').success).toBe(true);
    });

    // `required` owns emptiness, exactly as HTML5's `pattern` attribute does.
    // Without this an empty required field reported BOTH "This field is
    // required." and "Not a valid …" at once, as a bulleted list — the
    // researcher was told to fix two things when there was only one.
    it.each([undefined, null, '', '   '])(
      'says nothing about the unanswered value %p',
      (value) => {
        const validator = validations.pattern(NMTOKEN, createMockContext())({});

        expect(validator.safeParse(value).success).toBe(true);
      },
    );

    it('holds no cursor between values', () => {
      // A `test` against a stateful (global) expression alternates pass/fail
      // on identical input. Same validator instance, same value, twice.
      const validator = validations.pattern(NMTOKEN, createMockContext())({});

      expect(validator.safeParse('Person').success).toBe(true);
      expect(validator.safeParse('Person').success).toBe(true);
    });

    it('should throw error when the expression is not specified', () => {
      expect(() => {
        validations.pattern({ ...NMTOKEN, regex: '' }, createMockContext())({});
      }).toThrow('Regex must be specified');
    });
  });

  describe('minValue', () => {
    it('should reject numbers less than min', () => {
      const validator = validations.minValue(10, createMockContext())({});

      const result = validator.safeParse(5);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Too small. Value must be at least 10.',
        );
      }
    });

    it('should accept numbers equal to min', () => {
      const validator = validations.minValue(10, createMockContext())({});

      const result = validator.safeParse(10);
      expect(result.success).toBe(true);
    });

    it('should accept numbers greater than min', () => {
      const validator = validations.minValue(10, createMockContext())({});

      const result = validator.safeParse(15);
      expect(result.success).toBe(true);
    });

    it('should throw error when min is not specified', () => {
      expect(() => {
        validations.minValue(Number.NaN, createMockContext())({});
      }).toThrow('Min value must be specified');
    });
  });

  describe('maxValue', () => {
    it('should reject numbers greater than max', () => {
      const validator = validations.maxValue(10, createMockContext())({});

      const result = validator.safeParse(15);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Too large. Value must be at most 10.',
        );
      }
    });

    it('should accept numbers equal to max', () => {
      const validator = validations.maxValue(10, createMockContext())({});

      const result = validator.safeParse(10);
      expect(result.success).toBe(true);
    });

    it('should accept numbers less than max', () => {
      const validator = validations.maxValue(10, createMockContext())({});

      const result = validator.safeParse(5);
      expect(result.success).toBe(true);
    });

    it('should throw error when max is not specified', () => {
      expect(() => {
        validations.maxValue(
          null as unknown as number,
          createMockContext(),
        )({});
      }).toThrow('Max value must be specified');
    });
  });

  describe('min (numeric)', () => {
    it('rejects numbers less than min', () => {
      const validator = validations.min(10, createMockContext())({});
      const result = validator.safeParse(5);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Too small. Value must be at least 10.',
        );
      }
    });

    it('accepts numbers equal to min', () => {
      const validator = validations.min(10, createMockContext())({});
      expect(validator.safeParse(10).success).toBe(true);
    });

    it('accepts numbers greater than min', () => {
      const validator = validations.min(10, createMockContext())({});
      expect(validator.safeParse(15).success).toBe(true);
    });

    it('coerces numeric string values for number/range inputs', () => {
      const validator = validations.min(10, createMockContext())({});
      expect(validator.safeParse('15').success).toBe(true);
      expect(validator.safeParse('5').success).toBe(false);
    });

    it('ignores empty values (required handles emptiness)', () => {
      const validator = validations.min(10, createMockContext())({});
      expect(validator.safeParse('').success).toBe(true);
      expect(validator.safeParse(undefined).success).toBe(true);
      expect(validator.safeParse(null).success).toBe(true);
    });

    it('throws when min is not specified', () => {
      expect(() => {
        validations.min(
          undefined as unknown as number,
          createMockContext(),
        )({});
      }).toThrow('Min must be specified');
    });
  });

  describe('min (date)', () => {
    it('rejects YYYY-MM-DD values before min', () => {
      const validator = validations.min('2000-06-15', createMockContext())({});
      const result = validator.safeParse('2000-06-14');
      expect(result.success).toBe(false);
      if (!result.success) {
        // Locale pinned to en-US in vitest.setup.ts.
        expect(result.error.issues[0]?.message).toBe(
          'Must be on or after June 15, 2000.',
        );
      }
    });

    it('accepts YYYY-MM-DD values equal to or after min', () => {
      const validator = validations.min('2000-06-15', createMockContext())({});
      expect(validator.safeParse('2000-06-15').success).toBe(true);
      expect(validator.safeParse('2000-06-16').success).toBe(true);
      expect(validator.safeParse('2001-01-01').success).toBe(true);
    });

    it('truncates value to YYYY-MM resolution when comparing against a YYYY-MM-DD min', () => {
      const validator = validations.min('2000-06-15', createMockContext())({});
      // "2000-06" truncates min to "2000-06" → equal → accept (year/month overlaps)
      expect(validator.safeParse('2000-06').success).toBe(true);
      // "2000-05" is strictly earlier month → reject
      expect(validator.safeParse('2000-05').success).toBe(false);
    });

    it('truncates value to YYYY resolution when comparing against a YYYY-MM-DD min', () => {
      const validator = validations.min('2000-06-15', createMockContext())({});
      // "2000" truncates min to "2000" → equal → accept
      expect(validator.safeParse('2000').success).toBe(true);
      expect(validator.safeParse('1999').success).toBe(false);
    });

    it('handles YYYY-MM min with YYYY-MM-DD value', () => {
      const validator = validations.min('2000-06', createMockContext())({});
      expect(validator.safeParse('2000-06-01').success).toBe(true);
      expect(validator.safeParse('2000-05-31').success).toBe(false);
    });

    it('handles YYYY min with YYYY-MM-DD value', () => {
      const validator = validations.min('2000', createMockContext())({});
      expect(validator.safeParse('2000-01-01').success).toBe(true);
      expect(validator.safeParse('1999-12-31').success).toBe(false);
    });

    it('handles time inputs (HH:MM)', () => {
      const validator = validations.min('09:00', createMockContext())({});
      expect(validator.safeParse('09:00').success).toBe(true);
      expect(validator.safeParse('10:30').success).toBe(true);
      expect(validator.safeParse('08:59').success).toBe(false);
    });

    it('handles datetime-local inputs', () => {
      const validator = validations.min(
        '2000-06-15T09:00',
        createMockContext(),
      )({});
      expect(validator.safeParse('2000-06-15T09:00').success).toBe(true);
      expect(validator.safeParse('2000-06-15T08:59').success).toBe(false);
    });
  });

  describe('max (numeric)', () => {
    it('rejects numbers greater than max', () => {
      const validator = validations.max(10, createMockContext())({});
      const result = validator.safeParse(15);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Too large. Value must be at most 10.',
        );
      }
    });

    it('accepts numbers equal to max', () => {
      const validator = validations.max(10, createMockContext())({});
      expect(validator.safeParse(10).success).toBe(true);
    });

    it('accepts numbers less than max', () => {
      const validator = validations.max(10, createMockContext())({});
      expect(validator.safeParse(5).success).toBe(true);
    });

    it('throws when max is not specified', () => {
      expect(() => {
        validations.max(
          undefined as unknown as number,
          createMockContext(),
        )({});
      }).toThrow('Max must be specified');
    });
  });

  describe('max (date)', () => {
    it('rejects YYYY-MM-DD values after max', () => {
      const validator = validations.max('2020-05-15', createMockContext())({});
      const result = validator.safeParse('2020-05-16');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Must be on or before May 15, 2020.',
        );
      }
    });

    it('accepts values equal to or before max', () => {
      const validator = validations.max('2020-05-15', createMockContext())({});
      expect(validator.safeParse('2020-05-15').success).toBe(true);
      expect(validator.safeParse('2020-05-14').success).toBe(true);
      expect(validator.safeParse('1999-12-31').success).toBe(true);
    });

    it('allows partially-overlapping years/months via truncation', () => {
      const validator = validations.max('2020-05-15', createMockContext())({});
      // "2020" truncates max to "2020" → equal → accept (year overlaps)
      expect(validator.safeParse('2020').success).toBe(true);
      // "2020-05" truncates max to "2020-05" → equal → accept (month overlaps)
      expect(validator.safeParse('2020-05').success).toBe(true);
      // "2020-06" is strictly later month → reject
      expect(validator.safeParse('2020-06').success).toBe(false);
    });
  });

  describe('minSelected', () => {
    it('should reject arrays with fewer than min items', () => {
      const validator = validations.minSelected(3, createMockContext())({});

      const result = validator.safeParse(['a', 'b']);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Too few selected. Select at least 3 values.',
        );
      }
    });

    it('should accept arrays with exactly min items', () => {
      const validator = validations.minSelected(3, createMockContext())({});

      const result = validator.safeParse(['a', 'b', 'c']);
      expect(result.success).toBe(true);
    });

    it('should accept arrays with more than min items', () => {
      const validator = validations.minSelected(2, createMockContext())({});

      const result = validator.safeParse(['a', 'b', 'c', 'd']);
      expect(result.success).toBe(true);
    });

    it('should accept an empty array (required owns emptiness)', () => {
      // Deliberate: a checkbox group produces the same `[]` whether the
      // field was never touched or ticked then unticked, so `minSelected`
      // cannot flag `[]` without also flagging an untouched field. Pair
      // `minSelected` with `required: true` to reject an empty selection.
      const validator = validations.minSelected(1, createMockContext())({});

      expect(validator.safeParse([]).success).toBe(true);
      expect(validator.safeParse(undefined).success).toBe(true);
    });

    it('should use singular form for min=1 in its hint', () => {
      const validator = validations.minSelected(1, createMockContext())({});

      const meta = z.globalRegistry.get(validator);
      expect(meta?.hint).toBe('Select at least 1 value.');
    });

    it('should throw error when min is not specified', () => {
      expect(() => {
        validations.minSelected(
          null as unknown as number,
          createMockContext(),
        )({});
      }).toThrow('Min items must be specified');
    });
  });

  describe('maxSelected', () => {
    it('should reject arrays with more than max items', () => {
      const validator = validations.maxSelected(2, createMockContext())({});

      const result = validator.safeParse(['a', 'b', 'c']);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Too many items selected. Select a maximum of 2 values.',
        );
      }
    });

    it('should accept arrays with exactly max items', () => {
      const validator = validations.maxSelected(3, createMockContext())({});

      const result = validator.safeParse(['a', 'b', 'c']);
      expect(result.success).toBe(true);
    });

    it('should accept arrays with fewer than max items', () => {
      const validator = validations.maxSelected(5, createMockContext())({});

      const result = validator.safeParse(['a', 'b']);
      expect(result.success).toBe(true);
    });

    it('should use singular form for max=1', () => {
      const validator = validations.maxSelected(1, createMockContext())({});

      const result = validator.safeParse(['a', 'b']);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Too many items selected. Select a maximum of 1 value.',
        );
      }
    });

    it('should throw error when max is not specified', () => {
      expect(() => {
        validations.maxSelected(
          null as unknown as number,
          createMockContext(),
        )({});
      }).toThrow('Max items must be specified');
    });
  });

  describe('unique', () => {
    it('should reject values that already exist in the network', () => {
      const mockNetwork = {
        nodes: [
          {
            _uid: 'node1',
            type: 'person',
            [entityAttributesProperty]: { name: 'John' },
          },
          {
            _uid: 'node2',
            type: 'person',
            [entityAttributesProperty]: { name: 'Jane' },
          },
        ],
        edges: [],
        ego: {
          _uid: 'ego',
          [entityAttributesProperty]: {},
        },
      } as NcNetwork;

      const validator = validations.unique(
        'name',
        createMockContext({ network: mockNetwork }),
      )({});

      const result = validator.safeParse('John');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'This value is used elsewhere. It must be unique.',
        );
      }
    });

    it('should accept values that do not exist in the network', () => {
      const mockNetwork = {
        nodes: [
          {
            _uid: 'node1',
            type: 'person',
            [entityAttributesProperty]: { name: 'John' },
          },
        ],
        edges: [],
        ego: {
          _uid: 'ego',
          [entityAttributesProperty]: {},
        },
      } as NcNetwork;

      const validator = validations.unique(
        'name',
        createMockContext({ network: mockNetwork }),
      )({});

      const result = validator.safeParse('Alice');
      expect(result.success).toBe(true);
    });

    it('should accept unanswered optional values even when another entity is also unanswered', () => {
      const mockNetwork = {
        nodes: [
          {
            _uid: 'node1',
            type: 'person',
            [entityAttributesProperty]: { name: '' },
          },
        ],
        edges: [],
        ego: {
          _uid: 'ego',
          [entityAttributesProperty]: {},
        },
      } as NcNetwork;

      const validator = validations.unique(
        'name',
        createMockContext({ network: mockNetwork }),
      )({});

      expect(validator.safeParse('').success).toBe(true);
      expect(validator.safeParse('   ').success).toBe(true);
      expect(validator.safeParse(undefined).success).toBe(true);
    });

    it('should throw error for ego entities', () => {
      const context = createMockContext({
        stageSubject: { entity: 'ego' } as StageSubject,
      });

      expect(() => {
        validations.unique('name', context)({}).safeParse('test');
      }).toThrow('Not applicable to ego entities');
    });

    it('should throw error when attribute is not specified', () => {
      expect(() => {
        validations
          .unique(
            null as unknown as string,
            createMockContext(),
          )({})
          .safeParse('test');
      }).toThrow('Attribute must be specified for unique validation');
    });

    it("should accept the currently-edited entity's own value", () => {
      const mockNetwork = {
        nodes: [
          {
            _uid: 'node1',
            type: 'person',
            [entityAttributesProperty]: { name: 'John' },
          },
          {
            _uid: 'node2',
            type: 'person',
            [entityAttributesProperty]: { name: 'Jane' },
          },
        ],
        edges: [],
        ego: {
          _uid: 'ego',
          [entityAttributesProperty]: {},
        },
      } as NcNetwork;

      const validator = validations.unique(
        'name',
        createMockContext({
          network: mockNetwork,
          currentEntityId: 'node1',
        }),
      )({});

      const result = validator.safeParse('John');
      expect(result.success).toBe(true);
    });

    it("should still reject other entities' values when editing", () => {
      const mockNetwork = {
        nodes: [
          {
            _uid: 'node1',
            type: 'person',
            [entityAttributesProperty]: { name: 'John' },
          },
          {
            _uid: 'node2',
            type: 'person',
            [entityAttributesProperty]: { name: 'Jane' },
          },
        ],
        edges: [],
        ego: {
          _uid: 'ego',
          [entityAttributesProperty]: {},
        },
      } as NcNetwork;

      const validator = validations.unique(
        'name',
        createMockContext({
          network: mockNetwork,
          currentEntityId: 'node1',
        }),
      )({});

      const result = validator.safeParse('Jane');
      expect(result.success).toBe(false);
    });
  });

  describe('differentFrom', () => {
    it('should reject values that match the comparison field', () => {
      const validator = validations.differentFrom(
        'testAttribute',
        createMockContext(),
      )({ testAttribute: 'sameValue' });

      const result = validator.safeParse('sameValue');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Your answer must be different from your earlier answer.',
        );
      }
    });

    it('should accept values that differ from the comparison field', () => {
      const validator = validations.differentFrom(
        'testAttribute',
        createMockContext(),
      )({ testAttribute: 'originalValue' });

      const result = validator.safeParse('differentValue');
      expect(result.success).toBe(true);
    });

    it('should throw error when attribute is not specified', () => {
      expect(() => {
        validations
          .differentFrom(
            null as unknown as string,
            createMockContext(),
          )({})
          .safeParse('test');
      }).toThrow('Attribute must be specified for differentFrom validation');
    });

    it('should pass validation when comparison attribute is not in form values (allows hint generation)', () => {
      // When the comparison attribute is not in formValues, validation is skipped
      // This allows hint generation to work without requiring formValues
      const validator = validations.differentFrom(
        'testAttribute',
        createMockContext(),
      )({});

      const result = validator.safeParse('someValue');
      expect(result.success).toBe(true);
    });

    it('should throw error when comparison variable is not found in codebook', () => {
      expect(() => {
        validations
          .differentFrom(
            'unknownAttribute',
            createMockContext(),
          )({
            unknownAttribute: 'value',
          })
          .safeParse('test');
      }).toThrow('Comparison attribute not found in codebook');
    });
  });

  describe('sameAs', () => {
    it('should reject values that differ from the comparison field', () => {
      const validator = validations.sameAs(
        'testAttribute',
        createMockContext(),
      )({ testAttribute: 'originalValue' });

      const result = validator.safeParse('differentValue');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Your answer must be the same as your earlier answer.',
        );
      }
    });

    it('should accept values that match the comparison field', () => {
      const validator = validations.sameAs(
        'testAttribute',
        createMockContext(),
      )({ testAttribute: 'sameValue' });

      const result = validator.safeParse('sameValue');
      expect(result.success).toBe(true);
    });

    it('resolves comparison fields relative to the active namespace', () => {
      const validator = validations.sameAs(
        'testAttribute',
        createMockContext({ formValueNamespace: 'parent' }),
      )({
        testAttribute: 'wrong top-level person',
        parent: { testAttribute: 'sameValue' },
      });

      expect(validator.safeParse('sameValue').success).toBe(true);
      expect(validator.safeParse('differentValue').success).toBe(false);
    });

    it('uses an aliased live form key without changing the codebook variable ID', () => {
      const validator = validations.sameAs(
        'displayName',
        createMockContext({
          formValueAliases: { displayName: 'name' },
          codebook: {
            node: {
              person: {
                name: 'Person',
                color: 'node-color-seq-1',
                shape: { default: 'circle' },
                variables: {
                  displayName: {
                    name: 'Display name',
                    type: 'text',
                  },
                },
              },
            },
          },
        }),
      )({ name: 'live value' });

      expect(validator.safeParse('live value').success).toBe(true);
      expect(validator.safeParse('stale value').success).toBe(false);
    });

    it('should throw error when attribute is not specified', () => {
      expect(() => {
        validations
          .sameAs(
            null as unknown as string,
            createMockContext(),
          )({})
          .safeParse('test');
      }).toThrow('Attribute must be specified for sameAs validation');
    });

    it('should pass validation when comparison attribute is not in form values (allows hint generation)', () => {
      // When the comparison attribute is not in formValues, validation is skipped
      // This allows hint generation to work without requiring formValues
      const validator = validations.sameAs(
        'testAttribute',
        createMockContext(),
      )({});

      const result = validator.safeParse('someValue');
      expect(result.success).toBe(true);
    });
  });

  describe('greaterThanVariable', () => {
    it('should reject values less than the comparison field', () => {
      const validator = validations.greaterThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(5);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Your answer must be greater than your earlier answer.',
        );
      }
    });

    it('should accept values greater than the comparison field', () => {
      const validator = validations.greaterThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(15);
      expect(result.success).toBe(true);
    });

    it('should reject values equal to the comparison field (strict comparison)', () => {
      const validator = validations.greaterThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(10);
      expect(result.success).toBe(false);
    });

    it('should work with datetime fields', () => {
      const validator = validations.greaterThanVariable(
        { attribute: 'dateAttribute', type: 'datetime' },
        createMockContext(),
      )({ dateAttribute: '2024-01-01T00:00:00Z' });

      const result = validator.safeParse('2024-06-01T00:00:00Z');
      expect(result.success).toBe(true);

      const resultPast = validator.safeParse('2023-06-01T00:00:00Z');
      expect(resultPast.success).toBe(false);
    });

    it('should throw error when attribute is not specified', () => {
      expect(() => {
        validations
          .greaterThanVariable(
            { attribute: null, type: 'number' } as unknown as {
              attribute: string;
              type: 'number';
            },
            createMockContext(),
          )({})
          .safeParse(10);
      }).toThrow(
        'Attribute must be specified for greaterThanVariable validation',
      );
    });

    it('should throw error when attribute is not in codebook', () => {
      expect(() => {
        validations
          .greaterThanVariable(
            {
              attribute: 'missingAttribute',
              type: 'number',
            },
            createMockContext(),
          )({})
          .safeParse(10);
      }).toThrow('Comparison attribute not found in codebook');
    });

    it('should pass validation when comparison attribute is not in form values (allows hint generation)', () => {
      // When the comparison attribute is not in formValues, validation is skipped
      // This allows hint generation to work without requiring formValues
      const validator = validations.greaterThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({});

      const result = validator.safeParse(10);
      expect(result.success).toBe(true);
    });
  });

  describe('lessThanVariable', () => {
    it('should reject values greater than the comparison field', () => {
      const validator = validations.lessThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(15);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Your answer must be less than your earlier answer.',
        );
      }
    });

    it('should accept values less than the comparison field', () => {
      const validator = validations.lessThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(5);
      expect(result.success).toBe(true);
    });

    it('should reject values equal to the comparison field (strict comparison)', () => {
      const validator = validations.lessThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(10);
      expect(result.success).toBe(false);
    });

    it('should work with datetime fields', () => {
      const validator = validations.lessThanVariable(
        { attribute: 'dateAttribute', type: 'datetime' },
        createMockContext(),
      )({ dateAttribute: '2024-01-01T00:00:00Z' });

      const result = validator.safeParse('2023-06-01T00:00:00Z');
      expect(result.success).toBe(true);

      const resultFuture = validator.safeParse('2024-06-01T00:00:00Z');
      expect(resultFuture.success).toBe(false);
    });

    it('should throw error when attribute is not specified', () => {
      expect(() => {
        validations
          .lessThanVariable(
            { attribute: null, type: 'number' } as unknown as {
              attribute: string;
              type: 'number';
            },
            createMockContext(),
          )({})
          .safeParse(10);
      }).toThrow('Attribute must be specified for lessThanVariable validation');
    });

    it('should throw error when attribute is not in codebook', () => {
      expect(() => {
        validations
          .lessThanVariable(
            {
              attribute: 'missingAttribute',
              type: 'number',
            },
            createMockContext(),
          )({})
          .safeParse(10);
      }).toThrow('Comparison attribute not found in codebook');
    });

    it('should pass validation when comparison attribute is not in form values (allows hint generation)', () => {
      // When the comparison attribute is not in formValues, validation is skipped
      // This allows hint generation to work without requiring formValues
      const validator = validations.lessThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({});

      const result = validator.safeParse(10);
      expect(result.success).toBe(true);
    });
  });

  describe('greaterThanOrEqualToVariable', () => {
    it('should reject values less than the comparison field', () => {
      const validator = validations.greaterThanOrEqualToVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(5);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Your answer must be the same as or greater than your earlier answer.',
        );
      }
    });

    it('should accept values equal to the comparison field', () => {
      const validator = validations.greaterThanOrEqualToVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(10);
      expect(result.success).toBe(true);
    });

    it('should accept values greater than the comparison field', () => {
      const validator = validations.greaterThanOrEqualToVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(15);
      expect(result.success).toBe(true);
    });

    it('should work with datetime fields', () => {
      const validator = validations.greaterThanOrEqualToVariable(
        { attribute: 'dateAttribute', type: 'datetime' },
        createMockContext(),
      )({ dateAttribute: '2024-01-01T00:00:00Z' });

      const result = validator.safeParse('2024-06-01T00:00:00Z');
      expect(result.success).toBe(true);

      const resultEqual = validator.safeParse('2024-01-01T00:00:00Z');
      expect(resultEqual.success).toBe(true);

      const resultPast = validator.safeParse('2023-06-01T00:00:00Z');
      expect(resultPast.success).toBe(false);
    });

    it('should throw error when attribute is not specified', () => {
      expect(() => {
        validations
          .greaterThanOrEqualToVariable(
            { attribute: null, type: 'number' } as unknown as {
              attribute: string;
              type: 'number';
            },
            createMockContext(),
          )({})
          .safeParse(10);
      }).toThrow(
        'Attribute must be specified for greaterThanOrEqualToVariable validation',
      );
    });

    it('should throw error when attribute is not in codebook', () => {
      expect(() => {
        validations
          .greaterThanOrEqualToVariable(
            {
              attribute: 'missingAttribute',
              type: 'number',
            },
            createMockContext(),
          )({})
          .safeParse(10);
      }).toThrow('Comparison attribute not found in codebook');
    });

    it('should pass validation when comparison attribute is not in form values (allows hint generation)', () => {
      const validator = validations.greaterThanOrEqualToVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({});

      const result = validator.safeParse(10);
      expect(result.success).toBe(true);
    });
  });

  describe('lessThanOrEqualToVariable', () => {
    it('should reject values greater than the comparison field', () => {
      const validator = validations.lessThanOrEqualToVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(15);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Your answer must be the same as or less than your earlier answer.',
        );
      }
    });

    it('should accept values equal to the comparison field', () => {
      const validator = validations.lessThanOrEqualToVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(10);
      expect(result.success).toBe(true);
    });

    it('should accept values less than the comparison field', () => {
      const validator = validations.lessThanOrEqualToVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({ numberAttribute: 10 });

      const result = validator.safeParse(5);
      expect(result.success).toBe(true);
    });

    it('should work with datetime fields', () => {
      const validator = validations.lessThanOrEqualToVariable(
        { attribute: 'dateAttribute', type: 'datetime' },
        createMockContext(),
      )({ dateAttribute: '2024-01-01T00:00:00Z' });

      const result = validator.safeParse('2023-06-01T00:00:00Z');
      expect(result.success).toBe(true);

      const resultEqual = validator.safeParse('2024-01-01T00:00:00Z');
      expect(resultEqual.success).toBe(true);

      const resultFuture = validator.safeParse('2024-06-01T00:00:00Z');
      expect(resultFuture.success).toBe(false);
    });

    it('should throw error when attribute is not specified', () => {
      expect(() => {
        validations
          .lessThanOrEqualToVariable(
            { attribute: null, type: 'number' } as unknown as {
              attribute: string;
              type: 'number';
            },
            createMockContext(),
          )({})
          .safeParse(10);
      }).toThrow(
        'Attribute must be specified for lessThanOrEqualToVariable validation',
      );
    });

    it('should throw error when attribute is not in codebook', () => {
      expect(() => {
        validations
          .lessThanOrEqualToVariable(
            {
              attribute: 'missingAttribute',
              type: 'number',
            },
            createMockContext(),
          )({})
          .safeParse(10);
      }).toThrow('Comparison attribute not found in codebook');
    });

    it('should pass validation when comparison attribute is not in form values (allows hint generation)', () => {
      const validator = validations.lessThanOrEqualToVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext(),
      )({});

      const result = validator.safeParse(10);
      expect(result.success).toBe(true);
    });
  });

  describe('optional min* short-circuit on empty/undefined (A4)', () => {
    it('minValue ignores undefined/empty (required owns emptiness)', () => {
      const validator = validations.minValue(10, createMockContext())({});
      expect(validator.safeParse(undefined).success).toBe(true);
      expect(validator.safeParse('').success).toBe(true);
      expect(validator.safeParse(null).success).toBe(true);
    });

    it('minValue still rejects a present value below the bound', () => {
      const validator = validations.minValue(10, createMockContext())({});
      expect(validator.safeParse(5).success).toBe(false);
      expect(validator.safeParse(10).success).toBe(true);
    });

    it('minLength ignores undefined/empty (required owns emptiness)', () => {
      const validator = validations.minLength(3, createMockContext())({});
      expect(validator.safeParse(undefined).success).toBe(true);
      expect(validator.safeParse('').success).toBe(true);
    });

    it('minLength still rejects a present value below the bound', () => {
      const validator = validations.minLength(3, createMockContext())({});
      expect(validator.safeParse('hi').success).toBe(false);
      expect(validator.safeParse('abc').success).toBe(true);
    });

    it('minSelected ignores undefined/empty (required owns emptiness)', () => {
      const validator = validations.minSelected(2, createMockContext())({});
      expect(validator.safeParse(undefined).success).toBe(true);
      expect(validator.safeParse([]).success).toBe(true);
    });

    it('minSelected still rejects a present array below the bound', () => {
      const validator = validations.minSelected(2, createMockContext())({});
      expect(validator.safeParse(['a']).success).toBe(false);
      expect(validator.safeParse(['a', 'b']).success).toBe(true);
    });
  });

  describe('maxValue/maxLength with a zero bound (A4)', () => {
    it('maxValue:0 treats 0 as a real bound rather than throwing', () => {
      const validator = validations.maxValue(0, createMockContext())({});
      expect(validator.safeParse(0).success).toBe(true);
      expect(validator.safeParse(-5).success).toBe(true);
      const result = validator.safeParse(1);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Too large. Value must be at most 0.',
        );
      }
    });

    it('maxValue:0 ignores empty/undefined', () => {
      const validator = validations.maxValue(0, createMockContext())({});
      expect(validator.safeParse(undefined).success).toBe(true);
      expect(validator.safeParse('').success).toBe(true);
    });

    it('maxLength:0 treats 0 as a real bound rather than throwing', () => {
      const validator = validations.maxLength(0, createMockContext())({});
      expect(validator.safeParse('').success).toBe(true);
      expect(validator.safeParse('a').success).toBe(false);
    });
  });

  describe('comparison validators source from persisted attributes (A4)', () => {
    const networkWithNode: NcNetwork = {
      nodes: [
        {
          _uid: 'node1',
          type: 'person',
          [entityAttributesProperty]: { numberAttribute: 10 },
        },
      ],
      edges: [],
      ego: {
        _uid: 'ego',
        [entityAttributesProperty]: {},
      },
    } as NcNetwork;

    it('greaterThanVariable compares against the persisted node attribute when not a form field', () => {
      const validator = validations.greaterThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext({
          network: networkWithNode,
          currentEntityId: 'node1',
        }),
      )({}); // comparison var not present as a form field

      expect(validator.safeParse(15).success).toBe(true);
      expect(validator.safeParse(5).success).toBe(false);
    });

    it('lessThanVariable compares against the persisted node attribute when not a form field', () => {
      const validator = validations.lessThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext({
          network: networkWithNode,
          currentEntityId: 'node1',
        }),
      )({});

      expect(validator.safeParse(5).success).toBe(true);
      expect(validator.safeParse(15).success).toBe(false);
    });

    it('sameAs compares against the persisted ego attribute when not a form field', () => {
      const egoNetwork: NcNetwork = {
        nodes: [],
        edges: [],
        ego: {
          _uid: 'ego',
          [entityAttributesProperty]: { testAttribute: 'secret' },
        },
      } as NcNetwork;

      const validator = validations.sameAs(
        'testAttribute',
        createMockContext({
          stageSubject: { entity: 'ego' } as StageSubject,
          network: egoNetwork,
          codebook: {
            ego: {
              variables: {
                testAttribute: { name: 'Test Attribute', type: 'text' },
              },
            },
          },
        }),
      )({});

      expect(validator.safeParse('secret').success).toBe(true);
      expect(validator.safeParse('different').success).toBe(false);
    });

    it('differentFrom compares against the persisted node attribute when not a form field', () => {
      const stringNetwork: NcNetwork = {
        nodes: [
          {
            _uid: 'node1',
            type: 'person',
            [entityAttributesProperty]: { testAttribute: 'taken' },
          },
        ],
        edges: [],
        ego: { _uid: 'ego', [entityAttributesProperty]: {} },
      } as NcNetwork;

      const validator = validations.differentFrom(
        'testAttribute',
        createMockContext({
          network: stringNetwork,
          currentEntityId: 'node1',
        }),
      )({});

      expect(validator.safeParse('taken').success).toBe(false);
      expect(validator.safeParse('fresh').success).toBe(true);
    });

    it('still no-ops when the variable is absent from both form and attributes', () => {
      const validator = validations.greaterThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext({ currentEntityId: 'missing-node' }),
      )({});

      expect(validator.safeParse(5).success).toBe(true);
    });
  });

  /**
   * Regression cover for issue #1385: an unanswered field collected BOTH the
   * required error and a nonsensical comparison error about a value it did
   * not have, and the comparison copy named the codebook variable — the
   * researcher's identifier for a column of data — to the participant.
   */
  describe('comparison rules and unanswered values (#1385)', () => {
    const comparisonCases = [
      {
        name: 'differentFrom',
        build: (context: ValidationContext) =>
          validations.differentFrom('numberAttribute', context),
      },
      {
        name: 'sameAs',
        build: (context: ValidationContext) =>
          validations.sameAs('numberAttribute', context),
      },
      {
        name: 'greaterThanVariable',
        build: (context: ValidationContext) =>
          validations.greaterThanVariable(
            { attribute: 'numberAttribute', type: 'number' },
            context,
          ),
      },
      {
        name: 'lessThanVariable',
        build: (context: ValidationContext) =>
          validations.lessThanVariable(
            { attribute: 'numberAttribute', type: 'number' },
            context,
          ),
      },
      {
        name: 'greaterThanOrEqualToVariable',
        build: (context: ValidationContext) =>
          validations.greaterThanOrEqualToVariable(
            { attribute: 'numberAttribute', type: 'number' },
            context,
          ),
      },
      {
        name: 'lessThanOrEqualToVariable',
        build: (context: ValidationContext) =>
          validations.lessThanOrEqualToVariable(
            { attribute: 'numberAttribute', type: 'number' },
            context,
          ),
      },
    ] as const;

    it.each(comparisonCases)(
      '$name does not fire on an unanswered field whose target IS answered',
      ({ build }) => {
        const validator = build(createMockContext())({ numberAttribute: 5 });

        expect(validator.safeParse(undefined).success).toBe(true);
        expect(validator.safeParse(null).success).toBe(true);
        expect(validator.safeParse('').success).toBe(true);
        expect(validator.safeParse('   ').success).toBe(true);
        expect(validator.safeParse(Number.NaN).success).toBe(true);
        expect(validator.safeParse([]).success).toBe(true);
      },
    );

    it.each(comparisonCases)(
      '$name does not fire when the target is present but empty',
      ({ build }) => {
        // A form value the participant has cleared: the key is present, so
        // `getComparisonValue` reports it, but there is nothing to compare to.
        const emptyTargets: FieldValue[] = [undefined, '', '   '];
        for (const emptyTarget of emptyTargets) {
          const validator = build(createMockContext())({
            numberAttribute: emptyTarget,
          });

          expect(validator.safeParse(5).success).toBe(true);
        }
      },
    );

    it('leaves an unanswered required field with exactly one error', async () => {
      // Through the same combiner a real Field uses, so the two rules meet
      // exactly as they do on screen.
      const validate = makeValidationFunction({
        required: true,
        greaterThanVariable: { attribute: 'numberAttribute', type: 'number' },
        validationContext: createMockContext(),
      });

      const result = await validate({ numberAttribute: 5 }).safeParseAsync(
        undefined,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message)).toEqual([
          'You must answer this question before continuing.',
        ]);
      }
    });

    it('names the comparison target with the authored prompt, never the variable', () => {
      const validator = validations.greaterThanVariable(
        { attribute: 'numberAttribute', type: 'number' },
        createMockContext({
          variableLabels: {
            numberAttribute: 'How many years have you lived here?',
          },
        }),
      )({ numberAttribute: 5 });

      const result = validator.safeParse(1);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Your answer must be greater than your answer to 'How many years have you lived here?'.",
        );
      }
    });

    it('treats an inherited label property as an absent authored label', () => {
      const validator = validations.greaterThanVariable(
        { attribute: 'toString', type: 'number' },
        createMockContext({ variableLabels: {} }),
      )({ toString: 5 });

      const result = validator.safeParse(1);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Your answer must be greater than your earlier answer.',
        );
      }
    });

    it.each(comparisonCases)(
      '$name never leaks the codebook variable name or id without an authored label',
      ({ build }) => {
        const validator = build(createMockContext())({ numberAttribute: 5 });

        // 5 fails every one of the six rules against a target of 5 except the
        // inclusive ones, so drive each with a value that cannot satisfy it.
        for (const value of [5, 1, 9]) {
          const result = validator.safeParse(value);
          if (result.success) continue;
          const message = result.error.issues[0]?.message ?? '';
          expect(message).not.toContain('Number Attribute');
          expect(message).not.toContain('numberAttribute');
        }
      },
    );
  });

  /**
   * `isUnanswered` is the file's single definition of emptiness, and every
   * OPTIONAL rule short-circuits on it so an unanswered field collects exactly
   * one error — the `required` one — rather than a second, nonsensical one
   * about a value the participant never supplied.
   *
   * The rules below used to hand-roll a weaker `undefined | null | ''` guard,
   * which let whitespace-only text and an empty selection fall through to
   * `Number(value)` — which coerces BOTH to `0` and then reports them as
   * out of bounds. `maxSelected` and `email` went further and leaned on
   * `z.prefault`, which surfaced raw Zod type errors ("expected array,
   * received null") to participants and, for `email`, rejected an untouched
   * optional field outright.
   *
   * `maxLength` is deliberately absent: an empty string is a present value
   * for it and trivially satisfies any maximum (see isUnanswered.ts).
   */
  describe('optional rules short-circuit on the shared emptiness predicate', () => {
    const NUMBERS_ONLY = {
      regex: '^\\d+$',
      errorMessage: 'Enter numbers only.',
      hint: 'Numbers only.',
    };

    const optionalRules = [
      {
        name: 'minLength',
        build: () => validations.minLength(5, createMockContext())({}),
      },
      {
        name: 'minValue',
        build: () => validations.minValue(10, createMockContext())({}),
      },
      {
        // A negative bound, because `Number('   ')` and `Number([])` are both
        // `0`, which any non-negative maximum would accept by accident.
        name: 'maxValue',
        build: () => validations.maxValue(-1, createMockContext())({}),
      },
      {
        name: 'min (numeric)',
        build: () => validations.min(10, createMockContext())({}),
      },
      {
        name: 'min (date)',
        build: () => validations.min('2000-01-01', createMockContext())({}),
      },
      {
        name: 'max (numeric)',
        build: () => validations.max(-1, createMockContext())({}),
      },
      {
        name: 'max (date)',
        build: () => validations.max('2000-01-01', createMockContext())({}),
      },
      {
        name: 'minSelected',
        build: () => validations.minSelected(2, createMockContext())({}),
      },
      {
        name: 'maxSelected',
        build: () => validations.maxSelected(2, createMockContext())({}),
      },
      {
        name: 'pattern',
        build: () => validations.pattern(NUMBERS_ONLY, createMockContext())({}),
      },
      {
        name: 'email',
        build: () => validations.email()(),
      },
    ];

    const unansweredValues: unknown[] = [
      undefined,
      null,
      '',
      '   ',
      [],
      Number.NaN,
    ];

    const unansweredCases = optionalRules.flatMap((rule) =>
      unansweredValues.map((value) => ({ ...rule, value })),
    );

    it.each(unansweredCases)(
      '$name says nothing about the unanswered value $value',
      ({ build, value }) => {
        expect(build().safeParse(value).success).toBe(true);
      },
    );

    it('maxSelected ignores a value that is not a selection', () => {
      // Every other collection rule returns silently on a value of the wrong
      // shape rather than showing a participant a Zod type error.
      const validator = validations.maxSelected(2, createMockContext())({});

      expect(validator.safeParse('abc').success).toBe(true);
      expect(validator.safeParse(5).success).toBe(true);
    });

    it.each([
      {
        name: 'maxSelected',
        build: () => validations.maxSelected(2, createMockContext())({}),
        hint: 'Select a maximum of 2 values.',
      },
      {
        name: 'email',
        build: () => validations.email()(),
        hint: 'Must be a valid email address.',
      },
    ])(
      '$name still carries its hint metadata after dropping z.prefault',
      ({ build, hint }) => {
        // `makeValidationHints` reads the hint back off the returned schema, so
        // moving these two off `z.prefault` must not move the metadata with it.
        expect(z.globalRegistry.get(build())?.hint).toBe(hint);
      },
    );

    it('email rejects a malformed address with the participant-facing message', () => {
      const validator = validations.email()();

      expect(validator.safeParse('someone@example.com').success).toBe(true);

      const result = validator.safeParse('not-an-address');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Enter a valid email address.',
        );
      }
    });

    it('leaves an unanswered required numeric field with exactly one error', async () => {
      // Through the same combiner a real Field uses, so the rules meet exactly
      // as they do on screen. Whitespace-only text is unanswered, so only
      // `required` has anything to say about it.
      const validate = makeValidationFunction({
        required: true,
        minValue: 10,
        minLength: 5,
        validationContext: createMockContext(),
      });

      const result = await validate({}).safeParseAsync('   ');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message)).toEqual([
          'You must answer this question before continuing.',
        ]);
      }
    });
  });
});
