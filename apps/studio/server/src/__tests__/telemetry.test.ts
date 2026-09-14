import { ORPCError } from '@orpc/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildTelemetryReport,
  exceptionProperties,
  TelemetryReportSchema,
} from '@codaco/studio-rpc/telemetry';

import { createApp } from '../app.ts';
import { readEnv } from '../env.ts';
import { installFatalErrorHandlers } from '../fatal-errors.ts';
import { createServerTelemetry } from '../telemetry.ts';
import { stubAuthService } from './support/auth.ts';
import { createRpcClient } from './support/rpc.ts';

const CANARY =
  'participant-PiiCanary@example.test?protocol=SecretProtocol&token=SecretToken';
const CHUNK = 'a25f69b0-49d7-4b5e-9720-6ff565d88bd4';
const context = {
  mode: 'self-hosted',
  runtime: 'both',
  version: '0.2.0',
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function privateError() {
  const error = Object.assign(new Error(CANARY, { cause: new Error(CANARY) }), {
    participantId: CANARY,
    protocol: { nodes: [CANARY] },
    headers: { authorization: CANARY },
  });
  error.name = CANARY;
  error.stack = `${CANARY}\n    at ${CANARY} (https://institution.example/assets/app.js?${CANARY}:21:7)\n    at ${CANARY} (file:///private/${CANARY}/node_modules/provider.js:32:9)`;
  vi.stubGlobal('_posthogChunkIds', {
    [`Error\n    at https://institution.example/assets/app.js?${CANARY}:1:1`]:
      CHUNK,
  });
  return error;
}

describe('Studio diagnostic boundary', () => {
  it('keeps useful chunk coordinates while discarding messages, URLs, paths, identifiers and causes', () => {
    const report = buildTelemetryReport(
      context,
      'server_request',
      privateError(),
    );
    expect(report?.studio_frames).toEqual([
      {
        platform: 'node:javascript',
        filename: 'studio.js',
        function: 'compiled',
        chunk_id: CHUNK,
        lineno: 21,
        colno: 7,
      },
    ]);
    expect(JSON.stringify(exceptionProperties(report!))).not.toMatch(
      /PiiCanary|Secret|institution|private|provider|authorization|participantId|protocol/,
    );
    expect(
      exceptionProperties(report!).$exception_list[0]?.mechanism.handled,
    ).toBe(true);
  });

  it('does not interpret arbitrary filenames as trusted compiled code', () => {
    vi.stubGlobal('_posthogChunkIds', undefined);
    const report = buildTelemetryReport(context, 'server_request', {
      stack: `Error\n    at https://example.test/assets/${CANARY}.js:1:2`,
    });
    expect(report?.studio_frames).toEqual([]);
  });

  it('bounds traces and supports Firefox locations without passing function names', () => {
    vi.stubGlobal('_posthogChunkIds', {
      'Error\ninit@https://site.test/assets/app.js:1:2': CHUNK,
    });
    const report = buildTelemetryReport(
      { ...context, runtime: 'client' },
      'client_error',
      {
        stack: `Error\n${Array.from({ length: 100 }, () => 'secret@https://site.test/assets/app.js:10:5').join('\n')}`,
      },
    );
    expect(report?.studio_frames).toHaveLength(12);
    expect(report?.studio_frames[0]?.platform).toBe('web:javascript');
    expect(JSON.stringify(report)).not.toContain('secret');
  });

  it('handles hostile thrown values without reading their messages or conversion hooks', () => {
    const values = [
      null,
      CANARY,
      {
        get stack() {
          throw new Error(CANARY);
        },
      },
      new Proxy(
        {},
        {
          has() {
            throw new Error(CANARY);
          },
        },
      ),
    ];
    expect(values.length).toBeGreaterThan(0);
    for (const value of values)
      expect(
        buildTelemetryReport(context, 'server_worker', value)?.studio_frames,
      ).toEqual([]);
    const message = vi.fn(() => {
      throw new Error(CANARY);
    });
    const report = buildTelemetryReport(context, 'server_worker', {
      get message() {
        return message();
      },
      toString: message,
      toJSON: message,
    });
    expect(report?.studio_diagnostic).toBe('server_worker');
    expect(message).not.toHaveBeenCalled();
  });

  it('rebuilds nested SDK properties and refuses non-finite metadata', () => {
    const report = buildTelemetryReport(
      context,
      'server_request',
      privateError(),
    )!;
    const parsed = TelemetryReportSchema.parse({
      ...report,
      $current_url: CANARY,
      $set: { email: CANARY },
      studio_frames: report.studio_frames.map((frame) => ({
        ...frame,
        vars: { body: CANARY },
        context_line: CANARY,
      })),
    });
    expect(JSON.stringify(parsed)).not.toContain(CANARY);
    expect(
      TelemetryReportSchema.safeParse({ ...report, studio_runtime: CANARY })
        .success,
    ).toBe(false);
    expect(
      TelemetryReportSchema.safeParse({ ...report, studio_version: CANARY })
        .success,
    ).toBe(false);
  });
});

describe('runtime configuration and owned hooks', () => {
  it.each(['managed', 'self-hosted'])(
    'defaults on and really opts out in %s, including the function and validation-skip lanes',
    async (mode) => {
      vi.stubEnv('EMAIL_FROM', '');
      vi.stubEnv(
        'STUDIO_DATABASE_ALLOWED_LOGINS',
        '["studio_migrator","studio_runtime"]',
      );
      vi.stubEnv('STUDIO_DEPLOYMENT_MODE', mode);
      vi.stubEnv('STUDIO_TELEMETRY', '');
      expect(readEnv().telemetry).toBe(true);
      for (const skip of ['false', 'true']) {
        vi.stubEnv('SKIP_ENV_VALIDATION', skip);
        vi.stubEnv('STUDIO_TELEMETRY', 'false');
        for (const options of [{}, { withoutDatabaseOrAuth: true }]) {
          const env = readEnv(options);
          expect(env.telemetry).toBe(false);
          expect(
            (await createRpcClient(createApp(env)).status()).telemetry,
          ).toBe(false);
        }
      }
    },
  );

  it('adds and removes only the executable failure-policy hooks', () => {
    const exceptionCount = process.listenerCount('uncaughtException');
    const rejectionCount = process.listenerCount('unhandledRejection');
    const remove = installFatalErrorHandlers({
      telemetry: () => undefined,
      stopServing() {},
    });
    expect(process.listenerCount('uncaughtException')).toBe(exceptionCount + 1);
    expect(process.listenerCount('unhandledRejection')).toBe(
      rejectionCount + 1,
    );
    remove();
    remove();
    expect(process.listenerCount('uncaughtException')).toBe(exceptionCount);
    expect(process.listenerCount('unhandledRejection')).toBe(rejectionCount);
  });

  it('does not construct the server SDK, create timers or attach listeners when disabled', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const on = vi.spyOn(process, 'on');
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const reporter = await createServerTelemetry(false, context);
    reporter.capture('server_worker', privateError());
    await reporter.flush();
    await reporter.close();
    expect(interval).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(on).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('RPC exception interception', () => {
  it('reports procedure failures while retaining server errors and expected unauthenticated responses', async () => {
    const capture = vi.fn();
    const telemetry = { capture, async flush() {}, async close() {} };
    const env = readEnv({ withoutDatabaseOrAuth: true });
    const unauthorized = createRpcClient(
      createApp(env, {
        telemetry,
        auth: stubAuthService(),
      }),
    );
    await expect(unauthorized.me()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(capture).not.toHaveBeenCalled();
    const failures = [
      privateError(),
      new ORPCError('SERVICE_UNAVAILABLE', { message: CANARY }),
    ];
    for (const failure of failures) {
      const auth = stubAuthService({
        getSession: async () => ({
          kind: 'user',
          userId: CANARY,
          sessionId: CANARY,
          email: CANARY,
          emailVerified: true,
          name: CANARY,
          locale: null,
        }),
        listMemberships: async () => {
          throw failure;
        },
      });
      const client = createRpcClient(createApp(env, { auth, telemetry }));
      await expect(client.me()).rejects.toMatchObject({
        code:
          failure instanceof ORPCError
            ? 'SERVICE_UNAVAILABLE'
            : 'INTERNAL_SERVER_ERROR',
      });
      expect(capture).toHaveBeenLastCalledWith('server_rpc', failure);
    }
    expect(capture).toHaveBeenCalledTimes(2);
  });
});

describe('the real server SDK', () => {
  it('sends a sanitized handled exception, refuses capture after close, and never installs autocapture listeners', async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        requests.push(String(init.body));
        return Response.json({ status: 1 });
      }),
    );
    const exceptionCount = process.listenerCount('uncaughtException');
    const rejectionCount = process.listenerCount('unhandledRejection');
    const { PostHog } = await import('posthog-node');
    const sdkCapture = vi.spyOn(PostHog.prototype, 'captureException');
    const reporter = await createServerTelemetry(true, context);
    try {
      const error = privateError();
      const app = createApp(readEnv({ withoutDatabaseOrAuth: true }), {
        telemetry: reporter,
      });
      app.get('/crash', () => {
        throw error;
      });
      expect(
        (
          await app.request(`/crash?${CANARY}`, {
            headers: { authorization: CANARY },
          })
        ).status,
      ).toBe(500);
      await reporter.flush();
      const sdkError = sdkCapture.mock.calls[0]?.[0];
      expect(sdkError).toBeInstanceOf(Error);
      expect(sdkError).toMatchObject({ message: 'server_request', stack: '' });
      expect(sdkError).not.toHaveProperty('cause');
      expect(sdkError).not.toHaveProperty('protocol');
      expect(requests).toHaveLength(1);
      // Compression is disabled on this low-volume channel, so the oracle
      // examines actual SDK JSON, not the application's pre-SDK object.
      const payload = requests[0]!;
      expect(payload).toContain('server_request');
      expect(payload).toContain(CHUNK);
      expect(payload).not.toMatch(
        /PiiCanary|Secret|institution|private|provider|authorization/,
      );
      expect(process.listenerCount('uncaughtException')).toBe(exceptionCount);
      expect(process.listenerCount('unhandledRejection')).toBe(rejectionCount);
    } finally {
      await reporter.close();
    }
    const sent = requests.length;
    reporter.capture('server_worker', new Error(CANARY));
    await reporter.flush();
    expect(requests).toHaveLength(sent);
  });
});
