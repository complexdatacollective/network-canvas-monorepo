import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import type { Rolldown } from 'vite';
import { build } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstanceStatus } from '@codaco/studio-contract/schema/status';
import type { ErrorReport } from '@codaco/studio-contract/schema/telemetry';

import { ResearcherErrorTelemetry } from '../../lib/errorTelemetry.ts';
import { installRpcHarness, type RpcHarness } from '../../test/rpcHarness.ts';
import { type SendReport, useErrorTelemetry } from '../telemetry.ts';

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const SECRET = 'jane.doe@example.org';

const fetchSpy = vi.fn<typeof globalThis.fetch>(async () =>
  Promise.resolve(
    new Response('', {
      status: 200,
      headers: { 'content-type': 'application/ndjson' },
    }),
  ),
);

vi.stubGlobal('fetch', fetchSpy);

const statusWith = (telemetry: boolean): InstanceStatus => ({
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
});

const failure = (): Error => {
  const message = `could not read ${SECRET}\n    at jane_doe (${window.location.origin}/assets/fake.js:1:1)`;
  const error = new TypeError(message);
  error.stack = [
    `TypeError: ${message}`,
    `    at renderStage (${window.location.origin}/assets/index-abc123.js:10:5)`,
    '    at leak (https://evil.example/assets/index-abc123.js:1:1)',
    `    at inline (${window.location.origin}/participant/session/token-abc:3:4)`,
  ].join('\n');
  return error;
};

const raise = (error: unknown) => {
  const observed = () => undefined;
  window.addEventListener('error', observed);
  window.dispatchEvent(new ErrorEvent('error', { error }));
  window.removeEventListener('error', observed);
  window.dispatchEvent(
    Object.assign(new Event('unhandledrejection'), { reason: error }),
  );
};

const settledStatus = async (harness: RpcHarness) => {
  await waitFor(() =>
    expect(harness.calls.map((call) => call.tag)).toContain('status'),
  );
  await new Promise((done) => setTimeout(done, 50));
};

const reportCalls = () =>
  fetchSpy.mock.calls.filter(([, init]) =>
    String(init?.body ?? '').includes('telemetry.report'),
  );

const renderResearcher = (telemetry: boolean) => {
  const harness = installRpcHarness({
    status: () => Effect.succeed(statusWith(telemetry)),
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

beforeEach(() => {
  fetchSpy.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('browser error reporting', () => {
  it('sends nothing while status reports telemetry off', async () => {
    const { harness } = renderResearcher(false);
    await settledStatus(harness);
    raise(failure());
    await new Promise((done) => setTimeout(done, 50));
    expect(reportCalls()).toEqual([]);
  });

  it('reports the type and bundle frames to its own origin once telemetry is on', async () => {
    const { harness } = renderResearcher(true);
    await settledStatus(harness);
    raise(failure());
    await waitFor(() => expect(reportCalls()).toHaveLength(2));
    for (const [input, init] of fetchSpy.mock.calls) {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.href,
      );
      expect(url.origin).toBe(window.location.origin);
      expect(url.pathname.replace(/\/$/, '')).toBe('/rpc');
      expect(init?.credentials).toBe('omit');
    }
    const body = String(reportCalls()[0]?.[1]?.body);
    expect(body).toContain('"type":"TypeError"');
    expect(body).toContain('"surface":"researcher"');
    expect(body).toContain('/assets/index-abc123.js');
    expect(body).toContain('renderStage');
    expect(body).not.toContain('jane');
    expect(body).not.toContain('evil.example');
    expect(body).not.toContain('token-abc');
  });

  it('stops reporting when it unmounts', async () => {
    const { harness, view } = renderResearcher(true);
    await settledStatus(harness);
    view.unmount();
    raise(failure());
    await new Promise((done) => setTimeout(done, 50));
    expect(reportCalls()).toEqual([]);
  });

  it('writes nothing to cookies or storage', async () => {
    const { harness } = renderResearcher(true);
    await settledStatus(harness);
    raise(failure());
    await waitFor(() => expect(reportCalls().length).toBeGreaterThan(0));
    expect(document.cookie).toBe('');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('reports from a participant page only when its session says telemetry is on', async () => {
    const sent: ErrorReport[] = [];
    const send: SendReport = (report) => {
      sent.push(report);
      return Promise.resolve();
    };
    const off = renderHook(() => useErrorTelemetry('participant', false, send));
    raise(failure());
    off.unmount();
    expect(sent).toEqual([]);
    const on = renderHook(() => useErrorTelemetry('participant', true, send));
    raise(failure());
    on.unmount();
    expect(sent.map((report) => report.surface)).toEqual([
      'participant',
      'participant',
    ]);
    expect(sent[0]?.frames).toEqual([
      {
        filename: '/assets/index-abc123.js',
        function: 'renderStage',
        lineno: 10,
        colno: 5,
      },
    ]);
  });
});

describe('the Studio bundle', () => {
  it('contains no posthog-js', { timeout: 120_000 }, async () => {
    const output = await build({
      root: WEB_ROOT,
      configFile: resolve(WEB_ROOT, 'vite.config.ts'),
      logLevel: 'silent',
      build: { write: false, emptyOutDir: false },
    });
    const outputs: Rolldown.RolldownOutput[] = Array.isArray(output)
      ? output
      : 'output' in output
        ? [output]
        : [];
    const modules = outputs.flatMap((result) =>
      result.output.flatMap((chunk) =>
        chunk.type === 'chunk' ? chunk.moduleIds : [],
      ),
    );
    expect(modules.length).toBeGreaterThan(0);
    expect(modules.some((id) => id.includes('packages/interview/'))).toBe(true);
    expect(modules.filter((id) => id.includes('posthog-js'))).toEqual([]);
  });
});
