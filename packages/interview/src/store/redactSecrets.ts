import type { Action } from '@reduxjs/toolkit';

import type { Codebook, CurrentProtocol } from '@codaco/protocol-validation';

import { isAttributeEncrypted } from '../interfaces/Anonymisation/isAttributeEncrypted';
import { setPassphrase } from './modules/ui';

const REDACTED = '[redacted]';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function getEncryptedVariableIds(
  codebook: Codebook,
  encryptionEnabled: boolean,
): ReadonlySet<string> {
  const variableSets = [
    codebook.ego?.variables,
    ...Object.values(codebook.node ?? {}).map(
      (definition) => definition.variables,
    ),
    ...Object.values(codebook.edge ?? {}).map(
      (definition) => definition.variables,
    ),
  ];

  const ids = new Set<string>();
  for (const variables of variableSets) {
    for (const id of Object.keys(variables ?? {})) {
      if (isAttributeEncrypted(encryptionEnabled, variables, id)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

function redactEncryptedValues(
  value: unknown,
  encryptedIds: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactEncryptedValues(item, encryptedIds));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      encryptedIds.has(key)
        ? REDACTED
        : redactEncryptedValues(item, encryptedIds),
    ]),
  );
}

/**
 * What dev tooling (Redux DevTools and the console logger) may show of the
 * interview's actions and state. The passphrase is kept in the store, and the
 * answers it protects travel as plaintext in the actions that save them (a
 * write thunk's `meta.arg`) before they are encrypted. Both are replaced
 * wherever they appear: answers by the id of a variable the interview
 * encrypts.
 */
export function createSecretRedactors(
  protocol: Pick<CurrentProtocol, 'codebook' | 'experiments'>,
) {
  const encryptedIds = getEncryptedVariableIds(
    protocol.codebook,
    protocol.experiments?.encryptedVariables ?? false,
  );

  const redactAction = <A extends Action>(action: A): A => {
    if (setPassphrase.match(action)) {
      return { ...action, payload: REDACTED };
    }
    if (encryptedIds.size === 0) {
      return action;
    }

    let redacted = action;
    if ('payload' in redacted) {
      redacted = {
        ...redacted,
        payload: redactEncryptedValues(redacted.payload, encryptedIds),
      };
    }
    if ('meta' in redacted) {
      redacted = {
        ...redacted,
        meta: redactEncryptedValues(redacted.meta, encryptedIds),
      };
    }
    return redacted;
  };

  const redactState = <S>(state: S): S => {
    if (
      !isRecord(state) ||
      !isRecord(state.ui) ||
      typeof state.ui.passphrase !== 'string'
    ) {
      return state;
    }
    return { ...state, ui: { ...state.ui, passphrase: REDACTED } };
  };

  return { redactAction, redactState };
}

export type SecretRedactors = ReturnType<typeof createSecretRedactors>;
