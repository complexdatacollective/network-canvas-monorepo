import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, type StoredSettings } from '~/lib/db/types';

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
    capture: vi.fn(),
    captureException: vi.fn(),
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
    expect(client.register).toHaveBeenCalledWith({
      app: 'interviewer',
      $app_name: 'Interviewer',
      installation_id: expect.any(String),
      host_version: expect.any(String),
      $app_version: expect.any(String),
    });
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

describe('AnalyticsProvider reports made before init settles', () => {
  it('delivers held reports in order once the opted-in client loads', async () => {
    const client = makeClient();
    const delivered: string[] = [];
    client.captureException.mockImplementation(() => {
      delivered.push('exception');
    });
    client.capture.mockImplementation((event: string) => {
      delivered.push(event);
    });
    const settings = Promise.withResolvers<StoredSettings>();
    const clientLoad = Promise.withResolvers<typeof client>();
    mockGetSettings.mockReturnValue(settings.promise);
    mockGetAnalyticsClient.mockReturnValue(clientLoad.promise);

    const { result } = renderHook(() => useAnalytics(), { wrapper });
    const error = new Error('stored interview unreadable');
    result.current.captureException(error, { feature: 'interview-load' });

    await act(async () => {
      settings.resolve({ ...DEFAULT_SETTINGS, analyticsEnabled: true });
    });
    await waitFor(() => expect(mockGetAnalyticsClient).toHaveBeenCalled());
    result.current.track('app_event', { step: 1 });
    expect(delivered).toEqual([]);

    await act(async () => {
      clientLoad.resolve(client);
    });

    await waitFor(() => expect(result.current.client).toBe(client));
    expect(delivered).toEqual(['exception', 'app_event']);
    expect(client.captureException).toHaveBeenCalledWith(error, {
      feature: 'interview-load',
    });
    expect(client.capture).toHaveBeenCalledWith('app_event', { step: 1 });
  });

  it('holds at most 20 reports, dropping any beyond that', async () => {
    const client = makeClient();
    const settings = Promise.withResolvers<StoredSettings>();
    mockGetSettings.mockReturnValue(settings.promise);
    mockGetAnalyticsClient.mockResolvedValue(client);

    const { result } = renderHook(() => useAnalytics(), { wrapper });
    for (let i = 0; i < 25; i += 1) result.current.track(`event_${i}`);

    await act(async () => {
      settings.resolve({ ...DEFAULT_SETTINGS, analyticsEnabled: true });
    });

    await waitFor(() => expect(result.current.client).toBe(client));
    expect(client.capture).toHaveBeenCalledTimes(20);
    expect(client.capture).toHaveBeenNthCalledWith(1, 'event_0', undefined);
    expect(client.capture).toHaveBeenLastCalledWith('event_19', undefined);
  });

  it('never delivers reports held while the stored preference is off, even after a later opt-in', async () => {
    const client = makeClient();
    const settings = Promise.withResolvers<StoredSettings>();
    mockGetSettings.mockReturnValue(settings.promise);
    mockUpdateSettings.mockResolvedValue(undefined);
    mockGetAnalyticsClient.mockResolvedValue(client);

    const { result } = renderHook(() => useAnalytics(), { wrapper });
    result.current.captureException(new Error('before consent is known'));
    result.current.track('before_consent_is_known');

    await act(async () => {
      settings.resolve({ ...DEFAULT_SETTINGS, analyticsEnabled: false });
    });
    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.client).toBe(client);
    expect(client.captureException).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();

    // The opted-in client does deliver: only the held reports were discarded.
    const afterOptIn = new Error('after opt-in');
    result.current.captureException(afterOptIn);
    expect(client.captureException).toHaveBeenCalledTimes(1);
    expect(client.captureException).toHaveBeenCalledWith(afterOptIn, undefined);
  });

  it('delivers held reports when the user opts in before init settles', async () => {
    const client = makeClient();
    mockGetSettings.mockReturnValue(new Promise<StoredSettings>(() => {}));
    mockUpdateSettings.mockResolvedValue(undefined);
    mockGetAnalyticsClient.mockResolvedValue(client);

    const { result } = renderHook(() => useAnalytics(), { wrapper });
    const error = new Error('held');
    result.current.captureException(error);

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(client.captureException).toHaveBeenCalledTimes(1);
    expect(client.captureException).toHaveBeenCalledWith(error, undefined);
  });

  it('discards held reports when the user opts out before init settles', async () => {
    const client = makeClient();
    const settings = Promise.withResolvers<StoredSettings>();
    mockGetSettings.mockReturnValue(settings.promise);
    mockUpdateSettings.mockResolvedValue(undefined);
    mockGetAnalyticsClient.mockResolvedValue(client);

    const { result } = renderHook(() => useAnalytics(), { wrapper });
    result.current.captureException(new Error('held'));

    await act(async () => {
      await result.current.setEnabled(false);
    });
    await act(async () => {
      settings.resolve({ ...DEFAULT_SETTINGS, analyticsEnabled: true });
    });
    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(result.current.client).toBe(client);
    expect(client.captureException).not.toHaveBeenCalled();
  });

  it('discards held reports on lock, and drops reports made while locked', async () => {
    const client = makeClient();
    mockGetSettings
      .mockReturnValueOnce(new Promise<StoredSettings>(() => {}))
      .mockResolvedValue({ ...DEFAULT_SETTINGS, analyticsEnabled: true });
    mockGetAnalyticsClient.mockResolvedValue(client);

    const { result, rerender } = renderHook(() => useAnalytics(), { wrapper });
    result.current.captureException(new Error('held before lock'));

    authKind.current = 'locked';
    rerender();
    result.current.captureException(new Error('made while locked'));

    authKind.current = 'unlocked';
    rerender();
    await waitFor(() => expect(result.current.client).toBe(client));
    expect(client.captureException).not.toHaveBeenCalled();

    const afterUnlock = new Error('after unlock');
    result.current.captureException(afterUnlock);
    expect(client.captureException).toHaveBeenCalledTimes(1);
    expect(client.captureException).toHaveBeenCalledWith(
      afterUnlock,
      undefined,
    );
  });
});
