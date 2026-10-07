import { afterEach, describe, expect, it, vi } from 'vitest';

import { LinkToken, SessionToken } from '@codaco/studio-contract/schema/ids';

import {
  forgetStoredSession,
  readStoredSession,
  storeSession,
} from '../storedSessions.ts';

const LINK = LinkToken.make('l'.repeat(32));
const SESSION = SessionToken.make('s'.repeat(32));

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
    storeSession(LINK, SESSION, { anonymous: false });
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(denied);

    expect(readStoredSession(LINK)).toBe(SESSION);
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
