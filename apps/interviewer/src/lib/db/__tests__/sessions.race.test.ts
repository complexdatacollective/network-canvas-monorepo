// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NcNetwork } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

// A controllable pause inside `encryptSession`, so a test can deterministically
// interleave an external write (the launch-time protocol migration repointing
// `protocolHash`, possibly from another tab) into the gap between
// `updateSession`'s read and its commit. Everything else passes through to the
// real implementation.
let encryptPause: {
  reached: Promise<void>;
  signalReached: () => void;
  blocked: Promise<void>;
} | null = null;

vi.mock('../recordCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../recordCrypto')>();
  return {
    ...actual,
    encryptSession: async (
      ...args: Parameters<typeof actual.encryptSession>
    ) => {
      if (encryptPause) {
        encryptPause.signalReached();
        await encryptPause.blocked;
      }
      return actual.encryptSession(...args);
    },
  };
});

// Import AFTER the mock so sessions.ts binds the wrapped encryptSession.
const { db } = await import('../db');
const { setSessionDek } = await import('../sessionKey');
const { createSession, updateSession } = await import('../sessions');

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function pauseNextEncrypt() {
  let signalReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    signalReached = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  encryptPause = { reached, signalReached, blocked };
  return {
    reached,
    release: () => {
      encryptPause = null;
      release();
    },
  };
}

const network: NcNetwork = {
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
  nodes: [],
  edges: [],
};

describe('updateSession against concurrent writers', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    encryptPause = null;
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('commits the freshest protocolHash when a migration repointed it mid-write', async () => {
    const created = await createSession({
      protocolHash: 'old-hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: network,
    });

    const pause = pauseNextEncrypt();
    const pending = updateSession(created.id, { currentStep: 3 });
    await pause.reached;
    // The sweep (another tab) repoints the session while the update is
    // suspended between its read and its commit.
    await db.sessions.update(created.id, { protocolHash: 'new-hash' });
    pause.release();
    await pending;

    const row = await db.sessions.get(created.id);
    expect(row?.protocolHash).toBe('new-hash');
    expect(row?.currentStep).toBe(3);
  });

  it('does not resurrect a session deleted mid-write', async () => {
    const created = await createSession({
      protocolHash: 'old-hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: network,
    });

    const pause = pauseNextEncrypt();
    const pending = updateSession(created.id, { currentStep: 3 });
    await pause.reached;
    await db.sessions.delete(created.id);
    pause.release();
    await expect(pending).resolves.toBeUndefined();

    expect(await db.sessions.get(created.id)).toBeUndefined();
  });
});
