import type { Dispatch } from '@reduxjs/toolkit';

import { entitySecureAttributesMeta, type NcNode } from '@codaco/shared-consts';

import { encryptionUnlocked, passphraseRejected } from '../../store/modules/ui';
import type { RootState } from '../../store/store';
import {
  createDecryptionScope,
  type EncryptedValue,
  getDecryptionScope,
  readEncryptedAttribute,
  watchDecryptionScope,
} from './decryptionScope';
import {
  deriveInterviewKey,
  encryptValue,
  opensValue,
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
 * The values stored in `nodes` that a passphrase can be checked against:
 * every value in the current format. A value written by schema 8's
 * experimental format can never be decrypted, so it says nothing about the
 * passphrase and is passed over.
 */
function checkableValues(nodes: readonly NcNode[]): EncryptedValue[] {
  return nodes.flatMap((node) =>
    Object.keys(node[entitySecureAttributesMeta] ?? {}).flatMap(
      (variableId) => {
        // Only a value with its own record is ciphertext beyond doubt, so no
        // codebook is consulted.
        const stored = readEncryptedAttribute(node, variableId, {});
        return stored?.status === 'encrypted' ? [stored.value] : [];
      },
    ),
  );
}

/**
 * Whether the network holds a value a passphrase can be checked against, so
 * that one entered now is checked rather than becoming the interview's.
 */
export const hasCheckableValue = (state: Pick<RootState, 'session'>) =>
  checkableValues(state.session.network.nodes).length > 0;

// The binding of the value made to compare a passphrase with the key already
// in force, when nothing is stored yet. It is never stored.
const PROBE_BINDING = { nodeId: '', variableId: '' };

/**
 * How an attempt to unlock ended: the passphrase became the interview's,
 * there being nothing yet it could be wrong about (`chosen`), its key
 * decrypted an answer already stored or matched the key already in force
 * (`verified`), or it did not (`incorrect`).
 */
type UnlockOutcome = 'chosen' | 'verified' | 'incorrect';

async function attemptUnlock(
  store: UnlockStore,
  passphrase: string,
): Promise<UnlockOutcome> {
  const { session } = store.getState();
  const key = await deriveInterviewKey(passphrase, session.id);

  const stored = checkableValues(session.network.nodes);
  let checks: EncryptedValue[] = stored;
  if (stored.length === 0) {
    // Nothing is stored yet, but a key may already be in force, chosen
    // moments ago: a passphrase entered now must match it, or answers would
    // be written under two keys.
    const inForce = getDecryptionScope(store.getState);
    checks = inForce
      ? [
          {
            ...PROBE_BINDING,
            ...(await encryptValue(inForce.key, '', PROBE_BINDING)),
          },
        ]
      : [];
  }

  if (checks.length === 0) {
    installEncryptionKey(store, key);
    return 'chosen';
  }

  // AES-GCM authenticates every value, so only the right key decrypts one.
  // Every value is tried, one after another until one opens, so a single
  // damaged value cannot turn the right passphrase away.
  for (const value of checks) {
    if (await opensValue(key, value, value)) {
      installEncryptionKey(store, key);
      return 'verified';
    }
  }

  store.dispatch(passphraseRejected());
  return 'incorrect';
}

const attempts = new WeakMap<UnlockStore['getState'], Promise<unknown>>();

/**
 * Derives the interview's key from `passphrase` and the interview's id, and
 * puts it in force.
 *
 * Nothing that checks a passphrase is stored. When the interview holds
 * encrypted answers, the passphrase is accepted only if its key decrypts one
 * of them, so a mistyped one is turned away instead of being used to encrypt
 * answers that could then never be read alongside the others. When it holds
 * none, there is nothing the passphrase could be wrong about, and it is
 * accepted as the interview's.
 *
 * Attempts on one store run one after another, so a second passphrase entered
 * before any answer is stored is checked against the first. Resolves to how
 * the attempt ended.
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
