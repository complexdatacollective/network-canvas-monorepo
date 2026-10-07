'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import {
  type DecryptionScope,
  decryptInScope,
  type EncryptedValue,
  getEncryptedValue,
  isNumberArray,
  readCachedPlaintext,
} from './decryptionScope';
import { useDecryptionScope } from './useDecryptionScope';
import { usePassphrase } from './usePassphrase';

type ProtectedFormValues =
  | { status: 'ready'; values: Record<string, VariableValue> }
  | { status: 'pending' }
  | { status: 'locked'; reason: 'passphrase-needed' | 'passphrase-invalid' };

type ScopedEntity = { scope: DecryptionScope; entityId: string };

const isNode = (entity: NcNode | NcEdge): entity is NcNode =>
  !('from' in entity);

/**
 * The values a form editing `entity` should start from, with every encrypted
 * answer decrypted, or why the form must not be shown yet. With no `entity`
 * (a form for a new one) there is nothing to decrypt.
 *
 * A form with an encrypted question is locked until a working passphrase is in
 * force, whether or not that question has been answered yet: without one its
 * stored answer cannot be shown, and a new answer could not be saved.
 *
 * A form already open under the passphrase in force stays open if that
 * passphrase is later found not to work, so answers being entered are kept;
 * saving them is refused, with the reason shown, until it is re-entered.
 */
export function useProtectedFormValues(
  entity: NcNode | NcEdge | null,
  fields: readonly { variable: string }[],
  variables: Record<string, Variable>,
): ProtectedFormValues {
  const scope = useDecryptionScope();
  const { passphraseInvalid, requirePassphrase, setPassphraseInvalid } =
    usePassphrase();
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const [openedFor, setOpenedFor] = useState<ScopedEntity>();
  const [failedFor, setFailedFor] = useState<ScopedEntity>();

  const protectedFields = useMemo(
    () =>
      fields
        .map((field) => field.variable)
        .filter((variable) => variables[variable]?.encrypted),
    [fields, variables],
  );

  const encrypted = useMemo(() => {
    if (!entity || !isNode(entity)) return [];
    return protectedFields.flatMap(
      (variable): { variable: string; value: EncryptedValue }[] => {
        const value = getEncryptedValue(entity, variable, variables);
        return value ? [{ variable, value }] : [];
      },
    );
  }, [entity, protectedFields, variables]);

  const entityId = entity?.[entityPrimaryKeyProperty];
  const isFor = (marker: ScopedEntity | undefined) =>
    scope !== undefined &&
    marker?.scope === scope &&
    marker.entityId === entityId;

  const locked =
    entity !== null &&
    protectedFields.length > 0 &&
    (!scope || isFor(failedFor) || (passphraseInvalid && !isFor(openedFor)));

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

  // Ciphertext with no metadata to decrypt it can never be shown, and must
  // not reach a form as if it were an answer.
  for (const variable of protectedFields) {
    if (isNumberArray(values[variable])) delete values[variable];
  }

  // Plaintext is read from the passphrase's decryption scope on every render,
  // so it is gone from these values as soon as that passphrase is.
  let missing = false;
  if (scope && !locked) {
    for (const { variable, value } of encrypted) {
      const plaintext = readCachedPlaintext(scope, value);
      if (plaintext === undefined) {
        missing = true;
      } else {
        values[variable] = plaintext;
      }
    }
  }

  useEffect(() => {
    if (!scope || locked || !missing || entityId === undefined) return;

    let current = true;
    Promise.all(encrypted.map(({ value }) => decryptInScope(scope, value)))
      .then(() => {
        if (current) rerender();
      })
      .catch(() => {
        if (!current) return;
        setFailedFor({ scope, entityId });
        setPassphraseInvalid(true);
      });
    return () => {
      current = false;
    };
  }, [scope, locked, missing, encrypted, entityId, setPassphraseInvalid]);

  const ready =
    protectedFields.length > 0 && scope !== undefined && !locked && !missing;
  useEffect(() => {
    if (ready && scope && entityId !== undefined) {
      setOpenedFor({ scope, entityId });
    }
  }, [ready, scope, entityId]);

  if (locked) {
    return {
      status: 'locked',
      reason: scope ? 'passphrase-invalid' : 'passphrase-needed',
    };
  }
  if (missing) return { status: 'pending' };
  return { status: 'ready', values };
}
