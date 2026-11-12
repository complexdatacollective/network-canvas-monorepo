// A roster is refused at staging when it holds a character no export can
// carry, with a code and a place the editor words itself, or when the
// interview could not load it, so a caller other than the editor cannot stage
// one either. Staging consults `rosterRefusal` before it stores any bytes;
// the RPC suites cover the staging itself.
import { Redacted, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  resourceResult,
  StagedResourceSchema,
} from '@codaco/protocol-builder-core/contract/schemas';

import { rosterRefusal } from '../protocol-builder/resources.ts';
import { asTheEditorShowsIt } from './support/messages.ts';

const BELL = String.fromCharCode(7);

function roster(source: string, text: string) {
  return {
    kind: 'content' as const,
    contentKind: 'network' as const,
    name: Redacted.make(source),
    source: Redacted.make(source),
    contentType: source.endsWith('.csv') ? 'text/csv' : 'application/json',
    bytes: Redacted.make(new TextEncoder().encode(text)),
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
      // The editor names the character from `detail`; the message is for a
      // client that cannot, and is in the reader's language too.
      if (outcome?.status !== 'failed') return;
      expect(asTheEditorShowsIt(outcome.failure.message)).toBe(
        'The roster holds a character that an export cannot carry.',
      );
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
      name: Redacted.make('photo.png'),
      source: Redacted.make('photo.png'),
      contentType: 'image/png',
      bytes: Redacted.make(new Uint8Array([7, 7, 7])),
    });

    expect(outcome).toBeUndefined();
  });
});

describe('staging a roster the interview could not load', () => {
  it.each([
    [
      'two headings that are one name written two ways',
      roster('people.csv', 'caf\u00e9,cafe\u0301\nAda,36\n'),
      'the "caf\u00e9" and "cafe\u0301" attributes are the same name written in two different ways, such as an accented letter typed as one character in one and as two in the other',
    ],
    [
      'a heading with a space at its end',
      roster('people.csv', '"name ",age\nAda,36\n'),
      'the "name " attribute cannot be used as a variable name: a name cannot be empty, start or end with a space, or contain line breaks, tabs or other control characters',
    ],
    [
      'a row with more cells than its header',
      roster('people.csv', 'name,age\nAda,36\nGrace,45,extra\n'),
      'the selected file is not a readable network',
    ],
    [
      'a CSV header with no rows under it',
      roster('people.csv', 'name,age\n'),
      'the selected file has no records in it, so a stage using it would have nobody to show',
    ],
    [
      'a JSON roster with edges but no nodes',
      roster('people.json', JSON.stringify({ nodes: [], edges: [{}] })),
      'the selected file has no records in it, so a stage using it would have nobody to show',
    ],
    [
      'JSON that does not parse',
      roster('people.json', '{"nodes": ['),
      'the selected file is not a readable network',
    ],
    [
      'a JSON node that is not an object',
      roster('people.json', JSON.stringify({ nodes: ['Ada'] })),
      'the selected file is not a readable network: node 1 is not an object',
    ],
    [
      'a JSON attribute value no variable can hold',
      roster(
        'people.json',
        JSON.stringify({
          nodes: [{ attributes: { name: { first: 'Ada' } } }],
        }),
      ),
      'the selected file is not a readable network: the "name" attribute of node 1 is not a value a variable can hold',
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
      'the "caf\u00e9" and "cafe\u0301" attributes are the same name written in two different ways, such as an accented letter typed as one character in one and as two in the other',
    ],
  ])('refuses a roster with %s', async (_, request, message) => {
    const outcome = await rosterRefusal(request);

    // In the protocol builder's words for the same refusal, encoded so the
    // editor says it in the reader's language.
    expect(outcome).toEqual({
      status: 'failed',
      failure: {
        reason: 'invalid-content',
        message: expect.any(String),
        retryable: false,
      },
    });
    if (outcome?.status !== 'failed') return;
    expect(asTheEditorShowsIt(outcome.failure.message)).toBe(message);
  });

  it('reads a file whose name says nothing by its media type', async () => {
    const outcome = await rosterRefusal({
      ...roster('people', 'caf\u00e9,cafe\u0301\nAda,36\n'),
      contentType: 'text/csv; charset=utf-8',
    });

    // The headings' refusal, which only a read of the file as CSV can give.
    if (outcome?.status !== 'failed') throw new Error('expected a refusal');
    expect(asTheEditorShowsIt(outcome.failure.message)).toContain(
      'are the same name written in two different ways',
    );
  });

  it('accepts a roster whose headings are in any language, decomposed or not', async () => {
    expect(
      await rosterRefusal(
        roster('people.csv', 'cafe\u0301,\u540d\u524d\nAda,36\n'),
      ),
    ).toBeUndefined();
  });
});
