import { describe, expect, it } from 'vitest';

import { enIntl as intl, readMessage } from '../../testing/i18n.ts';
import {
  exportColumnRefusals,
  type ScopedVariable,
  type VariableNameScope,
  variableNameRefusal,
  variableNameScope,
} from '../variableNameRules.ts';

/**
 * The one rule both controls that take an attribute name ask: the create row
 * of the attribute window, and the editor the held pill opens on the name it
 * already has. Two controls that judged a name differently would offer a name
 * the other refuses.
 */
const scopeOf = (
  variables: readonly ScopedVariable[],
  entity: VariableNameScope['entity'] = 'node',
): VariableNameScope => ({ entity, variables });

const SCOPE = scopeOf([
  { id: 'v-age', name: 'age', type: 'number' },
  { id: 'v-freq', name: 'contactFreq', type: 'text' },
]);

const TAKEN = 'this type already has an attribute called that';
const CONTROL =
  'a name cannot contain line breaks, tabs or other control characters';

describe('the rule for an attribute name', () => {
  it('takes a name nothing else holds', () => {
    expect(variableNameRefusal('height', { intl, scope: SCOPE })).toBe(
      undefined,
    );
  });

  /**
   * Case-folded, the way `assertVariableNameAvailable` compares at the write:
   * a control that offered `AGE` while the codebook held `age` would spend a
   * round trip to answer with a duplicate-name refusal about a name the
   * researcher believed was free.
   */
  it('refuses a name another attribute holds in another case', () => {
    expect(variableNameRefusal('AGE', { intl, scope: SCOPE })).toBe(TAKEN);
    expect(variableNameRefusal('CONTACTFREQ', { intl, scope: SCOPE })).toBe(
      TAKEN,
    );
  });

  it('reads a name by the text it will be stored as', () => {
    // Stored trimmed and in canonical form, so a padded copy of a held name
    // and a decomposed copy of a precomposed one are that name.
    expect(variableNameRefusal('  age  ', { intl, scope: SCOPE })).toBe(TAKEN);
    const scope = scopeOf([{ id: 'v-cafe', name: 'café', type: 'text' }]);
    expect(variableNameRefusal('café'.normalize('NFD'), { intl, scope })).toBe(
      TAKEN,
    );
  });

  /** An attribute is not the thing standing in its own way. */
  it('excludes the attribute being renamed, by its record id', () => {
    expect(
      variableNameRefusal('age', { intl, scope: SCOPE, excluding: 'v-age' }),
    ).toBe(undefined);
    // Including a change of case of its own name, which is a rename a
    // researcher may well want and no duplicate at all.
    expect(
      variableNameRefusal('Age', { intl, scope: SCOPE, excluding: 'v-age' }),
    ).toBe(undefined);
    // And excluding one attribute does not excuse another.
    expect(
      variableNameRefusal('contactFreq', {
        intl,
        scope: SCOPE,
        excluding: 'v-age',
      }),
    ).toBe(TAKEN);
  });

  it.each([
    '友人',
    'amigo cercano',
    'Collègue',
    'full name',
    'name!',
    'a/b',
    'a-b_c.d:e9',
    'ما اسمك',
  ])('accepts %j, whatever script or punctuation it is written in', (typed) => {
    expect(variableNameRefusal(typed, { intl, scope: SCOPE })).toBe(undefined);
    expect(variableNameRefusal(typed, { intl })).toBe(undefined);
  });

  it.each([
    ['a line break', 'line\nbreak'],
    ['a tab', 'tab\tseparated'],
    ['a nul', `nul${String.fromCharCode(0)}`],
    ['a bell', `bell${String.fromCharCode(7)}`],
  ])('refuses a name holding %s', (_, typed) => {
    expect(variableNameRefusal(typed, { intl, scope: SCOPE })).toBe(CONTROL);
  });

  it('refuses a name with nothing in it', () => {
    expect(variableNameRefusal('   ', { intl, scope: SCOPE })).toBe(CONTROL);
  });

  /**
   * Asked of the whole type rather than of whatever list a control offers, so
   * a caller with nothing to compare against still has the name rule.
   */
  it('still judges the characters when it is given no scope at all', () => {
    expect(variableNameRefusal('full\tname', { intl })).toBe(CONTROL);
    expect(variableNameRefusal('full name', { intl })).toBe(undefined);
  });

  describe('when it would write a column the export already writes', () => {
    it('refuses a name that is where an option of another attribute is written', () => {
      const scope = scopeOf([
        {
          id: 'v-foo',
          name: 'foo',
          type: 'categorical',
          options: [{ value: 'bar' }],
        },
      ]);
      expect(variableNameRefusal('foo_bar', { intl, scope })).toBe(
        'The export already has a column called “foo_bar” for option “bar” of the attribute “foo”. Choose a different name.',
      );
      // The comparison is the duplicate-name one: case and composition fold.
      expect(variableNameRefusal('FOO_BAR', { intl, scope })).toMatch(
        /already has a column/,
      );
      expect(variableNameRefusal('foo_baz', { intl, scope })).toBe(undefined);
    });

    it('refuses a name that is where a layout attribute writes a position', () => {
      const scope = scopeOf([{ id: 'v-pos', name: 'pos', type: 'layout' }]);
      for (const typed of ['pos_x', 'pos_Y', 'pos_screenSpaceX']) {
        expect(variableNameRefusal(typed, { intl, scope })).toMatch(
          /for the position of the layout attribute “pos”/,
        );
      }
    });

    it('refuses a name that is a built-in column, in any case', () => {
      expect(variableNameRefusal('nodeID', { intl, scope: SCOPE })).toBe(
        'The export already has a built-in column called “nodeID”, so an attribute cannot be named “nodeID”. Choose a different name.',
      );
      expect(variableNameRefusal('NETWORKCANVASUUID', { intl })).toBe(
        undefined,
      );
      expect(
        variableNameRefusal('NETWORKCANVASUUID', { intl, scope: SCOPE }),
      ).toMatch(/built-in column called “networkCanvasUUID”/);
    });

    it('judges a built-in column against the kind of thing it belongs to', () => {
      // `nodeID` is a node column; an edge has no column by that name.
      const edgeScope = scopeOf([], 'edge');
      expect(variableNameRefusal('nodeID', { intl, scope: edgeScope })).toBe(
        undefined,
      );
      expect(variableNameRefusal('edgeID', { intl, scope: edgeScope })).toMatch(
        /built-in column/,
      );
    });

    it('refuses a name the export writes the way another attribute’s is written', () => {
      const scope = scopeOf([
        { id: 'v-close', name: 'close_friend', type: 'text' },
      ]);
      expect(variableNameRefusal('close friend', { intl, scope })).toBe(
        'In the export, the name “close friend” and the column “close_friend” of the attribute “close_friend” would become the same column, “close_friend”. Choose a different name.',
      );
      expect(variableNameRefusal('close-friend', { intl, scope })).toBe(
        undefined,
      );
    });

    it('judges a new name as one column, unless it says what it will be', () => {
      const scope = scopeOf([{ id: 'v-x', name: 'pos_x', type: 'text' }]);
      expect(variableNameRefusal('pos', { intl, scope })).toBe(undefined);
      expect(
        variableNameRefusal('pos', { intl, scope, type: 'layout' }),
      ).toMatch(
        /A layout attribute named “pos” would be exported to a column called “pos_x”/,
      );
    });

    it('judges a rename as the attribute it renames, options and all', () => {
      const scope = scopeOf([
        {
          id: 'v-foo',
          name: 'foo',
          type: 'categorical',
          options: [{ value: 'bar' }],
        },
        { id: 'v-other', name: 'other_bar', type: 'text' },
      ]);
      // Renaming the categorical attribute moves every option column with it.
      expect(
        variableNameRefusal('other', { intl, scope, excluding: 'v-foo' }),
      ).toMatch(
        /Option “bar” of “other” would be exported to a column called “other_bar”/,
      );
      expect(
        variableNameRefusal('another', { intl, scope, excluding: 'v-foo' }),
      ).toBe(undefined);
    });
  });
});

describe('the attributes of one type as the rule reads them', () => {
  it('carries each attribute with its record id and the parts its columns depend on', () => {
    expect(
      variableNameScope('edge', {
        'v-a': {
          name: 'closeness',
          label: 'Closeness',
          type: 'ordinal',
          options: [{ label: { en: 'Close' }, value: 1 }],
        },
        'v-b': { name: 'note', label: 'Note', type: 'text' },
      }),
    ).toEqual({
      entity: 'edge',
      variables: [
        {
          id: 'v-a',
          name: 'closeness',
          type: 'ordinal',
          options: [{ label: { en: 'Close' }, value: 1 }],
        },
        { id: 'v-b', name: 'note', type: 'text' },
      ],
    });
  });
});

/**
 * Every direction two export columns can meet in, asked of the rule directly:
 * what the attribute being saved writes against what another attribute — or the
 * export itself — already writes.
 *
 * Two layout attributes cannot meet as the same text, and nor can a layout
 * attribute and a built-in column: no position suffix ends the way another one
 * does, and no built-in column ends in one. Those sentences exist so the lookup
 * is total.
 */
describe('the export columns an attribute would write', () => {
  const refusals = (
    candidate: Parameters<typeof exportColumnRefusals>[0]['candidate'],
    siblings: Parameters<typeof exportColumnRefusals>[0]['siblings'],
    entity: 'ego' | 'node' | 'edge' = 'node',
  ) =>
    exportColumnRefusals({ entity, candidate, siblings }).map(
      ({ origin, message }) => ({
        origin: origin.kind,
        text: readMessage(message),
      }),
    );

  it('says nothing about an attribute whose columns are its own', () => {
    expect(
      refusals(
        { name: 'foo', type: 'categorical', options: [{ value: 'bar' }] },
        [{ name: 'baz', type: 'text' }],
      ),
    ).toEqual([]);
  });

  it('refuses a name where an option of another attribute is written', () => {
    expect(
      refusals({ name: 'foo_bar', type: 'text' }, [
        { name: 'foo', type: 'categorical', options: [{ value: 'bar' }] },
      ]),
    ).toEqual([
      {
        origin: 'name',
        text: 'The export already has a column called “foo_bar” for option “bar” of the attribute “foo”. Choose a different name.',
      },
    ]);
  });

  it('refuses a name where another layout attribute writes a position', () => {
    expect(
      refusals({ name: 'pos_x', type: 'text' }, [
        { name: 'pos', type: 'layout' },
      ]),
    ).toEqual([
      {
        origin: 'name',
        text: 'The export already has a column called “pos_x” for the position of the layout attribute “pos”. Choose a different name.',
      },
    ]);
  });

  it('refuses an option written where another attribute already is', () => {
    expect(
      refusals(
        { name: 'foo', type: 'categorical', options: [{ value: 'bar' }] },
        [{ name: 'foo_bar', type: 'text' }],
      ),
    ).toEqual([
      {
        origin: 'option',
        text: 'Option “bar” of “foo” would be exported to a column called “foo_bar”, but the attribute “foo_bar” already has a column called “foo_bar”. Change the option value or the attribute name.',
      },
    ]);
  });

  it('refuses an option written where an option of another attribute is', () => {
    expect(
      refusals(
        { name: 'a_b', type: 'categorical', options: [{ value: 'c' }] },
        [{ name: 'a', type: 'categorical', options: [{ value: 'b_c' }] }],
      ),
    ).toEqual([
      {
        origin: 'option',
        text: 'Option “c” of “a_b” would be exported to a column called “a_b_c”, but the export already has a column called “a_b_c” for option “b_c” of the attribute “a”. Change the option value or the attribute name.',
      },
    ]);
  });

  it('refuses an option written where a layout attribute writes a position', () => {
    expect(
      refusals(
        { name: 'a', type: 'categorical', options: [{ value: 'b_x' }] },
        [{ name: 'a_b', type: 'layout' }],
      ),
    ).toEqual([
      {
        origin: 'option',
        text: 'Option “b_x” of “a” would be exported to a column called “a_b_x”, but the export already has a column called “a_b_x” for the position of the layout attribute “a_b”. Change the option value or the attribute name.',
      },
    ]);
  });

  it('refuses a layout position written where another attribute already is', () => {
    expect(
      refusals({ name: 'pos', type: 'layout' }, [
        { name: 'pos_x', type: 'text' },
      ]),
    ).toEqual([
      {
        origin: 'layout',
        text: 'A layout attribute named “pos” would be exported to a column called “pos_x”, but the attribute “pos_x” already has a column called “pos_x”. Choose a different name.',
      },
    ]);
  });

  it('refuses a layout position written where an option already is', () => {
    expect(
      refusals({ name: 'a_b', type: 'layout' }, [
        { name: 'a', type: 'categorical', options: [{ value: 'b_x' }] },
      ]),
    ).toEqual([
      {
        origin: 'layout',
        text: 'A layout attribute named “a_b” would be exported to a column called “a_b_x”, but the export already has a column called “a_b_x” for option “b_x” of the attribute “a”. Choose a different name.',
      },
    ]);
  });

  it('refuses a name the export writes itself', () => {
    expect(refusals({ name: 'networkCanvasUUID', type: 'text' }, [])).toEqual([
      {
        origin: 'name',
        text: 'The export already has a built-in column called “networkCanvasUUID”, so an attribute cannot be named “networkCanvasUUID”. Choose a different name.',
      },
    ]);
  });

  it('refuses an option written where the export writes itself', () => {
    // Only the participant's own columns include one with an underscore.
    const categorical = {
      name: 'COMMIT',
      type: 'categorical',
      options: [{ value: 'HASH' }],
    };
    expect(refusals(categorical, [], 'ego')).toEqual([
      {
        origin: 'option',
        text: 'Option “HASH” of “COMMIT” would be exported to a column called “COMMIT_HASH”, but the export already has a built-in column called “COMMIT_HASH”. Change the option value or the attribute name.',
      },
    ]);
    expect(refusals(categorical, [], 'node')).toEqual([]);
  });

  it('does not expand an ordinal attribute into a column per option', () => {
    expect(
      refusals({ name: 'foo', type: 'ordinal', options: [{ value: 'bar' }] }, [
        { name: 'foo_bar', type: 'text' },
      ]),
    ).toEqual([]);
  });

  it('refuses two options of the attribute GraphML writes as one column', () => {
    expect(
      refusals(
        {
          name: 'q',
          type: 'categorical',
          options: [{ value: 'a b' }, { value: 'a?b' }],
        },
        [],
      ),
    ).toEqual([
      {
        origin: 'option',
        text: 'In the export, the column “q_a b” for option “a b” of “q” and the column “q_a?b” of the attribute “q” would become the same column, “q_a_b”. Change the option value or the attribute name.',
      },
      {
        origin: 'option',
        text: 'In the export, the column “q_a?b” for option “a?b” of “q” and the column “q_a b” of the attribute “q” would become the same column, “q_a_b”. Change the option value or the attribute name.',
      },
    ]);
  });

  it('refuses a name GraphML writes as another attribute’s column', () => {
    expect(
      refusals({ name: 'close friend', type: 'text' }, [
        { name: 'close_friend', type: 'text' },
      ]),
    ).toEqual([
      {
        origin: 'name',
        text: 'In the export, the name “close friend” and the column “close_friend” of the attribute “close_friend” would become the same column, “close_friend”. Choose a different name.',
      },
    ]);
  });

  it('refuses a name CSV writes as another attribute’s column', () => {
    expect(
      refusals({ name: '=total', type: 'text' }, [
        { name: "'=total", type: 'text' },
      ]),
    ).toEqual([
      {
        origin: 'name',
        text: "In the export, the name “=total” and the column “'=total” of the attribute “'=total” would become the same column, “'=total”. Choose a different name.",
      },
    ]);
  });

  it('refuses an option GraphML writes as another attribute’s column', () => {
    expect(
      refusals(
        { name: 'close', type: 'categorical', options: [{ value: 'friend' }] },
        [{ name: 'close friend', type: 'text' }],
      ),
    ).toEqual([
      {
        origin: 'option',
        text: 'In the export, the column “close_friend” for option “friend” of “close” and the column “close friend” of the attribute “close friend” would become the same column, “close_friend”. Change the option value or the attribute name.',
      },
    ]);
  });

  it('refuses a layout position GraphML writes as another layout attribute’s', () => {
    const [first, ...rest] = refusals({ name: 'a b', type: 'layout' }, [
      { name: 'a_b', type: 'layout' },
    ]);
    expect(first).toEqual({
      origin: 'layout',
      text: 'In the export, the position column “a b_X” of the layout attribute “a b” and the column “a_b_X” of the attribute “a_b” would become the same column, “a_b_X”. Choose a different name.',
    });
    expect(rest.map(({ origin }) => origin)).toEqual([
      'layout',
      'layout',
      'layout',
    ]);
  });

  it('leaves two attributes of the same name to the duplicate-name check', () => {
    expect(
      refusals({ name: 'Foo', type: 'text' }, [{ name: 'foo', type: 'text' }]),
    ).toEqual([]);
  });
});
