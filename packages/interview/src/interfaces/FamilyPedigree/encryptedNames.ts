'use client';

import { hash } from 'ohash';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { decryptData } from '../Anonymisation/utils';

/** A name as the interview's encryption stores it: ciphertext, with the salt
 * and initialisation vector it was made with. */
type EncryptedName = {
  data: number[];
  secureAttributes: { iv: number[]; salt: number[] };
};

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number');

/**
 * A person's name, when it is stored encrypted. Undefined for a name held as
 * text, and for none. A value with no record of how it was encrypted cannot
 * be decrypted, and is undefined too.
 */
export function encryptedNameOf(
  node: NcNode,
  nameAttribute: string,
): EncryptedName | undefined {
  const secure = node[entitySecureAttributesMeta]?.[nameAttribute];
  const data = node[entityAttributesProperty][nameAttribute];
  if (!secure || !isNumberArray(data)) return undefined;
  return { data, secureAttributes: { iv: secure.iv, salt: secure.salt } };
}

type DecryptedNames = {
  /** Each name decrypted so far, by person id. */
  names: Map<string, string>;
  /** The passphrase could not decrypt at least one of the names. */
  failed: boolean;
  /** Every name has been decrypted, or has failed to be. */
  settled: boolean;
};

const EMPTY: ReadonlyMap<string, string> = new Map();

/**
 * Decrypts a family's encrypted names with a passphrase, remembering each
 * result (by passphrase and ciphertext) so that a name is decrypted once, and
 * a new passphrase tries every name again.
 */
export class NameDecryptor {
  /** Each name's text, or null where the passphrase could not decrypt it. */
  private readonly results = new Map<string, string | null>();
  private readonly running = new Map<string, Promise<void>>();

  private static keyOf(passphrase: string, encrypted: EncryptedName) {
    return hash([passphrase, encrypted.data, encrypted.secureAttributes]);
  }

  /**
   * The names already decrypted among these nodes. `expected` gives, by
   * person id, the text a name being decrypted is known to hold, because the
   * stage has just written it.
   */
  read(
    nodes: readonly NcNode[],
    nameAttribute: string,
    passphrase: string,
    expected: ReadonlyMap<string, string> = EMPTY,
  ): DecryptedNames {
    const names = new Map<string, string>();
    let failed = false;
    let settled = true;
    for (const node of nodes) {
      const encrypted = encryptedNameOf(node, nameAttribute);
      if (!encrypted) continue;
      const id = node[entityPrimaryKeyProperty];
      const result = this.results.get(
        NameDecryptor.keyOf(passphrase, encrypted),
      );
      if (result === null) {
        failed = true;
      } else if (result !== undefined) {
        names.set(id, result);
      } else {
        settled = false;
        const text = expected.get(id);
        if (text !== undefined) names.set(id, text);
      }
    }
    return { names, failed, settled };
  }

  /** Decrypts every name among these nodes not yet decrypted, then reads
   * them all. */
  async decrypt(
    nodes: readonly NcNode[],
    nameAttribute: string,
    passphrase: string,
  ): Promise<DecryptedNames> {
    const waiting: Promise<void>[] = [];
    for (const node of nodes) {
      const encrypted = encryptedNameOf(node, nameAttribute);
      if (!encrypted) continue;
      const key = NameDecryptor.keyOf(passphrase, encrypted);
      if (this.results.has(key)) continue;
      const run =
        this.running.get(key) ?? this.start(key, encrypted, passphrase);
      waiting.push(run);
    }
    await Promise.all(waiting);
    return this.read(nodes, nameAttribute, passphrase);
  }

  private start(key: string, encrypted: EncryptedName, passphrase: string) {
    const run = (async () => {
      try {
        this.results.set(key, await decryptData(encrypted, passphrase));
      } catch {
        // A wrong passphrase, or ciphertext that is not what it claims.
        this.results.set(key, null);
      } finally {
        this.running.delete(key);
      }
    })();
    this.running.set(key, run);
    return run;
  }
}

/**
 * The family's encrypted names, decrypted with the participant's passphrase
 * for the stage to show and to tell people apart by. Nothing is decrypted
 * while `enabled` is false or there is no passphrase. A name the passphrase
 * cannot decrypt calls `onUndecryptable`, once for each time the passphrase
 * is entered (`passphraseInvalid` returning to false).
 *
 * `expectName` gives the text of a name the stage is about to write, so the
 * person is shown by it while the new ciphertext is decrypted, rather than
 * by a label for that moment.
 */
export function useDecryptedNames({
  nodes,
  nameAttribute,
  enabled,
  passphrase,
  passphraseInvalid,
  onUndecryptable,
}: {
  nodes: readonly NcNode[];
  nameAttribute: string;
  enabled: boolean;
  passphrase: string | null;
  passphraseInvalid: boolean;
  onUndecryptable: () => void;
}) {
  const [decryptor] = useState(() => new NameDecryptor());
  // Changes whenever more names have been decrypted.
  const [version, setVersion] = useState(0);
  const [expected, setExpected] = useState<ReadonlyMap<string, string>>(EMPTY);
  const key = enabled && passphrase ? passphrase : null;

  const names = useMemo(() => {
    if (!key) return EMPTY;
    // Read again whenever more names have been decrypted.
    void version;
    return decryptor.read(nodes, nameAttribute, key, expected).names;
  }, [decryptor, nodes, nameAttribute, key, expected, version]);

  const onUndecryptableRef = useRef(onUndecryptable);
  onUndecryptableRef.current = onUndecryptable;

  useEffect(() => {
    if (!key) return;
    let live = true;
    const before = decryptor.read(nodes, nameAttribute, key);
    void (async () => {
      const { failed } = await decryptor.decrypt(nodes, nameAttribute, key);
      if (!live) return;
      if (!before.settled) setVersion((current) => current + 1);
      if (failed && !passphraseInvalid) onUndecryptableRef.current();
    })();
    return () => {
      live = false;
    };
  }, [decryptor, nodes, nameAttribute, key, passphraseInvalid]);

  const expectName = useCallback((personId: string, text: string) => {
    setExpected((current) => new Map(current).set(personId, text));
  }, []);

  /** Every name among these nodes, once all of them are decrypted. */
  const decryptAll = useCallback(
    async (latest: readonly NcNode[]) =>
      key
        ? decryptor.decrypt(latest, nameAttribute, key)
        : { names: new Map<string, string>(), failed: false, settled: true },
    [decryptor, nameAttribute, key],
  );

  return { names, expectName, decryptAll };
}
