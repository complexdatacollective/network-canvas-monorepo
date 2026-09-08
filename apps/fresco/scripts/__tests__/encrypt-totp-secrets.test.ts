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

type StoredRow = { id: string; secret: string };

function makeTx(rows: StoredRow[]) {
  const store = new Map(rows.map((row) => [row.id, { ...row }]));
  const findMany = vi.fn(async () =>
    [...store.values()]
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .map(({ id, secret }) => ({ id, secret })),
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
    totpCredential: { findMany, update },
  } as unknown as Prisma.TransactionClient;
  return { tx, store, findMany, update };
}

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
    const { tx, store, update } = makeTx([LEGACY_ROW]);

    await expect(encryptStoredTotpSecrets(tx, undefined)).rejects.toThrow(
      /1 account\(s\) have two-factor authentication enabled, but TOTP_ENCRYPTION_KEY is not set/,
    );

    expect(update).not.toHaveBeenCalled();
    expect(store.get(LEGACY_ROW.id)?.secret).toBe(LEGACY_ROW.secret);
  });

  it('fails the deploy when the configured key does not open the sealed rows', async () => {
    const { tx, update } = makeTx([
      { id: LEGACY_ROW.id, secret: encryptTotpSecret(LEGACY_ROW.secret, KEY) },
    ]);

    await expect(encryptStoredTotpSecrets(tx, OTHER_KEY)).rejects.toThrow(
      /TOTP_ENCRYPTION_KEY does not match the key that encrypted the stored TOTP secrets/,
    );
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
    const { tx, update } = makeTx([]);

    await expect(
      encryptStoredTotpSecrets(tx, undefined),
    ).resolves.toBeUndefined();

    expect(update).not.toHaveBeenCalled();
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
