import { describe, expect, it } from 'vitest';

import { assignFileNames, sanitizeFilePart } from '../fileNames';

type TypeRecord = readonly [name: string | undefined, id: string | undefined];

const bytes = (value: string) => new TextEncoder().encode(value).length;

const nameFiles = (
  types: readonly TypeRecord[],
  overrides: { prefix?: string } = {},
) =>
  assignFileNames(types, ([entityName, entityId]) => ({
    prefix: overrides.prefix ?? 'case_session',
    exportFormat: 'attributeList',
    extension: '.csv',
    entityName,
    entityId,
  })).map(({ name }) => name);

const expectDistinctIgnoringCase = (names: readonly string[]) => {
  expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(
    names.length,
  );
};

describe('sanitizeFilePart', () => {
  it('keeps any script, spaces and punctuation', () => {
    expect(sanitizeFilePart('Close Friend')).toBe('Close Friend');
    expect(sanitizeFilePart('close-friend')).toBe('close-friend');
    expect(sanitizeFilePart('close.friend')).toBe('close.friend');
    expect(sanitizeFilePart('友人')).toBe('友人');
    expect(sanitizeFilePart('Freund (enger) & Co.')).toBe(
      'Freund (enger) & Co',
    );
    expect(sanitizeFilePart('🧑‍🤝‍🧑 friends')).toBe('🧑‍🤝‍🧑 friends');
  });

  it('removes only what a file system refuses', () => {
    expect(sanitizeFilePart('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
    expect(sanitizeFilePart('a\u0000b\u001fc\u007fd')).toBe('abcd');
  });

  it('trims the trailing dots and spaces Windows strips', () => {
    expect(sanitizeFilePart('friend. . ')).toBe('friend');
    expect(sanitizeFilePart('...')).toBe('');
  });

  it('is empty when nothing usable remains', () => {
    expect(sanitizeFilePart('?')).toBe('');
    expect(sanitizeFilePart('<>|')).toBe('');
  });

  it('writes NFC, so one name typed two ways is one file name', () => {
    expect(sanitizeFilePart('café')).toBe('café');
    expect(sanitizeFilePart('café')).toBe('café');
  });

  it.each(['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9'])(
    'prefixes the Windows reserved name %s',
    (reserved) => {
      expect(sanitizeFilePart(reserved)).toBe(`_${reserved}`);
    },
  );

  it('prefixes a reserved name with an extension, and leaves lookalikes alone', () => {
    expect(sanitizeFilePart('con.txt')).toBe('_con.txt');
    expect(sanitizeFilePart('COM10')).toBe('COM10');
    expect(sanitizeFilePart('console')).toBe('console');
    expect(sanitizeFilePart('nullable')).toBe('nullable');
  });
});

describe('assignFileNames', () => {
  it('names a file after its entity type and leaves the name of a lone type unchanged', () => {
    expect(nameFiles([['Close Friend', 'closeFriend']])).toEqual([
      'case_session_attributeList_Close Friend.csv',
    ]);
  });

  it('omits the entity and the format token where the file holds no single type', () => {
    expect(
      assignFileNames([undefined], () => ({
        prefix: 'case_session',
        exportFormat: 'graphml',
        extension: '.graphml',
        entityName: undefined,
        entityId: undefined,
      })).map(({ name }) => name),
    ).toEqual(['case_session.graphml']);
  });

  it('keeps names that differ only in punctuation apart without help', () => {
    const names = nameFiles([
      ['close-friend', 'a'],
      ['close.friend', 'b'],
      ['closefriend', 'c'],
    ]);

    expect(names).toEqual([
      'case_session_attributeList_close-friend.csv',
      'case_session_attributeList_close.friend.csv',
      'case_session_attributeList_closefriend.csv',
    ]);
  });

  it('tells apart names that become the same once the unsafe characters go', () => {
    const names = nameFiles([
      ['close?friend', 'typeA'],
      ['close*friend', 'typeB'],
      ['closefriend', 'typeC'],
    ]);

    expect(names).toEqual([
      'case_session_attributeList_closefriend_typeA.csv',
      'case_session_attributeList_closefriend_typeB.csv',
      'case_session_attributeList_closefriend_typeC.csv',
    ]);
  });

  it('tells apart names that differ only in case, which are one file on macOS and Windows', () => {
    const names = nameFiles([
      ['Friend', 'friendUpper'],
      ['friend', 'friendLower'],
      ['Colleague', 'colleague'],
    ]);

    expect(names).toEqual([
      'case_session_attributeList_Friend_friendUpper.csv',
      'case_session_attributeList_friend_friendLower.csv',
      'case_session_attributeList_Colleague.csv',
    ]);
    expectDistinctIgnoringCase(names);
  });

  it('tells apart names that differ only in Unicode normalization', () => {
    const names = nameFiles([
      ['café', 'composed'],
      ['café', 'decomposed'],
    ]);

    expect(names).toEqual([
      'case_session_attributeList_café_composed.csv',
      'case_session_attributeList_café_decomposed.csv',
    ]);
  });

  it('names two CJK types after themselves', () => {
    expect(
      nameFiles([
        ['友人', 'friend'],
        ['家族', 'family'],
      ]),
    ).toEqual([
      'case_session_attributeList_友人.csv',
      'case_session_attributeList_家族.csv',
    ]);
  });

  it('tells apart two types that share a CJK name', () => {
    const names = nameFiles([
      ['友人', 'friend'],
      ['友人', 'colleague'],
    ]);

    expect(names).toEqual([
      'case_session_attributeList_友人_friend.csv',
      'case_session_attributeList_友人_colleague.csv',
    ]);
  });

  it('falls back to the type id when nothing of the name survives', () => {
    const names = nameFiles([
      ['?', 'first'],
      ['***', 'second'],
      ['Friend', 'friend'],
    ]);

    expect(names).toEqual([
      'case_session_attributeList_first.csv',
      'case_session_attributeList_second.csv',
      'case_session_attributeList_Friend.csv',
    ]);
  });

  it('falls back to a counter when an empty name has no id to use', () => {
    const names = nameFiles([
      ['?', undefined],
      ['***', undefined],
    ]);

    expect(names).toEqual([
      'case_session_attributeList.csv',
      'case_session_attributeList_2.csv',
    ]);
  });

  it('keeps a reserved name usable', () => {
    expect(nameFiles([['CON', 'con']])).toEqual([
      'case_session_attributeList__CON.csv',
    ]);
  });

  it('never gives a type a name another type already has', () => {
    const names = nameFiles([
      ['Friend', 'x'],
      ['friend', 'y'],
      ['Friend_x', 'z'],
    ]);

    expectDistinctIgnoringCase(names);
  });

  it('numbers the repeats of one request in input order', () => {
    expect(
      nameFiles([
        ['Friend', 'friend'],
        ['Friend', 'friend'],
      ]),
    ).toEqual([
      'case_session_attributeList_Friend_friend.csv',
      'case_session_attributeList_Friend_friend_2.csv',
    ]);
  });

  it('gives a type the same file name wherever it sits in the export', () => {
    const types: TypeRecord[] = [
      ['close?friend', 'typeA'],
      ['closefriend', 'typeC'],
      ['Friend', 'friendUpper'],
      ['friend', 'friendLower'],
      ['友人', 'friend'],
    ];
    const byId = (order: readonly TypeRecord[]) =>
      new Map(
        assignFileNames(order, ([entityName, entityId]) => ({
          prefix: 'case_session',
          exportFormat: 'attributeList',
          extension: '.csv',
          entityName,
          entityId,
        })).map(({ item, name }) => [item[1], name]),
      );

    const forward = byId(types);
    const reversed = byId([...types].reverse());

    expect(reversed).toEqual(forward);
  });

  describe('the 255 byte limit', () => {
    it('keeps a long name within the limit without cutting a character in two', () => {
      const [name] = nameFiles([['友'.repeat(200), 'long']]);

      expect(bytes(name ?? '')).toBeLessThanOrEqual(255);
      expect(name).toMatch(/^case_session_attributeList_友+_long\.csv$/);
      expect(name?.isWellFormed()).toBe(true);
    });

    it('does not split a surrogate pair', () => {
      const [name] = nameFiles([['😀'.repeat(100), 'long']]);

      expect(bytes(name ?? '')).toBeLessThanOrEqual(255);
      expect(name?.isWellFormed()).toBe(true);
    });

    it('tells apart long names that are the same up to the cut', () => {
      const names = nameFiles([
        ['友'.repeat(200) + 'A', 'typeA'],
        ['友'.repeat(200) + 'B', 'typeB'],
      ]);

      expect(names).toHaveLength(2);
      expectDistinctIgnoringCase(names);
      for (const name of names) {
        expect(bytes(name)).toBeLessThanOrEqual(255);
        expect(name.endsWith('.csv')).toBe(true);
      }
      expect(names[0]).toContain('typeA');
      expect(names[1]).toContain('typeB');
    });

    it('gives up the entity name before the prefix, and names the type by its id instead', () => {
      const [name] = nameFiles([['Friend', 'friend']], {
        prefix: 'p'.repeat(400),
      });

      expect(bytes(name ?? '')).toBeLessThanOrEqual(255);
      expect(name?.endsWith('_attributeList_friend.csv')).toBe(true);
    });
  });
});
