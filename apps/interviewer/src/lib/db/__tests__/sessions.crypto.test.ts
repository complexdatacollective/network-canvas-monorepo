// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcEncryptionHeader, NcNetwork } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { db } from '../db';
import { setSessionDek } from '../sessionKey';
import {
  createSession,
  getSession,
  getSessionsByIds,
  listSessions,
  markSessionFinished,
  markSessionUnfinished,
  markSessionsExported,
  querySessions,
  reencryptSession,
  updateSession,
} from '../sessions';

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

const initialNetwork: NcNetwork = {
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'n1',
      type: 'person',
      [entityAttributesProperty]: { name: 'Ada' },
    },
  ],
  edges: [],
};

// Deterministic stand-ins for salts, IVs and ciphertexts. The repo never
// decrypts these values, so only their shape matters.
const bytes = (length: number, offset: number) =>
  Array.from({ length }, (_, index) => (index * 37 + offset) % 256);

const encryptionHeader: NcEncryptionHeader = {
  version: 1,
  method: 'AES-256-GCM',
  kdf: {
    algorithm: 'PBKDF2',
    hash: 'SHA-256',
    iterations: 600_000,
    salt: bytes(16, 1),
  },
  check: { iv: bytes(12, 2), data: bytes(48, 3) },
};

// The header is the only record of the participant's salt and check value:
// dropping it makes the interview ask for a new passphrase, and every answer
// encrypted under the old one becomes unreadable. A schema 8 interview that
// later gains a passphrase holds both value shapes, so this one does too.
const networkWithEncryptionHeader: NcNetwork = {
  encryption: encryptionHeader,
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'n1',
      type: 'person',
      [entityAttributesProperty]: { name: bytes(48, 4) },
      _secureAttributes: { name: { iv: bytes(12, 5) } },
    },
    {
      [entityPrimaryKeyProperty]: 'n2',
      type: 'person',
      [entityAttributesProperty]: { name: bytes(48, 6) },
      _secureAttributes: { name: { iv: bytes(12, 7), salt: bytes(16, 8) } },
    },
  ],
  edges: [],
};

const schema8EncryptedNetwork: NcNetwork = {
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'n1',
      type: 'person',
      [entityAttributesProperty]: { name: bytes(48, 9) },
      _secureAttributes: { name: { iv: bytes(12, 10), salt: bytes(16, 11) } },
    },
  ],
  edges: [],
};

type InformationStage = Extract<
  NonNullable<CurrentProtocol['stages'][number]>,
  { type: 'Information' }
>;

function informationStage(id: string): InformationStage {
  return {
    id,
    type: 'Information',
    label: id,
    title: id,
    items: [],
  };
}

const authoredStages: CurrentProtocol['stages'] = [
  informationStage('stage-0'),
  informationStage('stage-1'),
  informationStage('stage-2'),
  informationStage('stage-3'),
];

const stagesWithFinishRoute: CurrentProtocol['stages'] = [
  informationStage('stage-0'),
  {
    ...informationStage('stage-1'),
    skipLogic: {
      action: 'SKIP',
      filter: { join: 'AND', rules: [] },
      destination: { type: 'finish' },
    },
  },
  informationStage('stage-2'),
  informationStage('stage-3'),
];

const stagesWithNoActiveAuthoredStage: CurrentProtocol['stages'] = [
  {
    ...informationStage('stage-0'),
    skipLogic: {
      action: 'SKIP',
      filter: { join: 'AND', rules: [] },
      destination: { type: 'finish' },
    },
  },
  informationStage('stage-1'),
  informationStage('stage-2'),
  informationStage('stage-3'),
];

describe('sessions repo — encryption at boundary', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('stores no plaintext network/stageMetadata when unlocked', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });

    const raw = await db.sessions.get(created.id);
    expect(raw?.network).toBeUndefined();
    expect(raw?._enc?.network).toBeDefined();
    expect(raw?.caseId).toBe('case-1'); // index field plaintext
    expect(raw?.currentStep).toBe(0);
  });

  it('round-trips network on read', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    const back = await getSession(created.id);
    expect(back?.network).toEqual(initialNetwork);

    const byIds = await getSessionsByIds([created.id]);
    expect(byIds[0]?.network).toEqual(initialNetwork);
  });

  it('re-encrypts on updateSession', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    const nextNetwork: NcNetwork = { ...initialNetwork, nodes: [] };
    await updateSession(created.id, { network: nextNetwork, progress: 55 });

    const raw = await db.sessions.get(created.id);
    expect(raw?.network).toBeUndefined();
    expect(raw?.progress).toBe(55); // index field plaintext, no decrypt

    const back = await getSession(created.id);
    expect(back?.network.nodes).toHaveLength(0);
    expect(back?.progress).toBe(55);
  });

  it('lists and queries without touching the key (returns lite rows)', async () => {
    await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });

    // Lock the vault: query paths must not need the DEK.
    setSessionDek(null);

    const list = await listSessions();
    expect(list).toHaveLength(1);
    expect(list[0]?.caseId).toBe('case-1');
    expect(list[0]?.progressPercent).toBe(0);
    // Lite rows carry no network at all.
    expect('network' in (list[0] ?? {})).toBe(false);

    const result = await querySessions({
      sort: { column: 'updatedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.totalCount).toBe(1);
    expect(result.statusCounts.all).toBe(1);
    expect(result.rows[0]?.caseId).toBe('case-1');
  });
});

describe('sessions repo — participant passphrase encryption', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(null);
  });
  afterEach(async () => {
    await db.sessions.clear();
    setSessionDek(null);
  });

  it.each([
    {
      label: 'the encryption header and IV-only values',
      network: networkWithEncryptionHeader,
    },
    {
      label: 'schema 8 values without a header',
      network: schema8EncryptedNetwork,
    },
  ])(
    'keeps $label through syncs, resumes, re-encryption and export reads',
    async ({ network }) => {
      // No vault yet, so rows are written in plaintext.
      const created = await createSession({
        protocolHash: 'h1',
        protocolName: 'Study',
        caseId: 'case-1',
        initialNetwork,
      });
      // What the interview route's sync handler writes.
      await updateSession(created.id, { network, currentStep: 1 });
      expect((await getSession(created.id))?.network).toStrictEqual(network);

      // Securing the device re-encrypts every stored session under its key.
      setSessionDek(await makeDek());
      await reencryptSession(created.id);
      expect((await db.sessions.get(created.id))?._enc).toBeDefined();
      expect((await getSession(created.id))?.network).toStrictEqual(network);

      await updateSession(created.id, { network, currentStep: 2 });
      expect((await getSession(created.id))?.network).toStrictEqual(network);
      const [exported] = await getSessionsByIds([created.id]);
      expect(exported?.network).toStrictEqual(network);
    },
  );
});

// Formats a Date as its LOCAL calendar day, matching the 'YYYY-MM-DD' strings
// the DateFilter emits from the user's timezone (never toISOString(), which
// would report the UTC day).
function localDayString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('sessions repo — date range filtering (#753)', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('includes a same-local-day session regardless of timezone offset', async () => {
    // An instant near local midnight is where the UTC-vs-local frame mismatch
    // bites: west of UTC its ISO string can land on the next UTC day, east of
    // UTC on the previous one. The row must still match its own local day.
    const localInstant = new Date(2026, 2, 15, 23, 30, 0, 0);
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    await db.sessions.update(created.id, {
      startedAt: localInstant.toISOString(),
    });

    const day = localDayString(localInstant);
    const result = await querySessions({
      startedRange: { from: day, to: day },
      sort: { column: 'startedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.totalCount).toBe(1);
    expect(result.rows[0]?.id).toBe(created.id);
  });

  it('excludes a session on an adjacent local day', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    const dayBefore = new Date(2026, 2, 14, 12, 0, 0, 0);
    await db.sessions.update(created.id, {
      startedAt: dayBefore.toISOString(),
    });

    const target = localDayString(new Date(2026, 2, 15, 12, 0, 0, 0));
    const result = await querySessions({
      startedRange: { from: target, to: target },
      sort: { column: 'startedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.totalCount).toBe(0);
  });

  it('drops a malformed range bound rather than throwing', async () => {
    await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    const result = await querySessions({
      startedRange: { from: 'not-a-date', to: 'also-bad' },
      sort: { column: 'startedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.totalCount).toBe(0);
  });

  it('drops an out-of-range (overflow) calendar bound rather than rolling over', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    // Pin the session to a real date; the filter bounds are impossible dates
    // (2026-02-31 rolls over to March 3 if not rejected), so nothing should
    // match — a shape-valid-but-overflow bound must not become a real filter.
    await db.sessions.update(created.id, {
      startedAt: '2026-02-15T12:00:00.000Z',
    });
    const result = await querySessions({
      startedRange: { from: '2026-02-31', to: '2026-13-01' },
      sort: { column: 'startedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.totalCount).toBe(0);
  });
});

describe('sessions repo — status reflects completion, not export (#764)', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('keeps an exported-but-unfinished session in-progress', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    // Export without finishing: the old model misread this as complete/exported,
    // hiding Resume and miscounting the chips.
    await markSessionsExported([created.id]);

    const list = await listSessions();
    expect(list[0]?.statusKind).toBe('in-progress');
    expect(list[0]?.exportedAt).not.toBeNull();

    const result = await querySessions({
      sort: { column: 'updatedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.statusCounts.inProgress).toBe(1);
    expect(result.statusCounts.complete).toBe(0);
  });

  it('marks a finished session complete whether or not it is exported', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    await markSessionFinished(created.id);
    await markSessionsExported([created.id]);

    const list = await listSessions();
    expect(list[0]?.statusKind).toBe('complete');

    const result = await querySessions({
      sort: { column: 'updatedAt', direction: 'desc' },
      page: 0,
      pageSize: 20,
    });
    expect(result.statusCounts.complete).toBe(1);
    expect(result.statusCounts.inProgress).toBe(0);
  });

  it('marks a completed session unfinished without clearing its export history', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    await updateSession(created.id, { currentStep: 4, progress: 100 });
    await markSessionFinished(created.id);
    await markSessionsExported([created.id]);

    await markSessionUnfinished(created.id, authoredStages);

    const session = await getSession(created.id);
    expect(session?.finishedAt).toBeNull();
    expect(session?.exportedAt).not.toBeNull();
    expect(session?.currentStep).toBe(3);
    expect(session?.progress).toBe(80);
    expect(session?.resumeStageOverrideIndex).toBeUndefined();

    const list = await listSessions();
    expect(list[0]?.statusKind).toBe('in-progress');
    expect(list[0]?.progressPercent).toBe(80);
  });

  it('resumes before stages bypassed by a targeted route to finish', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    await updateSession(created.id, { currentStep: 4, progress: 100 });
    await markSessionFinished(created.id);

    await markSessionUnfinished(created.id, stagesWithFinishRoute);

    const session = await getSession(created.id);
    expect(session?.finishedAt).toBeNull();
    expect(session?.currentStep).toBe(0);
    expect(session?.progress).toBe(20);
    expect(session?.resumeStageOverrideIndex).toBeUndefined();
  });

  it('resumes at the route-controlling stage when no authored stage is active', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    await updateSession(created.id, { currentStep: 4, progress: 100 });
    await markSessionFinished(created.id);

    await markSessionUnfinished(created.id, stagesWithNoActiveAuthoredStage);

    const session = await getSession(created.id);
    expect(session?.finishedAt).toBeNull();
    expect(session?.currentStep).toBe(0);
    expect(session?.progress).toBe(20);
    expect(session?.resumeStageOverrideIndex).toBe(0);
  });

  it('does not reset an interview that is already unfinished', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });
    await updateSession(created.id, { currentStep: 2, progress: 60 });

    await markSessionUnfinished(created.id, authoredStages);

    const session = await getSession(created.id);
    expect(session?.currentStep).toBe(2);
    expect(session?.progress).toBe(60);
  });
});

describe('sessions repo — concurrent updateSession (#756)', () => {
  beforeEach(async () => {
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('serialises overlapping updates so no write is clobbered', async () => {
    const created = await createSession({
      protocolHash: 'h1',
      protocolName: 'Study',
      caseId: 'case-1',
      initialNetwork,
    });

    // Two updates fired without awaiting the first. Under the old read-modify-
    // write both read the same pre-update row and the last put would overwrite
    // the other's field; serialised, both must survive.
    await Promise.all([
      updateSession(created.id, { currentStep: 1 }),
      updateSession(created.id, { progress: 77 }),
    ]);

    const back = await getSession(created.id);
    expect(back?.currentStep).toBe(1);
    expect(back?.progress).toBe(77);
  });
});
