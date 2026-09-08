/* eslint-disable no-console */
import { type Prisma } from '~/lib/db/generated/client';
import {
  decryptTotpSecretWithAny,
  encryptTotpSecret,
  isEncryptedTotpSecret,
  type TotpKeyMaterials,
  TotpSecretDecryptError,
} from '~/utils/totpSecretEncryption';

const ENV_VAR = 'TOTP_ENCRYPTION_KEY';

/**
 * Bring every stored TOTP secret under the deployment's current key.
 *
 * Fresco stored TOTP secrets as their bare Base32 seed before it encrypted
 * them at rest, so a database written by an earlier version holds rows the app
 * now refuses to read (`openTotpSecret` accepts only the envelope). This runs
 * at deploy time from `setup-database.ts`, inside the same transaction as the
 * other one-time data migrations, so an upgrade either converts every row or
 * changes nothing. A Fresco upgrade takes the deployment down, so there is no
 * window in which the previous version reads a sealed row.
 *
 * Nothing here needs the operator to act: the key is derived from material the
 * environment already holds (see `resolveTotpKeyMaterials`). What the step
 * does per row:
 *
 * - a plaintext row is sealed under the primary key material;
 * - a row that only a fallback material opens (the database password, once
 *   `TOTP_ENCRYPTION_KEY` has been set) is re-sealed under the primary;
 * - a row nothing opens is discarded if the wizard never confirmed it (an
 *   abandoned enrolment holds a seed nobody can use, and no recovery codes
 *   exist for it), and otherwise left alone with a warning that says how to
 *   recover, because that account's authenticator codes will be refused
 *   until it is re-keyed or re-enrolled. It never fails the deploy: the
 *   account can still sign in with a recovery code, and an administrator can
 *   reset its two-factor authentication.
 */
export async function encryptStoredTotpSecrets(
  prisma: Prisma.TransactionClient,
  keyMaterials: TotpKeyMaterials,
): Promise<void> {
  const rows = await prisma.totpCredential.findMany({
    select: { id: true, secret: true, verified: true },
    orderBy: { id: 'asc' },
  });

  if (rows.length === 0) {
    console.log('No stored TOTP secrets to encrypt.');
    return;
  }

  const [primary] = keyMaterials;
  let sealed = 0;
  let verified = 0;
  let rekeyed = 0;
  const abandoned: string[] = [];
  const unreadable: string[] = [];

  for (const row of rows) {
    if (!isEncryptedTotpSecret(row.secret)) {
      await prisma.totpCredential.update({
        where: { id: row.id },
        data: { secret: encryptTotpSecret(row.secret, primary) },
      });
      sealed++;
      continue;
    }

    let opened: { secret: string; keyIndex: number };
    try {
      opened = decryptTotpSecretWithAny(row.secret, keyMaterials);
    } catch (error) {
      if (!(error instanceof TotpSecretDecryptError)) {
        throw error;
      }
      (row.verified ? unreadable : abandoned).push(row.id);
      continue;
    }

    if (opened.keyIndex === 0) {
      verified++;
      continue;
    }

    await prisma.totpCredential.update({
      where: { id: row.id },
      data: { secret: encryptTotpSecret(opened.secret, primary) },
    });
    rekeyed++;
  }

  if (abandoned.length > 0) {
    await prisma.totpCredential.deleteMany({
      where: { id: { in: abandoned } },
    });
    console.log(
      `Discarded ${abandoned.length} unfinished two-factor enrolment(s) that could not be read with the current key. Enrolment can be started again.`,
    );
  }

  if (unreadable.length > 0) {
    console.warn(
      `${unreadable.length} account(s) have a two-factor authentication secret that cannot be opened with the current key, so their authenticator codes will be refused; they can still sign in with a recovery code. This happens when the database password changed after the secrets were sealed without ${ENV_VAR} set first. To recover, temporarily restore the previous database password, set ${ENV_VAR} to a long random string, start Fresco once so the secrets are re-sealed under it, then change the password again. Otherwise reset two-factor authentication for the affected accounts from User Management so they can enrol again.`,
    );
  }

  console.log(
    `TOTP secret encryption: sealed ${sealed} plaintext secret(s), re-sealed ${rekeyed} under the current key, verified ${verified} already current, ${unreadable.length} unreadable.`,
  );
}
