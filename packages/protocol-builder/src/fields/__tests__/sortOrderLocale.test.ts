import { describe, expect, it } from 'vitest';

import { esIntl, readMessage } from '../../testing/i18n.ts';
import {
  getSortOrderOptionGetter,
  MISSING_SORT_PROPERTY_MESSAGE,
  orphanedSortProperties,
} from '../sortOrderOptions.ts';

/**
 * The sort-rule options a prompt offers, read in Spanish.
 *
 * A rule that has outlived its attribute is the case worth covering: the only
 * thing left of the attribute is a record id the researcher never chose, and
 * the option that carries it renders inside a plain `<option>`, which can hold
 * no styling — so the explanation IS the label. If that label stayed English
 * the researcher would be told, in a language they did not choose, that
 * something they cannot see is missing.
 */
describe('sort-rule options, read in Spanish', () => {
  it('offers the fixed source-order choice and both directions', () => {
    const options = getSortOrderOptionGetter(
      [{ value: 'age', label: 'Age', type: 'number' }],
      esIntl,
    );

    expect(options('direction', undefined, [])).toEqual([
      { value: 'desc', label: 'Descendente' },
      { value: 'asc', label: 'Ascendente' },
    ]);
  });

  it('explains a dangling rule inside the option that carries it', () => {
    expect(
      orphanedSortProperties(
        [{ property: 'nickname', direction: 'asc' }],
        [{ value: 'age', label: 'Age' }],
        esIntl,
      ),
    ).toEqual([
      {
        value: 'nickname',
        label: 'nickname — este atributo ya no está en el libro de códigos',
        disabled: true,
      },
    ]);
  });

  it('refuses the row holding one in the reader’s language', () => {
    // Encoded where the rule is built and decoded where the form reports it,
    // so this reads it exactly as `FormErrors` would.
    expect(readMessage(MISSING_SORT_PROPERTY_MESSAGE, esIntl)).toBe(
      'Esta regla apunta a un atributo que ya no está en el libro de códigos. Elige otro o elimina la regla.',
    );
  });
});
