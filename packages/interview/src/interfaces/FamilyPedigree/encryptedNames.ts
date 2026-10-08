'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useStore } from 'react-redux';

import type { Variable } from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import type { RootState } from '../../store/store';
import {
  type DecryptionScope,
  decryptInScope,
  getDecryptionScope,
  type OutcomeOf,
  readCachedOutcome,
  readEncryptedAttribute,
  type StoredEncryptedAttribute,
  type UnreadableReason,
} from '../Anonymisation/decryptionScope';
import { useDecryptedOutcomes } from '../Anonymisation/useDecryptionScope';
import { useReportUnreadable } from '../Anonymisation/useReportUnreadable';

type StoredName = { personId: string; stored: StoredEncryptedAttribute };

/** Each person whose name is stored as ciphertext, readable or not. */
export function storedEncryptedNames(
  nodes: readonly NcNode[],
  nameAttribute: string,
  variables: Record<string, Variable>,
): StoredName[] {
  return nodes.flatMap((node) => {
    const stored = readEncryptedAttribute(node, nameAttribute, variables);
    return stored ? [{ personId: node[entityPrimaryKeyProperty], stored }] : [];
  });
}

/** The text of each encrypted name decrypted so far, by person id. */
export function readDecryptedNames(
  names: readonly StoredName[],
  outcomeOf: OutcomeOf,
): Map<string, string> {
  const decrypted = new Map<string, string>();
  for (const { personId, stored } of names) {
    if (stored.status !== 'encrypted') continue;
    const outcome = outcomeOf(stored.value);
    if (outcome?.readable) decrypted.set(personId, outcome.plaintext);
  }
  return decrypted;
}

const encryptedValues = (names: readonly StoredName[]) =>
  names.flatMap(({ stored }) =>
    stored.status === 'encrypted' ? [stored.value] : [],
  );

/**
 * The family's encrypted names, decrypted with the interview's key for the
 * stage to show and to tell people apart by. Nothing is decrypted while no key
 * is in force, and nothing here asks for the passphrase. A name that can
 * never be read is left out, and reported.
 */
export function useDecryptedNames({
  nodes,
  nameAttribute,
  variables,
}: {
  nodes: readonly NcNode[];
  nameAttribute: string;
  variables: Record<string, Variable>;
}) {
  const store = useStore<RootState>();
  const reportUnreadable = useReportUnreadable();

  const stored = useMemo(
    () => storedEncryptedNames(nodes, nameAttribute, variables),
    [nodes, nameAttribute, variables],
  );
  const values = useMemo(() => encryptedValues(stored), [stored]);
  const outcomeOf = useDecryptedOutcomes(values);

  const names = useMemo(
    () => readDecryptedNames(stored, outcomeOf),
    [stored, outcomeOf],
  );

  useEffect(() => {
    for (const { stored: name } of stored) {
      if (name.status === 'unreadable') reportUnreadable(name.reason);
      else if (outcomeOf(name.value)?.readable === false) {
        reportUnreadable('decryption-failed');
      }
    }
  }, [stored, outcomeOf, reportUnreadable]);

  /** Every name among these nodes that can be decrypted, once it is. */
  const decryptAll = useCallback(
    async (latest: readonly NcNode[]) => {
      const scope = getDecryptionScope(store.getState);
      const latestNames = storedEncryptedNames(
        latest,
        nameAttribute,
        variables,
      );
      if (!scope) return readDecryptedNames(latestNames, () => undefined);
      await Promise.all(
        encryptedValues(latestNames).map((value) =>
          decryptInScope(scope, value),
        ),
      );
      return readDecryptedNames(latestNames, (value) =>
        readCachedOutcome(scope, value),
      );
    },
    [store, nameAttribute, variables],
  );

  return { names, decryptAll };
}

type ProtectedDetails =
  | {
      status: 'ready';
      /** Each value decrypted, by attribute. */
      values: Map<string, string>;
      /** The attributes whose stored value can never be shown. */
      unavailable: string[];
      /** Why each of those cannot be read. */
      unreadable: UnreadableReason[];
    }
  | { status: 'locked' };

/**
 * The person's values for these attributes, each decrypted where it is
 * stored encrypted, for the form that edits them. Locked while one is stored
 * encrypted and no key is in force, unless no passphrase can ever put one in
 * force: then, like a value that can never be read, it is unavailable.
 */
export async function decryptDetails(
  node: NcNode,
  attributes: readonly string[],
  variables: Record<string, Variable>,
  scope: DecryptionScope | undefined,
  encryptionUnavailable: boolean,
): Promise<ProtectedDetails> {
  const values = new Map<string, string>();
  const unavailable: string[] = [];
  const unreadable: UnreadableReason[] = [];
  for (const attribute of attributes) {
    const stored = readEncryptedAttribute(node, attribute, variables);
    if (!stored) continue;
    if (stored.status === 'unreadable') {
      unavailable.push(attribute);
      unreadable.push(stored.reason);
      continue;
    }
    if (!scope) {
      if (!encryptionUnavailable) return { status: 'locked' };
      unavailable.push(attribute);
      continue;
    }
    const outcome = await decryptInScope(scope, stored.value);
    if (outcome.readable) {
      values.set(attribute, outcome.plaintext);
    } else {
      unavailable.push(attribute);
      unreadable.push('decryption-failed');
    }
  }
  return { status: 'ready', values, unavailable, unreadable };
}
