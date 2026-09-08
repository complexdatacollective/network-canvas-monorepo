import { Secret, TOTP } from 'otpauth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Prisma } from '~/lib/db/generated/client';
import { encryptStoredTotpSecrets } from '~/scripts/encrypt-totp-secrets';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  isEncryptedTotpSecret,
  type TotpKeyMaterials,
} from '~/utils/totpSecretEncryption';

/** The database password a deployment derives its default key from. */
const DB_PASSWORD = 'npg_release-test-database-password';
/** An explicit TOTP_ENCRYPTION_KEY. */
const OVERRIDE = 'release-test-totp-encryption-key-0123456789';
const ROTATED_PASSWORD = 'npg_a-rotated-database-password';

const DERIVED_ONLY: TotpKeyMaterials = [DB_PASSWORD];
const WITH_OVERRIDE: TotpKeyMaterials = [OVERRIDE, DB_PASSWORD];

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

/** An enrolment someone started and never confirmed, as enableTotp writes it. */
const ABANDONED_ROW = Object.freeze({
  id: 'cm0abandonedtotpcredential0003',
  secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  verified: false,
});

type StoredRow = { id: string; secret: string; verified: boolean };

function makeTx(rows: StoredRow[]) {
  const store = new Map(rows.map((row) => [row.id, { ...row }]));
  const findMany = vi.fn(async () =>
    [...store.values()]
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .map(({ id, secret, verified }) => ({ id, secret, verified })),
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
  const deleteMany = vi.fn(
    async ({ where }: { where: { id: { in: string[] } } }) => {
      let count = 0;
      for (const id of where.id.in) {
        if (store.delete(id)) count++;
      }
      return { count };
    },
  );
  const tx = {
    totpCredential: { findMany, update, deleteMany },
  } as unknown as Prisma.TransactionClient;
  return { tx, store, findMany, update, deleteMany };
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

  it('seals a legacy plaintext row under the derived key so the column no longer holds the seed', async () => {
    const { tx, store, update } = makeTx([LEGACY_ROW]);

    await encryptStoredTotpSecrets(tx, DERIVED_ONLY);

    const stored = store.get(LEGACY_ROW.id)?.secret;
    expect(update).toHaveBeenCalledTimes(1);
    expect(stored).toBeDefined();
    expect(stored).not.toBe(LEGACY_ROW.secret);
    expect(stored).not.toContain(LEGACY_ROW.secret);
    expect(isEncryptedTotpSecret(stored ?? '')).toBe(true);
    expect(decryptTotpSecret(stored ?? '', DB_PASSWORD)).toBe(
      LEGACY_ROW.secret,
    );
  });

  it('keeps codes from the pre-upgrade seed verifiable after the upgrade', async () => {
    const { tx, store } = makeTx([LEGACY_ROW]);
    const authenticator = new TOTP({
      secret: Secret.fromBase32(LEGACY_ROW.secret),
    });
    const code = authenticator.generate();

    await encryptStoredTotpSecrets(tx, DERIVED_ONLY);

    const opened = decryptTotpSecret(
      store.get(LEGACY_ROW.id)?.secret ?? '',
      DB_PASSWORD,
    );
    expect(opened).toBe(LEGACY_ROW.secret);
    expect(
      new TOTP({ secret: Secret.fromBase32(opened) }).validate({
        token: code,
        window: 0,
      }),
    ).toBe(0);
  });

  it('seals under the override when one is set', async () => {
    const { tx, store } = makeTx([LEGACY_ROW]);

    await encryptStoredTotpSecrets(tx, WITH_OVERRIDE);

    const stored = store.get(LEGACY_ROW.id)?.secret ?? '';
    expect(decryptTotpSecret(stored, OVERRIDE)).toBe(LEGACY_ROW.secret);
    expect(() => decryptTotpSecret(stored, DB_PASSWORD)).toThrow(
      /could not be decrypted/,
    );
  });

  it('is idempotent: a second run verifies the sealed row and rewrites nothing', async () => {
    const { tx, store, update } = makeTx([LEGACY_ROW]);
    await encryptStoredTotpSecrets(tx, DERIVED_ONLY);
    const sealedOnce = store.get(LEGACY_ROW.id)?.secret;
    update.mockClear();

    await encryptStoredTotpSecrets(tx, DERIVED_ONLY);

    expect(update).not.toHaveBeenCalled();
    expect(store.get(LEGACY_ROW.id)?.secret).toBe(sealedOnce);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('verified 1 already current'),
    );
  });

  it('re-seals a row sealed under the database password once an override is set', async () => {
    const { tx, store, update } = makeTx([LEGACY_ROW]);
    await encryptStoredTotpSecrets(tx, DERIVED_ONLY);
    update.mockClear();

    await encryptStoredTotpSecrets(tx, WITH_OVERRIDE);

    expect(update).toHaveBeenCalledTimes(1);
    const stored = store.get(LEGACY_ROW.id)?.secret ?? '';
    expect(decryptTotpSecret(stored, OVERRIDE)).toBe(LEGACY_ROW.secret);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('re-sealed 1 under the current key'),
    );
  });

  it('seals only the plaintext rows in a mixed database', async () => {
    const sealedRow = {
      id: 'cm0sealedtotpcredential000002',
      secret: encryptTotpSecret('MFRGGZDFMZTWQ2LKNNWG23TPOBSXE', DB_PASSWORD),
      verified: true,
    };
    const { tx, store, update } = makeTx([LEGACY_ROW, sealedRow]);

    await encryptStoredTotpSecrets(tx, DERIVED_ONLY);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0].where).toEqual({ id: LEGACY_ROW.id });
    expect(store.get(sealedRow.id)?.secret).toBe(sealedRow.secret);
    expect(
      decryptTotpSecret(store.get(LEGACY_ROW.id)?.secret ?? '', DB_PASSWORD),
    ).toBe(LEGACY_ROW.secret);
  });

  it('warns, without failing the deploy, when a verified row was sealed under a rotated password', async () => {
    const { tx, store, update, deleteMany } = makeTx([
      {
        id: LEGACY_ROW.id,
        secret: encryptTotpSecret(LEGACY_ROW.secret, ROTATED_PASSWORD),
        verified: true,
      },
    ]);

    await expect(
      encryptStoredTotpSecrets(tx, DERIVED_ONLY),
    ).resolves.toBeUndefined();

    expect(update).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(store.get(LEGACY_ROW.id)?.secret).toBeDefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '1 account(s) have a two-factor authentication secret that cannot be opened with the current key',
      ),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('set TOTP_ENCRYPTION_KEY'),
    );
  });

  it('discards an unfinished enrolment that no key material opens', async () => {
    const { tx, store, update, deleteMany } = makeTx([
      {
        id: ABANDONED_ROW.id,
        secret: encryptTotpSecret(ABANDONED_ROW.secret, ROTATED_PASSWORD),
        verified: false,
      },
    ]);

    await encryptStoredTotpSecrets(tx, WITH_OVERRIDE);

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(store.has(ABANDONED_ROW.id)).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Discarded 1 unfinished two-factor enrolment(s)'),
    );
  });

  it('discards an unfinished enrolment whose envelope is malformed, and only warns for a verified one', async () => {
    const { tx, store, deleteMany } = makeTx([
      { id: ABANDONED_ROW.id, secret: 'v1:truncated', verified: false },
      { id: LEGACY_ROW.id, secret: 'v1:truncated', verified: true },
    ]);

    await expect(
      encryptStoredTotpSecrets(tx, DERIVED_ONLY),
    ).resolves.toBeUndefined();

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [ABANDONED_ROW.id] } },
    });
    expect(store.has(ABANDONED_ROW.id)).toBe(false);
    expect(store.get(LEGACY_ROW.id)?.secret).toBe('v1:truncated');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 account(s)'));
  });

  it('seals a plaintext unfinished enrolment like any other row', async () => {
    const { tx, store, deleteMany } = makeTx([ABANDONED_ROW]);

    await encryptStoredTotpSecrets(tx, DERIVED_ONLY);

    expect(deleteMany).not.toHaveBeenCalled();
    expect(
      decryptTotpSecret(store.get(ABANDONED_ROW.id)?.secret ?? '', DB_PASSWORD),
    ).toBe(ABANDONED_ROW.secret);
  });

  it('does nothing when no secrets exist', async () => {
    const { tx, update, deleteMany } = makeTx([]);

    await encryptStoredTotpSecrets(tx, DERIVED_ONLY);

    expect(update).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
