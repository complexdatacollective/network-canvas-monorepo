import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, waitFor } from '@testing-library/react';
import { Effect, Schema } from 'effect';
import { StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PARTICIPANT_SESSION_HEADER } from '@codaco/studio-contract/middleware/session';
import {
  BROWSER_LOG_PATHS,
  BrowserLogsBody,
  browserLogRecords,
  type LogLevelName,
} from '@codaco/studio-contract/schema/browser-logs';
import type { InstanceStatus } from '@codaco/studio-contract/schema/status';

import { ResearcherErrorTelemetry } from '../../lib/errorTelemetry.ts';
import {
  useParticipantLogs,
  useStatusParticipantLogs,
} from '../../participant/participantLogs.ts';
import { installRpcHarness } from '../../test/rpcHarness.ts';
import {
  createBrowserLogHandle,
  logResearcher,
  setResearcherLogTeam,
} from '../browserLogs.ts';

const fetchSpy = vi.fn<typeof globalThis.fetch>(async () =>
  Promise.resolve(new Response(null, { status: 204 })),
);

vi.stubGlobal('fetch', fetchSpy);

const statusWith = (
  telemetry: boolean,
  logLevel: LogLevelName = 'Info',
): InstanceStatus => ({
  name: 'Network Canvas Studio',
  version: '1.2.3',
  auth: {
    enabled: true,
    magicLink: true,
    emailAndPassword: true,
    socialProviders: [],
  },
  deployment: { mode: 'self-hosted', billing: false },
  setup: { required: false },
  telemetry,
  logLevel,
});

const urlOf = (input: Parameters<typeof globalThis.fetch>[0]): URL =>
  new URL(
    input instanceof Request ? input.url : String(input),
    window.location.href,
  );

const logCalls = (path: string) =>
  fetchSpy.mock.calls.filter(([input]) => urlOf(input).pathname === path);

const decodeBody = Schema.decodeUnknownSync(
  Schema.fromJsonString(BrowserLogsBody),
  { onExcessProperty: 'error' },
);

const recordsSent = (path: string) =>
  logCalls(path).flatMap(([, init]) =>
    browserLogRecords(decodeBody(String(init?.body))),
  );

const EXPORT_WAIT_MS = 1600;

const exportWindow = () =>
  new Promise((done) => setTimeout(done, EXPORT_WAIT_MS));

const renderResearcher = (telemetry: boolean, logLevel?: LogLevelName) => {
  const harness = installRpcHarness({
    status: () => Effect.succeed(statusWith(telemetry, logLevel)),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ResearcherErrorTelemetry />
    </QueryClientProvider>,
  );
  return { harness, view };
};

const statusSettled = async (harness: {
  readonly calls: ReadonlyArray<{ readonly tag: string }>;
}) => {
  await waitFor(() =>
    expect(harness.calls.map((call) => call.tag)).toContain('status'),
  );
  await new Promise((done) => setTimeout(done, 50));
};

const SESSION = 'participant-session-token';

beforeEach(() => {
  fetchSpy.mockClear();
  setResearcherLogTeam(undefined);
});

afterEach(() => {
  setResearcherLogTeam(undefined);
});

describe('researcher logs', () => {
  it('sends no record while status reports telemetry off', async () => {
    const { harness, view } = renderResearcher(false);
    await statusSettled(harness);
    logResearcher({
      message: 'Editing lock lost',
      level: 'Warn',
      attributes: {},
    });
    await exportWindow();
    view.unmount();
    expect(logCalls(BROWSER_LOG_PATHS.researcher)).toEqual([]);
  });

  it('sends catalogued records to its own origin, each with the team on screen when it was logged', async () => {
    const { harness, view } = renderResearcher(true);
    await statusSettled(harness);
    setResearcherLogTeam('team-on-screen');
    logResearcher({
      message: 'Request to the server failed',
      level: 'Warn',
      attributes: { error_code: 'transport' },
    });
    setResearcherLogTeam('team-moved-to');
    logResearcher({
      message: 'Request to the server failed',
      level: 'Warn',
      attributes: { error_code: 'transport' },
    });
    await waitFor(
      () =>
        expect(logCalls(BROWSER_LOG_PATHS.researcher).length).toBeGreaterThan(
          0,
        ),
      { timeout: 3000 },
    );
    view.unmount();
    for (const [input, init] of fetchSpy.mock.calls) {
      expect(urlOf(input).origin).toBe(window.location.origin);
      if (urlOf(input).pathname === BROWSER_LOG_PATHS.researcher) {
        expect(init?.credentials).toBe('same-origin');
      }
    }
    expect(
      recordsSent(BROWSER_LOG_PATHS.researcher).map((record) => ({
        severityText: record.severityText,
        body: record.body,
        attributes: record.attributes,
      })),
    ).toEqual([
      {
        severityText: 'Warn',
        body: { stringValue: 'Request to the server failed' },
        attributes: [
          { key: 'error_code', value: { stringValue: 'transport' } },
          { key: 'team_id', value: { stringValue: 'team-on-screen' } },
        ],
      },
      {
        severityText: 'Warn',
        body: { stringValue: 'Request to the server failed' },
        attributes: [
          { key: 'error_code', value: { stringValue: 'transport' } },
          { key: 'team_id', value: { stringValue: 'team-moved-to' } },
        ],
      },
    ]);
  });

  it('drops what is logged after the researcher app stops, rather than holding it for the next start', async () => {
    const first = renderResearcher(true);
    await statusSettled(first.harness);
    first.view.unmount();
    logResearcher({
      message: 'Editing lock lost',
      level: 'Warn',
      attributes: {},
    });
    const second = renderResearcher(true);
    await statusSettled(second.harness);
    await exportWindow();
    second.view.unmount();
    expect(logCalls(BROWSER_LOG_PATHS.researcher)).toEqual([]);
  });

  it('does not send a record below the configured level', async () => {
    const { harness, view } = renderResearcher(true, 'Error');
    await statusSettled(harness);
    logResearcher({
      message: 'Editing lock refused',
      level: 'Warn',
      attributes: {},
    });
    logResearcher({
      message: 'Screen failed to render',
      level: 'Error',
      attributes: { error_code: 'unknown' },
    });
    await waitFor(
      () =>
        expect(logCalls(BROWSER_LOG_PATHS.researcher).length).toBeGreaterThan(
          0,
        ),
      { timeout: 3000 },
    );
    view.unmount();
    expect(
      recordsSent(BROWSER_LOG_PATHS.researcher).map(
        (record) => record.body.stringValue,
      ),
    ).toEqual(['Screen failed to render']);
  });
});

describe('a log handle', () => {
  it('holds records only for itself until configured, and drops them once closed', async () => {
    const earlier = createBrowserLogHandle('participant');
    const later = createBrowserLogHandle('participant');
    earlier.log({
      message: 'Participant connection lost',
      level: 'Warn',
      attributes: { stage_index: 0, interface_type: 'Information' },
    });
    earlier.close();
    earlier.log({
      message: 'Participant connection lost',
      level: 'Warn',
      attributes: { stage_index: 0, interface_type: 'Information' },
    });
    later.configure({
      enabled: true,
      level: 'Info',
      credentials: 'omit',
      headers: () => ({}),
    });
    await exportWindow();
    later.close();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('leaving the page', () => {
  it('sends what is buffered at once, on a request that may outlive the page', async () => {
    const page = new EventTarget();
    const handle = createBrowserLogHandle('participant', page);
    handle.configure({
      enabled: true,
      level: 'Info',
      credentials: 'omit',
      headers: () => ({}),
    });
    handle.log({
      message: 'Answer save failed',
      level: 'Error',
      attributes: {
        stage_index: 1,
        interface_type: 'Sociogram',
        error_code: 'transport',
        attempt_count: 1,
      },
    });
    page.dispatchEvent(new Event('pagehide'));
    await waitFor(
      () =>
        expect(logCalls(BROWSER_LOG_PATHS.participant).length).toBeGreaterThan(
          0,
        ),
      { timeout: 300 },
    );
    handle.close();
    const [[, init]] = logCalls(BROWSER_LOG_PATHS.participant) as [
      Parameters<typeof globalThis.fetch>,
    ];
    expect(init?.keepalive).toBe(true);
  });
});

describe('a record logged while the page is leaving', () => {
  const answerSaveFailed = {
    message: 'Answer save failed',
    level: 'Error',
    attributes: {
      stage_index: 1,
      interface_type: 'Sociogram',
      error_code: 'transport',
      attempt_count: 1,
    },
  } as const;

  it('is sent at once, though it came after the page was hidden', async () => {
    const page = new EventTarget();
    const handle = createBrowserLogHandle('participant', page);
    handle.configure({
      enabled: true,
      level: 'Info',
      credentials: 'omit',
      headers: () => ({}),
    });
    page.dispatchEvent(new Event('pagehide'));
    handle.log(answerSaveFailed);
    await waitFor(
      () =>
        expect(logCalls(BROWSER_LOG_PATHS.participant).length).toBeGreaterThan(
          0,
        ),
      { timeout: 300 },
    );
    handle.close();
    const [[, init]] = logCalls(BROWSER_LOG_PATHS.participant) as [
      Parameters<typeof globalThis.fetch>,
    ];
    expect(init?.keepalive).toBe(true);
  });

  it('waits for the interval again once the page is shown', async () => {
    const page = new EventTarget();
    const handle = createBrowserLogHandle('participant', page);
    handle.configure({
      enabled: true,
      level: 'Info',
      credentials: 'omit',
      headers: () => ({}),
    });
    page.dispatchEvent(new Event('pagehide'));
    page.dispatchEvent(new Event('pageshow'));
    handle.log(answerSaveFailed);
    await new Promise((done) => setTimeout(done, 300));
    expect(logCalls(BROWSER_LOG_PATHS.participant)).toEqual([]);
    handle.close();
    await new Promise((done) => setTimeout(done, 100));
  });
});

describe('participant logs', () => {
  it('sends nothing while the session reports telemetry off', async () => {
    const view = renderHook(() => useParticipantLogs(SESSION, null));
    view.result.current({
      message: 'Participant connection lost',
      level: 'Warn',
      attributes: { stage_index: 1, interface_type: 'Sociogram' },
    });
    await exportWindow();
    view.unmount();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends a catalogued record with the session header and no credentials', async () => {
    const view = renderHook(() => useParticipantLogs(SESSION, 'Info'));
    view.result.current({
      message: 'Participant connection restored',
      level: 'Info',
      attributes: {
        stage_index: 1,
        interface_type: 'Sociogram',
        duration_ms: 4200,
      },
    });
    await waitFor(
      () =>
        expect(logCalls(BROWSER_LOG_PATHS.participant).length).toBeGreaterThan(
          0,
        ),
      { timeout: 3000 },
    );
    view.unmount();
    const [[input, init]] = logCalls(BROWSER_LOG_PATHS.participant) as [
      Parameters<typeof globalThis.fetch>,
    ];
    expect(urlOf(input).origin).toBe(window.location.origin);
    expect(init?.credentials).toBe('omit');
    expect(new Headers(init?.headers).get(PARTICIPANT_SESSION_HEADER)).toBe(
      SESSION,
    );
    expect(recordsSent(BROWSER_LOG_PATHS.participant)).toEqual([
      expect.objectContaining({
        severityText: 'Info',
        body: { stringValue: 'Participant connection restored' },
        attributes: [
          { key: 'stage_index', value: { intValue: 1 } },
          { key: 'interface_type', value: { stringValue: 'Sociogram' } },
          { key: 'duration_ms', value: { intValue: 4200 } },
        ],
      }),
    ]);
  });
});

describe('participant logs under StrictMode', () => {
  const connectionLost = {
    message: 'Participant connection lost',
    level: 'Warn',
    attributes: { stage_index: 1, interface_type: 'Sociogram' },
  } as const;

  it('keeps logging after the effect is set up, cleaned up and set up again', async () => {
    const view = renderHook(() => useParticipantLogs(SESSION, 'Info'), {
      wrapper: StrictMode,
    });
    view.result.current(connectionLost);
    await waitFor(
      () => expect(recordsSent(BROWSER_LOG_PATHS.participant)).toHaveLength(1),
      { timeout: 3000 },
    );
    view.unmount();
  });

  it('sends a session failure logged from an effect exactly once, once status answers', async () => {
    const view = renderHook(
      () => {
        const log = useStatusParticipantLogs(SESSION, async () => ({
          telemetry: true,
          logLevel: 'Info',
        }));
        useEffect(() => {
          log({
            message: 'Interview session failed to load',
            level: 'Error',
            attributes: { error_code: 'session_ended' },
          });
        }, [log]);
      },
      { wrapper: StrictMode },
    );
    await waitFor(
      () => expect(recordsSent(BROWSER_LOG_PATHS.participant)).toHaveLength(1),
      { timeout: 3000 },
    );
    await exportWindow();
    view.unmount();
    expect(recordsSent(BROWSER_LOG_PATHS.participant)).toHaveLength(1);
  });
});

const PARTICIPANT_SOURCE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../participant',
);

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(name) ? [path] : [];
  });

describe('participant pages', () => {
  it('log only through the catalogue', () => {
    const files = sourceFiles(PARTICIPANT_SOURCE);
    expect(files.length).toBeGreaterThan(0);
    const offending = files.filter((path) =>
      /\bEffect\.log|\bconsole\.|\bLogger\./.test(readFileSync(path, 'utf8')),
    );
    expect(offending).toEqual([]);
  });
});
