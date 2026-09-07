import { describe, expect, it } from 'vitest';

import { messageText } from '~/test/messageText';

import validateEntityType, { SHAPE_MAPPING_FIELD } from '../validateEntityType';

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
