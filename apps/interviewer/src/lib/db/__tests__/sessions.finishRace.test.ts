// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NcNetwork } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { db } from '../db';
import { decryptSession, encryptSession } from '../recordCrypto';
import { setSessionDek } from '../sessionKey';
import { createSession, markSessionFinished } from '../sessions';

// Holds the encryption of a finish record until the test lets it go, so a
// migration can be written while the finish is being prepared.
const gate = vi.hoisted(() => ({
  held: undefined as Promise<void> | undefined,
  reached: undefined as (() => void) | undefined,
}));

vi.mock('../../vault/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../vault/crypto')>();
  return {
    ...actual,
    encryptJson: async (...args: Parameters<typeof actual.encryptJson>) => {
      const [value] = args;
      if (
        gate.held &&
        typeof value === 'object' &&
        value !== null &&
        'stageId' in value
      ) {
        gate.reached?.();
        await gate.held;
      }
      return actual.encryptJson(...args);
    },
  };
});

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

const networkWith = (name: string): NcNetwork => ({
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'n1',
      type: 'person',
      [entityAttributesProperty]: { name },
    },
  ],
  edges: [],
});

describe('recording a finish while another tab migrates the session', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    gate.held = undefined;
    gate.reached = undefined;
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('keeps everything the migration wrote, and adds the finish to it', async () => {
    const created = await createSession({
      protocolHash: 'old-hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: networkWith('Ada'),
    });

    let release: () => void = () => undefined;
    gate.held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      gate.reached = resolve;
    });

    const finishing = markSessionFinished(created.id, {
      stageId: 'finish',
      outcome: 'ineligible',
    });
    await reached;

    // The launch migration in another tab carries the session onto the
    // migrated protocol while the finish is being encrypted.
    const before = await decryptSession((await db.sessions.get(created.id))!);
    const migratedNetwork = networkWith('Ada (migrated)');
    const migratedRow = await encryptSession({
      ...before,
      protocolHash: 'new-hash',
      network: migratedNetwork,
      currentStep: 5,
    });
    await db.sessions.put(migratedRow);

    release();
    await finishing;

    const raw = await db.sessions.get(created.id);
    expect(raw?.protocolHash).toBe('new-hash');
    expect(raw?._enc?.network).toEqual(migratedRow._enc?.network);
    const session = await decryptSession(raw!);
    expect(session.network).toEqual(migratedNetwork);
    expect(session.currentStep).toBe(5);
    expect(session.finishedAt).not.toBeNull();
    expect(session.finishStageId).toBe('finish');
    expect(session.finishOutcome).toBe('ineligible');
  });

  it('writes no finish when the interview is torn down while the finish is being encrypted', async () => {
    const created = await createSession({
      protocolHash: 'old-hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: networkWith('Ada'),
    });

    let release: () => void = () => undefined;
    gate.held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      gate.reached = resolve;
    });

    const teardown = new AbortController();
    const finishing = markSessionFinished(
      created.id,
      { stageId: 'finish', outcome: 'ineligible' },
      teardown.signal,
    ).then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await reached;

    // The Shell is torn down after the route's own abort check, while the
    // write is past it.
    teardown.abort();
    release();

    expect(await finishing).toMatchObject({ name: 'AbortError' });
    const session = await decryptSession((await db.sessions.get(created.id))!);
    expect(session.finishedAt).toBeNull();
    expect(session.finishStageId ?? null).toBeNull();
  });
});
