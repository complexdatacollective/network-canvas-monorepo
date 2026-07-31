import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  reportStartupProtocolValidationFailure,
  subscribeStartupProtocolValidationFailures,
  takeStartupProtocolValidationFailures,
} from '../startupProtocolFailureQueue';

describe('startupProtocolFailureQueue', () => {
  beforeEach(() => {
    takeStartupProtocolValidationFailures();
  });

  it('retains startup validation failures until the dialog reporter mounts', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStartupProtocolValidationFailures(listener);

    reportStartupProtocolValidationFailure('Invalid legacy protocol');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(takeStartupProtocolValidationFailures()).toEqual([
      'Invalid legacy protocol',
    ]);
    expect(takeStartupProtocolValidationFailures()).toEqual([]);
    unsubscribe();
  });
});
