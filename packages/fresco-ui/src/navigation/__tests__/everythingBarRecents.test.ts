import { describe, expect, it, vi } from 'vitest';

import {
  addRecent,
  parseRecents,
  readRecents,
  writeRecents,
  type EverythingBarRecentRef,
} from '../everythingBarRecents';

const ref = (providerId: string, itemId: string): EverythingBarRecentRef => ({
  providerId,
  itemId,
});

describe('parseRecents', () => {
  it('reads a stored list of references', () => {
    expect(
      parseRecents(
        '[{"providerId":"destinations","itemId":"study:st_42:settings"}]',
      ),
    ).toEqual([ref('destinations', 'study:st_42:settings')]);
  });

  it('yields nothing for a missing, empty or non-JSON store', () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents('')).toEqual([]);
    expect(parseRecents('{"providerId":')).toEqual([]);
  });

  it('drops entries that are not references, keeping the ones that are', () => {
    expect(
      parseRecents(
        '[{"providerId":"a","itemId":"1"},null,42,{"providerId":"b"},{"label":"Participants"}]',
      ),
    ).toEqual([ref('a', '1')]);
  });

  it('ignores a stored value that is not a list at all', () => {
    expect(parseRecents('{"providerId":"a","itemId":"1"}')).toEqual([]);
  });
});

describe('addRecent', () => {
  it('puts the newest activation first', () => {
    expect(addRecent([ref('a', '1')], ref('b', '2'), 5)).toEqual([
      ref('b', '2'),
      ref('a', '1'),
    ]);
  });

  it('moves a repeat activation to the front instead of duplicating it', () => {
    expect(addRecent([ref('a', '1'), ref('b', '2')], ref('b', '2'), 5)).toEqual(
      [ref('b', '2'), ref('a', '1')],
    );
  });

  it('separates two providers that use the same natural id', () => {
    expect(
      addRecent(
        [ref('commands', 'settings')],
        ref('destinations', 'settings'),
        5,
      ),
    ).toEqual([ref('destinations', 'settings'), ref('commands', 'settings')]);
  });

  it('stays within its bound, dropping the oldest', () => {
    const stored = [ref('a', '1'), ref('a', '2'), ref('a', '3')];

    expect(addRecent(stored, ref('a', '4'), 3)).toEqual([
      ref('a', '4'),
      ref('a', '1'),
      ref('a', '2'),
    ]);
  });
});

describe('storage access', () => {
  const key = 'fresco-ui:everything-bar:test';

  it('round-trips through localStorage', () => {
    writeRecents(key, [ref('destinations', 'team:tm_7:members')]);

    expect(readRecents(key)).toEqual([
      ref('destinations', 'team:tm_7:members'),
    ]);
  });

  it('reads nothing from a cleared store', () => {
    writeRecents(key, [ref('a', '1')]);
    window.localStorage.clear();

    expect(readRecents(key)).toEqual([]);
  });

  it('survives a store that throws on read and on write', () => {
    // Patched on the prototype: `window.localStorage` hands back a fresh
    // wrapper on every access, so patching the instance would leave the real
    // implementation in place and the assertions below vacuous.
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new DOMException('SecurityError');
      });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

    try {
      expect(readRecents(key)).toEqual([]);
      expect(() => writeRecents(key, [ref('a', '1')])).not.toThrow();
      expect(getItem).toHaveBeenCalled();
      expect(setItem).toHaveBeenCalled();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
