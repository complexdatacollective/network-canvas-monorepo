import { describe, expect, it } from 'vitest';

import { getSortOrderOptionGetter } from '../optionGetters';

const mockVariableOptions = [
  { label: 'Name', type: 'text', value: '1234-1234-1234-1' },
  { label: 'Age', type: 'number', value: '1234-1234-1234-2' },
  { label: 'Location', type: 'layout', value: '1234-1234-1234-3' },
];

describe('CategoricalBin optionGetters', () => {
  describe('getSortOrderOptionGetter', () => {
    it('options for `property`', () => {
      const sortOrderOptionGetter =
        getSortOrderOptionGetter(mockVariableOptions);

      const mockAllValues = [
        {
          property: '1234-1234-1234-2',
          direction: 'asc',
        },
      ];

      const subject = sortOrderOptionGetter(
        'property',
        undefined,
        mockAllValues,
      );

      expect(subject).toEqual([
        { label: '*', value: '*' },
        { label: 'Name', value: '1234-1234-1234-1' },
        { label: 'Age', value: '1234-1234-1234-2', disabled: true },
      ]);
    });

    // The field value is unset until the array holds rows, and a half-filled
    // row has no `property` yet.
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a non-array value', {}],
      ['rows with no property yet', [{ direction: 'asc' }]],
    ])('disables nothing when allValues is %s', (_label, allValues) => {
      const sortOrderOptionGetter =
        getSortOrderOptionGetter(mockVariableOptions);

      const subject = sortOrderOptionGetter('property', undefined, allValues);

      expect(subject).toEqual([
        { label: '*', value: '*' },
        { label: 'Name', value: '1234-1234-1234-1' },
        { label: 'Age', value: '1234-1234-1234-2' },
      ]);
    });

    it('options for `direction`', () => {
      const sortOrderOptionGetter =
        getSortOrderOptionGetter(mockVariableOptions);

      const mockAllValues = [
        { property: '1234-1234-1234-2', direction: 'asc' },
      ];

      const subject = sortOrderOptionGetter(
        'direction',
        undefined,
        mockAllValues,
      );

      expect(subject).toEqual([
        { label: 'Descending', value: 'desc' },
        { label: 'Ascending', value: 'asc' },
      ]);
    });
  });
});
