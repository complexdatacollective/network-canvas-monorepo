import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  NcNetworkSchema,
  VariableValueSchema,
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
      networkWithEgoAttributes({ externalAttribute: 'preserved' }),
    );

    expect(parsed.ego.attributes).toStrictEqual({
      externalAttribute: 'preserved',
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
