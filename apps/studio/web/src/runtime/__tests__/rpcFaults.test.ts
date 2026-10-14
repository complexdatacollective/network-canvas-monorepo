import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResearcherLogEntry } from '@codaco/studio-contract/schema/browser-logs';
import { StudyId, TeamId } from '@codaco/studio-contract/schema/ids';

import { installFetchStub } from '../../test/fetchStub.ts';
import { rememberStudyTeam } from '../browserLogs.ts';
import { faultCodeOf } from '../errors.ts';
import { rpcCall } from '../rpc.ts';

const logged = vi.hoisted((): ResearcherLogEntry[] => []);

const loggedTeams = vi.hoisted((): Array<string | undefined> => []);

vi.mock('../browserLogs.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../browserLogs.ts')>()),
  logResearcher: (
    entry: ResearcherLogEntry,
    scope: { readonly teamId: string | undefined },
  ) => {
    logged.push(entry);
    loggedTeams.push(scope.teamId);
  },
}));

const fetchStub = installFetchStub();

const failureOf = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => {
      throw new Error('the call was expected to fail');
    },
    (error: unknown) => error,
  );

const failureOfStatusCall = (): Promise<unknown> =>
  failureOf(rpcCall('status', undefined));

beforeEach(() => {
  logged.length = 0;
  loggedTeams.length = 0;
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

  it('is logged under the team the failed request was made for, or none', async () => {
    fetchStub.mockImplementation(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );

    await failureOf(rpcCall('studies.list', { teamId: TeamId.make('team-a') }));
    await failureOfStatusCall();

    expect(loggedTeams).toEqual(['team-a', undefined]);
  });

  it('is logged under the team that owns the study a failed request names, once that team is known', async () => {
    fetchStub.mockImplementation(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    const known = StudyId.make('4d0f5f2e-0000-4000-8000-0000000000a1');
    const unknown = StudyId.make('4d0f5f2e-0000-4000-8000-0000000000a2');
    rememberStudyTeam(known, 'team-of-study');

    await failureOf(rpcCall('studies.counts', { studyId: known }));
    await failureOf(rpcCall('studies.counts', { studyId: unknown }));

    expect(loggedTeams).toEqual(['team-of-study', undefined]);
  });

  it('is not logged when the client itself failed rather than the network', async () => {
    fetchStub.mockImplementation(
      async () => new Response('not the rpc wire format', { status: 200 }),
    );

    const failure = await failureOfStatusCall();

    expect(faultCodeOf(failure)).toBe('unknown');
    expect(logged).toEqual([]);
  });
});
