import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../migration/errors.ts';
import { migrateProtocol } from '../../migration/migrate-protocol.ts';
import { createBaseProtocol } from '../../utils/test-utils.ts';
import validateProtocol from '../validate-protocol.ts';

// `JSON.parse` gives a protocol file's `"__proto__"` key an own, enumerable
// property; `defineProperty` makes the same property without a JSON round trip.
const addPrototypeKey = (record: object, value: unknown) =>
  Object.defineProperty(record, '__proto__', {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });

const nodeType = {
  name: 'Proto',
  color: 'node-color-seq-3',
  shape: { default: 'circle' },
};
const textVariable = { name: 'Proto', type: 'text' };

const cases = [
  {
    where: 'a node type id',
    path: ['codebook', 'node', '__proto__'],
    add: (protocol: ReturnType<typeof createBaseProtocol>) =>
      addPrototypeKey(protocol.codebook.node, nodeType),
  },
  {
    where: 'an edge type id',
    path: ['codebook', 'edge', '__proto__'],
    add: (protocol: ReturnType<typeof createBaseProtocol>) =>
      addPrototypeKey(protocol.codebook.edge, {
        name: 'Proto',
        color: 'edge-color-seq-3',
      }),
  },
  {
    where: 'a node variable id',
    path: ['codebook', 'node', 'person', 'variables', '__proto__'],
    add: (protocol: ReturnType<typeof createBaseProtocol>) =>
      addPrototypeKey(protocol.codebook.node.person.variables, textVariable),
  },
  {
    where: 'an edge variable id',
    path: ['codebook', 'edge', 'knows', 'variables', '__proto__'],
    add: (protocol: ReturnType<typeof createBaseProtocol>) =>
      addPrototypeKey(protocol.codebook.edge.knows.variables, textVariable),
  },
  {
    where: 'an ego variable id',
    path: ['codebook', 'ego', 'variables', '__proto__'],
    add: (protocol: ReturnType<typeof createBaseProtocol>) =>
      addPrototypeKey(protocol.codebook.ego.variables, textVariable),
  },
];

describe('a __proto__ codebook id', () => {
  it('leaves the base protocol valid', async () => {
    const result = await validateProtocol(createBaseProtocol());
    expect(result.error?.issues).toBeUndefined();
  });

  it.each(cases)('is refused as $where', async ({ add, path }) => {
    const protocol = createBaseProtocol();
    add(protocol);

    const result = await validateProtocol(protocol);

    expect(result.error?.issues).toEqual([
      { code: 'custom', path, message: 'An id cannot be __proto__' },
    ]);
  });

  it('is refused in a document read from JSON', async () => {
    const text = JSON.stringify(createBaseProtocol()).replace(
      '"node":{',
      `"node":{"__proto__":${JSON.stringify(nodeType)},`,
    );

    const result = await validateProtocol(JSON.parse(text));

    expect(result.error?.message).toBe(
      'codebook.node.__proto__: An id cannot be __proto__',
    );
  });

  it.each(cases)('stops a migration when it is $where', ({ add, path }) => {
    const protocol = createBaseProtocol();
    add(protocol);

    expect(() => migrateProtocol(protocol)).toThrow(ValidationError);
    expect(() => migrateProtocol(protocol)).toThrow(
      `${path.join('.')}: An id cannot be __proto__`,
    );
  });

  it('stops a migration from a schema that predates the codebook checks', () => {
    const protocol = {
      schemaVersion: 3,
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [],
    };
    addPrototypeKey(protocol.codebook.node, { name: 'Proto' });

    expect(() => migrateProtocol(protocol, 9, { name: 'Proto' })).toThrow(
      'Validation failed for version 3: Invalid protocol document for version 3: codebook.node.__proto__: An id cannot be __proto__',
    );
  });
});
