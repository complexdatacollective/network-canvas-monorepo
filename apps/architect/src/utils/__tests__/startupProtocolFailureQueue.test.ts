import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  reportStartupProtocolFailure,
  subscribeStartupProtocolFailures,
  takeStartupProtocolFailures,
} from '../startupProtocolFailureQueue';

describe('startupProtocolFailureQueue', () => {
  beforeEach(() => {
    takeStartupProtocolFailures();
  });

  it('retains startup failures until the dialog reporter mounts', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStartupProtocolFailures(listener);

    reportStartupProtocolFailure({
      status: 'validation-error',
      message: 'Invalid legacy protocol',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(takeStartupProtocolFailures()).toEqual([
      { status: 'validation-error', message: 'Invalid legacy protocol' },
    ]);
    expect(takeStartupProtocolFailures()).toEqual([]);
    unsubscribe();
  });

  // The queue carries the whole refusal, not a message, so a restored session
  // that is too NEW for this build reaches the "upgrade Architect" dialog
  // rather than being mis-reported as a validation failure.
  it('carries a non-validation refusal through unchanged', () => {
    reportStartupProtocolFailure({
      status: 'app-upgrade-required',
      protocolSchemaVersion: 9,
    });

    expect(takeStartupProtocolFailures()).toEqual([
      { status: 'app-upgrade-required', protocolSchemaVersion: 9 },
    ]);
  });
});
