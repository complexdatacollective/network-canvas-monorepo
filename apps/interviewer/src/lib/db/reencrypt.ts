import {
  listAssetIds,
  listProtocolIds,
  reencryptAsset,
  reencryptProtocol,
} from './protocols';
import { getSessionDek } from './sessionKey';
import { listSessionIds, reencryptSession } from './sessions';

export type ReencryptProgress = (done: number, total: number) => void;

// `failed` is the number of rows that could not be re-encrypted (e.g. a
// QuotaExceededError on a near-full device, or a corrupt/unexpected row shape).
// The caller uses failed>0 to keep a "re-encryption pending" flag set so a later
// unlock finishes the job; the security invariant is only met once failed === 0.
export type ReencryptResult = { total: number; failed: number };

// Sweep every session, protocol, and asset row and re-encrypt it under the
// currently-held session DEK. This closes the gap where data collected before
// the device was secured (written as plaintext, no `_enc`, while the vault was
// unconfigured / mode `none`) would otherwise stay unencrypted at rest forever
// after the user enrols a PIN/passphrase/biometric: enrolment mints a brand-new
// DEK but re-encrypts nothing on its own.
//
// Correctness properties:
// - Field-preserving: each row is re-read through the decrypting getter and
//   written back through the encrypting setter, which only swap the encryption
//   envelope — every plaintext index field (including `lastUpdatedAt`,
//   `importedAt`, and all timestamps) passes through `...rest` untouched. This
//   is deliberately NOT `updateSession`, which stamps a fresh `lastUpdatedAt`.
// - Idempotent: re-encrypting a row already encrypted under this DEK yields an
//   equivalent row, so a partial sweep can be safely re-run to completion.
// - Per-row isolation: rows are processed one at a time and a failure on ONE row
//   is caught and skipped so the sweep CONTINUES to the rest — a single corrupt
//   row or a mid-sweep QuotaExceededError must not leave every subsequent row
//   plaintext. Failures are counted and returned; the vault + DEK remain valid
//   and un-swept rows stay readable (decrypt is per-row self-describing), so a
//   later re-run (see the resume-on-unlock path in lib/auth/api.ts) finishes the
//   job. Session rows go through the repo's per-id serializer so the sweep can't
//   race the interview engine's own writes.
//
// Precondition: a session DEK MUST be held. The sweep is meant to run right
// after an initial enrol has set the DEK; calling it with no DEK is a caller
// error (encryptSession would otherwise either throw for a locked secured vault
// or silently write plaintext under mode `none`), so we fail fast with a clear
// message rather than doing something surprising. It must never be called for
// mode `none` (data stays plaintext by design) or for a re-enrol (same DEK —
// existing rows are already encrypted).
export async function reencryptAllRecords(
  onProgress?: ReencryptProgress,
): Promise<ReencryptResult> {
  if (getSessionDek() === null) {
    throw new Error(
      'reencryptAllRecords requires an unlocked session DEK (call it after enrolment sets the key)',
    );
  }

  const [sessionIds, protocolIds, assetIds] = await Promise.all([
    listSessionIds(),
    listProtocolIds(),
    listAssetIds(),
  ]);

  const total = sessionIds.length + protocolIds.length + assetIds.length;
  let done = 0;
  let failed = 0;
  onProgress?.(0, total);

  const runRow = async (reencryptRow: () => Promise<void>) => {
    try {
      await reencryptRow();
    } catch (error) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error('Re-encrypting a record failed; skipping it', error);
    }
    done += 1;
    onProgress?.(done, total);
  };

  for (const id of sessionIds) await runRow(() => reencryptSession(id));
  for (const id of protocolIds) await runRow(() => reencryptProtocol(id));
  for (const id of assetIds) await runRow(() => reencryptAsset(id));

  return { total, failed };
}
