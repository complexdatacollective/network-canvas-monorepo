import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindFirst } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
}));

// Mock dependencies before importing the handler
vi.mock('server-only', () => ({}));

vi.mock('~/lib/db', () => ({
  prisma: { interview: { findFirst: mockFindFirst } },
}));

vi.mock('~/actions/interviews', () => ({
  createInterview: vi.fn(),
}));

vi.mock('~/queries/appSettings', () => ({
  getAppSetting: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
  })),
}));

vi.mock('~/env', () => ({
  env: {
    PUBLIC_URL: 'http://localhost:3000',
  },
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Run the callback inline so telemetry side effects are observable.
    after: vi.fn((callback: () => unknown) => void callback()),
  };
});

vi.mock('~/lib/posthog-server', () => ({
  captureEvent: vi.fn(),
  captureException: vi.fn(),
  flushPostHog: vi.fn(),
}));

import { cookies } from 'next/headers';

// Import after mocks are set up
import { createInterview } from '~/actions/interviews';
import { captureEvent } from '~/lib/posthog-server';
import { getAppSetting } from '~/queries/appSettings';

// Import the handlers
import { GET, POST } from '../route';

const mockCreateInterview = vi.mocked(createInterview);
const mockCaptureEvent = vi.mocked(captureEvent);
const mockGetAppSetting = vi.mocked(getAppSetting);
const mockCookies = vi.mocked(cookies);

describe('Onboard Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockGetAppSetting.mockResolvedValue(false);
    mockFindFirst.mockResolvedValue(null);
    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
      has: vi.fn().mockReturnValue(false),
      getAll: vi.fn().mockReturnValue([]),
      set: vi.fn(),
      delete: vi.fn(),
      size: 0,
      [Symbol.iterator]: vi.fn(),
    });
  });

  describe('GET handler', () => {
    it('should redirect to error page when no protocolId is provided', async () => {
      const request = new NextRequest(
        'http://localhost:3000/onboard/undefined',
      );
      const params = Promise.resolve({ protocolId: 'undefined' });

      const response = await GET(request, { params });

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/onboard/error',
      );
    });

    it('should extract participantIdentifier from query string', async () => {
      const protocolId = 'test-protocol-id';
      const participantIdentifier = 'TEST-PARTICIPANT-001';
      const createdInterviewId = 'interview-123';

      mockCreateInterview.mockResolvedValue({
        createdInterviewId,
        error: null,
        errorType: null,
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}?participantIdentifier=${participantIdentifier}`,
      );
      const params = Promise.resolve({ protocolId });

      const response = await GET(request, { params });

      expect(mockCreateInterview).toHaveBeenCalledWith({
        participantIdentifier,
        protocolId,
      });
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        `http://localhost:3000/interview/${createdInterviewId}`,
      );
    });

    it('should pass undefined when no participantIdentifier is provided', async () => {
      const protocolId = 'test-protocol-id';
      const createdInterviewId = 'interview-456';

      mockCreateInterview.mockResolvedValue({
        createdInterviewId,
        error: null,
        errorType: null,
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
      );
      const params = Promise.resolve({ protocolId });

      await GET(request, { params });

      expect(mockCreateInterview).toHaveBeenCalledWith({
        participantIdentifier: undefined,
        protocolId,
      });
    });

    it('should redirect to the finished interview the cookie names when limitInterviews is enabled', async () => {
      const protocolId = 'test-protocol-id';
      const getCookie = vi
        .fn()
        .mockReturnValue({ value: 'finished-interview' });

      mockGetAppSetting.mockResolvedValue(true);
      mockCookies.mockResolvedValue({
        get: getCookie,
      } as unknown as Awaited<ReturnType<typeof cookies>>);
      mockFindFirst.mockResolvedValue({ id: 'finished-interview' });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
      );
      const params = Promise.resolve({ protocolId });

      const response = await GET(request, { params });

      expect(getCookie).toHaveBeenCalledWith(protocolId);
      // Only a finished interview of this same protocol counts.
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'finished-interview',
          protocolId,
          finishTime: { not: null },
        },
        select: { id: true },
      });
      expect(mockCreateInterview).not.toHaveBeenCalled();
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/interview/finished-interview',
      );
      expect(response.headers.get('Cache-Control')).toBe(
        'no-cache, no-store, must-revalidate',
      );
    });

    it.each([
      ['the legacy "completed" value', 'completed'],
      ['an id that names no finished interview of the protocol', 'other-id'],
    ])(
      'should start a new interview when the cookie holds %s',
      async (_case, value) => {
        const protocolId = 'test-protocol-id';
        const createdInterviewId = 'interview-new';

        mockGetAppSetting.mockResolvedValue(true);
        mockCookies.mockResolvedValue({
          get: vi.fn().mockReturnValue({ value }),
        } as unknown as Awaited<ReturnType<typeof cookies>>);
        mockFindFirst.mockResolvedValue(null);
        mockCreateInterview.mockResolvedValue({
          createdInterviewId,
          error: null,
          errorType: null,
        });

        const request = new NextRequest(
          `http://localhost:3000/onboard/${protocolId}`,
        );
        const params = Promise.resolve({ protocolId });

        const response = await GET(request, { params });

        expect(mockFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ id: value, protocolId }),
          }),
        );
        expect(mockCreateInterview).toHaveBeenCalled();
        expect(response.headers.get('location')).toBe(
          `http://localhost:3000/interview/${createdInterviewId}`,
        );
      },
    );

    it('should ignore the cookie when limitInterviews is disabled', async () => {
      const protocolId = 'test-protocol-id';
      const createdInterviewId = 'interview-unlimited';

      mockGetAppSetting.mockResolvedValue(false);
      mockCookies.mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: 'finished-interview' }),
      } as unknown as Awaited<ReturnType<typeof cookies>>);
      mockFindFirst.mockResolvedValue({ id: 'finished-interview' });
      mockCreateInterview.mockResolvedValue({
        createdInterviewId,
        error: null,
        errorType: null,
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
      );
      const params = Promise.resolve({ protocolId });

      const response = await GET(request, { params });

      expect(mockFindFirst).not.toHaveBeenCalled();
      expect(response.headers.get('location')).toBe(
        `http://localhost:3000/interview/${createdInterviewId}`,
      );
    });

    it('should allow new interview when limitInterviews is enabled but no cookie exists', async () => {
      const protocolId = 'test-protocol-id';
      const createdInterviewId = 'interview-789';

      mockGetAppSetting.mockResolvedValue(true);
      mockCookies.mockResolvedValue({
        get: vi.fn().mockReturnValue(undefined),
      } as unknown as Awaited<ReturnType<typeof cookies>>);
      mockCreateInterview.mockResolvedValue({
        createdInterviewId,
        error: null,
        errorType: null,
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
      );
      const params = Promise.resolve({ protocolId });

      const response = await GET(request, { params });

      expect(mockCreateInterview).toHaveBeenCalled();
      expect(response.headers.get('location')).toBe(
        `http://localhost:3000/interview/${createdInterviewId}`,
      );
    });

    it('should redirect to error page when createInterview returns an error', async () => {
      const protocolId = 'test-protocol-id';

      mockCreateInterview.mockResolvedValue({
        createdInterviewId: null,
        error: 'Failed to create interview',
        errorType: 'unknown',
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
      );
      const params = Promise.resolve({ protocolId });

      const response = await GET(request, { params });

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/onboard/error',
      );
    });

    it('should redirect to no-anonymous-recruitment page when anonymous recruitment is disabled', async () => {
      const protocolId = 'test-protocol-id';

      mockCreateInterview.mockResolvedValue({
        createdInterviewId: null,
        error: 'Anonymous recruitment is not enabled',
        errorType: 'no-anonymous-recruitment',
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
      );
      const params = Promise.resolve({ protocolId });

      const response = await GET(request, { params });

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/onboard/no-anonymous-recruitment',
      );
    });

    it('should redirect to the invalid-link page when the protocol does not exist', async () => {
      const protocolId = 'deleted-protocol-id';

      mockCreateInterview.mockResolvedValue({
        createdInterviewId: null,
        error: 'Protocol not found',
        errorType: 'no-protocol',
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
      );
      const params = Promise.resolve({ protocolId });

      const response = await GET(request, { params });

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/onboard/invalid-link',
      );
      // An invalid link is a participant mistake, not a deployment error.
      expect(mockCaptureEvent).not.toHaveBeenCalledWith(
        'Error',
        expect.anything(),
      );
    });
  });

  describe('POST handler', () => {
    it('should extract participantIdentifier from JSON body', async () => {
      const protocolId = 'test-protocol-id';
      const participantIdentifier = 'POST-PARTICIPANT-001';
      const createdInterviewId = 'interview-post-123';

      mockCreateInterview.mockResolvedValue({
        createdInterviewId,
        error: null,
        errorType: null,
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
        {
          method: 'POST',
          body: JSON.stringify({ participantIdentifier }),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
      const params = Promise.resolve({ protocolId });

      const response = await POST(request, { params });

      expect(mockCreateInterview).toHaveBeenCalledWith({
        participantIdentifier,
        protocolId,
      });
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        `http://localhost:3000/interview/${createdInterviewId}`,
      );
    });

    it('should handle POST with empty body gracefully', async () => {
      const protocolId = 'test-protocol-id';
      const createdInterviewId = 'interview-post-456';

      mockCreateInterview.mockResolvedValue({
        createdInterviewId,
        error: null,
        errorType: null,
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
      const params = Promise.resolve({ protocolId });

      await POST(request, { params });

      expect(mockCreateInterview).toHaveBeenCalledWith({
        participantIdentifier: undefined,
        protocolId,
      });
    });

    it('should redirect to error page when POST body parsing fails', async () => {
      const protocolId = 'test-protocol-id';

      mockCreateInterview.mockResolvedValue({
        createdInterviewId: null,
        error: 'Failed to create interview',
        errorType: 'unknown',
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
        {
          method: 'POST',
          body: JSON.stringify(null),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
      const params = Promise.resolve({ protocolId });

      await POST(request, { params });

      expect(mockCreateInterview).toHaveBeenCalledWith({
        participantIdentifier: undefined,
        protocolId,
      });
    });

    it('should redirect to no-anonymous-recruitment page when anonymous recruitment is disabled', async () => {
      const protocolId = 'test-protocol-id';

      mockCreateInterview.mockResolvedValue({
        createdInterviewId: null,
        error: 'Anonymous recruitment is not enabled',
        errorType: 'no-anonymous-recruitment',
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
      const params = Promise.resolve({ protocolId });

      const response = await POST(request, { params });

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/onboard/no-anonymous-recruitment',
      );
    });

    it('should check limitInterviews for POST requests too', async () => {
      const protocolId = 'test-protocol-id';

      mockGetAppSetting.mockResolvedValue(true);
      mockCookies.mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: 'finished-interview' }),
      } as unknown as Awaited<ReturnType<typeof cookies>>);
      mockFindFirst.mockResolvedValue({ id: 'finished-interview' });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
        {
          method: 'POST',
          body: JSON.stringify({ participantIdentifier: 'test' }),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
      const params = Promise.resolve({ protocolId });

      const response = await POST(request, { params });

      expect(mockCreateInterview).not.toHaveBeenCalled();
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/interview/finished-interview',
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle protocolId with special characters', async () => {
      const protocolId = 'test-protocol-123_abc';
      const createdInterviewId = 'interview-special';

      mockCreateInterview.mockResolvedValue({
        createdInterviewId,
        error: null,
        errorType: null,
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}`,
      );
      const params = Promise.resolve({ protocolId });

      const response = await GET(request, { params });

      expect(mockCreateInterview).toHaveBeenCalledWith({
        participantIdentifier: undefined,
        protocolId,
      });
      expect(response.headers.get('location')).toBe(
        `http://localhost:3000/interview/${createdInterviewId}`,
      );
    });

    it('should handle URL-encoded participantIdentifier', async () => {
      const protocolId = 'test-protocol-id';
      const participantIdentifier = 'user@example.com';
      const createdInterviewId = 'interview-encoded';

      mockCreateInterview.mockResolvedValue({
        createdInterviewId,
        error: null,
        errorType: null,
      });

      const request = new NextRequest(
        `http://localhost:3000/onboard/${protocolId}?participantIdentifier=${encodeURIComponent(participantIdentifier)}`,
      );
      const params = Promise.resolve({ protocolId });

      await GET(request, { params });

      expect(mockCreateInterview).toHaveBeenCalledWith({
        participantIdentifier,
        protocolId,
      });
    });
  });
});
