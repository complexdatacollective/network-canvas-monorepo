import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { render, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { RpcClientError } from 'effect/rpc';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResearcherLogEntry } from '@codaco/studio-contract/schema/browser-logs';
import {
  Forbidden,
  Maintenance,
  RateLimited,
} from '@codaco/studio-contract/schema/errors';

import { StudioI18nProvider } from '../../i18n/StudioI18nProvider.tsx';
import ErrorScreen from '../../routes/ErrorScreen.tsx';
import UpdateNotice from '../../shell/UpdateNotice.tsx';
import { installRpcHarness } from '../../test/rpcHarness.ts';
import { reportRpcFailure } from '../rpc.ts';

const logged = vi.hoisted((): ResearcherLogEntry[] => []);

vi.mock('../browserLogs.ts', () => ({
  logResearcher: (entry: ResearcherLogEntry) => {
    logged.push(entry);
  },
  logParticipant: () => undefined,
  startBrowserLogs: () => () => undefined,
}));

beforeEach(() => {
  logged.length = 0;
});

const transportFailure = () =>
  new RpcClientError.RpcClientError({
    reason: new RpcClientError.RpcClientDefect({
      message: 'the connection dropped',
      cause: new TypeError('Failed to fetch'),
    }),
  });

describe('rpc failures', () => {
  it('log a request that never reached the server, and no refusal', () => {
    reportRpcFailure(new Forbidden({}));
    reportRpcFailure(transportFailure());
    expect(logged).toEqual([
      {
        message: 'Request to the server failed',
        level: 'Warn',
        attributes: { error_code: 'transport' },
      },
    ]);
  });
});

const errorProps = (error: Error): ErrorComponentProps => ({
  error,
  reset: () => undefined,
});

const renderScreen = (error: Error, participant?: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StudioI18nProvider>
        <ErrorScreen {...errorProps(error)} participant={participant} />
      </StudioI18nProvider>
    </QueryClientProvider>,
  );

describe('the error screen', () => {
  it('logs a researcher screen that failed, by its fault code and never its message', async () => {
    renderScreen(new Maintenance({}));
    await waitFor(() => expect(logged).toHaveLength(1));
    expect(logged).toEqual([
      {
        message: 'Screen failed to render',
        level: 'Error',
        attributes: { error_code: 'maintenance' },
      },
    ]);
  });

  it('logs nothing as the researcher’s when it stands in on a participant page', async () => {
    renderScreen(new Error('participant page'), true);
    await new Promise((done) => setTimeout(done, 50));
    expect(logged).toEqual([]);
  });
});

describe('the update notice', () => {
  it('logs a failed update check by its fault code', async () => {
    installRpcHarness({
      'status.updateAvailable': () =>
        Effect.fail(new RateLimited({ retryAfterSeconds: 30 })),
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <StudioI18nProvider>
          <UpdateNotice />
        </StudioI18nProvider>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(logged).toContainEqual({
        message: 'Update check failed',
        level: 'Warn',
        attributes: { error_code: 'rate_limited' },
      }),
    );
  });
});
