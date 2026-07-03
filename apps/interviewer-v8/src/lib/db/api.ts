import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import * as dexieSettings from './db';
import * as dexieProtocols from './protocols';
import * as dexieSessions from './sessions';
import type {
  ProtocolWithCounts,
  SessionQueryParams,
  SessionQueryResult,
  StoredAsset,
  StoredProtocol,
  StoredSession,
  StoredSessionLite,
  StoredSettings,
} from './types';

export async function listProtocols(): Promise<ProtocolWithCounts[]> {
  return dexieProtocols.listProtocols();
}

export async function getProtocolByHash(
  hash: string,
): Promise<StoredProtocol | undefined> {
  return dexieProtocols.getProtocolByHash(hash);
}

export async function getProtocolsByHashes(
  hashes: readonly string[],
): Promise<StoredProtocol[]> {
  return dexieProtocols.getProtocolsByHashes(hashes);
}

export async function saveProtocol(
  protocol: CurrentProtocol,
  hash: string,
  assets: { id: string; name: string; data: Blob | string }[],
): Promise<StoredProtocol> {
  return dexieProtocols.saveProtocol(protocol, hash, assets);
}

export async function deleteProtocol(hash: string): Promise<void> {
  return dexieProtocols.deleteProtocol(hash);
}

export async function getProtocolAssets(hash: string): Promise<StoredAsset[]> {
  return dexieProtocols.getProtocolAssets(hash);
}

export async function getProtocolAsset(
  hash: string,
  assetId: string,
): Promise<StoredAsset | undefined> {
  return dexieProtocols.getProtocolAsset(hash, assetId);
}

export async function listSessions(): Promise<StoredSessionLite[]> {
  return dexieSessions.listSessions();
}

export async function querySessions(
  params: SessionQueryParams,
): Promise<SessionQueryResult> {
  return dexieSessions.querySessions(params);
}

export async function queryMatchingSessionIds(
  params: SessionQueryParams,
): Promise<string[]> {
  return dexieSessions.queryMatchingSessionIds(params);
}

export async function getSession(
  id: string,
): Promise<StoredSession | undefined> {
  return dexieSessions.getSession(id);
}

export async function getSessionsByIds(
  ids: readonly string[],
): Promise<StoredSession[]> {
  return dexieSessions.getSessionsByIds(ids);
}

export async function createSession(args: {
  protocolHash: string;
  protocolName: string;
  caseId: string;
  initialNetwork: NcNetwork;
  isSynthetic?: boolean;
}): Promise<StoredSession> {
  return dexieSessions.createSession(args);
}

export async function updateSession(
  id: string,
  patch: Partial<StoredSession>,
): Promise<StoredSession | undefined> {
  return dexieSessions.updateSession(id, patch);
}

export async function markSessionFinished(id: string): Promise<void> {
  return dexieSessions.markSessionFinished(id);
}

export async function markSessionsExported(ids: string[]): Promise<void> {
  return dexieSessions.markSessionsExported(ids);
}

export async function deleteSessions(ids: string[]): Promise<void> {
  return dexieSessions.deleteSessions(ids);
}

export async function countSyntheticSessions(): Promise<number> {
  return dexieSessions.countSyntheticSessions();
}

export async function deleteSyntheticSessions(): Promise<number> {
  return dexieSessions.deleteSyntheticSessions();
}

export async function getSettings(): Promise<StoredSettings> {
  return dexieSettings.getSettings();
}

export async function updateSettings(
  patch: Partial<Omit<StoredSettings, 'id'>>,
): Promise<StoredSettings> {
  return dexieSettings.updateSettings(patch);
}
