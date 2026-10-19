// Dexie's liveQuery needs an IndexedDB to observe, even with its reads mocked.
import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listProtocols: vi.fn(),
  listLegacyProtocols: vi.fn(),
  listLegacyProtocolChoices: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock('~/utils/protocolLibrary', () => ({
  listProtocols: mocks.listProtocols,
  listLegacyProtocolChoices: mocks.listLegacyProtocolChoices,
}));
vi.mock('~/utils/legacyProtocolLibrary', () => ({
  listLegacyProtocols: mocks.listLegacyProtocols,
}));
vi.mock('~/utils/reportError', () => ({ reportError: mocks.reportError }));

import { useProtocolLibrary } from '../useProtocolLibrary';

const own = [{ id: 'own-1' }];
const legacy = [{ id: 'legacy-1' }];
const choices = [{ legacyId: 'legacy-1', choice: 'legacy', updatedAt: 1 }];

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.listProtocols.mockResolvedValue(own);
  mocks.listLegacyProtocols.mockResolvedValue(legacy);
  mocks.listLegacyProtocolChoices.mockResolvedValue(choices);
});

describe('useProtocolLibrary', () => {
  it('lists both libraries and the remembered choices', async () => {
    const { result } = renderHook(() => useProtocolLibrary());

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current).toEqual({
      protocols: own,
      legacyProtocols: legacy,
      legacyChoices: choices,
      isLoaded: true,
    });
  });

  it('is not loaded until Architect 8’s library has been read too', async () => {
    mocks.listLegacyProtocols.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useProtocolLibrary());

    await waitFor(() => expect(result.current.protocols).toEqual(own));
    expect(result.current.isLoaded).toBe(false);
  });

  it('still lists Architect 8’s protocols when the choices cannot be read', async () => {
    mocks.listLegacyProtocolChoices.mockRejectedValue(new Error('blocked'));

    const { result } = renderHook(() => useProtocolLibrary());

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.legacyProtocols).toEqual(legacy);
    expect(result.current.legacyChoices).toEqual([]);
    expect(mocks.reportError).toHaveBeenCalled();
  });
});
