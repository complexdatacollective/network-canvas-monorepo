import { describe, expect, it } from 'vitest';

import {
  addDays,
  addSteps,
  stepsBetween,
  todayYmd,
  truncateToResolution,
} from '../dateWindow';

describe('addDays', () => {
  it('adds days across a month boundary in UTC', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('subtracts days across a year boundary', () => {
    expect(addDays('2026-01-02', -3)).toBe('2025-12-30');
  });

  it('handles leap days', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});

describe('truncateToResolution', () => {
  it('keeps the full date at full resolution', () => {
    expect(truncateToResolution('2026-07-27', 'full')).toBe('2026-07-27');
  });

  it('drops the day at month resolution', () => {
    expect(truncateToResolution('2026-07-27', 'month')).toBe('2026-07');
  });

  it('drops the month at year resolution', () => {
    expect(truncateToResolution('2026-07-27', 'year')).toBe('2026');
  });
});

describe('addSteps', () => {
  it('steps by days at full resolution', () => {
    expect(addSteps('2026-07-27', 5, 'full')).toBe('2026-08-01');
  });

  it('steps by months at month resolution', () => {
    expect(addSteps('2026-11', 3, 'month')).toBe('2027-02');
  });

  it('steps back across a year boundary at month resolution', () => {
    expect(addSteps('2026-02', -2, 'month')).toBe('2025-12');
    expect(addSteps('2026-01', -13, 'month')).toBe('2024-12');
  });

  it('steps by years at year resolution', () => {
    expect(addSteps('2026', -2, 'year')).toBe('2024');
  });
});

describe('stepsBetween', () => {
  it('counts days at full resolution', () => {
    expect(stepsBetween('2026-07-27', '2026-08-01', 'full')).toBe(5);
  });

  it('counts months at month resolution', () => {
    expect(stepsBetween('2026-11', '2027-02', 'month')).toBe(3);
  });

  it('counts years at year resolution', () => {
    expect(stepsBetween('2024', '2026', 'year')).toBe(2);
  });

  it('returns a negative count for an inverted range', () => {
    expect(stepsBetween('2026', '2024', 'year')).toBe(-2);
  });
});

describe('todayYmd', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayYmd()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
