import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Effect, Redacted } from 'effect';
import { useSyncExternalStore } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { BROWSER_LOG_PATHS } from '@codaco/studio-contract/schema/browser-logs';
import { StudyId } from '@codaco/studio-contract/schema/ids';

import { studioRootOptions } from '../../rootOptions.ts';
import { createAppRouter } from '../../router.tsx';
import { installFetchStub, requestUrl } from '../../test/fetchStub.ts';
import { installParticipantHarness } from '../../test/participantHarness.ts';
import {
  isStageErrorBoundary,
  reportCaughtStageCrash,
  reportStageCrashesTo,
} from '../stageCrashes.ts';

const crash = vi.hoisted(() => {
  let now = false;
  const listeners = new Set<() => void>();
  return {
    get: () => now,
    set: (value: boolean) => {
      now = value;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock(
  '../../../../../../packages/interview/src/interfaces/Information/Information',
  () => ({
    default: function CrashingStage() {
      const crashing = useSyncExternalStore(crash.subscribe, crash.get);
      if (crashing) throw new Error('the stage could not render');
      return <h1>Welcome to the study</h1>;
    },
  }),
);

const fetchStub = installFetchStub();

const SESSION = 's'.repeat(32);

const sessionPayload = (analytics: boolean) => ({
  analytics,
  logLevel: 'Info' as const,
  studyId: StudyId.make('00000000-0000-4000-8000-000000000002'),
  holderEpoch: 2,
  revision: '5',
  stageIndex: 0,
  stageId: 'welcome',
  session: {
    id: 'session-1',
    startTime: '2026-10-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-10-01T00:00:00.000Z',
    network: Redacted.make({
      nodes: [],
      edges: [],
      ego: { _uid: 'ego-1', attributes: {} },
    }),
    stageMetadata: Redacted.make({}),
  },
  protocol: Redacted.make({
    id: 'version-1',
    hash: 'protocol-hash',
    importedAt: '2026-10-01T00:00:00.000Z',
    name: 'Stage crash protocol',
    schemaVersion: 8,
    codebook: { ego: { variables: {} }, node: {}, edge: {} },
    assets: [],
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome to the study',
        items: [],
      },
    ],
  }),
});

const LOG_PATH = BROWSER_LOG_PATHS.participant;

const logPosts = () =>
  fetchStub.mock.calls.filter(
    ([input]) =>
      new URL(requestUrl(input), window.location.href).pathname === LOG_PATH,
  );

const stageCrashEntries = () =>
  logPosts().flatMap(([, init]) =>
    String(init?.body).split('Stage failed to render').slice(1),
  );

const renderSession = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/session/${SESSION}`] }),
    queryClient,
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
    studioRootOptions,
  );
};

const exportWindow = () =>
  act(() => new Promise((done) => setTimeout(done, 1600)));

beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList =>
    Object.assign(new EventTarget(), {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  );
});

beforeEach(() => {
  crash.set(false);
  fetchStub.mockImplementation(async () => new Response(null, { status: 204 }));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('a stage that fails to render in a participant session', () => {
  it('is logged once when it fails on its very first render, before the interview’s tracker exists', async () => {
    installParticipantHarness({
      'participant.session': () => Effect.succeed(sessionPayload(true)),
      'participant.analytics': () => Effect.void,
    });
    crash.set(true);

    renderSession();
    await waitFor(() => expect(stageCrashEntries()).toHaveLength(1), {
      timeout: 15_000,
    });
    await exportWindow();

    expect(stageCrashEntries()).toHaveLength(1);
    expect(String(logPosts()[0]?.[1]?.body)).toContain(
      '"stringValue":"Information"',
    );
  });

  it('is logged once when it fails after the interview’s tracker has resolved', async () => {
    const harness = installParticipantHarness({
      'participant.session': () => Effect.succeed(sessionPayload(true)),
      'participant.analytics': () => Effect.void,
    });

    renderSession();
    await screen.findByRole(
      'heading',
      { name: 'Welcome to the study' },
      { timeout: 15_000 },
    );
    await waitFor(
      () => expect(JSON.stringify(harness.calls)).toContain('stage_entered'),
      { timeout: 4000 },
    );
    act(() => crash.set(true));

    await waitFor(() => expect(stageCrashEntries()).toHaveLength(1), {
      timeout: 3000,
    });
    await exportWindow();

    expect(stageCrashEntries()).toHaveLength(1);
  });
});

describe('a caught error', () => {
  it('reaches the session only from the interview’s stage boundary, and only while a session is listening', () => {
    const reported: string[] = [];
    const stop = reportStageCrashesTo(() => reported.push('stage'));
    const stageBoundary = {
      props: { captureException: () => undefined, isOffline: false },
    };

    reportCaughtStageCrash({ props: { reset: () => undefined } });
    reportCaughtStageCrash(undefined);
    reportCaughtStageCrash(stageBoundary);
    stop();
    reportCaughtStageCrash(stageBoundary);

    expect(reported).toEqual(['stage']);
    expect(isStageErrorBoundary({ props: { isOffline: false } })).toBe(false);
  });
});
