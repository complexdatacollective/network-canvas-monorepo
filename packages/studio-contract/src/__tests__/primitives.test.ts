import { Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { SessionToken, StudyId, TeamInvitationId } from '../schema/ids.ts';
import {
  DecimalSequence,
  Email,
  NonBlankString,
} from '../schema/primitives.ts';

const decodeDecimal = Schema.decodeUnknownExit(DecimalSequence);
const decodeDecimalCollectingAll = Schema.decodeUnknownExit(DecimalSequence, {
  errors: 'all',
});
const decodeEmail = Schema.decodeUnknownExit(Email);
const decodeInvitationId = Schema.decodeUnknownExit(TeamInvitationId);
const decodeSessionToken = Schema.decodeUnknownExit(SessionToken);

describe('DecimalSequence', () => {
  it('accepts the PostgreSQL bigint range', () => {
    expect(Exit.isSuccess(decodeDecimal('0'))).toBe(true);
    expect(Exit.isSuccess(decodeDecimal('9223372036854775807'))).toBe(true);
  });

  it.each([
    ['one past the bigint maximum', '9223372036854775808'],
    ['a non-numeric string', 'abc'],
    ['the empty string', ''],
    ['twenty digits', '12345678901234567890'],
  ])('refuses %s', (_label, input) => {
    expect(Exit.isFailure(decodeDecimal(input))).toBe(true);
  });

  it('reports a non-numeric string as an issue, not a defect, when every check runs', () => {
    // Under `errors: 'all'` the range filter runs even though the pattern
    // check already failed. A `BigInt('abc')` inside it would throw, and a
    // throw in a filter is a defect that escapes the parse result rather than
    // a validation failure the caller can report.
    const exit = decodeDecimalCollectingAll('abc');

    expect(Exit.hasDies(exit)).toBe(false);
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('NonBlankString', () => {
  it('refuses a string of only whitespace', () => {
    const decode = Schema.decodeUnknownExit(NonBlankString(10, 'Name'));

    expect(Exit.isFailure(decode('   '))).toBe(true);
    expect(Exit.isSuccess(decode('Ada'))).toBe(true);
  });
});

describe('Email', () => {
  it('requires a dotted domain, as zod 4 does', () => {
    expect(Exit.isFailure(decodeEmail('a@b'))).toBe(true);
    expect(Exit.isSuccess(decodeEmail('a@b.co'))).toBe(true);
  });
});

describe('ids', () => {
  const uuid = '3f1b2c8e-6a4d-4f5b-9c2e-7d8a1b0c3e4f';

  it('refuses a StudyId that is not a UUID', () => {
    expect(() => StudyId.make('study-1')).toThrow();
    expect(StudyId.make(uuid)).toBe(uuid);
  });

  it('leaves the wire alone: a branded id encodes to its plain string', () => {
    expect(Schema.encodeUnknownSync(StudyId)(StudyId.make(uuid))).toBe(uuid);
  });

  it('refuses a TeamInvitationId containing a space', () => {
    expect(Exit.isFailure(decodeInvitationId('a b'))).toBe(true);
    expect(Exit.isSuccess(decodeInvitationId('a-b_C9'))).toBe(true);
  });

  it('refuses a SessionToken below the entropy floor', () => {
    expect(Exit.isFailure(decodeSessionToken('a'.repeat(15)))).toBe(true);
    expect(Exit.isSuccess(decodeSessionToken('a'.repeat(16)))).toBe(true);
  });
});
