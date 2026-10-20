import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { render, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResearcherLogEntry } from '@codaco/studio-contract/schema/browser-logs';
import {
  Maintenance,
  RateLimited,
} from '@codaco/studio-contract/schema/errors';

import { StudioI18nProvider } from '../../i18n/StudioI18nProvider.tsx';
import ErrorScreen from '../../routes/ErrorScreen.tsx';
import UpdateNotice from '../../shell/UpdateNotice.tsx';
import { installRpcHarness } from '../../test/rpcHarness.ts';
import type { ResearcherLogScope } from '../browserLogs.ts';

const logged = vi.hoisted(
  (): Array<{ entry: ResearcherLogEntry; teamId: string | undefined }> => [],
);

const onScreen = vi.hoisted((): { team: ResearcherLogScope } => ({
  team: { teamId: undefined },
}));

vi.mock('../browserLogs.ts', () => ({
  logResearcher: (entry: ResearcherLogEntry, scope: ResearcherLogScope) => {
    logged.push({ entry, teamId: scope.teamId });
  },
}));

vi.mock('../../shell/screenTeamContext.ts', () => ({
  useScreenTeam: () => onScreen.team,
}));

beforeEach(() => {
  logged.length = 0;
  onScreen.team = { teamId: 'team-a' };
});

const errorProps = (error: Error): ErrorComponentProps => ({
  error,
  reset: () => undefined,
});

const screenOf = (error: Error, participant?: boolean) => (
  <QueryClientProvider client={new QueryClient()}>
    <StudioI18nProvider>
      <ErrorScreen {...errorProps(error)} participant={participant} />
    </StudioI18nProvider>
  </QueryClientProvider>
);

const renderScreen = (error: Error, participant?: boolean) =>
  render(screenOf(error, participant));

describe('the error screen', () => {
  it('logs a researcher screen that failed, by its fault code and never its message', async () => {
    renderScreen(new Maintenance({}));
    await waitFor(() => expect(logged).toHaveLength(1));
    expect(logged).toEqual([
      {
        entry: {
          message: 'Screen failed to render',
          level: 'Error',
          attributes: { error_code: 'maintenance' },
        },
        teamId: 'team-a',
      },
    ]);
  });

  it('logs once, under the team on screen when it failed, though the team changes after', async () => {
    const error = new Maintenance({});
    const view = renderScreen(error);
    await waitFor(() => expect(logged).toHaveLength(1));
    onScreen.team = { teamId: 'team-b' };
    view.rerender(screenOf(error));
    await new Promise((done) => setTimeout(done, 50));
    expect(logged.map((record) => record.teamId)).toEqual(['team-a']);
  });

  it('logs nothing as the researcher’s when it stands in on a participant page', async () => {
    renderScreen(new Error('participant page'), true);
    await new Promise((done) => setTimeout(done, 50));
    expect(logged).toEqual([]);
  });
});

describe('the update notice', () => {
  it('logs a failed update check once, by its fault code, under the team on screen when it failed', async () => {
    installRpcHarness({
      'status.updateAvailable': () =>
        Effect.fail(new RateLimited({ retryAfterSeconds: 30 })),
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const notice = () => (
      <QueryClientProvider client={queryClient}>
        <StudioI18nProvider>
          <UpdateNotice />
        </StudioI18nProvider>
      </QueryClientProvider>
    );
    const view = render(notice());
    await waitFor(() => expect(logged).toHaveLength(1));
    onScreen.team = { teamId: 'team-b' };
    view.rerender(notice());
    await new Promise((done) => setTimeout(done, 50));
    expect(logged).toEqual([
      {
        entry: {
          message: 'Update check failed',
          level: 'Warn',
          attributes: { error_code: 'rate_limited' },
        },
        teamId: 'team-a',
      },
    ]);
  });
});
