import { describe, expect, it } from 'vitest';

import {
  buildEntityConstraints,
  buildVariableConstraints,
} from '../buildConstraints';

const TODAY = '2026-07-27';

describe('buildVariableConstraints', () => {
  it('reads single-variable rules from validation', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Nickname',
        type: 'text',
        validation: { required: true, minLength: 24, maxLength: 24 },
      },
      TODAY,
    );

    expect(result.required).toBe(true);
    expect(result.minLength).toBe(24);
    expect(result.maxLength).toBe(24);
    expect(result.unique).toBe(false);
  });

  it('reads cross-variable references', () => {
    const result = buildVariableConstraints(
      {
        id: 'v2',
        name: 'Confirm',
        type: 'text',
        validation: { sameAs: 'v1', differentFrom: 'v3' },
      },
      TODAY,
    );

    expect(result.sameAs).toBe('v1');
    expect(result.differentFrom).toBe('v3');
  });

  it('defaults required and unique to false when validation is absent', () => {
    const result = buildVariableConstraints(
      { id: 'v1', name: 'Name', type: 'text' },
      TODAY,
    );

    expect(result.required).toBe(false);
    expect(result.unique).toBe(false);
    expect(result.dateWindow).toBeUndefined();
  });

  it('normalises DatePicker parameters into a date window', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'month', min: '2020-01-01', max: '2024-06-30' },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'month',
      min: '2020-01',
      max: '2024-06',
    });
  });

  it('defaults DatePicker resolution to full', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({ resolution: 'full' });
  });

  it('normalises RelativeDatePicker offsets against the supplied today', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Last seen',
        type: 'datetime',
        component: 'RelativeDatePicker',
        parameters: { anchor: '2026-07-27', before: 30, after: 5 },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-06-27',
      max: '2026-08-01',
    });
  });

  it('applies the runtime RelativeDatePicker defaults of 180 before and 0 after', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Last seen',
        type: 'datetime',
        component: 'RelativeDatePicker',
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-01-28',
      max: '2026-07-27',
    });
  });
});

describe('buildEntityConstraints', () => {
  it('builds one entry per codebook variable, keyed by id', () => {
    const result = buildEntityConstraints(
      {
        v1: { name: 'Name', type: 'text', validation: { required: true } },
        v2: { name: 'Age', type: 'number', validation: { minValue: 18 } },
      },
      TODAY,
    );

    expect([...result.keys()]).toEqual(['v1', 'v2']);
    expect(result.get('v1')?.constraints.required).toBe(true);
    expect(result.get('v2')?.constraints.minValue).toBe(18);
    expect(result.get('v2')?.entry.type).toBe('number');
  });

  it('returns an empty map for undefined variables', () => {
    expect(buildEntityConstraints(undefined, TODAY).size).toBe(0);
  });
});
