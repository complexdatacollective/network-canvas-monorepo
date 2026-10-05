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

  it.each([
    ['a..b@c.de', false],
    ['.a@b.cd', false],
    ['a@-b.cd', false],
    ['a@b.c', false],
    ['a.b+c@d-e.fg', true],
    ['invitee@example.com', true],
    ['a.@b.cd', false],
    ["o'b@x.io", true],
    ['A@B.CD', true],
  ])('decides %s as zod did (accepted: %s)', (address, accepted) => {
    expect(Exit.isSuccess(decodeEmail(address))).toBe(accepted);
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

  it('bounds a TeamInvitationId at 255 characters', () => {
    expect(Exit.isSuccess(decodeInvitationId('a'.repeat(255)))).toBe(true);
    expect(Exit.isFailure(decodeInvitationId('a'.repeat(256)))).toBe(true);
  });

  it('refuses a SessionToken below the entropy floor', () => {
    expect(Exit.isFailure(decodeSessionToken('a'.repeat(15)))).toBe(true);
    expect(Exit.isSuccess(decodeSessionToken('a'.repeat(16)))).toBe(true);
  });
});
