import { Redacted, Schema } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LinkToken, SessionToken } from '@codaco/studio-contract/schema/ids';

import {
  forgetStoredSession,
  readStoredSession,
  storeSession,
} from '../storedSessions.ts';

const LINK = Schema.decodeSync(LinkToken)('l'.repeat(32));
const SESSION = 's'.repeat(32);

const denied = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('stored participant sessions', () => {
  it('reads and forgets a session in the store the browser allows when it denies the other', () => {
    storeSession(LINK, Schema.decodeSync(SessionToken)(SESSION), {
      anonymous: false,
    });
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(denied);

    const stored = readStoredSession(LINK);
    expect(stored === undefined ? undefined : Redacted.value(stored)).toBe(
      SESSION,
    );
    forgetStoredSession(LINK);
    expect(localStorage.length).toBe(0);
  });

  it('reads nothing, rather than throwing, when the browser denies both', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(denied);
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(denied);

    expect(readStoredSession(LINK)).toBeUndefined();
    expect(() => forgetStoredSession(LINK)).not.toThrow();
  });
});
