import { afterAll, beforeAll, beforeEach, vi } from 'vitest';

/**
 * Installed once per file and kept: `Context.getDefaultValue` memoises
 * `globalThis.fetch` on the first request, so a per-test `vi.fn()` is never read.
 */
export type FetchStub = ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

export const requestUrl = (
  input: Parameters<typeof globalThis.fetch>[0],
): string => {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
};

const notAnswered: typeof globalThis.fetch = (input) =>
  Promise.reject(
    new Error(
      `the fetch stub has no answer for ${requestUrl(input)}; set one with mockImplementation`,
    ),
  );

export function installFetchStub(): FetchStub {
  const stub: FetchStub = vi.fn<typeof globalThis.fetch>(notAnswered);
  const real = globalThis.fetch;

  beforeAll(() => {
    globalThis.fetch = stub;
  });

  beforeEach(() => {
    stub.mockReset();
    stub.mockImplementation(notAnswered);
  });

  afterAll(() => {
    globalThis.fetch = real;
  });

  return stub;
}

export function problemResponse(
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/problem+json',
      ...headers,
    },
  });
}
