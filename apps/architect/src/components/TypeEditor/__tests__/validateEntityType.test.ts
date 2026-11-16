import { describe, expect, it } from 'vitest';

import { messageText } from '~/test/messageText';

import validateEntityType, {
  DYNAMIC_LABEL_FIELD,
  SHAPE_MAPPING_FIELD,
} from '../validateEntityType';

describe('validateEntityType()', () => {
  it('returns no errors when there is no dynamic shape mapping', () => {
    expect(validateEntityType({ name: 'Person' })).toEqual({});
    expect(validateEntityType({ shape: { default: 'circle' } })).toEqual({});
  });

  it('accepts a complete discrete mapping', () => {
    expect(
      validateEntityType({
        shape: {
          default: 'circle',
          dynamic: { variable: 'var-1', type: 'discrete', map: [] },
        },
      }),
    ).toEqual({});
  });

  it('accepts a breakpoints mapping with strictly ascending thresholds', () => {
    expect(
      validateEntityType({
        shape: {
          default: 'circle',
          dynamic: {
            variable: 'var-1',
            type: 'breakpoints',
            thresholds: [
              { value: 1, shape: 'square' },
              { value: 5, shape: 'diamond' },
            ],
          },
        },
      }),
    ).toEqual({});
  });

  // The mapping is one opaque field, so every message is reported at that
  // field name — which is what makes fresco-ui mark it errored and focus it.
  it('flags a dynamic mapping with no variable selected', () => {
    const errors = validateEntityType({
      shape: { default: 'circle', dynamic: {} },
    });
    expect(messageText(errors[SHAPE_MAPPING_FIELD])).toMatch(
      /Select an attribute/,
    );
  });

  it('flags a breakpoints mapping with no thresholds', () => {
    const errors = validateEntityType({
      shape: {
        default: 'circle',
        dynamic: { variable: 'var-1', type: 'breakpoints', thresholds: [] },
      },
    });
    expect(messageText(errors[SHAPE_MAPPING_FIELD])).toMatch(
      /at least one threshold/,
    );
  });

  it('flags duplicate threshold values', () => {
    const errors = validateEntityType({
      shape: {
        default: 'circle',
        dynamic: {
          variable: 'var-1',
          type: 'breakpoints',
          thresholds: [
            { value: 0, shape: 'square' },
            { value: 0, shape: 'diamond' },
          ],
        },
      },
    });
    expect(messageText(errors[SHAPE_MAPPING_FIELD])).toMatch(
      /increase in value/,
    );
  });

  it('flags descending threshold values', () => {
    const errors = validateEntityType({
      shape: {
        default: 'circle',
        dynamic: {
          variable: 'var-1',
          type: 'breakpoints',
          thresholds: [
            { value: 5, shape: 'square' },
            { value: 1, shape: 'diamond' },
          ],
        },
      },
    });
    expect(messageText(errors[SHAPE_MAPPING_FIELD])).toMatch(
      /increase in value/,
    );
  });
});

describe('validateEntityType() with a dynamic label', () => {
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: { nameVar: { name: 'name', type: 'text' } },
      },
    },
    edge: { knows: { name: 'Knows', color: 'edge-color-seq-1' } },
  };
  const context = { codebook, nodeType: 'person' };
  const labelErrorOf = (dynamicLabel: unknown) =>
    validateEntityType({ dynamicLabel }, context)[DYNAMIC_LABEL_FIELD];

  it('accepts a label that is switched off', () => {
    expect(validateEntityType({ name: 'Person' }, context)).toEqual({});
  });

  it('asks for the label once the section is switched on', () => {
    expect(labelErrorOf({})).toBeDefined();
    expect(labelErrorOf({ text: {} })).toBeDefined();
  });

  it('accepts a label that shows the default label and a connection', () => {
    expect(
      labelErrorOf({
        text: { en: '{linked, select, yes {🔗 } other {}}{nodeLabel}' },
        dynamicValues: {
          linked: { path: 'node.$connected.knows', cases: { yes: true } },
          nodeLabel: { path: 'node.$label' },
        },
      }),
    ).toBeUndefined();
  });

  it('refuses a label that shows an attribute where it could be missing', () => {
    expect(
      labelErrorOf({
        text: { en: '{name}' },
        dynamicValues: { name: { path: 'node.nameVar' } },
      }),
    ).toBeDefined();
  });

  it('refuses a condition with no name, no rules or no join', () => {
    const rule = (id: string) => ({
      type: 'node',
      id,
      options: { type: 'person', attribute: 'nameVar', operator: 'EXISTS' },
    });
    const withCondition = (condition: unknown) => ({
      text: { en: 'x' },
      conditions: { named: condition },
    });
    expect(
      labelErrorOf(
        withCondition({ name: ' ', filter: { rules: [rule('a')] } }),
      ),
    ).toBeDefined();
    expect(labelErrorOf(withCondition({ name: 'Named' }))).toBeDefined();
    expect(
      labelErrorOf(
        withCondition({
          name: 'Named',
          filter: { rules: [rule('a'), rule('b')] },
        }),
      ),
    ).toBeDefined();
    expect(
      labelErrorOf(
        withCondition({
          name: 'Named',
          filter: { join: 'AND', rules: [rule('a'), rule('b')] },
        }),
      ),
    ).toBeUndefined();
  });
});
