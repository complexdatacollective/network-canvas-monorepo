import { describe, expect, it } from 'vitest';

import { storeRehydrated } from '../store';

describe('storeRehydrated', () => {
  it('settles after redux-remember restores the session id', async () => {
    const result = await Promise.race([
      storeRehydrated.then(() => 'rehydrated'),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('timed out'), 250);
      }),
    ]);

    expect(result).toBe('rehydrated');
  });
});
