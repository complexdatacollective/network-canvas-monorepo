import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  DEFAULT_PASSPHRASE_MIN_LENGTH,
  NcNetworkSchema,
  VariableValueSchema,
  effectivePassphraseMinLength,
  type NcEdge,
  type NcEgo,
  type NcEncryptionHeader,
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

const encryptionHeader = {
  version: 1,
  method: 'AES-256-GCM',
  kdf: {
    algorithm: 'PBKDF2',
    hash: 'SHA-256',
    iterations: 600_000,
    salt: [
      0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 221, 238, 255,
    ],
  },
  check: {
    iv: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    data: [250, 251, 252, 253, 254, 255, 0, 1],
  },
} satisfies NcEncryptionHeader;

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
  it('preserves the encryption header and the per-value metadata of a current network', () => {
    const input = {
      ...networkWithEncryptedNode({ iv: [1, 2, 3] }),
      encryption: encryptionHeader,
    };

    const parsed = NcNetworkSchema.parse(input);

    expect(parsed).toStrictEqual(input);
    expect(parsed.encryption).toStrictEqual(encryptionHeader);
    expect(parsed.nodes[0]?._secureAttributes).toStrictEqual({
      name: { iv: [1, 2, 3] },
    });
  });

  it('preserves a schema 8 network, whose metadata carries a salt and which has no header', () => {
    const input = networkWithEncryptedNode({ iv: [1, 2, 3], salt: [4, 5, 6] });

    const parsed = NcNetworkSchema.parse(input);

    expect(parsed).toStrictEqual(input);
    expect(parsed.encryption).toBeUndefined();
    expect(Object.hasOwn(parsed, 'encryption')).toBe(false);
    expect(parsed.nodes[0]?._secureAttributes).toStrictEqual({
      name: { iv: [1, 2, 3], salt: [4, 5, 6] },
    });
  });

  it('accepts a header on a network that holds no encrypted values yet', () => {
    const input = {
      nodes: [],
      edges: [],
      ego: { _uid: 'ego', attributes: {} },
      encryption: encryptionHeader,
    };

    expect(NcNetworkSchema.parse(input)).toStrictEqual(input);
  });

  it('keeps metadata on edges and the ego alongside the header', () => {
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
      encryption: encryptionHeader,
    };

    expect(NcNetworkSchema.parse(input)).toStrictEqual(input);
  });

  it('rejects metadata without an iv', () => {
    const result = NcNetworkSchema.safeParse(
      networkWithEncryptedNode({ salt: [4, 5, 6] }),
    );

    expect(result.success).toBe(false);
  });

  it.each([
    {
      label: 'a different method',
      mutate: (header: NcEncryptionHeader) => ({
        ...header,
        method: 'AES-128-GCM',
      }),
    },
    {
      label: 'a different version',
      mutate: (header: NcEncryptionHeader) => ({ ...header, version: 2 }),
    },
    {
      label: 'a different key derivation algorithm',
      mutate: (header: NcEncryptionHeader) => ({
        ...header,
        kdf: { ...header.kdf, algorithm: 'scrypt' },
      }),
    },
    {
      label: 'a different hash',
      mutate: (header: NcEncryptionHeader) => ({
        ...header,
        kdf: { ...header.kdf, hash: 'SHA-1' },
      }),
    },
    {
      label: 'a non-positive iteration count',
      mutate: (header: NcEncryptionHeader) => ({
        ...header,
        kdf: { ...header.kdf, iterations: 0 },
      }),
    },
    {
      label: 'a fractional iteration count',
      mutate: (header: NcEncryptionHeader) => ({
        ...header,
        kdf: { ...header.kdf, iterations: 1000.5 },
      }),
    },
    {
      label: 'a salt that is not an array',
      mutate: (header: NcEncryptionHeader) => ({
        ...header,
        kdf: { ...header.kdf, salt: 'c2FsdA==' },
      }),
    },
    {
      label: 'a salt with a value that is not a byte',
      mutate: (header: NcEncryptionHeader) => ({
        ...header,
        kdf: { ...header.kdf, salt: [0, 256] },
      }),
    },
    {
      label: 'a salt with a negative value',
      mutate: (header: NcEncryptionHeader) => ({
        ...header,
        kdf: { ...header.kdf, salt: [-1, 5] },
      }),
    },
    {
      label: 'a salt with a fractional value',
      mutate: (header: NcEncryptionHeader) => ({
        ...header,
        kdf: { ...header.kdf, salt: [1.5] },
      }),
    },
    {
      label: 'a check iv that is not an array of bytes',
      mutate: (header: NcEncryptionHeader) => ({
        ...header,
        check: { ...header.check, iv: ['1', '2'] },
      }),
    },
    {
      label: 'check data with a value that is not a byte',
      mutate: (header: NcEncryptionHeader) => ({
        ...header,
        check: { ...header.check, data: [1, 300] },
      }),
    },
    {
      label: 'no check value',
      mutate: ({ version, method, kdf }: NcEncryptionHeader) => ({
        version,
        method,
        kdf,
      }),
    },
    {
      label: 'no key derivation',
      mutate: ({ version, method, check }: NcEncryptionHeader) => ({
        version,
        method,
        check,
      }),
    },
  ])('rejects a header with $label', ({ mutate }) => {
    const result = NcNetworkSchema.safeParse({
      nodes: [],
      edges: [],
      ego: { _uid: 'ego', attributes: {} },
      encryption: mutate(encryptionHeader),
    });

    expect(result.success).toBe(false);
  });

  it('exposes the header type on the parsed network', () => {
    expectTypeOf<NcNetwork['encryption']>().toEqualTypeOf<
      NcEncryptionHeader | undefined
    >();
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
