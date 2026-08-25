import { describe, expect, it } from 'vitest';

import {
  formatSyntheticBatchToken,
  freshBatchStartWindow,
  parseSyntheticBatchToken,
} from '../batchToken';

describe('the batch reproduction token', () => {
  it('round-trips a host-drawn anchor exactly', () => {
    const startWindow = freshBatchStartWindow(
      new Date('2026-08-22T14:03:22.123Z'),
    );
    expect(startWindow).toBe('2026-08-22T00:00:00.000Z');

    const token = formatSyntheticBatchToken(1723456789, startWindow);
    expect(token).toBe('1723456789-2026-08-22');
    expect(parseSyntheticBatchToken(token)).toEqual({
      seed: 1723456789,
      startWindow,
    });
  });

  it('reads a bare seed as pinning only the draws', () => {
    expect(parseSyntheticBatchToken(' 42 ')).toEqual({ seed: 42 });
  });

  it('rejects anything that is not a token', () => {
    expect(parseSyntheticBatchToken('')).toBeNull();
    expect(parseSyntheticBatchToken('abc')).toBeNull();
    expect(parseSyntheticBatchToken('42-2026-13-99')).toBeNull();
    expect(parseSyntheticBatchToken('42-20260822')).toBeNull();
    expect(parseSyntheticBatchToken('-5')).toBeNull();
  });
});
