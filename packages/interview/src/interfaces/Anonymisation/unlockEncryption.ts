import type { Dispatch } from '@reduxjs/toolkit';

import { setEncryptionHeader } from '../../store/modules/session';
import { encryptionUnlocked, passphraseRejected } from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import { createDecryptionScope, watchDecryptionScope } from './decryptionScope';
import {
  createEncryptionHeader,
  isUsableEncryptionHeader,
  openEncryptionHeader,
} from './encryptionFormat';

type UnlockStore = {
  getState: () => Pick<RootState, 'session' | 'ui'>;
  dispatch: Dispatch;
  subscribe: (listener: () => void) => () => void;
};

/** Puts `key` in force for this store's encrypted reads and writes. */
export function installEncryptionKey(store: UnlockStore, key: CryptoKey) {
  const scope = createDecryptionScope(store.getState, key);
  store.dispatch(encryptionUnlocked(scope.id));
  watchDecryptionScope(store, scope);
}

/**
 * How an attempt to unlock ended: the passphrase became the interview's
 * (`chosen`), matched the one chosen earlier (`verified`), did not match it
 * (`incorrect`), or was never checked because the interview's header is
 * outside the runtime's bounds and no passphrase can open it (`unavailable`).
 */
type UnlockOutcome = 'chosen' | 'verified' | 'incorrect' | 'unavailable';

async function attemptUnlock(
  store: UnlockStore,
  passphrase: string,
): Promise<UnlockOutcome> {
  const header = store.getState().session.network.encryption;

  if (header) {
    // Not a wrong passphrase: no passphrase can open this header, so asking
    // again would never end.
    if (!isUsableEncryptionHeader(header)) return 'unavailable';

    const key = await openEncryptionHeader(header, passphrase);
    if (!key) {
      store.dispatch(passphraseRejected());
      return 'incorrect';
    }
    installEncryptionKey(store, key);
    return 'verified';
  }

  const created = await createEncryptionHeader(passphrase);
  store.dispatch(setEncryptionHeader(created.header));
  installEncryptionKey(store, created.key);
  return 'chosen';
}

const attempts = new WeakMap<UnlockStore['getState'], Promise<unknown>>();

/**
 * Derives the interview's key from `passphrase` and puts it in force.
 *
 * In an interview with an encryption header, the passphrase is accepted only
 * if its key decrypts the header's check value, so a mistyped one is turned
 * away instead of being used to encrypt answers that could then never be read
 * alongside the others. In an interview without one, the passphrase is the
 * first, and the header is created from it. A header outside the runtime's
 * bounds is never derived under, and is left as it is.
 *
 * Attempts on one store run one after another, so two can never create two
 * headers. Resolves to how the attempt ended.
 */
export function unlockEncryption(
  store: UnlockStore,
  passphrase: string,
): Promise<UnlockOutcome> {
  const previous = attempts.get(store.getState) ?? Promise.resolve();
  const attempt = previous.then(() => attemptUnlock(store, passphrase));
  attempts.set(
    store.getState,
    attempt.catch(() => undefined),
  );
  return attempt;
}
