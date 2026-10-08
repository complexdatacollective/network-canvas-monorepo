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
const {
  createSession,
  getSession,
  SessionProtocolChangedError,
  setSessionLocale,
  updateSession,
} = await import('../sessions');

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

  // The launch migration (possibly in another tab) can move a session to its
  // migrated protocol while this tab's write is between its read and its
  // commit. A write naming only part of the session's protocol-bound state
  // cannot be applied to the migrated data, so it is refused.
  it('refuses a partial write when a migration moved the session mid-write, and leaves the migrated row alone', async () => {
    const created = await createSession({
      protocolHash: 'old-hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: network,
    });

    const pause = pauseNextEncrypt();
    const pending = updateSession(
      created.id,
      { currentStep: 3 },
      { protocolHash: 'old-hash' },
    );
    await pause.reached;
    await db.sessions.update(created.id, { protocolHash: 'new-hash' });
    const migrated = await db.sessions.get(created.id);
    pause.release();

    await expect(pending).rejects.toBeInstanceOf(SessionProtocolChangedError);
    expect(await db.sessions.get(created.id)).toEqual(migrated);
  });

  it('refuses a partial write computed against a protocol the session had already left', async () => {
    const created = await createSession({
      protocolHash: 'old-hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: network,
    });
    await db.sessions.update(created.id, { protocolHash: 'new-hash' });
    const migrated = await db.sessions.get(created.id);

    for (const patch of [
      { currentStep: 3 },
      { progress: 50 },
      { resumeStageOverrideIndex: undefined },
      { network },
    ]) {
      await expect(
        updateSession(created.id, patch, { protocolHash: 'old-hash' }),
      ).rejects.toBeInstanceOf(SessionProtocolChangedError);
    }
    expect(await db.sessions.get(created.id)).toEqual(migrated);
  });

  // A write of the session's whole state is complete in the old protocol's
  // schema, so it is kept under the hash it was computed against, and the
  // next launch carries it across the migration again.
  it('stores a whole-state write under the protocol it was computed against when the session has moved', async () => {
    const created = await createSession({
      protocolHash: 'old-hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: network,
    });
    await db.sessions.update(created.id, { protocolHash: 'new-hash' });
    const answered: NcNetwork = {
      ...network,
      nodes: [
        {
          [entityPrimaryKeyProperty]: 'node-1',
          type: 'person',
          [entityAttributesProperty]: {},
        },
      ],
    };

    await updateSession(
      created.id,
      { network: answered, stageMetadata: undefined, currentStep: 2 },
      { protocolHash: 'old-hash' },
    );

    expect((await db.sessions.get(created.id))?.protocolHash).toBe('old-hash');
    const back = await getSession(created.id);
    expect(back?.network).toEqual(answered);
    expect(back?.currentStep).toBe(2);
  });

  it('applies a write naming nothing protocol-bound whichever protocol the session belongs to', async () => {
    const created = await createSession({
      protocolHash: 'old-hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: network,
    });
    await db.sessions.update(created.id, { protocolHash: 'new-hash' });

    await updateSession(
      created.id,
      { exportedAt: '2026-01-05T00:00:00.000Z' },
      { protocolHash: 'old-hash' },
    );

    const row = await db.sessions.get(created.id);
    expect(row?.protocolHash).toBe('new-hash');
    expect(row?.exportedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('applies a write computed against the protocol the session belongs to as before', async () => {
    const created = await createSession({
      protocolHash: 'hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: network,
    });

    await updateSession(
      created.id,
      { currentStep: 3, progress: 40 },
      { protocolHash: 'hash' },
    );

    const row = await db.sessions.get(created.id);
    expect(row?.protocolHash).toBe('hash');
    expect(row?.currentStep).toBe(3);
    expect(row?.progress).toBe(40);
  });

  it('does not resurrect a session deleted mid-write', async () => {
    const created = await createSession({
      protocolHash: 'old-hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: network,
    });

    const pause = pauseNextEncrypt();
    const pending = updateSession(
      created.id,
      { currentStep: 3 },
      { protocolHash: 'old-hash' },
    );
    await pause.reached;
    await db.sessions.delete(created.id);
    pause.release();
    await expect(pending).resolves.toBeUndefined();

    expect(await db.sessions.get(created.id)).toBeUndefined();
  });

  // The exit→resume data-loss race: the interview Shell hands its final
  // autosave to updateSession while unmounting, and a prompt resume issues a
  // hydration read while that write is still committing. If the read returns
  // the pre-write row, the resumed interview renders without the
  // participant's latest answers and its own autosaves then persist the stale
  // network back over the newer record — so getSession must queue behind
  // every write already enqueued for the same id.
  it('getSession waits for an in-flight updateSession instead of returning the pre-write row', async () => {
    const created = await createSession({
      protocolHash: 'hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: network,
    });

    const pause = pauseNextEncrypt();
    const pending = updateSession(
      created.id,
      {
        network: {
          ...network,
          nodes: [
            {
              [entityPrimaryKeyProperty]: 'node-1',
              type: 'person',
              [entityAttributesProperty]: {},
            },
          ],
        },
      },
      { protocolHash: 'hash' },
    );
    await pause.reached;

    // The hydration read, issued while the write is suspended between its
    // read and its commit.
    let settled = false;
    const read = getSession(created.id).then((session) => {
      settled = true;
      return session;
    });

    // Negative assertion: the read must still be pending while the write is.
    // No event fires when a wrongly-unqueued read completes, so a macrotask
    // turn is the oracle — it gives a read that bypassed the chain time to
    // finish its get+decrypt and flip `settled`.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);

    pause.release();
    await pending;

    const session = await read;
    expect(session?.network.nodes).toHaveLength(1);
  });
});

describe('setSessionLocale', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    encryptPause = null;
    await db.sessions.clear();
    setSessionDek(null);
  });

  async function createStudySession() {
    return createSession({
      protocolHash: 'hash',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork: network,
    });
  }

  it('starts a new session with no recorded language', async () => {
    const created = await createStudySession();

    expect(created).toMatchObject({ localePreference: null, locale: null });
    expect(await db.sessions.get(created.id)).toMatchObject({
      localePreference: null,
      locale: null,
    });
  });

  it('stores both the chosen and the shown language', async () => {
    const created = await createStudySession();

    await setSessionLocale(created.id, {
      locale: 'fr',
      localePreference: 'fr',
    });
    expect(await getSession(created.id)).toMatchObject({
      localePreference: 'fr',
      locale: 'fr',
    });

    // Returning to automatic matching clears the choice but still records
    // the language the interview then showed.
    await setSessionLocale(created.id, {
      locale: 'es',
      localePreference: null,
    });
    expect(await getSession(created.id)).toMatchObject({
      localePreference: null,
      locale: 'es',
    });
  });

  it('applies changes in the order they were made', async () => {
    const created = await createStudySession();

    await Promise.all([
      setSessionLocale(created.id, { locale: 'fr', localePreference: 'fr' }),
      setSessionLocale(created.id, { locale: 'ar', localePreference: 'ar' }),
      setSessionLocale(created.id, { locale: 'es', localePreference: null }),
    ]);

    expect(await db.sessions.get(created.id)).toMatchObject({
      localePreference: null,
      locale: 'es',
    });
  });

  it('waits behind an in-flight updateSession for the same session', async () => {
    const created = await createStudySession();

    const pause = pauseNextEncrypt();
    const pending = updateSession(
      created.id,
      { currentStep: 2 },
      { protocolHash: 'hash' },
    );
    await pause.reached;

    let settled = false;
    const localeWrite = setSessionLocale(created.id, {
      locale: 'fr',
      localePreference: 'fr',
    }).then(() => {
      settled = true;
    });

    // No event fires when a wrongly-unqueued write completes, so a macrotask
    // turn is the oracle.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    expect(await db.sessions.get(created.id)).toMatchObject({ locale: null });

    pause.release();
    await pending;
    await localeWrite;

    expect(await db.sessions.get(created.id)).toMatchObject({
      currentStep: 2,
      localePreference: 'fr',
      locale: 'fr',
    });
  });

  it('is not overwritten by an updateSession that read the row before another tab stored a language', async () => {
    const created = await createStudySession();

    const pause = pauseNextEncrypt();
    const pending = updateSession(
      created.id,
      { currentStep: 3 },
      { protocolHash: 'hash' },
    );
    await pause.reached;
    // Another tab's write lands between this update's read and its commit.
    await db.sessions.update(created.id, {
      localePreference: 'fr',
      locale: 'fr',
    });
    pause.release();
    await pending;

    expect(await db.sessions.get(created.id)).toMatchObject({
      currentStep: 3,
      localePreference: 'fr',
      locale: 'fr',
    });
  });

  it('does not recreate a deleted session', async () => {
    const created = await createStudySession();
    await db.sessions.delete(created.id);

    await expect(
      setSessionLocale(created.id, { locale: 'fr', localePreference: 'fr' }),
    ).resolves.toBeUndefined();
    expect(await db.sessions.get(created.id)).toBeUndefined();
  });
});
