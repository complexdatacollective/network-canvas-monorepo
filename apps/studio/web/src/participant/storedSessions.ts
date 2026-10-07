import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { Option, Schema } from 'effect';

import {
  type LinkToken,
  SessionToken,
} from '@codaco/studio-contract/schema/ids';

const decodeSessionToken = Schema.decodeUnknownOption(SessionToken);

const keyFor = (linkToken: LinkToken): string =>
  `studio.participant.${bytesToHex(sha256(utf8ToBytes(linkToken)))}`;

const stores = (): Storage[] => [sessionStorage, localStorage];

export const readStoredSession = (
  linkToken: LinkToken,
): SessionToken | undefined => {
  for (const store of stores()) {
    try {
      const stored = Option.getOrUndefined(
        decodeSessionToken(store.getItem(keyFor(linkToken))),
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
      sessionToken,
    );
  } catch {
    return;
  }
};

export const forgetStoredSession = (linkToken: LinkToken): void => {
  for (const store of stores()) {
    try {
      store.removeItem(keyFor(linkToken));
    } catch {
      continue;
    }
  }
};
