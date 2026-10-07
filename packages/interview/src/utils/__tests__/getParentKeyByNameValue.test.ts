import { describe, expect, it } from 'vitest';

import type { EntityDefinition } from '@codaco/protocol-validation';

import getParentKeyByNameValue from '../getParentKeyByNameValue';

const variables: NonNullable<EntityDefinition['variables']> = {
  'id-name': { name: 'Full name', label: 'Full name', type: 'text' },
  'id-dotted': { name: 'a.b', label: 'a.b', type: 'text' },
  'id-position': {
    name: 'Position',
    label: 'Position',
    type: 'layout',
  },
  'id-cjk': { name: '年龄', label: '年龄', type: 'number' },
  'id-cafe': { name: 'Café', label: 'Café', type: 'text' },
  'id-contacts': {
    name: 'Contacts_kind',
    label: 'Contacts kind',
    type: 'categorical',
    options: [
      { label: { en: 'Close friend' }, value: 'close friend' },
      { label: { en: 'Colleague' }, value: '同事' },
      { label: { en: 'Snake' }, value: 'under_score' },
      { label: { en: 'One' }, value: 1 },
      { label: { en: 'Cafe' }, value: 'Café' },
    ],
  },
  'id-rating': {
    name: 'Rating',
    label: 'Rating',
    type: 'ordinal',
    options: [
      { label: { en: 'Low' }, value: 1 },
      { label: { en: 'High' }, value: 2 },
    ],
  },
};

describe('getParentKeyByNameValue', () => {
  it('returns a key that is already a variable id', () => {
    expect(getParentKeyByNameValue(variables, 'id-name')).toBe('id-name');
  });

  it('returns the text unchanged when there is no entity definition', () => {
    expect(getParentKeyByNameValue(undefined, 'Full name')).toBe('Full name');
    expect(getParentKeyByNameValue({}, 'Full name')).toBe('Full name');
  });

  it('returns the text unchanged when no variable matches', () => {
    expect(getParentKeyByNameValue(variables, 'Nickname')).toBe('Nickname');
  });

  it.each([
    ['a name with a space', 'Full name', 'id-name'],
    ['a name in another script', '年龄', 'id-cjk'],
    ['a name with a dot', 'a.b', 'id-dotted'],
  ])('matches %s', (_description, name, id) => {
    expect(getParentKeyByNameValue(variables, name)).toBe(id);
  });

  it('does not read a dotted name as a path through the variables', () => {
    expect(getParentKeyByNameValue(variables, 'id-name.name')).toBe(
      'id-name.name',
    );
    expect(getParentKeyByNameValue(variables, 'a')).toBe('a');
  });

  it('matches a name spelled in NFD against the NFC name', () => {
    const decomposed = 'Café';

    expect(decomposed).not.toBe('Café');
    expect(getParentKeyByNameValue(variables, decomposed)).toBe('id-cafe');
  });

  it('matches an NFC header against a name stored in NFD', () => {
    const decomposedVariables: NonNullable<EntityDefinition['variables']> = {
      'id-cafe': { name: 'Café', label: 'Café', type: 'text' },
    };

    expect(getParentKeyByNameValue(decomposedVariables, 'Café')).toBe(
      'id-cafe',
    );
  });

  describe('names that are also properties of every object', () => {
    it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
      'does not resolve %s to an inherited property',
      (name) => {
        expect(getParentKeyByNameValue(variables, name)).toBe(name);
      },
    );

    it('matches a variable that is named after one', () => {
      const named: NonNullable<EntityDefinition['variables']> = {
        'id-proto': {
          name: '__proto__',
          label: '__proto__',
          type: 'text',
        },
        'id-constructor': {
          name: 'constructor',
          label: 'Constructor',
          type: 'text',
        },
      };

      expect(getParentKeyByNameValue(named, '__proto__')).toBe('id-proto');
      expect(getParentKeyByNameValue(named, 'constructor')).toBe(
        'id-constructor',
      );
    });

    it('matches a variable id that is named after one', () => {
      const named: NonNullable<EntityDefinition['variables']> =
        Object.fromEntries([
          [
            '__proto__',
            {
              name: 'Anything',
              label: 'Anything',
              type: 'text' as const,
            },
          ],
        ]);

      expect(getParentKeyByNameValue(named, '__proto__')).toBe('__proto__');
    });
  });

  describe('layout columns', () => {
    it('resolves the _x and _y columns to the variable id', () => {
      expect(getParentKeyByNameValue(variables, 'Position_x')).toBe(
        'id-position_x',
      );
      expect(getParentKeyByNameValue(variables, 'Position_y')).toBe(
        'id-position_y',
      );
    });

    it('resolves a decomposed name', () => {
      const named: NonNullable<EntityDefinition['variables']> = {
        'id-place': {
          name: 'Café position',
          label: 'Café position',
          type: 'layout',
        },
      };

      expect(getParentKeyByNameValue(named, 'Café position_x')).toBe(
        'id-place_x',
      );
    });
  });

  describe('categorical option columns', () => {
    it.each([
      ['an option with a space', 'Contacts_kind_close friend', 'close friend'],
      ['an option in another script', 'Contacts_kind_同事', '同事'],
      [
        'an option with an underscore',
        'Contacts_kind_under_score',
        'under_score',
      ],
      ['a number option', 'Contacts_kind_1', '1'],
    ])('resolves %s', (_description, column, option) => {
      expect(getParentKeyByNameValue(variables, column)).toBe(
        `id-contacts_${option}`,
      );
    });

    it('spells the option as the codebook does when the column is decomposed', () => {
      expect(getParentKeyByNameValue(variables, 'Contacts_kind_Café')).toBe(
        'id-contacts_Café',
      );
    });

    it('resolves a decomposed variable name', () => {
      const named: NonNullable<EntityDefinition['variables']> = {
        'id-cafe': {
          name: 'Café',
          label: 'Café',
          type: 'categorical',
          options: [{ label: { en: 'Open' }, value: 'open' }],
        },
      };

      expect(getParentKeyByNameValue(named, 'Café_open')).toBe('id-cafe_open');
    });

    it('leaves a column whose option is not in the codebook alone', () => {
      expect(getParentKeyByNameValue(variables, 'Contacts_kind_stranger')).toBe(
        'Contacts_kind_stranger',
      );
    });

    it('does not treat a variable that is not categorical as having options', () => {
      expect(getParentKeyByNameValue(variables, 'Rating_1')).toBe('Rating_1');
    });
  });
});
