import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '~/lib/db/types';

const {
  mockGetSettings,
  mockUpdateSettings,
  mockGetAnalyticsClient,
  authKind,
} = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockUpdateSettings: vi.fn(),
  mockGetAnalyticsClient: vi.fn(),
  authKind: { current: 'unlocked' as string },
}));

vi.mock('~/lib/db/api', () => ({
  getSettings: mockGetSettings,
  updateSettings: mockUpdateSettings,
}));

vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => ({ kind: authKind.current }),
}));

vi.mock('../client', () => ({
  getAnalyticsClient: mockGetAnalyticsClient,
}));

import { AnalyticsProvider, useAnalytics } from '../AnalyticsProvider';

function makeClient() {
  return {
    register: vi.fn(),
    identify: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <AnalyticsProvider>{children}</AnalyticsProvider>;
}

afterEach(() => {
  vi.clearAllMocks();
  authKind.current = 'unlocked';
});

describe('AnalyticsProvider opt-out no-network guarantee', () => {
  it('never constructs the client on unlock when analytics is opted out', async () => {
    mockGetSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      analyticsEnabled: false,
    });

    const { result } = renderHook(() => useAnalytics(), { wrapper });

    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());
    // The relay is only contacted via getAnalyticsClient; it must stay unhit.
    expect(mockGetAnalyticsClient).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
    expect(result.current.client).toBeNull();
  });

  it('constructs and opts the client in on unlock when opted in', async () => {
    const client = makeClient();
    mockGetSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      analyticsEnabled: true,
    });
    mockGetAnalyticsClient.mockResolvedValue(client);

    const { result } = renderHook(() => useAnalytics(), { wrapper });

    await waitFor(() => expect(result.current.client).toBe(client));
    expect(mockGetAnalyticsClient).toHaveBeenCalledTimes(1);
    expect(result.current.enabled).toBe(true);
    expect(client.opt_in_capturing).toHaveBeenCalledTimes(1);
    expect(client.opt_out_capturing).not.toHaveBeenCalled();
  });

  it('lazily constructs the client when opting in after an opted-out start', async () => {
    const client = makeClient();
    mockGetSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      analyticsEnabled: false,
    });
    mockUpdateSettings.mockResolvedValue(undefined);
    mockGetAnalyticsClient.mockResolvedValue(client);

    const { result } = renderHook(() => useAnalytics(), { wrapper });

    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());
    expect(mockGetAnalyticsClient).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(mockUpdateSettings).toHaveBeenCalledWith({ analyticsEnabled: true });
    expect(mockGetAnalyticsClient).toHaveBeenCalledTimes(1);
    expect(result.current.enabled).toBe(true);
    expect(result.current.client).toBe(client);
    expect(client.opt_in_capturing).toHaveBeenCalledTimes(1);
  });

  it('does not construct the client when opting out after an opted-out start', async () => {
    mockGetSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      analyticsEnabled: false,
    });
    mockUpdateSettings.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAnalytics(), { wrapper });
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(mockGetAnalyticsClient).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
    expect(result.current.client).toBeNull();
  });

  it('stays opted out while locked, before any settings read', () => {
    authKind.current = 'locked';
    mockGetSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      analyticsEnabled: true,
    });

    const { result } = renderHook(() => useAnalytics(), { wrapper });

    expect(mockGetSettings).not.toHaveBeenCalled();
    expect(mockGetAnalyticsClient).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
  });
});
