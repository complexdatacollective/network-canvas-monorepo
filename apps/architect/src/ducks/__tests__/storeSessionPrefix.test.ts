import { afterEach, describe, expect, it, vi } from 'vitest';

import { SESSION_PREFIX } from '~/utils/storageNames';

// Architect 8 at `/v8/` remembers its session under redux-remember's default
// prefix. A tab that moves between the two apps shares one sessionStorage, so
// each must restore only its own session and leave the other's in place.
describe('remembered session prefix', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.resetModules();
  });

  it('restores this app’s session and never touches Architect 8’s', async () => {
    const architect8Session = JSON.stringify({ activeProtocolId: 'v8-row' });
    window.sessionStorage.setItem('@@remember-app', architect8Session);
    window.sessionStorage.setItem(
      `${SESSION_PREFIX}app`,
      JSON.stringify({ activeProtocolId: 'v9-row' }),
    );

    const { store, storeRehydrated } = await import('../store');
    const { getActiveProtocolId, setActiveProtocolId } =
      await import('../modules/app');

    await expect(storeRehydrated).resolves.toBe('rehydrated');
    expect(getActiveProtocolId(store.getState())).toBe('v9-row');

    store.dispatch(setActiveProtocolId('another-v9-row'));

    await vi.waitFor(() => {
      expect(window.sessionStorage.getItem(`${SESSION_PREFIX}app`)).toContain(
        'another-v9-row',
      );
    });
    expect(window.sessionStorage.getItem('@@remember-app')).toBe(
      architect8Session,
    );
  });
});
