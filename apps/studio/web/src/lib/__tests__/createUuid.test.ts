import { describe, expect, it, vi } from 'vitest';

import { createUuid } from '../createUuid.ts';

describe('createUuid', () => {
  it('does not require the secure-context randomUUID API', () => {
    const randomUUID = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockImplementation(() => {
        throw new Error('randomUUID is unavailable');
      });

    expect(createUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(randomUUID).not.toHaveBeenCalled();
  });
});
