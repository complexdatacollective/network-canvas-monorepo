import { afterEach, describe, expect, it } from 'vitest';

import {
  isReencryptionPending,
  setReencryptionPending,
} from '../../auth/reencryptionPending';
import { enrolNone, enrolPin } from '../vault';
import { readVaultState, VAULT_STORAGE_KEY } from '../vaultStore';

// SHARED CONTRACT with Interviewer 8 (on main), served at /v8/ on the same
// origin. Both apps unlock the same vault record with the same key (one lock
// for both), and Interviewer 8 treats a vault record of any version but 4 as
// corrupt. While Interviewer 8 is bundled, the key, the record's version and
// the pending-sweep flag must stay exactly as they are; main pins the same
// literals. Change them on both sides or neither.

afterEach(() => {
  window.localStorage.clear();
});

describe('the lock shared with Interviewer 8', () => {
  it('keeps the vault record under interviewer:vault', () => {
    expect(VAULT_STORAGE_KEY).toBe('interviewer:vault');
  });

  it('writes format version 4, and only accepts version 4', async () => {
    await enrolNone();
    expect(
      JSON.parse(window.localStorage.getItem('interviewer:vault') ?? 'null'),
    ).toEqual({ version: 4, mode: 'none' });

    await enrolPin('12345678');
    const stored: unknown = JSON.parse(
      window.localStorage.getItem('interviewer:vault') ?? 'null',
    );
    expect(stored).toMatchObject({ version: 4, mode: 'pin' });

    window.localStorage.setItem(
      'interviewer:vault',
      JSON.stringify({ version: 5, mode: 'none' }),
    );
    expect(readVaultState()).toEqual({ status: 'corrupt' });
  });

  it('keeps the pending re-encryption flag under interviewer:reencryption-pending', () => {
    setReencryptionPending(true);
    expect(
      window.localStorage.getItem('interviewer:reencryption-pending'),
    ).toBe('1');
    window.localStorage.removeItem('interviewer:reencryption-pending');
    expect(isReencryptionPending()).toBe(false);
  });
});
