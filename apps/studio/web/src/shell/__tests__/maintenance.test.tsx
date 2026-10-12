// @vitest-environment jsdom
import {
  QueryClientProvider,
  useQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StudioI18nProvider } from '../../i18n/StudioI18nProvider.tsx';
import { fetchDeploymentMode } from '../../lib/deployment.ts';
import {
  createQueryClient,
  refusalRetryDelay,
  retryRefusals,
} from '../../lib/queryClient.ts';
import { rpcCall } from '../../runtime/rpc.ts';
import { installFetchStub, problemResponse } from '../../test/fetchStub.ts';
import MaintenanceNotice from '../MaintenanceNotice.tsx';

const fetchStub = installFetchStub();

const NOTICE =
  'Studio is down for maintenance. This page will carry on by itself once Studio is back.';

const refusalOfStatus = async (response: () => Response): Promise<unknown> => {
  fetchStub.mockImplementation(() => Promise.resolve(response()));
  return rpcCall('status', undefined).then(
    () => {
      throw new Error('the call was expected to fail');
    },
    (error: unknown) => error,
  );
};

const maintenance = (headers?: Record<string, string>) => () =>
  problemResponse(503, { title: 'Down for maintenance', status: 503 }, headers);

function Probe({ queryFn }: { queryFn: () => Promise<string> }) {
  const read = useQuery({ queryKey: ['probe'], queryFn });
  return <p>{read.data ?? 'waiting'}</p>;
}

function renderWith(queryClient: QueryClient, queryFn: () => Promise<string>) {
  return render(
    <QueryClientProvider client={queryClient}>
      <StudioI18nProvider>
        <MaintenanceNotice />
        <Probe queryFn={queryFn} />
      </StudioI18nProvider>
    </QueryClientProvider>,
  );
}

describe('a read refused for maintenance', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says so while it is refused, and carries on past three attempts once the window ends', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const queryFn = vi.fn(async () => {
      attempts += 1;
      if (attempts <= 5) {
        throw await refusalOfStatus(maintenance({ 'retry-after': '0' }));
      }
      return 'answered';
    });

    renderWith(createQueryClient(), queryFn);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByRole('status')).toHaveTextContent(NOTICE);
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(queryFn).toHaveBeenCalledTimes(1);

    for (let retry = 0; retry < 5; retry += 1) {
      await act(() => vi.advanceTimersByTimeAsync(1_000));
    }
    expect(screen.getByText('answered')).toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledTimes(6);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('is not announced for a read nobody is watching any more', async () => {
    const queryFn = vi.fn(async () => {
      throw await refusalOfStatus(maintenance({ 'retry-after': '0' }));
    });
    const queryClient = createQueryClient();
    const view = renderWith(queryClient, queryFn);
    expect(await screen.findByText(NOTICE)).toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <StudioI18nProvider>
          <MaintenanceNotice />
        </StudioI18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});

describe('the retry policy every read inherits', () => {
  it('waits out the interval a maintenance refusal names, for as long as it lasts', async () => {
    const error = await refusalOfStatus(maintenance({ 'retry-after': '120' }));

    expect(retryRefusals(25, error)).toBe(true);
    expect(refusalRetryDelay(1, error)).toBe(120_000);
  });

  it('waits the gate’s own interval when a maintenance refusal names none', async () => {
    const error = await refusalOfStatus(maintenance());

    expect(refusalRetryDelay(1, error)).toBe(30_000);
  });

  it('paces a rate-limited read by its interval, within the usual three retries', async () => {
    const error = await refusalOfStatus(() =>
      problemResponse(
        429,
        { title: 'Too Many Requests' },
        { 'retry-after': '7' },
      ),
    );

    expect(refusalRetryDelay(0, error)).toBe(7_000);
    expect(retryRefusals(2, error)).toBe(true);
    expect(retryRefusals(3, error)).toBe(false);
  });

  it.each([
    [401, 'Unauthorized'],
    [403, 'Forbidden'],
  ])('never retries a %i', async (status, title) => {
    const error = await refusalOfStatus(() =>
      problemResponse(status, { title, status }),
    );

    expect(retryRefusals(0, error)).toBe(false);
  });

  it('retries any other failure three times, backing off', async () => {
    const error = await refusalOfStatus(
      () => new Response('nothing to read here', { status: 500 }),
    );

    expect([0, 1, 2, 3].map((count) => retryRefusals(count, error))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(refusalRetryDelay(0, error)).toBe(1_000);
    expect(refusalRetryDelay(2, error)).toBe(4_000);
  });
});

describe('a guard’s read refused for maintenance', () => {
  it('fails at once rather than holding the navigation for the window', async () => {
    fetchStub.mockImplementation(() =>
      Promise.resolve(maintenance({ 'retry-after': '0' })()),
    );

    await expect(fetchDeploymentMode(createQueryClient())).rejects.toThrow();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
