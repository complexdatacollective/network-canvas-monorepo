import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResearcherLogEntry } from '@codaco/studio-contract/schema/browser-logs';

import { installFetchStub } from '../../test/fetchStub.ts';
import { faultCodeOf } from '../errors.ts';
import { rpcCall } from '../rpc.ts';

const logged = vi.hoisted((): ResearcherLogEntry[] => []);

vi.mock('../browserLogs.ts', () => ({
  logResearcher: (entry: ResearcherLogEntry) => {
    logged.push(entry);
  },
}));

const fetchStub = installFetchStub();

const failureOfStatusCall = (): Promise<unknown> =>
  rpcCall('status', undefined).then(
    () => {
      throw new Error('the call was expected to fail');
    },
    (error: unknown) => error,
  );

beforeEach(() => {
  logged.length = 0;
});

describe('an rpc failure', () => {
  it('is a server answer, not a transport failure, when the server answered with an uncatalogued status', async () => {
    fetchStub.mockImplementation(
      async () => new Response('upstream exploded', { status: 500 }),
    );

    const failure = await failureOfStatusCall();

    expect(faultCodeOf(failure)).toBe('http_error');
    expect(logged).toEqual([]);
  });

  it('is logged as a request that never reached the server when no answer came back', async () => {
    fetchStub.mockImplementation(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );

    const failure = await failureOfStatusCall();

    expect(faultCodeOf(failure)).toBe('transport');
    expect(logged).toEqual([
      {
        message: 'Request to the server failed',
        level: 'Warn',
        attributes: { error_code: 'transport' },
      },
    ]);
  });
});
