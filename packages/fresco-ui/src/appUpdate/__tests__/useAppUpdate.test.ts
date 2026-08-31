import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useAppUpdate, { FRESH_LOAD_AUTO_APPLY_MS } from '../useAppUpdate';

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
        installUpdate: vi.fn().mockResolvedValue(true),
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
        installUpdate: vi.fn().mockResolvedValue(true),
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
        installUpdate: vi.fn().mockResolvedValue(true),
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

describe('manual installation', () => {
  it('preserves deprecated auto-apply options as inert patch-compatible inputs', async () => {
    const installUpdate = vi.fn().mockResolvedValue(true);
    const checkUnsavedWork = vi.fn().mockReturnValue(false);
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'architect',
        currentVersion: '2.0.0',
        needRefresh: true,
        installUpdate,
        hasUnsavedWork: false,
        checkUnsavedWork,
        autoApplyWindowMs: 0,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('available'));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(FRESH_LOAD_AUTO_APPLY_MS).toBe(20_000);
    expect(checkUnsavedWork).not.toHaveBeenCalled();
    expect(installUpdate).not.toHaveBeenCalled();
  });

  it('never installs an available update without a user request', async () => {
    const installUpdate = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'interviewer',
        currentVersion: '2.0.0',
        needRefresh: true,
        installUpdate,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('available'));
    await Promise.resolve();
    expect(installUpdate).not.toHaveBeenCalled();
    expect(result.current.status).toBe('available');
  });

  it('records a pending update before invoking the user-requested install', async () => {
    const installUpdate = vi.fn(() => {
      expect(localStorage.getItem('nc:pendingAppUpdate:interviewer')).toBe(
        '2.0.0',
      );
      return true;
    });
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'interviewer',
        currentVersion: '2.0.0',
        needRefresh: true,
        installUpdate,
      }),
    );

    await expect(result.current.install()).resolves.toBe(true);
    expect(installUpdate).toHaveBeenCalledOnce();
    expect(localStorage.getItem('nc:pendingAppUpdate:interviewer')).toBe(
      '2.0.0',
    );
  });

  it('clears the pending marker when installation reports failure', async () => {
    const installUpdate = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'interviewer',
        currentVersion: '2.0.0',
        needRefresh: true,
        installUpdate,
      }),
    );

    await expect(result.current.install()).resolves.toBe(false);
    expect(localStorage.getItem('nc:pendingAppUpdate:interviewer')).toBeNull();
  });

  it('clears the pending marker and preserves a rejected installation', async () => {
    const error = new Error('activation failed');
    const installUpdate = vi.fn().mockRejectedValue(error);
    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'architect',
        currentVersion: '2.0.0',
        needRefresh: true,
        installUpdate,
      }),
    );

    await expect(result.current.install()).rejects.toBe(error);
    expect(localStorage.getItem('nc:pendingAppUpdate:architect')).toBeNull();
  });

  it('reports recently updated after a requested reload even when the recorded version already matches', async () => {
    localStorage.setItem('nc:lastLaunchedVersion:architect', '2.0.0');
    localStorage.setItem('nc:pendingAppUpdate:architect', '2.0.0');

    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'architect',
        currentVersion: '2.0.0',
        needRefresh: false,
        installUpdate: vi.fn().mockResolvedValue(true),
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('updated'));
    expect(localStorage.getItem('nc:pendingAppUpdate:architect')).toBeNull();
    expect(localStorage.getItem('nc:pendingAppUpdate:interviewer')).toBeNull();
  });

  it('keeps pending update markers isolated by app', async () => {
    localStorage.setItem('nc:lastLaunchedVersion:interviewer', '2.0.0');
    localStorage.setItem('nc:pendingAppUpdate:architect', '2.0.0');

    const { result } = renderHook(() =>
      useAppUpdate({
        app: 'interviewer',
        currentVersion: '2.0.0',
        needRefresh: false,
        installUpdate: vi.fn().mockResolvedValue(true),
      }),
    );

    await waitFor(() =>
      expect(localStorage.getItem('nc:lastLaunchedVersion:interviewer')).toBe(
        '2.0.0',
      ),
    );
    expect(result.current.status).toBe('idle');
    expect(localStorage.getItem('nc:pendingAppUpdate:architect')).toBe('2.0.0');
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
        installUpdate: vi.fn().mockResolvedValue(true),
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
