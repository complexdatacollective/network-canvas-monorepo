import { describe, expect, it, vi } from 'vitest';
import { type z } from 'zod';

vi.mock('server-only', () => ({}));
import {
  disableTotpSchema,
  verifyTotpSetupSchema,
  verifyTwoFactorSchema,
} from '../totp';

function expectIssue(
  result: z.ZodSafeParseResult<unknown>,
  path: string,
  message: string,
) {
  expect(result.success).toBe(false);
  expect(result.error?.issues).toContainEqual(
    expect.objectContaining({ path: [path], message }),
  );
}

describe('TOTP Schema Validators', () => {
  describe('verifyTotpSetupSchema', () => {
    it('accepts a valid 6-digit numeric code', () => {
      const result = verifyTotpSetupSchema.parse({ code: '123456' });
      expect(result.code).toBe('123456');
    });

    it('rejects a code containing non-numeric characters', () => {
      expectIssue(
        verifyTotpSetupSchema.safeParse({ code: '12345a' }),
        'code',
        'Code must be exactly 6 digits',
      );
    });

    it('rejects a code shorter than 6 digits', () => {
      expectIssue(
        verifyTotpSetupSchema.safeParse({ code: '12345' }),
        'code',
        'Code must be exactly 6 digits',
      );
    });

    it('rejects a code longer than 6 digits', () => {
      expectIssue(
        verifyTotpSetupSchema.safeParse({ code: '1234567' }),
        'code',
        'Code must be exactly 6 digits',
      );
    });

    it('rejects when code is omitted because the prefault empty string fails length validation', () => {
      expectIssue(
        verifyTotpSetupSchema.safeParse({}),
        'code',
        'Code must be exactly 6 digits',
      );
    });
  });

  describe('verifyTwoFactorSchema', () => {
    it('accepts valid twoFactorToken and code values', () => {
      const result = verifyTwoFactorSchema.parse({
        twoFactorToken: 'token-abc',
        code: '654321',
      });
      expect(result.twoFactorToken).toBe('token-abc');
      expect(result.code).toBe('654321');
    });

    it('rejects an empty twoFactorToken', () => {
      expectIssue(
        verifyTwoFactorSchema.safeParse({ twoFactorToken: '', code: '123456' }),
        'twoFactorToken',
        'Two-factor token is required',
      );
    });

    it('rejects an empty code', () => {
      expectIssue(
        verifyTwoFactorSchema.safeParse({
          twoFactorToken: 'token-abc',
          code: '',
        }),
        'code',
        'Code cannot be empty',
      );
    });

    it('rejects when code is omitted because the prefault empty string fails min(1) validation', () => {
      expectIssue(
        verifyTwoFactorSchema.safeParse({ twoFactorToken: 'token-abc' }),
        'code',
        'Code cannot be empty',
      );
    });
  });

  describe('disableTotpSchema', () => {
    it('accepts a valid 6-digit numeric code', () => {
      const result = disableTotpSchema.parse({ code: '987654' });
      expect(result.code).toBe('987654');
    });

    it('rejects a code containing non-numeric characters', () => {
      expectIssue(
        disableTotpSchema.safeParse({ code: 'abc123' }),
        'code',
        'Must be a 6-digit code or a recovery code',
      );
    });

    it('rejects a code that is not 6 digits long', () => {
      expectIssue(
        disableTotpSchema.safeParse({ code: '12345' }),
        'code',
        'Must be a 6-digit code or a recovery code',
      );
      expectIssue(
        disableTotpSchema.safeParse({ code: '1234567' }),
        'code',
        'Must be a 6-digit code or a recovery code',
      );
    });

    it('rejects when code is omitted because the prefault empty string fails min(1) validation', () => {
      expectIssue(disableTotpSchema.safeParse({}), 'code', 'Code is required');
    });
  });
});
