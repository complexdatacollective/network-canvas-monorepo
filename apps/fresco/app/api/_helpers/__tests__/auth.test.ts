import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockVerifyApiToken } = vi.hoisted(() => ({
  mockVerifyApiToken: vi.fn(),
}));

vi.mock('~/actions/apiTokens', () => ({
  verifyApiToken: mockVerifyApiToken,
}));

import { createCorsHeaders, requireApiTokenAuth } from '../auth';

describe('API auth helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCorsHeaders', () => {
    it('should return headers with specified methods', () => {
      const headers = createCorsHeaders('GET, POST');

      expect(headers['Access-Control-Allow-Origin']).toBe('*');
      expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST');
      expect(headers['Access-Control-Allow-Headers']).toBe(
        'Content-Type, Authorization',
      );
    });
  });

  describe('requireApiTokenAuth', () => {
    it('should return error when no authorization header is present', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/test');

      const result = await requireApiTokenAuth(request);

      if (!('error' in result)) throw new Error('Expected an auth error');
      expect(result.error).toBeInstanceOf(NextResponse);
      expect(result.error.status).toBe(401);
      expect(await result.error.json()).toEqual({
        error: 'Authentication required. Provide a Bearer token.',
      });
      expect(mockVerifyApiToken).not.toHaveBeenCalled();
    });

    it('should return error when token is invalid', async () => {
      mockVerifyApiToken.mockResolvedValue({ valid: false });

      const request = new NextRequest('http://localhost:3000/api/v1/test', {
        headers: { Authorization: 'Bearer invalid-token' },
      });

      const result = await requireApiTokenAuth(request);

      if (!('error' in result)) throw new Error('Expected an auth error');
      expect(result.error.status).toBe(401);
      expect(await result.error.json()).toEqual({
        error: 'Invalid API token',
      });
      expect(mockVerifyApiToken).toHaveBeenCalledWith('invalid-token');
    });

    it('should return valid when token is valid', async () => {
      mockVerifyApiToken.mockResolvedValue({ valid: true });

      const request = new NextRequest('http://localhost:3000/api/v1/test', {
        headers: { Authorization: 'Bearer valid-token' },
      });

      const result = await requireApiTokenAuth(request);

      expect(result).toEqual({ valid: true });
      expect(mockVerifyApiToken).toHaveBeenCalledWith('valid-token');
    });

    it('accepts a valid token sent without the Bearer prefix', async () => {
      mockVerifyApiToken.mockResolvedValue({ valid: true });

      const request = new NextRequest('http://localhost:3000/api/v1/test', {
        headers: { Authorization: 'valid-token' },
      });

      const result = await requireApiTokenAuth(request);

      expect(result).toEqual({ valid: true });
      expect(mockVerifyApiToken).toHaveBeenCalledExactlyOnceWith('valid-token');
    });

    it.each(['bearer valid-token', 'BEARER valid-token'])(
      'strips the Bearer prefix in any letter case from %j',
      async (authorization) => {
        mockVerifyApiToken.mockResolvedValue({ valid: true });

        const request = new NextRequest('http://localhost:3000/api/v1/test', {
          headers: { Authorization: authorization },
        });

        const result = await requireApiTokenAuth(request);

        expect(result).toEqual({ valid: true });
        expect(mockVerifyApiToken).toHaveBeenCalledExactlyOnceWith(
          'valid-token',
        );
      },
    );

    it.each([
      ['a bare token that begins with the word', 'BearerValidToken'],
      ['the word joined by a hyphen', 'bearer-valid-token'],
      ['the word followed by a tab', 'Bearer\tvalid-token'],
    ])('passes %s through unchanged', async (_description, authorization) => {
      mockVerifyApiToken.mockResolvedValue({ valid: false });

      const request = new NextRequest('http://localhost:3000/api/v1/test', {
        headers: { Authorization: authorization },
      });

      await requireApiTokenAuth(request);

      expect(mockVerifyApiToken).toHaveBeenCalledExactlyOnceWith(authorization);
    });

    it('strips only the first space after the Bearer prefix', async () => {
      mockVerifyApiToken.mockResolvedValue({ valid: false });

      const request = new NextRequest('http://localhost:3000/api/v1/test', {
        headers: { Authorization: 'Bearer  valid-token' },
      });

      await requireApiTokenAuth(request);

      expect(mockVerifyApiToken).toHaveBeenCalledExactlyOnceWith(
        ' valid-token',
      );
    });

    it('leaves a Bearer that is not at the start of the header in place', async () => {
      mockVerifyApiToken.mockResolvedValue({ valid: false });

      const request = new NextRequest('http://localhost:3000/api/v1/test', {
        headers: { Authorization: 'abc Bearer def' },
      });

      await requireApiTokenAuth(request);

      expect(mockVerifyApiToken).toHaveBeenCalledExactlyOnceWith(
        'abc Bearer def',
      );
    });
  });
});
