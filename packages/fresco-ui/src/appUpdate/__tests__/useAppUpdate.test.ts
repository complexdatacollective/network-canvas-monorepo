import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useAppUpdate from '../useAppUpdate';

const okEmptyList = { ok: true, json: async () => [] };

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okEmptyList));
});
afterEach(() => vi.unstubAllGlobals());

describe('version-change detection', () => {
  it('reports "updated" when the stored version differs from the current one', async () => {
    localStorage.setItem('nc:lastLaunchedVersion:architect', '1.0.0');
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'architect',
        currentVersion: '2.0.0',
        needRefresh: false,
        hasUnsavedWork: false,
        installUpdate: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('updated'));
    expect(localStorage.getItem('nc:lastLaunchedVersion:architect')).toBe(
      '2.0.0',
    );
  });

  it('stays "idle" on first-ever launch (no stored version)', async () => {
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'architect',
        currentVersion: '2.0.0',
        needRefresh: false,
        hasUnsavedWork: false,
        installUpdate: vi.fn(),
      }),
    );
    await waitFor(() =>
      expect(localStorage.getItem('nc:lastLaunchedVersion:architect')).toBe(
        '2.0.0',
      ),
    );
    expect(result.current.status).toBe('idle');
  });

  it('stays "idle" when the version is unchanged', async () => {
    localStorage.setItem('nc:lastLaunchedVersion:architect', '2.0.0');
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'architect',
        currentVersion: '2.0.0',
        needRefresh: false,
        hasUnsavedWork: false,
        installUpdate: vi.fn(),
      }),
    );
    await waitFor(() =>
      expect(localStorage.getItem('nc:lastLaunchedVersion:architect')).toBe(
        '2.0.0',
      ),
    );
    expect(result.current.status).toBe('idle');
  });
});

describe('auto-apply', () => {
  it('applies the update once when one is pending and no work is in progress', async () => {
    const installUpdate = vi.fn();
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'interviewer',
        currentVersion: '2.0.0',
        needRefresh: true,
        hasUnsavedWork: false,
        installUpdate,
      }),
    );
    await waitFor(() => expect(installUpdate).toHaveBeenCalledOnce());
    expect(result.current.status).toBe('available');
  });

  it('defers to the manual button when work is in progress', async () => {
    const installUpdate = vi.fn();
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'interviewer',
        currentVersion: '2.0.0',
        needRefresh: true,
        hasUnsavedWork: true,
        installUpdate,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe('available'));
    expect(installUpdate).not.toHaveBeenCalled();
  });

  it('does not auto-apply an update surfaced after the fresh-load window', async () => {
    const installUpdate = vi.fn();
    const { result, rerender } = renderHook(
      ({ needRefresh }: { needRefresh: boolean }) =>
        useAppUpdate({
          app: 'architect',
          currentVersion: '2.0.0',
          needRefresh,
          hasUnsavedWork: false,
          installUpdate,
          autoApplyWindowMs: 10,
        }),
      { initialProps: { needRefresh: false } },
    );

    // Let the fresh-load window elapse before the update is detected (as the
    // hourly poll would in a long-lived idle session).
    await new Promise((resolve) => setTimeout(resolve, 40));
    rerender({ needRefresh: true });

    await waitFor(() => expect(result.current.status).toBe('available'));
    expect(installUpdate).not.toHaveBeenCalled();
  });
});

describe('release-notes state', () => {
  it('falls back to null (not a stuck loading state) when the fetch yields nothing', async () => {
    let resolveFetch: (value: {
      ok: boolean;
      json: () => Promise<unknown>;
    }) => void = () => {};
    const pending = new Promise<{ ok: boolean; json: () => Promise<unknown> }>(
      (resolve) => {
        resolveFetch = resolve;
      },
    );
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));

    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'architect',
        currentVersion: '2.0.0',
        needRefresh: true,
        hasUnsavedWork: true, // suppress auto-apply so the test doesn't reload
        installUpdate: vi.fn(),
      }),
    );

    // While the fetch is in flight, the dialog shows a loading state.
    await waitFor(() => expect(result.current.releaseNotes).toBe('loading'));

    // A non-ok response makes fetchLatestReleaseNotes resolve to null; the hook
    // must settle to null so the dialog can show its "unavailable" copy.
    resolveFetch({ ok: false, json: async () => [] });
    await waitFor(() => expect(result.current.releaseNotes).toBeNull());
  });
});
