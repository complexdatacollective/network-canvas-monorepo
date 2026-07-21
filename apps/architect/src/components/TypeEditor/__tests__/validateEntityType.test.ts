import { describe, expect, it } from 'vitest';

import validateEntityType from '../validateEntityType';

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

  it('flags a dynamic mapping with no variable selected', () => {
    const errors = validateEntityType({
      shape: { default: 'circle', dynamic: {} },
    });
    expect(errors.shape?.dynamic?.variable).toBeTruthy();
    expect(errors.shape?.dynamic?.thresholds).toBeUndefined();
  });

  it('flags a breakpoints mapping with no thresholds', () => {
    const errors = validateEntityType({
      shape: {
        default: 'circle',
        dynamic: { variable: 'var-1', type: 'breakpoints', thresholds: [] },
      },
    });
    expect(errors.shape?.dynamic?.thresholds).toBeTruthy();
    expect(errors.shape?.dynamic?.variable).toBeUndefined();
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
    expect(errors.shape?.dynamic?.thresholds).toBeTruthy();
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
    expect(errors.shape?.dynamic?.thresholds).toBeTruthy();
  });
});
