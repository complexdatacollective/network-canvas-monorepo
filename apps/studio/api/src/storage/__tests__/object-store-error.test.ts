import { describe, expect, it } from 'vitest';

import { ObjectStoreError } from '../object-store.ts';

describe('an object store error', () => {
  it('describes a cause that has no string form without throwing', () => {
    const error = new ObjectStoreError({
      operation: 'delete',
      cause: Object.create(null),
    });

    expect(error.message).toBe('object store delete failed');
    expect(() => String(error)).not.toThrow();
  });

  it('carries an Error cause’s message, and a string cause as it is', () => {
    expect(
      new ObjectStoreError({ operation: 'get', cause: new Error('refused') })
        .message,
    ).toBe('refused');
    expect(
      new ObjectStoreError({ operation: 'list', cause: 'access denied' })
        .message,
    ).toBe('access denied');
  });
});
