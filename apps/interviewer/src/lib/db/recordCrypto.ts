import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

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
  'network' | 'stageMetadata'
> & {
  network?: NcNetwork;
  stageMetadata?: Record<string, unknown>;
  _enc?: { network: EncryptedField; stageMetadata?: EncryptedField };
};

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

// The asset row id is already `${protocolHash}::${assetId}`; bind the AAD to it
// so a ciphertext can't be replayed under a different asset row.
function assetAad(id: string): string {
  return `assets:${id}`;
}

export async function encryptSession(
  s: StoredSession,
): Promise<StoredSessionRow> {
  const dek = getSessionDek();
  const { network, stageMetadata, ...rest } = s;
  if (!dek) {
    assertNotLockedSecuredVault('session');
    return { ...rest, network, stageMetadata };
  }
  const aad = sessionAad(s.id);
  const encNetwork = await encryptJson(network, dek, aad);
  const encStageMetadata =
    stageMetadata === undefined
      ? undefined
      : await encryptJson(stageMetadata, dek, aad);
  return {
    ...rest,
    _enc: {
      network: encNetwork,
      ...(encStageMetadata ? { stageMetadata: encStageMetadata } : {}),
    },
  };
}

export async function decryptSession(
  row: StoredSessionRow,
): Promise<StoredSession> {
  const { _enc, network, stageMetadata, ...rest } = row;
  if (!_enc) {
    if (network === undefined) {
      throw new Error(
        `Session ${row.id} has neither plaintext network nor _enc`,
      );
    }
    return { ...rest, network, stageMetadata };
  }
  const dek = getSessionDek();
  if (!dek) throw new Error('Cannot decrypt session: vault is locked (no key)');
  const aad = sessionAad(row.id);
  const decNetwork = await decryptJson<NcNetwork>(_enc.network, dek, aad);
  const decStageMetadata = _enc.stageMetadata
    ? await decryptJson<Record<string, unknown>>(_enc.stageMetadata, dek, aad)
    : undefined;
  return { ...rest, network: decNetwork, stageMetadata: decStageMetadata };
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
