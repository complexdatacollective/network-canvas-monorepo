// A roster is refused at staging when it holds a character no export can
// carry, with a code and a place the editor words itself, or when the
// interview could not load it, so a caller other than the editor cannot stage
// one either.
import { describe, expect, it } from 'vitest';

import {
  resourceResult,
  StagedResourceSchema,
} from '@codaco/protocol-builder-core/contract/schemas';

import { StagedResources } from '../protocol-builder/resources.ts';

const BELL = String.fromCharCode(7);

function staging() {
  let next = 0;
  return new StagedResources(() => `resource-${++next}`);
}

function roster(source: string, text: string) {
  return {
    kind: 'content' as const,
    contentKind: 'network' as const,
    name: source,
    source,
    contentType: source.endsWith('.csv') ? 'text/csv' : 'application/json',
    bytes: new Blob([text]),
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
    'refuses a roster with an unsupported character in %s, and stages nothing',
    async (_, request, problem, total) => {
      const resources = staging();

      const outcome = await resources.stage('request', request);

      expect(outcome).toEqual({
        status: 'failed',
        failure: {
          reason: 'invalid-content',
          message: expect.any(String),
          retryable: false,
          detail: { code: 'roster-characters', problem, total },
        },
      });
      expect(resources.descriptors()).toEqual([]);
    },
  );

  it('answers the refusal in a shape the contract carries to the editor', async () => {
    const outcome = await staging().stage(
      'request',
      roster('people.csv', `name\nGr${BELL}ace\n`),
    );

    expect(resourceResult(StagedResourceSchema).parse(outcome)).toEqual(
      outcome,
    );
  });

  it('stages a roster with nothing to refuse', async () => {
    const resources = staging();

    const outcome = await resources.stage(
      'request',
      roster('people.csv', 'name,age\nAda,36\n'),
    );

    expect(outcome).toMatchObject({
      status: 'ok',
      data: { descriptor: { id: 'resource-1', kind: 'network' } },
    });
  });

  it('does not read a file that is not a roster as one', async () => {
    const outcome = await staging().stage('request', {
      kind: 'content',
      contentKind: 'image',
      name: 'photo.png',
      source: 'photo.png',
      contentType: 'image/png',
      bytes: new Blob([new Uint8Array([7, 7, 7])]),
    });

    expect(outcome.status).toBe('ok');
  });

  it('stages a retried request once when both arrive while the file is read', async () => {
    const resources = staging();
    const request = roster('people.csv', 'name\nAda\n');

    const [first, second] = await Promise.all([
      resources.stage('request', request),
      resources.stage('request', request),
    ]);

    expect(second).toEqual(first);
    expect(resources.descriptors()).toHaveLength(1);
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
  ])(
    'refuses a roster with %s, and stages nothing',
    async (_, request, message) => {
      const resources = staging();

      const outcome = await resources.stage('request', request);

      expect(outcome).toEqual({
        status: 'failed',
        failure: { reason: 'invalid-content', message, retryable: false },
      });
      expect(resources.descriptors()).toEqual([]);
    },
  );

  it('reads a file whose name says nothing by its media type', async () => {
    const outcome = await staging().stage('request', {
      ...roster('people', 'caf\u00e9,cafe\u0301\nAda,36\n'),
      contentType: 'text/csv; charset=utf-8',
    });

    // The headings' refusal, which only a read of the file as CSV can give.
    expect(outcome).toMatchObject({
      status: 'failed',
      failure: { message: expect.stringContaining('attribute names') },
    });
  });

  it('stages a roster whose headings are in any language, decomposed or not', async () => {
    const resources = staging();

    const outcome = await resources.stage(
      'request',
      roster('people.csv', 'cafe\u0301,\u540d\u524d\nAda,36\n'),
    );

    expect(outcome).toMatchObject({
      status: 'ok',
      data: { descriptor: { id: 'resource-1', kind: 'network' } },
    });
  });
});
