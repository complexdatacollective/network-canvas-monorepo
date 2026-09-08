/* eslint-disable no-console */
import { type Prisma } from '~/lib/db/generated/client';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  isEncryptedTotpSecret,
  TotpSecretDecryptError,
} from '~/utils/totpSecretEncryption';

const ENV_VAR = 'TOTP_ENCRYPTION_KEY';

/**
 * Seal every plaintext TOTP secret with the deployment's key, and check that
 * every already-sealed secret opens with it.
 *
 * Fresco stored TOTP secrets as their bare Base32 seed before it encrypted
 * them at rest, so a database written by an earlier version holds rows the app
 * would now refuse to read (`openTotpSecret` accepts only the envelope). This
 * runs at deploy time from `setup-database.ts`, inside the same transaction as
 * the other one-time data migrations, so an upgrade either seals every row or
 * changes nothing. A Fresco upgrade takes the deployment down, so there is no
 * window in which the previous version reads a sealed row.
 *
 * It is also the deploy-time check that the key is usable at all. A missing key
 * with sealed or unsealed secrets on file, or a key that does not open the
 * sealed ones, would lock every two-factor account out at sign-in; failing the
 * deploy here says exactly which of those it is while the operator can still
 * act on it.
 */
export async function encryptStoredTotpSecrets(
  prisma: Prisma.TransactionClient,
  keyMaterial: string | undefined,
): Promise<void> {
  const rows = await prisma.totpCredential.findMany({
    select: { id: true, secret: true },
    orderBy: { id: 'asc' },
  });

  if (rows.length === 0) {
    if (keyMaterial) {
      console.log('No stored TOTP secrets to encrypt.');
    } else {
      console.warn(
        `${ENV_VAR} is not set. No account has enabled two-factor authentication yet, and none can until it is: set ${ENV_VAR} to a long random string (for example the output of \`openssl rand -base64 32\`).`,
      );
    }
    return;
  }

  if (!keyMaterial) {
    throw new Error(
      `${rows.length} account(s) have two-factor authentication enabled, but ${ENV_VAR} is not set. Fresco encrypts TOTP secrets at rest with this key. Set ${ENV_VAR} to a long random string (for example the output of \`openssl rand -base64 32\`) and deploy again.`,
    );
  }

  let sealed = 0;
  let verified = 0;

  for (const row of rows) {
    if (isEncryptedTotpSecret(row.secret)) {
      try {
        decryptTotpSecret(row.secret, keyMaterial);
      } catch (error) {
        if (
          error instanceof TotpSecretDecryptError &&
          error.reason === 'wrong-key'
        ) {
          throw new Error(
            `${ENV_VAR} does not match the key that encrypted the stored TOTP secrets, so no account with two-factor authentication could sign in. Restore the original key. If it is lost, delete the affected TotpCredential and RecoveryCode rows so those accounts can enrol again.`,
            { cause: error },
          );
        }
        throw error;
      }
      verified++;
      continue;
    }

    await prisma.totpCredential.update({
      where: { id: row.id },
      data: { secret: encryptTotpSecret(row.secret, keyMaterial) },
    });
    sealed++;
  }

  console.log(
    `TOTP secret encryption: sealed ${sealed} plaintext secret(s), verified ${verified} already-encrypted secret(s) against ${ENV_VAR}.`,
  );
}
