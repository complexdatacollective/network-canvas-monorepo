import {
  type CurrentProtocol,
  FinishOutcomeSchema,
} from '@codaco/protocol-validation';
import {
  NcNetworkSchema,
  StageMetadataSchema,
  type StageMetadata,
} from '@codaco/shared-consts';

import {
  decryptAssetData,
  decryptJson,
  encryptAssetData,
  encryptJson,
  type EncryptedAssetData,
  type EncryptedField,
} from '../vault/crypto';
import { readVault } from '../vault/vaultStore';
import { getSessionDek } from './sessionKey';
import type { StoredAsset, StoredProtocol, StoredSession } from './types';

// A null session DEK is ambiguous: it means either mode 'none' (no key ever
// exists — legitimate plaintext) or a secured vault that is currently locked.
// Passing through plaintext for a locked secured vault would silently persist
// research data unencrypted at rest, so the write side must fail closed exactly
// as the decrypt side does. Consult the vault mode to disambiguate.
function assertNotLockedSecuredVault(kind: 'session' | 'protocol' | 'asset') {
  const mode = readVault()?.mode;
  if (mode === 'pin' || mode === 'passphrase' || mode === 'biometric') {
    throw new Error(`Cannot encrypt ${kind}: vault is locked (no key)`);
  }
}

export type StoredSessionRow = Omit<
  StoredSession,
  'network' | 'stageMetadata' | 'finishStageId' | 'finishOutcome'
> & {
  network?: unknown;
  stageMetadata?: unknown;
  // Plaintext only on a row written without a key (vault mode `none`).
  finishStageId?: unknown;
  finishOutcome?: unknown;
  _enc?: {
    network: EncryptedField;
    stageMetadata?: EncryptedField;
    // The finish stage id and outcome, together. Absent while the session is
    // unfinished, or when it was finished before they were recorded.
    finish?: EncryptedField;
  };
};

type SessionFinishRecord = Pick<
  StoredSession,
  'finishStageId' | 'finishOutcome'
>;

function parseFinishStageId(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseFinishOutcome(value: unknown): StoredSession['finishOutcome'] {
  const parsed = FinishOutcomeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseFinishRecord(value: unknown): SessionFinishRecord {
  if (typeof value !== 'object' || value === null) {
    return { finishStageId: null, finishOutcome: null };
  }
  return {
    finishStageId: parseFinishStageId(
      'stageId' in value ? value.stageId : undefined,
    ),
    finishOutcome: parseFinishOutcome(
      'outcome' in value ? value.outcome : undefined,
    ),
  };
}

/**
 * The row with its finish stage id and outcome removed, in plaintext and
 * encrypted form alike. Marking a session unfinished uses this, so it needs no
 * key.
 */
export function withoutSessionFinish(row: StoredSessionRow): StoredSessionRow {
  const {
    finishStageId: _stageId,
    finishOutcome: _outcome,
    _enc,
    ...rest
  } = row;
  if (!_enc) return rest;
  const { finish: _finish, ...enc } = _enc;
  return { ...rest, _enc: enc };
}

export type StoredProtocolRow = Omit<
  StoredProtocol,
  'protocol' | 'codebook'
> & {
  protocol?: CurrentProtocol;
  codebook?: CurrentProtocol['codebook'];
  _enc?: { protocol: EncryptedField; codebook: EncryptedField };
};

export type StoredAssetRow = Omit<StoredAsset, 'data'> & {
  data?: Blob | string;
  _enc?: { data: EncryptedAssetData };
};

function sessionAad(id: string): string {
  return `sessions:${id}`;
}

function protocolAad(hash: string): string {
  return `protocols:${hash}`;
}

function parseStageMetadata(value: unknown): StageMetadata | undefined {
  return value === undefined ? undefined : StageMetadataSchema.parse(value);
}

// The asset row id is already `${protocolHash}::${assetId}`; bind the AAD to it
// so a ciphertext can't be replayed under a different asset row.
function assetAad(id: string): string {
  return `assets:${id}`;
}

export async function encryptSession(
  s: StoredSession,
): Promise<StoredSessionRow> {
  const dek = getSessionDek();
  const { network, stageMetadata, finishStageId, finishOutcome, ...rest } = s;
  const hasFinish =
    (finishStageId ?? null) !== null || (finishOutcome ?? null) !== null;
  if (!dek) {
    assertNotLockedSecuredVault('session');
    return {
      ...rest,
      network,
      stageMetadata,
      ...(hasFinish ? { finishStageId, finishOutcome } : {}),
    };
  }
  const aad = sessionAad(s.id);
  const encNetwork = await encryptJson(network, dek, aad);
  const encStageMetadata =
    stageMetadata === undefined
      ? undefined
      : await encryptJson(stageMetadata, dek, aad);
  const encFinish = hasFinish
    ? await encryptJson(
        { stageId: finishStageId ?? null, outcome: finishOutcome ?? null },
        dek,
        aad,
      )
    : undefined;
  return {
    ...rest,
    _enc: {
      network: encNetwork,
      ...(encStageMetadata ? { stageMetadata: encStageMetadata } : {}),
      ...(encFinish ? { finish: encFinish } : {}),
    },
  };
}

export async function decryptSession(
  row: StoredSessionRow,
): Promise<StoredSession> {
  const {
    _enc,
    network,
    stageMetadata,
    finishStageId,
    finishOutcome,
    ...rest
  } = row;
  if (!_enc) {
    if (network === undefined) {
      throw new Error(
        `Session ${row.id} has neither plaintext network nor _enc`,
      );
    }
    return {
      ...rest,
      network: NcNetworkSchema.parse(network),
      stageMetadata: parseStageMetadata(stageMetadata),
      // Absent on a session that has not recorded a finish: left out rather
      // than read as null, like `stageMetadata`.
      ...(finishStageId === undefined && finishOutcome === undefined
        ? {}
        : {
            finishStageId: parseFinishStageId(finishStageId),
            finishOutcome: parseFinishOutcome(finishOutcome),
          }),
    };
  }
  const dek = getSessionDek();
  if (!dek) throw new Error('Cannot decrypt session: vault is locked (no key)');
  const aad = sessionAad(row.id);
  const decNetwork = await decryptJson<unknown>(_enc.network, dek, aad);
  const decStageMetadata = _enc.stageMetadata
    ? await decryptJson<unknown>(_enc.stageMetadata, dek, aad)
    : undefined;
  const finish = _enc.finish
    ? parseFinishRecord(await decryptJson<unknown>(_enc.finish, dek, aad))
    : {};
  return {
    ...rest,
    network: NcNetworkSchema.parse(decNetwork),
    stageMetadata: parseStageMetadata(decStageMetadata),
    ...finish,
  };
}

export async function encryptProtocol(
  p: StoredProtocol,
): Promise<StoredProtocolRow> {
  const dek = getSessionDek();
  const { protocol, codebook, ...rest } = p;
  if (!dek) {
    assertNotLockedSecuredVault('protocol');
    return { ...rest, protocol, codebook };
  }
  const aad = protocolAad(p.hash);
  const encProtocol = await encryptJson(protocol, dek, aad);
  const encCodebook = await encryptJson(codebook, dek, aad);
  return { ...rest, _enc: { protocol: encProtocol, codebook: encCodebook } };
}

export async function decryptProtocol(
  row: StoredProtocolRow,
): Promise<StoredProtocol> {
  const { _enc, protocol, codebook, ...rest } = row;
  if (!_enc) {
    if (protocol === undefined || codebook === undefined) {
      throw new Error(
        `Protocol ${row.hash} has neither plaintext protocol/codebook nor _enc`,
      );
    }
    return { ...rest, protocol, codebook };
  }
  const dek = getSessionDek();
  if (!dek)
    throw new Error('Cannot decrypt protocol: vault is locked (no key)');
  const aad = protocolAad(row.hash);
  const decProtocol = await decryptJson<CurrentProtocol>(
    _enc.protocol,
    dek,
    aad,
  );
  const decCodebook = await decryptJson<CurrentProtocol['codebook']>(
    _enc.codebook,
    dek,
    aad,
  );
  return { ...rest, protocol: decProtocol, codebook: decCodebook };
}

export async function encryptAsset(a: StoredAsset): Promise<StoredAssetRow> {
  const dek = getSessionDek();
  const { data, ...rest } = a;
  if (!dek) {
    assertNotLockedSecuredVault('asset');
    return { ...rest, data };
  }
  const enc = await encryptAssetData(data, dek, assetAad(a.id));
  return { ...rest, _enc: { data: enc } };
}

export async function decryptAsset(row: StoredAssetRow): Promise<StoredAsset> {
  const { _enc, data, ...rest } = row;
  if (!_enc) {
    if (data === undefined) {
      throw new Error(`Asset ${row.id} has neither plaintext data nor _enc`);
    }
    return { ...rest, data };
  }
  const dek = getSessionDek();
  if (!dek) throw new Error('Cannot decrypt asset: vault is locked (no key)');
  const decData = await decryptAssetData(_enc.data, dek, assetAad(row.id));
  return { ...rest, data: decData };
}
