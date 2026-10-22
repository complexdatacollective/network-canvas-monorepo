import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProtocolWithCounts, StoredSessionLite } from '~/lib/db/types';

import { useHomeData } from '../useHomeData';

const protocol = (hash: string, schemaVersion: 8 | 9) =>
  ({
    id: hash,
    hash,
    name: hash,
    schemaVersion,
    importedAt: '2026-03-01T00:00:00.000Z',
    codebook: {},
    protocol: { name: hash, schemaVersion, codebook: {}, stages: [] },
    sessionCount: 1,
  }) as unknown as ProtocolWithCounts;

const session = (id: string, protocolHash: string) =>
  ({ id, protocolHash }) as unknown as StoredSessionLite;

const { listProtocols, listSessions } = vi.hoisted(() => ({
  listProtocols: vi.fn<() => Promise<ProtocolWithCounts[]>>(),
  listSessions: vi.fn<() => Promise<StoredSessionLite[]>>(),
}));
vi.mock('~/lib/db/api', () => ({
  listProtocols,
  listSessions,
  getSettings: () => Promise.resolve({ id: 'device' }),
}));

describe('useHomeData', () => {
  it('lists every schema from the one database, side by side', async () => {
    listProtocols.mockResolvedValue([
      protocol('current', 9),
      protocol('older', 8),
    ]);
    listSessions.mockResolvedValue([
      session('a', 'current'),
      session('b', 'older'),
    ]);

    const { result } = renderHook(() => useHomeData());

    await waitFor(() => expect(result.current.protocols).toHaveLength(2));
    expect(result.current.protocols.map((p) => p.schemaVersion)).toEqual([
      9, 8,
    ]);
    expect(result.current.sessions.map((s) => s.protocolHash)).toEqual([
      'current',
      'older',
    ]);
    expect(result.current.settings).toEqual({ id: 'device' });
  });

  it('leaves the lists empty when the database cannot be read', async () => {
    listProtocols.mockRejectedValue(new Error('locked'));
    listSessions.mockResolvedValue([session('a', 'current')]);

    const { result } = renderHook(() => useHomeData());

    await waitFor(() => expect(listProtocols).toHaveBeenCalled());
    expect(result.current.protocols).toEqual([]);
    expect(result.current.sessions).toEqual([]);
  });
});
