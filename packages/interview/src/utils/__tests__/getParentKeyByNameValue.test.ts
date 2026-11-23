import { describe, expect, it } from 'vitest';

import type { EntityDefinition } from '@codaco/protocol-validation';

import { testVariableId } from '../../__tests__/testIds';
import getParentKeyByNameValue from '../getParentKeyByNameValue';

const CAFE = testVariableId('cafe');
const CJK = testVariableId('cjk');
const CONSTRUCTOR = testVariableId('constructor');
const CONTACTS = testVariableId('contacts');
const DOTTED = testVariableId('dotted');
const NAME = testVariableId('name');
const PLACE = testVariableId('place');
const POSITION = testVariableId('position');
const PROTO = testVariableId('proto');
const RATING = testVariableId('rating');

const variables: NonNullable<EntityDefinition['variables']> = {
  [NAME]: { name: 'Full name', type: 'text' },
  [DOTTED]: { name: 'a.b', type: 'text' },
  [POSITION]: {
    name: 'Position',
    type: 'layout',
  },
  [CJK]: { name: '年龄', type: 'number' },
  [CAFE]: { name: 'Café', type: 'text' },
  [CONTACTS]: {
    name: 'Contacts_kind',
    type: 'categorical',
    options: [
      { label: { en: 'Close friend' }, value: 'close friend' },
      { label: { en: 'Colleague' }, value: '同事' },
      { label: { en: 'Snake' }, value: 'under_score' },
      { label: { en: 'One' }, value: 1 },
      { label: { en: 'Cafe' }, value: 'Café' },
    ],
  },
  [RATING]: {
    name: 'Rating',
    type: 'ordinal',
    options: [
      { label: { en: 'Low' }, value: 1 },
      { label: { en: 'High' }, value: 2 },
    ],
  },
};

describe('getParentKeyByNameValue', () => {
  it('returns a key that is already a variable id', () => {
    expect(getParentKeyByNameValue(variables, NAME)).toBe(NAME);
  });

  it('returns the text unchanged when there is no entity definition', () => {
    expect(getParentKeyByNameValue(undefined, 'Full name')).toBe('Full name');
    expect(getParentKeyByNameValue({}, 'Full name')).toBe('Full name');
  });

  it('returns the text unchanged when no variable matches', () => {
    expect(getParentKeyByNameValue(variables, 'Nickname')).toBe('Nickname');
  });

  it.each([
    ['a name with a space', 'Full name', NAME],
    ['a name in another script', '年龄', CJK],
    ['a name with a dot', 'a.b', DOTTED],
  ])('matches %s', (_description, name, id) => {
    expect(getParentKeyByNameValue(variables, name)).toBe(id);
  });

  it('does not read a dotted name as a path through the variables', () => {
    expect(getParentKeyByNameValue(variables, `${NAME}.name`)).toBe(
      `${NAME}.name`,
    );
    expect(getParentKeyByNameValue(variables, 'a')).toBe('a');
  });

  it('matches a name spelled in NFD against the NFC name', () => {
    const decomposed = 'Café';

    expect(decomposed).not.toBe('Café');
    expect(getParentKeyByNameValue(variables, decomposed)).toBe(CAFE);
  });

  it('matches an NFC header against a name stored in NFD', () => {
    const decomposedVariables: NonNullable<EntityDefinition['variables']> = {
      [CAFE]: { name: 'Café', type: 'text' },
    };

    expect(getParentKeyByNameValue(decomposedVariables, 'Café')).toBe(CAFE);
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
        [PROTO]: {
          name: '__proto__',
          type: 'text',
        },
        [CONSTRUCTOR]: {
          name: 'constructor',
          type: 'text',
        },
      };

      expect(getParentKeyByNameValue(named, '__proto__')).toBe(PROTO);
      expect(getParentKeyByNameValue(named, 'constructor')).toBe(CONSTRUCTOR);
    });
  });

  describe('layout columns', () => {
    it('resolves the _x and _y columns to the variable id', () => {
      expect(getParentKeyByNameValue(variables, 'Position_x')).toBe(
        `${POSITION}_x`,
      );
      expect(getParentKeyByNameValue(variables, 'Position_y')).toBe(
        `${POSITION}_y`,
      );
    });

    it('resolves a decomposed name', () => {
      const named: NonNullable<EntityDefinition['variables']> = {
        [PLACE]: {
          name: 'Café position',
          type: 'layout',
        },
      };

      expect(getParentKeyByNameValue(named, 'Café position_x')).toBe(
        `${PLACE}_x`,
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
        `${CONTACTS}_${option}`,
      );
    });

    it('spells the option as the codebook does when the column is decomposed', () => {
      expect(getParentKeyByNameValue(variables, 'Contacts_kind_Café')).toBe(
        `${CONTACTS}_Café`,
      );
    });

    it('resolves a decomposed variable name', () => {
      const named: NonNullable<EntityDefinition['variables']> = {
        [CAFE]: {
          name: 'Café',
          type: 'categorical',
          options: [{ label: { en: 'Open' }, value: 'open' }],
        },
      };

      expect(getParentKeyByNameValue(named, 'Café_open')).toBe(`${CAFE}_open`);
    });

    it('resolves a column spelling an option as it was before the schema 9 migration renamed it', () => {
      expect(
        getParentKeyByNameValue(variables, 'Contacts_kind_close friend '),
      ).toBe(`${CONTACTS}_close friend`);
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
