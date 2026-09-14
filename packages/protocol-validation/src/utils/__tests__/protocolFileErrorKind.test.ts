import { describe, expect, it } from 'vitest';

import {
  MigrationNotPossibleError,
  MigrationStepError,
  SchemaVersionDetectionError,
  ValidationError,
  VersionMismatchError,
} from '../../migration/errors.ts';
import { MalformedNetcanvasError } from '../malformedNetcanvasError.ts';
import {
  getProtocolFileErrorKind,
  isProtocolFileFault,
} from '../protocolFileErrorKind.ts';

describe('isProtocolFileFault', () => {
  it.each([
    [
      'a file that is not an archive',
      new MalformedNetcanvasError('not-an-archive', ''),
    ],
    [
      'an archive with no protocol',
      new MalformedNetcanvasError('missing-protocol', ''),
    ],
    [
      'an entry that will not inflate',
      new MalformedNetcanvasError('unreadable-entry', ''),
    ],
    [
      'a manifest naming an absent file',
      new MalformedNetcanvasError('missing-asset', ''),
    ],
    ['a protocol from a newer release', new VersionMismatchError(9, 8)],
    ['a protocol too old to upgrade', new MigrationNotPossibleError(1, 8)],
    ['a file that does not say its version', new SchemaVersionDetectionError()],
    ['a protocol invalid for its own version', new ValidationError('nope')],
  ])("treats %s as the file's fault", (_label, error) => {
    expect(isProtocolFileFault(error)).toBe(true);
  });

  it("does not treat a failed migration step as the file's fault", () => {
    const error = new MigrationStepError(7);

    // `MigrationChain.executeStep` re-raises everything a migration step
    // throws as this, so a bug inside a migration is indistinguishable from a
    // protocol that cannot be upgraded — and a host that asked only whether
    // the failure could be described would stop reporting its own defects.
    expect(getProtocolFileErrorKind(error)).toBe('upgradeStepFailed');
    expect(isProtocolFileFault(error)).toBe(false);
  });

  it('keeps the original failure on the cause, so a report can act on it', () => {
    const cause = new TypeError('cannot read properties of undefined');

    expect(new MigrationStepError(7, { cause }).cause).toBe(cause);
  });

  it('is false for anything it does not recognise', () => {
    expect(isProtocolFileFault(new Error('disk on fire'))).toBe(false);
    expect(isProtocolFileFault(undefined)).toBe(false);
  });
});
