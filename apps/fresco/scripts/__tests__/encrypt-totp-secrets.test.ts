import { Secret, TOTP } from 'otpauth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Prisma } from '~/lib/db/generated/client';
import { encryptStoredTotpSecrets } from '~/scripts/encrypt-totp-secrets';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  isEncryptedTotpSecret,
} from '~/utils/totpSecretEncryption';

const KEY = 'release-test-totp-encryption-key-0123456789';
const OTHER_KEY = 'a-different-totp-encryption-key-9876543210';

/**
 * A `TotpCredential` row exactly as Fresco wrote it before secrets were
 * encrypted at rest: the bare Base32 seed in `secret`. Frozen on purpose — if
 * the shape drifts, the upgrade this file guards is no longer being tested
 * against what real databases hold.
 */
const LEGACY_ROW = Object.freeze({
  id: 'cm0legacytotpcredential000001',
  user_id: 'cm0legacyuser0000000000000001',
  secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  verified: true,
  createdAt: new Date('2026-03-01T09:00:00.000Z'),
});

type StoredRow = { id: string; secret: string; verified: boolean };

function makeTx(rows: StoredRow[]) {
  const store = new Map(rows.map((row) => [row.id, { ...row }]));
  const findMany = vi.fn(async () =>
    [...store.values()]
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .map(({ id, secret, verified }) => ({ id, secret, verified })),
  );
  const deleteMany = vi.fn(
    async ({ where }: { where: { id: { in: string[] } } }) => {
      let count = 0;
      for (const id of where.id.in) {
        if (store.delete(id)) count++;
      }
      return { count };
    },
  );
  const update = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { secret: string };
    }) => {
      const row = store.get(where.id);
      if (!row) throw new Error(`no row ${where.id}`);
      row.secret = data.secret;
      return row;
    },
  );
  const tx = {
    totpCredential: { findMany, update, deleteMany },
  } as unknown as Prisma.TransactionClient;
  return { tx, store, findMany, update, deleteMany };
}

/** An enrolment someone started and never confirmed, as enableTotp writes it. */
const ABANDONED_ROW = Object.freeze({
  id: 'cm0abandonedtotpcredential0003',
  secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  verified: false,
});

describe('encryptStoredTotpSecrets', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('seals a legacy plaintext row so the column no longer holds the seed', async () => {
    const { tx, store, update } = makeTx([LEGACY_ROW]);

    await encryptStoredTotpSecrets(tx, KEY);

    const stored = store.get(LEGACY_ROW.id)?.secret;
    expect(update).toHaveBeenCalledTimes(1);
    expect(stored).toBeDefined();
    expect(stored).not.toBe(LEGACY_ROW.secret);
    expect(stored).not.toContain(LEGACY_ROW.secret);
    expect(isEncryptedTotpSecret(stored ?? '')).toBe(true);
  });

  it('keeps codes from the pre-upgrade seed verifiable after the upgrade', async () => {
    const { tx, store } = makeTx([LEGACY_ROW]);
    const authenticator = new TOTP({
      secret: Secret.fromBase32(LEGACY_ROW.secret),
    });
    const code = authenticator.generate();

    await encryptStoredTotpSecrets(tx, KEY);

    const opened = decryptTotpSecret(
      store.get(LEGACY_ROW.id)?.secret ?? '',
      KEY,
    );
    expect(opened).toBe(LEGACY_ROW.secret);
    expect(
      new TOTP({ secret: Secret.fromBase32(opened) }).validate({
        token: code,
        window: 0,
      }),
    ).toBe(0);
  });

  it('is idempotent: a second run verifies the sealed row and rewrites nothing', async () => {
    const { tx, store, update } = makeTx([LEGACY_ROW]);
    await encryptStoredTotpSecrets(tx, KEY);
    const sealedOnce = store.get(LEGACY_ROW.id)?.secret;
    update.mockClear();

    await encryptStoredTotpSecrets(tx, KEY);

    expect(update).not.toHaveBeenCalled();
    expect(store.get(LEGACY_ROW.id)?.secret).toBe(sealedOnce);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('verified 1 already-encrypted secret(s)'),
    );
  });

  it('seals only the plaintext rows in a mixed database', async () => {
    const sealedRow = {
      id: 'cm0sealedtotpcredential000002',
      secret: encryptTotpSecret('MFRGGZDFMZTWQ2LKNNWG23TPOBSXE', KEY),
      verified: true,
    };
    const { tx, store, update } = makeTx([LEGACY_ROW, sealedRow]);

    await encryptStoredTotpSecrets(tx, KEY);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0].where).toEqual({ id: LEGACY_ROW.id });
    expect(store.get(sealedRow.id)?.secret).toBe(sealedRow.secret);
    expect(decryptTotpSecret(store.get(LEGACY_ROW.id)?.secret ?? '', KEY)).toBe(
      LEGACY_ROW.secret,
    );
  });

  it('fails the deploy when secrets exist but no key is configured', async () => {
    const { tx, store, update, deleteMany } = makeTx([LEGACY_ROW]);

    await expect(encryptStoredTotpSecrets(tx, undefined)).rejects.toThrow(
      /1 account\(s\) have two-factor authentication enabled, but TOTP_ENCRYPTION_KEY is not set/,
    );

    expect(update).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(store.get(LEGACY_ROW.id)?.secret).toBe(LEGACY_ROW.secret);
  });

  it('counts only verified accounts in the missing-key failure and touches nothing', async () => {
    const { tx, store, update, deleteMany } = makeTx([
      LEGACY_ROW,
      ABANDONED_ROW,
    ]);

    await expect(encryptStoredTotpSecrets(tx, undefined)).rejects.toThrow(
      /^1 account\(s\) have two-factor authentication enabled/,
    );

    expect(update).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(store.get(ABANDONED_ROW.id)?.secret).toBe(ABANDONED_ROW.secret);
  });

  it('discards unfinished enrolments and continues when no key is configured', async () => {
    const { tx, store, update, deleteMany } = makeTx([ABANDONED_ROW]);

    await expect(
      encryptStoredTotpSecrets(tx, undefined),
    ).resolves.toBeUndefined();

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(store.has(ABANDONED_ROW.id)).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Discarded 1 unfinished two-factor enrolment(s)'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('TOTP_ENCRYPTION_KEY is not set'),
    );
  });

  it('seals an unfinished enrolment rather than discarding it when a key is configured', async () => {
    const { tx, store, deleteMany } = makeTx([ABANDONED_ROW]);

    await encryptStoredTotpSecrets(tx, KEY);

    expect(deleteMany).not.toHaveBeenCalled();
    expect(
      decryptTotpSecret(store.get(ABANDONED_ROW.id)?.secret ?? '', KEY),
    ).toBe(ABANDONED_ROW.secret);
  });

  it('fails the deploy when the configured key does not open the sealed rows', async () => {
    const { tx, update } = makeTx([
      {
        id: LEGACY_ROW.id,
        secret: encryptTotpSecret(LEGACY_ROW.secret, KEY),
        verified: true,
      },
    ]);

    await expect(encryptStoredTotpSecrets(tx, OTHER_KEY)).rejects.toThrow(
      /TOTP_ENCRYPTION_KEY does not match the key that encrypted the stored TOTP secrets/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('discards an unfinished enrolment sealed under a different key instead of failing', async () => {
    const verifiedRow = {
      id: LEGACY_ROW.id,
      secret: encryptTotpSecret(LEGACY_ROW.secret, KEY),
      verified: true,
    };
    const staleUnfinished = {
      id: ABANDONED_ROW.id,
      secret: encryptTotpSecret(ABANDONED_ROW.secret, OTHER_KEY),
      verified: false,
    };
    const { tx, store, update, deleteMany } = makeTx([
      verifiedRow,
      staleUnfinished,
    ]);

    await expect(encryptStoredTotpSecrets(tx, KEY)).resolves.toBeUndefined();

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(store.has(ABANDONED_ROW.id)).toBe(false);
    expect(store.get(LEGACY_ROW.id)?.secret).toBe(verifiedRow.secret);
    expect(update).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Discarded 1 unfinished two-factor enrolment(s); they could not be read with the configured TOTP_ENCRYPTION_KEY',
      ),
    );
  });

  it('still fails the deploy when a verified row was sealed under a different key, even beside an unfinished one', async () => {
    const { tx, deleteMany, update } = makeTx([
      {
        id: LEGACY_ROW.id,
        secret: encryptTotpSecret(LEGACY_ROW.secret, OTHER_KEY),
        verified: true,
      },
      {
        id: ABANDONED_ROW.id,
        secret: encryptTotpSecret(ABANDONED_ROW.secret, OTHER_KEY),
        verified: false,
      },
    ]);

    await expect(encryptStoredTotpSecrets(tx, KEY)).rejects.toThrow(
      /TOTP_ENCRYPTION_KEY does not match/,
    );
    expect(deleteMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('discards an unfinished enrolment whose envelope is malformed', async () => {
    const { tx, store, update, deleteMany } = makeTx([
      { id: ABANDONED_ROW.id, secret: 'v1:truncated', verified: false },
    ]);

    await expect(encryptStoredTotpSecrets(tx, KEY)).resolves.toBeUndefined();

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(store.has(ABANDONED_ROW.id)).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('still fails the deploy when a verified row has a malformed envelope', async () => {
    const { tx, deleteMany, update } = makeTx([
      { id: LEGACY_ROW.id, secret: 'v1:truncated', verified: true },
    ]);

    await expect(encryptStoredTotpSecrets(tx, KEY)).rejects.toThrow(
      /not a valid encrypted envelope/,
    );
    expect(deleteMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('fails the deploy on a key shorter than the minimum', async () => {
    const { tx, update } = makeTx([LEGACY_ROW]);

    await expect(encryptStoredTotpSecrets(tx, 'short')).rejects.toThrow(
      /at least 32 characters/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('only warns when no secrets exist and no key is configured', async () => {
    const { tx, update, deleteMany } = makeTx([]);

    await expect(
      encryptStoredTotpSecrets(tx, undefined),
    ).resolves.toBeUndefined();

    expect(update).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('TOTP_ENCRYPTION_KEY is not set'),
    );
  });

  it('does nothing when no secrets exist and a key is configured', async () => {
    const { tx, update } = makeTx([]);

    await encryptStoredTotpSecrets(tx, KEY);

    expect(update).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
