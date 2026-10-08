import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StoredProtocolMigrationResult } from '~/lib/db/migrateStoredProtocols';
import { renderedMessage } from '~/testUtils/renderedMessage';

import {
  recordStoredProtocolMigrationFailures,
  useStoredProtocolMigrationFailure,
} from '../storedProtocolMigrationFailures';
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
      kind: 'protocol' as const,
      sessions: [],
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
      title: renderedMessage('Protocol updated'),
      description: renderedMessage(
        'Alpha Study was migrated to the current schema.',
      ),
      variant: 'success',
    });
  });

  it('counts them when several were migrated', async () => {
    sweepResolvesTo(migrated('Alpha Study', 'Beta Study'));
    const { result } = renderHook(() => useStoredProtocolMigration(true));

    await waitFor(() => expect(result.current).toBe('settled'));
    expect(toastAdd).toHaveBeenCalledWith({
      title: renderedMessage('Protocols updated'),
      description: renderedMessage(
        '2 protocols were migrated to the current schema.',
      ),
      variant: 'success',
    });
  });

  it('says what to do about a protocol it could not migrate, and still settles', async () => {
    sweepResolvesTo(failed('Broken Study'));
    const { result } = renderHook(() => useStoredProtocolMigration(true));

    await waitFor(() => expect(result.current).toBe('settled'));
    expect(toastAdd).toHaveBeenCalledWith({
      title: renderedMessage('Protocol could not be updated'),
      description: renderedMessage(
        'Broken Study could not be migrated to the current schema. Its interviews cannot be continued, though their responses remain on the data screen. Repair it in Architect and import it again to start new interviews.',
      ),
      variant: 'destructive',
    });
  });

  it('calmly reports a protocol whose interviews could not be updated, and records why for its screens', async () => {
    sweepResolvesTo({
      migrated: [],
      failed: [
        ...failed('Broken Study').failed,
        {
          name: 'Waiting Study',
          hash: 'hash-waiting',
          reason: 'one interview could not be migrated',
          kind: 'sessions',
          sessions: [{ id: 's1', reason: 'invalid' }],
        },
      ],
    });
    const { result } = renderHook(() => useStoredProtocolMigration(true));
    const failure = renderHook(() => ({
      waiting: useStoredProtocolMigrationFailure('hash-waiting'),
      broken: useStoredProtocolMigrationFailure('hash-Broken Study'),
      other: useStoredProtocolMigrationFailure('hash-other'),
    }));

    await waitFor(() => expect(result.current).toBe('settled'));
    expect(toastAdd).toHaveBeenCalledTimes(2);
    expect(toastAdd).toHaveBeenCalledWith({
      title: renderedMessage('A protocol is waiting for an update'),
      description: renderedMessage(
        'Some interviews recorded with Waiting Study could not be updated to work with this version of the app. The protocol and all its interviews have been kept exactly as they were, and the app will try again each time it starts. Until then, its interviews cannot be started or continued, though their responses remain on the data screen.',
      ),
      variant: 'info',
    });
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
    expect(failure.result.current).toEqual({
      waiting: 'sessions',
      broken: 'protocol',
      other: undefined,
    });
    act(() => recordStoredProtocolMigrationFailures([]));
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
        title: renderedMessage('Protocols could not be updated'),
        description: renderedMessage(
          '2 protocols could not be migrated to the current schema. Their interviews cannot be continued, though their responses remain on the data screen. Repair them in Architect and import them again to start new interviews.',
        ),
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
