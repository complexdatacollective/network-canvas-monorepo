import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StoredProtocolMigrationResult } from '~/lib/db/migrateStoredProtocols';

import { useStoredProtocolMigration } from '../useStoredProtocolMigration';

const { toastAdd, migrateStoredProtocols } = vi.hoisted(() => ({
  toastAdd: vi.fn(),
  migrateStoredProtocols: vi.fn(),
}));

vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));
vi.mock('~/lib/db/api', () => ({ migrateStoredProtocols }));

function sweepResolvesTo(result: StoredProtocolMigrationResult) {
  migrateStoredProtocols.mockResolvedValue(result);
}

function migrated(...names: string[]): StoredProtocolMigrationResult {
  return {
    migrated: names.map((name) => ({
      name,
      fromVersion: 7,
      toVersion: 8,
      previousHash: `old-${name}`,
      hash: `new-${name}`,
    })),
    failed: [],
  };
}

function failed(...names: string[]): StoredProtocolMigrationResult {
  return {
    migrated: [],
    failed: names.map((name) => ({
      name,
      hash: `hash-${name}`,
      reason: 'nope',
    })),
  };
}

describe('useStoredProtocolMigration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not touch the database until it is readable', () => {
    sweepResolvesTo(migrated());
    const { result } = renderHook(() => useStoredProtocolMigration(false));

    expect(migrateStoredProtocols).not.toHaveBeenCalled();
    expect(result.current).toBe('pending');
  });

  it('settles once the sweep resolves, and reports nothing when it found nothing', async () => {
    sweepResolvesTo(migrated());
    const { result } = renderHook(() => useStoredProtocolMigration(true));

    expect(result.current).toBe('pending');
    await waitFor(() => expect(result.current).toBe('settled'));
    expect(toastAdd).not.toHaveBeenCalled();
  });

  // StrictMode mounts every effect twice. The second mount must re-attach to
  // the sweep the first one started, or the gate that waits on 'settled' would
  // hold the app at its spinner forever.
  it('settles under StrictMode, running the sweep exactly once', async () => {
    sweepResolvesTo(migrated('Alpha Study'));
    const { result } = renderHook(() => useStoredProtocolMigration(true), {
      wrapper: StrictMode,
    });

    await waitFor(() => expect(result.current).toBe('settled'));
    expect(migrateStoredProtocols).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledTimes(1);
  });

  it('names the protocol when one was migrated', async () => {
    sweepResolvesTo(migrated('Alpha Study'));
    const { result } = renderHook(() => useStoredProtocolMigration(true));

    await waitFor(() => expect(result.current).toBe('settled'));
    expect(toastAdd).toHaveBeenCalledWith({
      title: 'Protocol updated',
      description: 'Alpha Study was migrated to the current schema.',
      variant: 'success',
    });
  });

  it('counts them when several were migrated', async () => {
    sweepResolvesTo(migrated('Alpha Study', 'Beta Study'));
    const { result } = renderHook(() => useStoredProtocolMigration(true));

    await waitFor(() => expect(result.current).toBe('settled'));
    expect(toastAdd).toHaveBeenCalledWith({
      title: 'Protocols updated',
      description: '2 protocols were migrated to the current schema.',
      variant: 'success',
    });
  });

  it('says what to do about a protocol it could not migrate, and still settles', async () => {
    sweepResolvesTo(failed('Broken Study'));
    const { result } = renderHook(() => useStoredProtocolMigration(true));

    await waitFor(() => expect(result.current).toBe('settled'));
    expect(toastAdd).toHaveBeenCalledWith({
      title: 'Protocol could not be updated',
      description:
        'Broken Study could not be migrated to the current schema. Repair it in Architect and import it again — it cannot be used until then.',
      variant: 'destructive',
    });
  });

  it('reports migrations and failures from the same sweep separately', async () => {
    sweepResolvesTo({
      ...migrated('Alpha Study'),
      failed: failed('Broken Study', 'Also Broken').failed,
    });
    const { result } = renderHook(() => useStoredProtocolMigration(true));

    await waitFor(() => expect(result.current).toBe('settled'));
    expect(toastAdd).toHaveBeenCalledTimes(2);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Protocols could not be updated',
        description:
          '2 protocols could not be migrated to the current schema. Repair them in Architect and import them again — they cannot be used until then.',
        variant: 'destructive',
      }),
    );
  });

  it('settles even if the sweep rejects, so the app can never be held at its spinner', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    migrateStoredProtocols.mockRejectedValue(new Error('indexeddb is gone'));

    const { result } = renderHook(() => useStoredProtocolMigration(true));

    await waitFor(() => expect(result.current).toBe('settled'));
    expect(toastAdd).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('runs again after a lock/unlock cycle, but not on a re-render', async () => {
    sweepResolvesTo(migrated());
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useStoredProtocolMigration(enabled),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current).toBe('settled'));
    rerender({ enabled: true });
    expect(migrateStoredProtocols).toHaveBeenCalledTimes(1);

    // Locking drops the key the rows are readable under.
    rerender({ enabled: false });
    expect(result.current).toBe('pending');

    rerender({ enabled: true });
    await waitFor(() => expect(result.current).toBe('settled'));
    expect(migrateStoredProtocols).toHaveBeenCalledTimes(2);
  });
});
