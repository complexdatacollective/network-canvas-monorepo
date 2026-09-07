import { describe, expect, it } from 'vitest';

import { enIntl } from '../../testing/i18n.ts';
import {
  getSortOrderOptionGetter,
  missingSortPropertyLabel,
  orphanedSortProperties,
} from '../sortOrderOptions.ts';

describe('getSortOrderOptionGetter', () => {
  describe('typed sortable properties (codebook attributes)', () => {
    const mockVariableOptions = [
      { label: 'Name', type: 'text', value: '1234-1234-1234-1' },
      { label: 'Age', type: 'number', value: '1234-1234-1234-2' },
      { label: 'Location', type: 'layout', value: '1234-1234-1234-3' },
    ];

    it('options for `property` exclude layout attributes and mark used ones disabled', () => {
      const sortOrderOptionGetter = getSortOrderOptionGetter(
        mockVariableOptions,
        enIntl,
      );

      const mockAllValues = [
        { property: '1234-1234-1234-2', direction: 'asc' },
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
      const sortOrderOptionGetter = getSortOrderOptionGetter(
        mockVariableOptions,
        enIntl,
      );

      const subject = sortOrderOptionGetter('property', undefined, allValues);

      expect(subject).toEqual([
        { label: '*', value: '*' },
        { label: 'Name', value: '1234-1234-1234-1' },
        { label: 'Age', value: '1234-1234-1234-2' },
      ]);
    });

    it('options for `direction`', () => {
      const sortOrderOptionGetter = getSortOrderOptionGetter(
        mockVariableOptions,
        enIntl,
      );

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

    it('returns nothing for an unrecognised field name', () => {
      const sortOrderOptionGetter = getSortOrderOptionGetter(
        mockVariableOptions,
        enIntl,
      );

      expect(sortOrderOptionGetter('label', undefined, [])).toEqual([]);
    });

    /**
     * A property marked unselectable stays unselectable whatever the rules do.
     *
     * The getter disables an option a rule already names, and that disabling
     * ends the moment the rule is pointed somewhere else — which is right for
     * an attribute the codebook still has, and wrong for one it has lost. So
     * `disabled` has to survive `toOption`, which until now kept only the
     * value and the label.
     */
    it('keeps a property that is disabled in its own right disabled', () => {
      const sortOrderOptionGetter = getSortOrderOptionGetter(
        [
          ...mockVariableOptions,
          {
            label: missingSortPropertyLabel('nickname', enIntl),
            value: 'nickname',
            disabled: true,
          },
        ],
        enIntl,
      );

      // No rule names it, so nothing about the rules can be what disables it.
      const subject = sortOrderOptionGetter('property', undefined, [
        { property: '1234-1234-1234-1', direction: 'asc' },
      ]);

      expect(subject).toContainEqual({
        label: 'nickname — this attribute is no longer in the codebook',
        value: 'nickname',
        disabled: true,
      });
      // An ordinary property still renders exactly what it always did, rather
      // than acquiring `disabled: false`.
      expect(subject).toContainEqual({
        label: 'Age',
        value: '1234-1234-1234-2',
      });
    });
  });

  describe('untyped sortable properties (external-data columns)', () => {
    const mockExternalDataPropertyOptions = [
      { label: 'Name', value: '1234-1234-1234-1' },
      { label: 'Age', value: '1234-1234-1234-2' },
      { label: 'Favourite Color', value: '1234-1234-1234-3' },
    ];

    it('options for `property` include every column, since none carry a type', () => {
      const sortOrderOptionGetter = getSortOrderOptionGetter(
        mockExternalDataPropertyOptions,
        enIntl,
      );

      const mockAllValues = [
        { property: '1234-1234-1234-2', direction: 'asc' },
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
        { label: 'Favourite Color', value: '1234-1234-1234-3' },
      ]);
    });

    it('options for `direction`', () => {
      const sortOrderOptionGetter = getSortOrderOptionGetter(
        mockExternalDataPropertyOptions,
        enIntl,
      );

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

/**
 * A rule may outlive the attribute it names.
 *
 * `SortRuleSchema.property` is `existence: 'unchecked'` on purpose — deleting
 * an attribute must not make a collaborator's stage unopenable — so the
 * dangling reference is kept, and the editor is what has to say it is dangling.
 */
describe('orphanedSortProperties', () => {
  const properties = [
    { label: 'Name', type: 'text', value: 'name' },
    { label: 'Age', type: 'number', value: 'age' },
  ];

  it('names the attributes the rules point at and the codebook has lost', () => {
    expect(
      orphanedSortProperties(
        [
          { property: 'name', direction: 'asc' },
          { property: 'nickname', direction: 'desc' },
        ],
        properties,
        enIntl,
      ),
    ).toEqual([
      {
        value: 'nickname',
        label: 'nickname — this attribute is no longer in the codebook',
        disabled: true,
      },
    ]);
  });

  it('reports one option for an attribute two rules both name', () => {
    // Two rules naming the same missing id is a protocol nothing refuses, and
    // two identical options in one select is a control nobody can read.
    expect(
      orphanedSortProperties(
        [
          { property: 'nickname', direction: 'asc' },
          { property: 'nickname', direction: 'desc' },
        ],
        properties,
        enIntl,
      ),
    ).toHaveLength(1);
  });

  it('leaves the order-they-were-added-in key alone', () => {
    // `*` names no attribute, so it can never be missing from the codebook.
    expect(
      orphanedSortProperties(
        [{ property: '*', direction: 'asc' }],
        properties,
        enIntl,
      ),
    ).toEqual([]);
  });

  /**
   * The state every caller passes through: a prompt whose stage has not been
   * told what it collects has nothing to judge its rules against yet. Judging
   * them there would report every one of them as dangling, and the researcher
   * would be told to fix a protocol that is not broken.
   */
  it('reports nothing while the caller does not know its properties yet', () => {
    expect(
      orphanedSortProperties(
        [{ property: 'nickname', direction: 'asc' }],
        undefined,
        enIntl,
      ),
    ).toEqual([]);
  });

  /**
   * And the state that is not that one. A subject with nothing to sort by is a
   * real answer, and there every rule the prompt holds is certainly dangling —
   * so it is reported, rather than the control going blank and the rule saving
   * itself straight back.
   */
  it('judges the rules against a subject with nothing to sort by', () => {
    expect(
      orphanedSortProperties(
        [{ property: 'nickname', direction: 'asc' }],
        [],
        enIntl,
      ),
    ).toEqual([
      {
        value: 'nickname',
        label: 'nickname — this attribute is no longer in the codebook',
        disabled: true,
      },
    ]);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a non-array value', {}],
    ['rows with no property yet', [{ direction: 'asc' }]],
    ['a row that is not an object', ['nickname']],
    ['a property cleared back to empty', [{ property: '', direction: 'asc' }]],
  ])('reports nothing for %s', (_label, rules) => {
    expect(orphanedSortProperties(rules, properties, enIntl)).toEqual([]);
  });
});
