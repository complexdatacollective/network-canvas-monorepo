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

  describe('synthetic population and topology', () => {
    it('accepts an absent or disabled section', () => {
      expect(validateEntityType({ name: 'Person' })).toEqual({});
      expect(validateEntityType({ synthetic: null })).toEqual({});
    });

    it.each([
      [
        'a uniform population',
        { count: { distribution: 'uniform', min: 1, max: 8 } },
      ],
      [
        'a constant population',
        { count: { distribution: 'constant', value: 8 } },
      ],
      ['a poisson population', { count: { distribution: 'poisson', mean: 5 } }],
      [
        'a truncated normal population',
        { count: { distribution: 'normal', mean: 8, sd: 3, min: 0, max: 20 } },
      ],
      [
        'a density topology',
        {
          topology: {
            metric: 'density',
            distribution: { distribution: 'uniform', min: 0.3, max: 0.5 },
          },
        },
      ],
      [
        'a mean-degree topology',
        {
          topology: {
            metric: 'meanDegree',
            distribution: { distribution: 'constant', value: 2 },
          },
        },
      ],
    ])('accepts %s', (_label, synthetic) => {
      expect(validateEntityType({ synthetic })).toEqual({});
    });

    it('flags a parameter cleared mid-edit as unfinished', () => {
      const errors = validateEntityType({
        synthetic: { count: { distribution: 'uniform', min: 1 } },
      });
      expect(errors._error).toContain('Finish the synthetic data settings');
    });

    it('rejects an inverted population range', () => {
      const errors = validateEntityType({
        synthetic: { count: { distribution: 'uniform', min: 10, max: 1 } },
      });
      expect(errors._error).toContain(
        'the minimum must not be greater than the maximum',
      );
    });

    it('rejects a fractional population count', () => {
      const errors = validateEntityType({
        synthetic: { count: { distribution: 'uniform', min: 1.5, max: 4 } },
      });
      expect(errors._error).toContain('counts must be whole numbers');
    });

    it('rejects a negative standard deviation', () => {
      const errors = validateEntityType({
        synthetic: { count: { distribution: 'normal', mean: 5, sd: -1 } },
      });
      expect(errors._error).toContain('values must be 0 or more');
    });

    it('rejects a density outside 0 to 1', () => {
      const errors = validateEntityType({
        synthetic: {
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value: 4 },
          },
        },
      });
      expect(errors._error).toContain('values must be 1 or less');
    });

    it('rejects an inverted topology range', () => {
      const errors = validateEntityType({
        synthetic: {
          topology: {
            metric: 'density',
            distribution: { distribution: 'uniform', min: 0.9, max: 0.2 },
          },
        },
      });
      expect(errors._error).toContain(
        'the minimum must not be greater than the maximum',
      );
    });

    it('reports the synthetic error ahead of a shape mapping error', () => {
      const errors = validateEntityType({
        synthetic: { count: { distribution: 'uniform', min: 10, max: 1 } },
        shape: { default: 'circle', dynamic: {} },
      });
      expect(errors.shape).toBeUndefined();
      expect(errors._error).toContain('synthetic data settings');
    });
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
