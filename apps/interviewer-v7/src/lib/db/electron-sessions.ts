import type { NcNetwork } from '@codaco/shared-consts';

import type {
  SessionQueryParams,
  SessionQueryResult,
  StoredSession,
  StoredSessionLite,
} from './types';

function ipc() {
  const api = window.electronAPI;
  if (!api?.db) {
    throw new Error('Electron DB IPC bridge not available');
  }
  return api.db;
}

export async function listSessions(): Promise<StoredSessionLite[]> {
  return ipc().sessions.list();
}

export async function querySessions(
  params: SessionQueryParams,
): Promise<SessionQueryResult> {
  return ipc().sessions.query(params);
}

export async function queryMatchingSessionIds(
  params: SessionQueryParams,
): Promise<string[]> {
  return ipc().sessions.queryMatchingIds(params);
}

export async function getSession(
  id: string,
): Promise<StoredSession | undefined> {
  return ipc().sessions.get(id);
}

export async function getSessionsByIds(
  ids: readonly string[],
): Promise<StoredSession[]> {
  return ipc().sessions.getByIds([...ids]);
}

export async function createSession(args: {
  protocolHash: string;
  protocolName: string;
  caseId: string;
  initialNetwork: NcNetwork;
  isSynthetic?: boolean;
}): Promise<StoredSession> {
  return ipc().sessions.create(args);
}

export async function updateSession(
  id: string,
  patch: Partial<StoredSession>,
): Promise<StoredSession | undefined> {
  return ipc().sessions.update({ id, patch });
}

export async function markSessionFinished(id: string): Promise<void> {
  return ipc().sessions.markFinished(id);
}

export async function markSessionsExported(ids: string[]): Promise<void> {
  return ipc().sessions.markExported(ids);
}

export async function countSyntheticSessions(): Promise<number> {
  return ipc().sessions.countSynthetic();
}

export async function deleteSyntheticSessions(): Promise<number> {
  return ipc().sessions.deleteSynthetic();
}
