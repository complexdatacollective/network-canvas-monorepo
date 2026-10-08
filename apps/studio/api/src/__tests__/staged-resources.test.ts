// A roster is refused at staging when it holds a character no export can
// carry, with a code and a place the editor words itself, or when the
// interview could not load it, so a caller other than the editor cannot stage
// one either. Staging consults `rosterRefusal` before it stores any bytes;
// the RPC suites cover the staging itself.
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  resourceResult,
  StagedResourceSchema,
} from '@codaco/protocol-builder-core/contract/schemas';

import { rosterRefusal } from '../protocol-builder/resources.ts';

const BELL = String.fromCharCode(7);

function roster(source: string, text: string) {
  return {
    kind: 'content' as const,
    contentKind: 'network' as const,
    name: source,
    source,
    contentType: source.endsWith('.csv') ? 'text/csv' : 'application/json',
    bytes: new TextEncoder().encode(text),
  };
}

describe('staging a roster', () => {
  it.each([
    [
      'a CSV cell',
      roster('people.csv', `name,age\nAda,36\nGr${BELL}ace,45\n`),
      { kind: 'cell', row: 3, column: 'name', character: 'U+0007' },
      1,
    ],
    [
      'a CSV column name, in a file whose extension is upper case',
      roster('people.CSV', `name,a${BELL}ge\nAda,3${BELL}6\n`),
      { kind: 'columnName', column: 2, character: 'U+0007' },
      2,
    ],
    [
      'a JSON attribute name',
      roster(
        'people.json',
        JSON.stringify({
          nodes: [
            { attributes: { name: 'Ada' } },
            { attributes: { [`a${BELL}ge`]: 36 } },
          ],
        }),
      ),
      { kind: 'attributeName', node: 2, character: 'U+0007' },
      1,
    ],
  ])(
    'refuses a roster with an unsupported character in %s',
    async (_, request, problem, total) => {
      const outcome = await rosterRefusal(request);

      expect(outcome).toEqual({
        status: 'failed',
        failure: {
          reason: 'invalid-content',
          message: expect.any(String),
          retryable: false,
          detail: { code: 'roster-characters', problem, total },
        },
      });
    },
  );

  it('answers the refusal in a shape the contract carries to the editor', async () => {
    const outcome = await rosterRefusal(
      roster('people.csv', `name\nGr${BELL}ace\n`),
    );

    expect(
      Schema.decodeUnknownSync(resourceResult(StagedResourceSchema))(outcome),
    ).toEqual(outcome);
  });

  it('refuses nothing in a roster with nothing to refuse', async () => {
    expect(
      await rosterRefusal(roster('people.csv', 'name,age\nAda,36\n')),
    ).toBeUndefined();
  });

  it('does not read a file that is not a roster as one', async () => {
    const outcome = await rosterRefusal({
      kind: 'content',
      contentKind: 'image',
      name: 'photo.png',
      source: 'photo.png',
      contentType: 'image/png',
      bytes: new Uint8Array([7, 7, 7]),
    });

    expect(outcome).toBeUndefined();
  });
});

describe('staging a roster the interview could not load', () => {
  it.each([
    [
      'two headings that are one name written two ways',
      roster('people.csv', 'caf\u00e9,cafe\u0301\nAda,36\n'),
      'the roster\'s attribute names "caf\u00e9" and "cafe\u0301" are the same name written two ways',
    ],
    [
      'a heading with a space at its end',
      roster('people.csv', '"name ",age\nAda,36\n'),
      'the roster\'s attribute name "name " cannot be a variable name',
    ],
    [
      'a row with more cells than its header',
      roster('people.csv', 'name,age\nAda,36\nGrace,45,extra\n'),
      'row 3 of the roster has a different number of cells from its header',
    ],
    [
      'a CSV header with no rows under it',
      roster('people.csv', 'name,age\n'),
      'the roster holds no nodes',
    ],
    [
      'JSON that does not parse',
      roster('people.json', '{"nodes": ['),
      'the roster cannot be read as JSON',
    ],
    [
      'a JSON node that is not an object',
      roster('people.json', JSON.stringify({ nodes: ['Ada'] })),
      'node 1 of the roster is not an object',
    ],
    [
      'a JSON attribute value no variable can hold',
      roster(
        'people.json',
        JSON.stringify({
          nodes: [{ attributes: { name: { first: 'Ada' } } }],
        }),
      ),
      'the "name" attribute of node 1 of the roster is not a value a variable can hold',
    ],
    [
      'two JSON attribute names that are one name written two ways',
      roster(
        'people.json',
        JSON.stringify({
          nodes: [
            { attributes: { 'caf\u00e9': 'yes' } },
            { attributes: { 'cafe\u0301': 'no' } },
          ],
        }),
      ),
      'the roster\'s attribute names "caf\u00e9" and "cafe\u0301" are the same name written two ways',
    ],
  ])('refuses a roster with %s', async (_, request, message) => {
    const outcome = await rosterRefusal(request);

    expect(outcome).toEqual({
      status: 'failed',
      failure: { reason: 'invalid-content', message, retryable: false },
    });
  });

  it('reads a file whose name says nothing by its media type', async () => {
    const outcome = await rosterRefusal({
      ...roster('people', 'caf\u00e9,cafe\u0301\nAda,36\n'),
      contentType: 'text/csv; charset=utf-8',
    });

    // The headings' refusal, which only a read of the file as CSV can give.
    expect(outcome).toMatchObject({
      status: 'failed',
      failure: { message: expect.stringContaining('attribute names') },
    });
  });

  it('accepts a roster whose headings are in any language, decomposed or not', async () => {
    expect(
      await rosterRefusal(
        roster('people.csv', 'cafe\u0301,\u540d\u524d\nAda,36\n'),
      ),
    ).toBeUndefined();
  });
});
