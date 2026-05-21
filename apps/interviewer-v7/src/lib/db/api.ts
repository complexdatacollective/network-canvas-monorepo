import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import { isElectron } from '../platform/platform';
import * as dexieSettings from './db';
import * as electronProtocols from './electron-protocols';
import * as electronSessions from './electron-sessions';
import * as electronSettings from './electron-settings';
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
  return isElectron
    ? electronProtocols.listProtocols()
    : dexieProtocols.listProtocols();
}

export async function getProtocolByHash(
  hash: string,
): Promise<StoredProtocol | undefined> {
  return isElectron
    ? electronProtocols.getProtocolByHash(hash)
    : dexieProtocols.getProtocolByHash(hash);
}

export async function getProtocolsByHashes(
  hashes: readonly string[],
): Promise<StoredProtocol[]> {
  return isElectron
    ? electronProtocols.getProtocolsByHashes(hashes)
    : dexieProtocols.getProtocolsByHashes(hashes);
}

export async function saveProtocol(
  protocol: CurrentProtocol,
  hash: string,
  assets: { id: string; name: string; data: Blob | string }[],
): Promise<StoredProtocol> {
  return isElectron
    ? electronProtocols.saveProtocol(protocol, hash, assets)
    : dexieProtocols.saveProtocol(protocol, hash, assets);
}

export async function deleteProtocol(hash: string): Promise<void> {
  return isElectron
    ? electronProtocols.deleteProtocol(hash)
    : dexieProtocols.deleteProtocol(hash);
}

export async function getProtocolAssets(hash: string): Promise<StoredAsset[]> {
  return isElectron
    ? electronProtocols.getProtocolAssets(hash)
    : dexieProtocols.getProtocolAssets(hash);
}

export async function getProtocolAsset(
  hash: string,
  assetId: string,
): Promise<StoredAsset | undefined> {
  return isElectron
    ? electronProtocols.getProtocolAsset(hash, assetId)
    : dexieProtocols.getProtocolAsset(hash, assetId);
}

export async function listSessions(): Promise<StoredSessionLite[]> {
  return isElectron
    ? electronSessions.listSessions()
    : dexieSessions.listSessions();
}

export async function querySessions(
  params: SessionQueryParams,
): Promise<SessionQueryResult> {
  return isElectron
    ? electronSessions.querySessions(params)
    : dexieSessions.querySessions(params);
}

export async function queryMatchingSessionIds(
  params: SessionQueryParams,
): Promise<string[]> {
  return isElectron
    ? electronSessions.queryMatchingSessionIds(params)
    : dexieSessions.queryMatchingSessionIds(params);
}

export async function getSession(
  id: string,
): Promise<StoredSession | undefined> {
  return isElectron
    ? electronSessions.getSession(id)
    : dexieSessions.getSession(id);
}

export async function getSessionsByIds(
  ids: readonly string[],
): Promise<StoredSession[]> {
  return isElectron
    ? electronSessions.getSessionsByIds(ids)
    : dexieSessions.getSessionsByIds(ids);
}

export async function createSession(args: {
  protocolHash: string;
  protocolName: string;
  caseId: string;
  initialNetwork: NcNetwork;
  isSynthetic?: boolean;
}): Promise<StoredSession> {
  return isElectron
    ? electronSessions.createSession(args)
    : dexieSessions.createSession(args);
}

export async function updateSession(
  id: string,
  patch: Partial<StoredSession>,
): Promise<StoredSession | undefined> {
  return isElectron
    ? electronSessions.updateSession(id, patch)
    : dexieSessions.updateSession(id, patch);
}

export async function markSessionFinished(id: string): Promise<void> {
  return isElectron
    ? electronSessions.markSessionFinished(id)
    : dexieSessions.markSessionFinished(id);
}

export async function markSessionsExported(ids: string[]): Promise<void> {
  return isElectron
    ? electronSessions.markSessionsExported(ids)
    : dexieSessions.markSessionsExported(ids);
}

export async function countSyntheticSessions(): Promise<number> {
  return isElectron
    ? electronSessions.countSyntheticSessions()
    : dexieSessions.countSyntheticSessions();
}

export async function deleteSyntheticSessions(): Promise<number> {
  return isElectron
    ? electronSessions.deleteSyntheticSessions()
    : dexieSessions.deleteSyntheticSessions();
}

export async function getSettings(): Promise<StoredSettings> {
  return isElectron
    ? electronSettings.getSettings()
    : dexieSettings.getSettings();
}

export async function updateSettings(
  patch: Partial<Omit<StoredSettings, 'id'>>,
): Promise<StoredSettings> {
  return isElectron
    ? electronSettings.updateSettings(patch)
    : dexieSettings.updateSettings(patch);
}
