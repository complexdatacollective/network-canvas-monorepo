import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LegacyUpgradeRecord } from '~/lib/db/db';
import type { LegacyProtocolSummary } from '~/lib/db/legacyLibrary';

import { useHomeData } from '../useHomeData';

const legacy = (hash: string, importedAt: string): LegacyProtocolSummary => ({
  id: hash,
  hash,
  name: hash,
  schemaVersion: 8,
  importedAt,
  description: undefined,
  lastModified: undefined,
  sessionCount: 0,
});

const upgrade = (
  legacyHash: string,
  legacyImportedAt: string,
): LegacyUpgradeRecord => ({
  legacyHash,
  upgradedHash: `${legacyHash}-9`,
  legacyImportedAt,
  upgradedAt: '2026-10-19T00:00:00.000Z',
});

vi.mock('~/lib/db/api', () => ({
  listProtocols: () => Promise.resolve([]),
  listSessions: () => Promise.resolve([]),
  getSettings: () => Promise.resolve(null),
  listLegacyUpgrades: () =>
    Promise.resolve([
      upgrade('current', '2026-03-01T00:00:00.000Z'),
      upgrade('reimported', '2026-03-01T00:00:00.000Z'),
    ]),
}));

vi.mock('~/lib/db/legacyLibrary', () => ({
  listLegacyProtocols: () =>
    Promise.resolve([
      legacy('current', '2026-03-01T00:00:00.000Z'),
      legacy('reimported', '2026-04-01T00:00:00.000Z'),
      legacy('never', '2026-03-01T00:00:00.000Z'),
    ]),
  listLegacySessions: () => Promise.resolve([]),
}));

describe('useHomeData', () => {
  it('marks a schema 8 protocol upgraded only while its copy matches the original as it is now', async () => {
    const { result } = renderHook(() => useHomeData());

    await waitFor(() => expect(result.current.legacyProtocols).toHaveLength(3));
    // Re-imported in Interviewer 8 since its copy was made: upgradeable again.
    expect([...result.current.upgradedLegacyHashes]).toEqual(['current']);
  });
});
