import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  DEFAULT_PASSPHRASE_MIN_LENGTH,
  NcNetworkSchema,
  VariableValueSchema,
  effectivePassphraseMinLength,
  type NcEdge,
  type NcEgo,
  type NcEntity,
  type NcNetwork,
  type NcNode,
  type VariableValue,
} from '../network.ts';

const networkWithEgoAttributes = (attributes: Record<string, unknown>) => ({
  nodes: [],
  edges: [],
  ego: {
    _uid: 'ego',
    attributes,
  },
});

describe('VariableValueSchema', () => {
  it.each([false, 0, '', []])('accepts the defined empty value %j', (value) => {
    expect(VariableValueSchema.parse(value)).toEqual(value);
  });

  it.each([null, undefined])('rejects the nullish value %j', (value) => {
    expect(VariableValueSchema.safeParse(value).success).toBe(false);
  });
});

describe('NcNetworkSchema', () => {
  it.each([
    { label: 'null', value: null, expected: {} },
    { label: 'own undefined', value: undefined, expected: {} },
    { label: 'false', value: false, expected: { value: false } },
    { label: 'zero', value: 0, expected: { value: 0 } },
    { label: 'empty string', value: '', expected: { value: '' } },
    { label: 'empty array', value: [], expected: { value: [] } },
  ])('normalizes $label attribute entries', ({ value, expected }) => {
    const input = networkWithEgoAttributes({ value });

    expect(Object.hasOwn(input.ego.attributes, 'value')).toBe(true);
    expect(NcNetworkSchema.parse(input).ego.attributes).toStrictEqual(expected);
  });

  it('normalizes mixed ego, node, and edge records', () => {
    const parsed = NcNetworkSchema.parse({
      ego: {
        _uid: 'ego',
        attributes: {
          removeNull: null,
          removeUndefined: undefined,
          keepFalse: false,
        },
      },
      nodes: [
        {
          _uid: 'node-1',
          type: 'person',
          attributes: {
            removeNull: null,
            keepZero: 0,
            keepEmptyString: '',
          },
        },
      ],
      edges: [
        {
          _uid: 'edge-1',
          type: 'knows',
          from: 'node-1',
          to: 'node-2',
          attributes: {
            removeUndefined: undefined,
            keepEmptyArray: [],
          },
        },
      ],
    });

    expect(parsed).toStrictEqual({
      ego: {
        _uid: 'ego',
        attributes: { keepFalse: false },
      },
      nodes: [
        {
          _uid: 'node-1',
          type: 'person',
          attributes: {
            keepZero: 0,
            keepEmptyString: '',
          },
        },
      ],
      edges: [
        {
          _uid: 'edge-1',
          type: 'knows',
          from: 'node-1',
          to: 'node-2',
          attributes: { keepEmptyArray: [] },
        },
      ],
    });
  });

  it('preserves unknown defined attribute keys', () => {
    const parsed = NcNetworkSchema.parse(
      networkWithEgoAttributes({
        'externalAttribute': 'preserved',
        'profile page': 'https://example.com/people/ada',
      }),
    );

    expect(parsed.ego.attributes).toStrictEqual({
      'externalAttribute': 'preserved',
      'profile page': 'https://example.com/people/ada',
    });
  });

  it('accepts nullish legacy input and emits sparse public output', () => {
    const nullInput = networkWithEgoAttributes({ unanswered: null });
    const undefinedInput = networkWithEgoAttributes({ unanswered: undefined });

    expect(NcNetworkSchema.parse(nullInput).ego.attributes).toStrictEqual({});
    expect(NcNetworkSchema.parse(undefinedInput).ego.attributes).toStrictEqual(
      {},
    );
  });

  it('exposes strict public output types', () => {
    expectTypeOf<null>().not.toMatchTypeOf<VariableValue>();
    expectTypeOf<undefined>().not.toMatchTypeOf<VariableValue>();
    expectTypeOf<
      NcEntity['attributes'][string]
    >().toEqualTypeOf<VariableValue>();
    expectTypeOf<NcNode['attributes'][string]>().toEqualTypeOf<VariableValue>();
    expectTypeOf<NcEdge['attributes'][string]>().toEqualTypeOf<VariableValue>();
    expectTypeOf<NcEgo['attributes'][string]>().toEqualTypeOf<VariableValue>();
    expectTypeOf<
      NcNetwork['ego']['attributes'][string]
    >().toEqualTypeOf<VariableValue>();
    expectTypeOf<
      NcNetwork['ego']['attributes'][string]
    >().toEqualTypeOf<VariableValue>();
  });
});

const networkWithEncryptedNode = (secureAttributeMeta: unknown) => ({
  nodes: [
    {
      _uid: 'node-1',
      type: 'person',
      attributes: { name: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
      _secureAttributes: { name: secureAttributeMeta },
    },
  ],
  edges: [],
  ego: { _uid: 'ego', attributes: {} },
});

describe('NcNetworkSchema encrypted attributes', () => {
  it('preserves the per-value metadata of a current network', () => {
    const input = networkWithEncryptedNode({ iv: [1, 2, 3] });

    const parsed = NcNetworkSchema.parse(input);

    expect(parsed).toStrictEqual(input);
    expect(parsed.nodes[0]?._secureAttributes).toStrictEqual({
      name: { iv: [1, 2, 3] },
    });
  });

  it('preserves a schema 8 network, whose metadata carries a salt', () => {
    const input = networkWithEncryptedNode({ iv: [1, 2, 3], salt: [4, 5, 6] });

    const parsed = NcNetworkSchema.parse(input);

    expect(parsed).toStrictEqual(input);
    expect(parsed.nodes[0]?._secureAttributes).toStrictEqual({
      name: { iv: [1, 2, 3], salt: [4, 5, 6] },
    });
  });

  it('keeps metadata on edges and the ego', () => {
    const input = {
      nodes: [],
      edges: [
        {
          _uid: 'edge-1',
          type: 'knows',
          from: 'a',
          to: 'b',
          attributes: { note: [1, 2] },
          _secureAttributes: { note: { iv: [1] } },
        },
      ],
      ego: {
        _uid: 'ego',
        attributes: { secret: [3, 4] },
        _secureAttributes: { secret: { iv: [2], salt: [3] } },
      },
    };

    expect(NcNetworkSchema.parse(input)).toStrictEqual(input);
  });

  it('rejects metadata without an iv', () => {
    const result = NcNetworkSchema.safeParse(
      networkWithEncryptedNode({ salt: [4, 5, 6] }),
    );

    expect(result.success).toBe(false);
  });

  // The key is derived from the passphrase and the interview's id, so a
  // network stores nothing about it: an `encryption` property is not part of
  // the network, and is dropped rather than kept.
  it('stores nothing about the key on the network', () => {
    const parsed = NcNetworkSchema.parse({
      ...networkWithEncryptedNode({ iv: [1, 2, 3] }),
      encryption: { kdf: { salt: [1, 2, 3] }, check: { iv: [1], data: [2] } },
    });

    expect(Object.hasOwn(parsed, 'encryption')).toBe(false);
  });
});

/**
 * Every pair of lengths here has to leave a passphrase a participant can
 * choose: a default minimum above the researcher's own maximum would refuse
 * every one, and the interview could never be finished.
 */
describe('effectivePassphraseMinLength', () => {
  it.each([
    { label: 'no rules', rules: undefined, expected: 8 },
    { label: 'empty rules', rules: {}, expected: 8 },
    {
      label: 'a maximum below the default',
      rules: { maxLength: 6 },
      expected: 6,
    },
    {
      label: 'a maximum equal to the default',
      rules: { maxLength: 8 },
      expected: 8,
    },
    {
      label: 'a maximum above the default',
      rules: { maxLength: 12 },
      expected: 8,
    },
    {
      label: 'a lower minimum beside a maximum',
      rules: { minLength: 4, maxLength: 6 },
      expected: 4,
    },
    {
      label: 'a higher minimum on its own',
      rules: { minLength: 10 },
      expected: 10,
    },
  ])('is $expected for $label', ({ rules, expected }) => {
    expect(effectivePassphraseMinLength(rules)).toBe(expected);
  });

  it('is the shared default when nothing lowers it', () => {
    expect(effectivePassphraseMinLength(undefined)).toBe(
      DEFAULT_PASSPHRASE_MIN_LENGTH,
    );
  });
});
