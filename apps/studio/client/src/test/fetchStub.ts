import { afterAll, beforeAll, beforeEach, vi } from 'vitest';

/**
 * The `fetch` a suite's `/rpc` requests are answered by.
 *
 * It has to be installed once per file and kept, rather than minted per test.
 * `FetchHttpClient.Fetch` is a `Context.Reference` whose default is
 * `() => globalThis.fetch`, and `Context.getDefaultValue` memoises what it
 * returns **on the reference object** — so the first request any test in the
 * file makes fixes the function for every later one. A fresh `vi.fn()` per test
 * would be installed on a global nothing reads again, and every test after the
 * first would see zero calls.
 *
 * So the identity is stable and `mockReset` is what a test gets instead; give
 * each test its answer with `stub.mockImplementation(...)`.
 */
export type FetchStub = ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

/** What a suite asserts a request went to; `fetch` accepts three spellings. */
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

/**
 * Installs the stub for the whole file and resets it before each test.
 * Call it once, at the top level of the suite.
 */
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

/** A problem+json refusal, as the server's pre-response handler writes one. */
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
