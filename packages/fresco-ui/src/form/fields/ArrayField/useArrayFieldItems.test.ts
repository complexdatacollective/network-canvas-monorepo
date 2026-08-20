import { describe, expect, it } from 'vitest';

import { stripManagedProperties } from './useArrayFieldItems';

/**
 * ArrayField hands its consumers items carrying the properties it manages
 * (`_internalId`, and `_draft` while an item is uncommitted). Consumers that
 * persist an item — Architect writes them into protocol JSON — have to take
 * those off first, and three of them were doing it with their own inline
 * destructure, each frozen on the managed keys that existed when it was
 * written.
 *
 * The list is now derived from `ManagedProperties` itself, and a key added
 * there without being listed is a compile error rather than a leak. This suite
 * pins the runtime half.
 */
describe('stripManagedProperties', () => {
  it('removes every property ArrayField manages', () => {
    expect(
      stripManagedProperties({
        _internalId: 'internal-1',
        _draft: true,
        label: 'Nickname',
        variable: 'var-1',
      }),
    ).toEqual({ label: 'Nickname', variable: 'var-1' });
  });

  it('keeps a consumer key that merely starts with an underscore', () => {
    expect(
      stripManagedProperties({ _internalId: 'internal-1', _private: 'keep' }),
    ).toEqual({ _private: 'keep' });
  });

  it('leaves an item that carries none of them untouched', () => {
    expect(stripManagedProperties({ label: 'Nickname' })).toEqual({
      label: 'Nickname',
    });
  });

  it('does not mutate the item it was given', () => {
    const item = { _internalId: 'internal-1', _draft: false, label: 'A' };

    stripManagedProperties(item);

    expect(item).toEqual({
      _internalId: 'internal-1',
      _draft: false,
      label: 'A',
    });
  });

  // Callers reach for this on an item that may not exist yet — the editor
  // session for a row that is being created.
  it('answers an empty object for a missing item', () => {
    expect(stripManagedProperties(undefined)).toEqual({});
  });
});
