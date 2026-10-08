import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { Option, Redacted, Schema } from 'effect';

import {
  type LinkToken,
  SessionToken,
} from '@codaco/studio-contract/schema/ids';

const decodeSessionToken = Schema.decodeUnknownOption(SessionToken);

const keyFor = (linkToken: LinkToken): string =>
  `studio.participant.${bytesToHex(sha256(utf8ToBytes(Redacted.value(linkToken))))}`;

// Getters, read inside each caller's `try`: a browser that denies Web Storage
// throws on reading `sessionStorage` or `localStorage` itself, and one denied
// store must not cost the other.
const STORES: ReadonlyArray<() => Storage> = [
  () => sessionStorage,
  () => localStorage,
];

export const readStoredSession = (
  linkToken: LinkToken,
): SessionToken | undefined => {
  for (const store of STORES) {
    try {
      const stored = Option.getOrUndefined(
        decodeSessionToken(store().getItem(keyFor(linkToken))),
      );
      if (stored !== undefined) return stored;
    } catch {
      continue;
    }
  }
  return undefined;
};

export const storeSession = (
  linkToken: LinkToken,
  sessionToken: SessionToken,
  { anonymous }: { readonly anonymous: boolean },
): void => {
  try {
    (anonymous ? sessionStorage : localStorage).setItem(
      keyFor(linkToken),
      Redacted.value(sessionToken),
    );
  } catch {
    return;
  }
};

export const forgetStoredSession = (linkToken: LinkToken): void => {
  for (const store of STORES) {
    try {
      store().removeItem(keyFor(linkToken));
    } catch {
      continue;
    }
  }
};
