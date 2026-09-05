import {
  createCipheriv,
  createDecipheriv,
  type KeyObject,
  randomBytes,
} from 'node:crypto';

import type { EncryptionKeys } from './keys.ts';

const ENVELOPE_VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = 'aes-256-gcm.v1';

export type ProtectedValue = {
  algorithm: string;
  keyId: string;
  envelope: Buffer;
};

export type ParticipantField = {
  teamId: string;
  studyId: string;
  participantId: string;
  column:
    | 'email_ciphertext'
    | 'phone_ciphertext'
    | 'name_ciphertext'
    | 'attributes_ciphertext';
};

export type IntegrationField =
  | {
      kind: 'webhook';
      teamId: string;
      subscriptionId: string;
      column: 'secret_ciphertext';
    }
  | {
      kind: 'oauth';
      userId: string;
      accountId: string;
      column: 'accessToken' | 'refreshToken' | 'idToken';
    };

/**
 * Supplied only by the server's authorization/audit integration. It must
 * authorize the exact target, invoke read inside its transaction, append the
 * required event, and commit before resolving. A failed audit must reject.
 * There is deliberately no default/no-op boundary and no exported decrypt.
 */
export type ProtectedReadBoundary<Target> = (
  target: Readonly<Target>,
  read: () => Buffer,
) => Promise<void>;

export class ProtectedDataError extends Error {
  constructor() {
    super('Stored encrypted data could not be read.');
    this.name = 'ProtectedDataError';
  }
}

function tuple(parts: readonly string[]): Buffer {
  if (parts.some((part) => part.length === 0)) throw new ProtectedDataError();
  // JSON tuple framing prevents ambiguous identifiers containing '|'. The
  // participant tuple is exactly team, study, participant, column in order.
  return Buffer.from(JSON.stringify(parts));
}

function participantAad(target: ParticipantField): Buffer {
  return tuple([
    target.teamId,
    target.studyId,
    target.participantId,
    target.column,
  ]);
}

function integrationAad(target: IntegrationField): Buffer {
  return target.kind === 'webhook'
    ? tuple([target.kind, target.teamId, target.subscriptionId, target.column])
    : tuple([target.kind, target.userId, target.accountId, target.column]);
}

function integrationScope(target: IntegrationField): readonly string[] {
  return target.kind === 'webhook'
    ? ['team', target.teamId]
    : ['account', target.userId, target.accountId];
}

function encrypt(key: KeyObject, aad: Buffer, plaintext: Uint8Array): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  // Same AES-GCM nonce/AAD/tag convention as Interviewer's tested vault;
  // Studio's bytea contract packages it as version || nonce || ct || tag.
  return Buffer.concat([
    Buffer.from([ENVELOPE_VERSION]),
    nonce,
    ciphertext,
    cipher.getAuthTag(),
  ]);
}

function decrypt(key: KeyObject, aad: Buffer, value: ProtectedValue): Buffer {
  const bytes = value.envelope;
  if (
    value.algorithm !== ALGORITHM ||
    bytes.byteLength < 1 + NONCE_BYTES + TAG_BYTES ||
    bytes[0] !== ENVELOPE_VERSION
  ) {
    throw new ProtectedDataError();
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    bytes.subarray(1, 1 + NONCE_BYTES),
    { authTagLength: TAG_BYTES },
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(bytes.subarray(-TAG_BYTES));
  const pending = decipher.update(bytes.subarray(1 + NONCE_BYTES, -TAG_BYTES));
  try {
    // update() yields unauthenticated bytes. Return nothing until final()
    // verifies the tag; discard the temporary bytes even on authentication
    // failure rather than exposing a partial plaintext.
    return Buffer.concat([pending, decipher.final()]);
  } finally {
    pending.fill(0);
  }
}

async function auditedRead<Target>(
  target: Readonly<Target>,
  boundary: ProtectedReadBoundary<Target>,
  open: () => Buffer,
): Promise<Buffer> {
  let active = true;
  let consumed = false;
  let plaintext: Buffer | undefined;
  try {
    await boundary(target, () => {
      if (!active || consumed) throw new ProtectedDataError();
      consumed = true;
      plaintext = open();
      return plaintext;
    });
    if (!plaintext) throw new ProtectedDataError();
    return plaintext;
  } catch (error) {
    // An audit/commit failure must not return the plaintext, including any
    // buffer the integration retained while performing its transaction.
    plaintext?.fill(0);
    throw error;
  } finally {
    // A captured read callback cannot be replayed outside its boundary.
    active = false;
  }
}

/** Internal foundation: no RPC/REST, environment, or database wiring yet. */
export function createDataProtection(
  keys: EncryptionKeys,
  boundaries: {
    participant: ProtectedReadBoundary<ParticipantField>;
    integration: ProtectedReadBoundary<IntegrationField>;
  },
) {
  function encryptParticipant(
    target: ParticipantField,
    plaintext: Uint8Array,
  ): ProtectedValue {
    const id = keys.currentId('pii-enc');
    const aad = participantAad(target);
    const key = keys.derive('pii-enc', id, ['team', target.teamId]);
    return {
      algorithm: ALGORITHM,
      keyId: id,
      envelope: encrypt(key, aad, plaintext),
    };
  }

  function encryptIntegration(
    target: IntegrationField,
    plaintext: Uint8Array,
  ): ProtectedValue {
    const id = keys.currentId('integration-enc');
    const aad = integrationAad(target);
    const key = keys.derive('integration-enc', id, integrationScope(target));
    return {
      algorithm: ALGORITHM,
      keyId: id,
      envelope: encrypt(key, aad, plaintext),
    };
  }

  function readParticipant(target: ParticipantField, value: ProtectedValue) {
    // Snapshot before the asynchronous authorization boundary: mutation of
    // caller-owned context or ciphertext must not redirect an approved read.
    const context = Object.freeze({ ...target });
    const stored = { ...value, envelope: Buffer.from(value.envelope) };
    return auditedRead(context, boundaries.participant, () => {
      try {
        const key = keys.derive('pii-enc', stored.keyId, [
          'team',
          context.teamId,
        ]);
        return decrypt(key, participantAad(context), stored);
      } catch {
        throw new ProtectedDataError();
      }
    });
  }

  function readIntegration(target: IntegrationField, value: ProtectedValue) {
    const context = Object.freeze({ ...target });
    const stored = { ...value, envelope: Buffer.from(value.envelope) };
    return auditedRead(context, boundaries.integration, () => {
      try {
        const key = keys.derive(
          'integration-enc',
          stored.keyId,
          integrationScope(context),
        );
        return decrypt(key, integrationAad(context), stored);
      } catch {
        throw new ProtectedDataError();
      }
    });
  }

  return {
    encryptParticipant,
    readParticipant,
    encryptIntegration,
    readIntegration,
  };
}
