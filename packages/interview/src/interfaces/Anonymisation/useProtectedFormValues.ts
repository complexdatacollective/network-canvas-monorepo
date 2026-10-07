'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import { shallow } from 'zustand/shallow';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import {
  decryptInScope,
  type EncryptedValue,
  readCachedOutcome,
  readEncryptedAttribute,
  type UnreadableReason,
} from './decryptionScope';
import { useDecryptionScope } from './useDecryptionScope';
import { usePassphrase } from './usePassphrase';
import { useReportUnreadable } from './useReportUnreadable';

type ProtectedFormValues =
  | {
      status: 'ready';
      values: Record<string, VariableValue>;
      /**
       * The questions whose stored answer can never be shown. Each is left
       * out of `values`, and must be left as it is stored unless the
       * participant gives a new answer.
       */
      unavailable: readonly string[];
    }
  | { status: 'pending' }
  | { status: 'locked' };

const isNode = (entity: NcNode | NcEdge): entity is NcNode =>
  !('from' in entity);

/**
 * `next`, or the object last returned while it holds the same entries. The
 * values are rebuilt on every render; handing back the same object for the
 * same answers keeps a re-render from looking like a change to anything that
 * memoises on, or reacts to, them.
 */
function useSameWhileUnchanged<T extends object>(next: T): T {
  const [kept, setKept] = useState(next);
  const unchanged = shallow(kept, next);
  if (!unchanged) setKept(next);
  return unchanged ? kept : next;
}

/**
 * The values a form editing `entity` should start from, with every encrypted
 * answer decrypted, or why the form must not be shown yet. With no `entity`
 * (a form for a new one) there is nothing to decrypt.
 *
 * A form with an encrypted question is locked until the interview's key is in
 * force, whether or not that question has been answered yet: without it the
 * stored answer cannot be shown, and a new answer could not be saved. So is a
 * form holding an answer stored encrypted under a question the codebook no
 * longer encrypts, until that answer can be shown. An answer that can never be
 * read is left out of the values, named in `unavailable`, and reported.
 */
export function useProtectedFormValues(
  entity: NcNode | NcEdge | null,
  fields: readonly { variable: string }[],
  variables: Record<string, Variable>,
): ProtectedFormValues {
  const scope = useDecryptionScope();
  const { requirePassphrase } = usePassphrase();
  const reportUnreadable = useReportUnreadable();
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  const savesEncrypted = useMemo(
    () => fields.some(({ variable }) => variables[variable]?.encrypted),
    [fields, variables],
  );

  const stored = useMemo(() => {
    if (!entity || !isNode(entity)) return [];
    return fields.flatMap(({ variable }) => {
      const attribute = readEncryptedAttribute(entity, variable, variables);
      return attribute ? [{ variable, attribute }] : [];
    });
  }, [entity, fields, variables]);

  const locked =
    entity !== null &&
    !scope &&
    (savesEncrypted ||
      stored.some(({ attribute }) => attribute.status === 'encrypted'));

  useEffect(() => {
    if (locked) requirePassphrase();
  }, [locked, requirePassphrase]);

  const values: Record<string, VariableValue> = {};
  for (const [key, value] of Object.entries(
    entity?.[entityAttributesProperty] ?? {},
  )) {
    if (value !== null && value !== undefined) {
      Object.defineProperty(values, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    }
  }

  // Plaintext is read from the key's decryption scope on every render, so it
  // is gone from these values as soon as that key is. Ciphertext never reaches
  // the form as if it were an answer.
  const pending: EncryptedValue[] = [];
  const unreadable = new Set<UnreadableReason>();
  const unavailable: string[] = [];
  for (const { variable, attribute } of stored) {
    delete values[variable];
    if (attribute.status === 'unreadable') {
      unreadable.add(attribute.reason);
      unavailable.push(variable);
      continue;
    }
    if (!scope) continue;
    const outcome = readCachedOutcome(scope, attribute.value);
    if (!outcome) {
      pending.push(attribute.value);
    } else if (outcome.readable) {
      values[variable] = outcome.plaintext;
    } else {
      unreadable.add('decryption-failed');
      unavailable.push(variable);
    }
  }
  const missing = pending.length > 0;

  // Runs after every commit, since outcomes arrive in the scope rather than
  // through props; each reason is reported only once per interview.
  useEffect(() => {
    for (const reason of unreadable) reportUnreadable(reason);
  });

  useEffect(() => {
    if (!scope || !missing) return;

    let current = true;
    void Promise.all(
      stored.flatMap(({ attribute }) =>
        attribute.status === 'encrypted'
          ? [decryptInScope(scope, attribute.value)]
          : [],
      ),
    ).then(() => {
      if (current) rerender();
    });
    return () => {
      current = false;
    };
  }, [scope, missing, stored]);

  const stableValues = useSameWhileUnchanged(values);
  const stableUnavailable = useSameWhileUnchanged(unavailable);

  if (locked) return { status: 'locked' };
  if (missing) return { status: 'pending' };
  return {
    status: 'ready',
    values: stableValues,
    unavailable: stableUnavailable,
  };
}
