## Phase D: Encrypted storage (spec Workstream B2)

Every task in this phase obeys the plan-header global constraints: no `any`, no `as` assertions, no barrel files, no convenience re-exports; oxlint + oxfmt (2-space, single quotes); Vitest unit tests co-located in `__tests__/`; no changeset; TDD with a commit per task (no `Co-Authored-By`). All crypto is Web Crypto only.

This phase depends on Phase B/C having produced `src/lib/vault/crypto.ts` with the exact contract signatures (`EncryptedField`, `EncryptedAssetData`, `generateDek`, `encryptJson`, `decryptJson`, `encryptAssetData`, `decryptAssetData`). It also assumes Phase A has already deleted the Electron DB/auth arms (`db/electron-*.ts`, `platform.isElectron`), so `db/api.ts` is a single Dexie path.

**Transaction-liveness rule (applies to every refactor task below):** all `encrypt*`/`decrypt*` calls run OUTSIDE any `db.transaction(...)` block. Encrypt (await) BEFORE opening `db.transaction('rw', …)`; decrypt AFTER `db.*.get()/where()/bulkGet()` returns. `crypto.subtle` yields the microtask queue, which would let Dexie auto-commit an open transaction mid-await.

### Task D1: In-memory session DEK holder

**Files:**

- Create: `apps/interviewer-v8/src/lib/db/sessionKey.ts`
- Test: `apps/interviewer-v8/src/lib/db/__tests__/sessionKey.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `setSessionDek(dek: CryptoKey | null): void`, `getSessionDek(): CryptoKey | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it } from 'vitest';

import { getSessionDek, setSessionDek } from '../sessionKey';

async function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

describe('sessionKey', () => {
  afterEach(() => {
    setSessionDek(null);
  });

  it('returns null before any key is set', () => {
    expect(getSessionDek()).toBeNull();
  });

  it('returns the key that was set', async () => {
    const key = await makeKey();
    setSessionDek(key);
    expect(getSessionDek()).toBe(key);
  });

  it('clears the key when set to null', async () => {
    setSessionDek(await makeKey());
    setSessionDek(null);
    expect(getSessionDek()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db/__tests__/sessionKey.test.ts`
      Expected: FAIL — `Cannot find module '../sessionKey'` (module not created yet).
- [ ] **Step 3: Implement**

```ts
// The unlocked data-encryption key for the current app session. Held only in
// memory: cleared on lock/idle/blur/revoke so it never outlives an unlock.
let sessionDek: CryptoKey | null = null;

export function setSessionDek(dek: CryptoKey | null): void {
  sessionDek = dek;
}

export function getSessionDek(): CryptoKey | null {
  return sessionDek;
}
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db/__tests__/sessionKey.test.ts`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/db/sessionKey.ts apps/interviewer-v8/src/lib/db/__tests__/sessionKey.test.ts
git commit -m "feat(interviewer-v8): in-memory session DEK holder"
```

### Task D2: Record field codec (recordCrypto.ts)

**Files:**

- Create: `apps/interviewer-v8/src/lib/db/recordCrypto.ts`
- Test: `apps/interviewer-v8/src/lib/db/__tests__/recordCrypto.test.ts`

**Interfaces:**

- Consumes: `crypto.ts::{EncryptedField, EncryptedAssetData, encryptJson, decryptJson, encryptAssetData, decryptAssetData}` (from Phase B/C); `sessionKey.ts::getSessionDek`; `types.ts::{StoredSession, StoredProtocol, StoredAsset}`.
- Produces:
  - Row types `StoredSessionRow`, `StoredProtocolRow`, `StoredAssetRow` (contract §recordCrypto).
  - `encryptSession(s: StoredSession): Promise<StoredSessionRow>`, `decryptSession(row: StoredSessionRow): Promise<StoredSession>`
  - `encryptProtocol(p: StoredProtocol): Promise<StoredProtocolRow>`, `decryptProtocol(row: StoredProtocolRow): Promise<StoredProtocol>`
  - `encryptAsset(a: StoredAsset): Promise<StoredAssetRow>`, `decryptAsset(row: StoredAssetRow): Promise<StoredAsset>`
  - AAD helpers `sessionAad(id)`, `protocolAad(hash)`, `assetAad(protocolHash, assetId)`.

AAD strings per contract: session `` `sessions:${id}` ``, protocol `` `protocols:${hash}` ``, asset `` `assets:${protocolHash}::${assetId}` `` (the asset id is itself `${hash}::${assetId}`). Passthrough (plaintext, no `_enc`) when `getSessionDek()` is null (mode `none`). Encrypted rows carry `_enc` and OMIT the corresponding plaintext fields; the plaintext index fields (`id`, `protocolHash`, `protocolName`, `caseId`, timestamps, `status`/`finishedAt`/`exportedAt`, `currentStep`, `progress`, `isSynthetic`, protocol `hash`/`name`/`schemaVersion`/`importedAt`/`description`/`lastModified`, asset `assetId`/`name`/`type`) always stay plaintext.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it } from 'vitest';

import type { NcNetwork } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import {
  decryptAsset,
  decryptProtocol,
  decryptSession,
  encryptAsset,
  encryptProtocol,
  encryptSession,
} from '../recordCrypto';
import { setSessionDek } from '../sessionKey';
import type { StoredAsset, StoredProtocol, StoredSession } from '../types';

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

const network: NcNetwork = {
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

const session: StoredSession = {
  id: 's1',
  protocolHash: 'h1',
  protocolName: 'Study',
  caseId: 'case-1',
  startedAt: '2026-01-01T00:00:00.000Z',
  lastUpdatedAt: '2026-01-02T00:00:00.000Z',
  finishedAt: null,
  exportedAt: null,
  currentStep: 3,
  progress: 40,
  network,
  stageMetadata: { '0': { visited: true } },
  isSynthetic: false,
};

const protocol: StoredProtocol = {
  id: 'h1',
  hash: 'h1',
  name: 'Study',
  schemaVersion: 8,
  importedAt: '2026-01-01T00:00:00.000Z',
  description: 'A study',
  codebook: { node: {}, edge: {}, ego: {} },
  // Minimal but structurally valid CurrentProtocol shape for a round-trip.
  protocol: {
    name: 'Study',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
  } as StoredProtocol['protocol'],
};

const blobAsset: StoredAsset = {
  id: 'h1::img-1',
  protocolHash: 'h1',
  assetId: 'img-1',
  name: 'Photo',
  type: 'image',
  data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
};

const stringAsset: StoredAsset = {
  id: 'h1::key-1',
  protocolHash: 'h1',
  assetId: 'key-1',
  name: 'Key',
  type: 'apikey',
  data: 'secret-token',
};

describe('recordCrypto — encrypted mode', () => {
  afterEach(() => setSessionDek(null));

  it('round-trips a session and stores no plaintext network/stageMetadata', async () => {
    setSessionDek(await makeDek());
    const row = await encryptSession(session);
    expect(row.network).toBeUndefined();
    expect(row.stageMetadata).toBeUndefined();
    expect(row._enc?.network).toBeDefined();
    expect(row._enc?.stageMetadata).toBeDefined();
    // Index fields remain plaintext.
    expect(row.id).toBe('s1');
    expect(row.caseId).toBe('case-1');
    expect(row.currentStep).toBe(3);
    expect(row.progress).toBe(40);
    expect(row.isSynthetic).toBe(false);

    const back = await decryptSession(row);
    expect(back).toEqual(session);
  });

  it('omits _enc.stageMetadata when the session has none', async () => {
    setSessionDek(await makeDek());
    const row = await encryptSession({ ...session, stageMetadata: undefined });
    expect(row._enc?.stageMetadata).toBeUndefined();
    const back = await decryptSession(row);
    expect(back.stageMetadata).toBeUndefined();
  });

  it('round-trips a protocol and stores no plaintext protocol/codebook', async () => {
    setSessionDek(await makeDek());
    const row = await encryptProtocol(protocol);
    expect(row.protocol).toBeUndefined();
    expect(row.codebook).toBeUndefined();
    expect(row._enc?.protocol).toBeDefined();
    expect(row._enc?.codebook).toBeDefined();
    expect(row.hash).toBe('h1');
    expect(row.name).toBe('Study');

    const back = await decryptProtocol(row);
    expect(back).toEqual(protocol);
  });

  it('round-trips a blob asset and stores no plaintext data', async () => {
    setSessionDek(await makeDek());
    const row = await encryptAsset(blobAsset);
    expect(row.data).toBeUndefined();
    expect(row._enc?.data).toBeDefined();

    const back = await decryptAsset(row);
    expect(back.data).toBeInstanceOf(Blob);
    const bytes = new Uint8Array(await (back.data as Blob).arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3, 4]);
    expect((back.data as Blob).type).toBe('image/png');
  });

  it('round-trips a string asset', async () => {
    setSessionDek(await makeDek());
    const row = await encryptAsset(stringAsset);
    expect(row.data).toBeUndefined();
    const back = await decryptAsset(row);
    expect(back.data).toBe('secret-token');
  });

  it('rejects decryption with a different key', async () => {
    setSessionDek(await makeDek());
    const row = await encryptSession(session);
    setSessionDek(await makeDek());
    await expect(decryptSession(row)).rejects.toThrow();
  });

  it('rejects decryption when the key is absent', async () => {
    setSessionDek(await makeDek());
    const row = await encryptSession(session);
    setSessionDek(null);
    await expect(decryptSession(row)).rejects.toThrow(/locked|key/i);
  });
});

describe('recordCrypto — none mode (passthrough)', () => {
  afterEach(() => setSessionDek(null));

  it('stores plaintext session with no _enc', async () => {
    setSessionDek(null);
    const row = await encryptSession(session);
    expect(row._enc).toBeUndefined();
    expect(row.network).toEqual(network);
    expect(row.stageMetadata).toEqual(session.stageMetadata);
    const back = await decryptSession(row);
    expect(back).toEqual(session);
  });

  it('stores plaintext protocol with no _enc', async () => {
    setSessionDek(null);
    const row = await encryptProtocol(protocol);
    expect(row._enc).toBeUndefined();
    expect(row.protocol).toEqual(protocol.protocol);
    const back = await decryptProtocol(row);
    expect(back).toEqual(protocol);
  });

  it('stores plaintext asset data with no _enc', async () => {
    setSessionDek(null);
    const row = await encryptAsset(blobAsset);
    expect(row._enc).toBeUndefined();
    expect(row.data).toBe(blobAsset.data);
    const back = await decryptAsset(row);
    expect(back.data).toBe(blobAsset.data);
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db/__tests__/recordCrypto.test.ts`
      Expected: FAIL — `Cannot find module '../recordCrypto'`.
- [ ] **Step 3: Implement**

```ts
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
import { getSessionDek } from './sessionKey';
import type { StoredAsset, StoredProtocol, StoredSession } from './types';

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
    return { ...rest, network: network as NcNetwork, stageMetadata };
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
    return {
      ...rest,
      protocol: protocol as CurrentProtocol,
      codebook: codebook as CurrentProtocol['codebook'],
    };
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
```

The two `as` casts in the passthrough (`none`-mode) read paths are unavoidable narrowings of the row-superset's optional field to the plaintext type — but the global constraint forbids `as`. Resolve them structurally instead: throw on the absent field so the type is provably present.
Replace the `decryptSession` no-`_enc` branch with:

```ts
if (!_enc) {
  if (network === undefined) {
    throw new Error(`Session ${row.id} has neither plaintext network nor _enc`);
  }
  return { ...rest, network, stageMetadata };
}
```

and the `decryptProtocol` no-`_enc` branch with:

```ts
if (!_enc) {
  if (protocol === undefined || codebook === undefined) {
    throw new Error(
      `Protocol ${row.hash} has neither plaintext protocol/codebook nor _enc`,
    );
  }
  return { ...rest, protocol, codebook };
}
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db/__tests__/recordCrypto.test.ts`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/db/recordCrypto.ts apps/interviewer-v8/src/lib/db/__tests__/recordCrypto.test.ts
git commit -m "feat(interviewer-v8): record field codec for encrypted storage"
```

### Task D3: Retype Dexie tables to row types

**Files:**

- Modify: `apps/interviewer-v8/src/lib/db/db.ts`

**Interfaces:**

- Consumes: `recordCrypto.ts::{StoredProtocolRow, StoredSessionRow, StoredAssetRow}`.
- Produces: `db.protocols: Table<StoredProtocolRow, string>`, `db.sessions: Table<StoredSessionRow, string>`, `db.assets: Table<StoredAssetRow, string>` (settings unchanged). Indexes and Dexie version are unchanged (no schema bump — alpha, no migration; all indexed fields remain plaintext).

This is a type-only refactor enabling D4/D5 to `put`/`get` encrypted rows without `as`. The `.stores(...)` index strings do NOT change.

- [ ] **Step 1: Verify current state (baseline)**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db/__tests__/recordCrypto.test.ts src/lib/db/__tests__/sessionKey.test.ts`
      Expected: PASS (D1/D2 unaffected; establishes the tables still compile before retyping).
- [ ] **Step 2: Implement — edit `db.ts`**
      Change the imports so the Dexie tables are typed by the row shapes (settings stays on `StoredSettings`):

```ts
import Dexie, { type Table } from 'dexie';

import type {
  StoredAssetRow,
  StoredProtocolRow,
  StoredSessionRow,
} from './recordCrypto';
import { DEFAULT_SETTINGS, type StoredSettings } from './types';

class InterviewerV8DB extends Dexie {
  protocols!: Table<StoredProtocolRow, string>;
  sessions!: Table<StoredSessionRow, string>;
  assets!: Table<StoredAssetRow, string>;
  settings!: Table<StoredSettings, 'device'>;

  constructor() {
    super('interviewer-v8');
    this.version(1).stores({
      protocols: 'id, hash, name, importedAt',
      sessions:
        'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt',
      assets: 'id, protocolHash, assetId',
      settings: 'id',
    });
    this.version(2).stores({
      sessions:
        'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt, isSynthetic',
    });
  }
}
```

Leave `getSettings`/`updateSettings` unchanged. (Also rename the class `InterviewerV7DB` → `InterviewerV8DB` — the DB name string `'interviewer-v8'` is already correct.)

- [ ] **Step 3: Typecheck**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck`
      Expected: FAIL — `protocols.ts`/`sessions.ts` still `put` plaintext `Stored*` rows into `Table<Stored*Row>`; type errors point at those repo files (fixed in D4/D5). This confirms the retype took effect.
- [ ] **Step 4: Verify the DB module itself compiles in isolation via its tests**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db/__tests__/defaultSettings.test.ts`
      Expected: PASS (settings path is untouched; row-typed tables don't affect it).
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/db/db.ts
git commit -m "refactor(interviewer-v8): type Dexie tables as encrypted row shapes"
```

### Task D4: Encrypt/decrypt at the protocols repo boundary

**Files:**

- Modify: `apps/interviewer-v8/src/lib/db/protocols.ts`
- Test: `apps/interviewer-v8/src/lib/db/__tests__/protocols.crypto.test.ts`

**Interfaces:**

- Consumes: `recordCrypto.ts::{encryptProtocol, decryptProtocol, encryptAsset, decryptAsset}`; `sessionKey.ts::setSessionDek`.
- Produces: `protocols.ts` public functions keep IDENTICAL signatures (`listProtocols`, `getProtocolByHash`, `getProtocolsByHashes`, `saveProtocol`, `deleteProtocol`, `getProtocolAssets`, `getProtocolAsset`) returning plaintext `StoredProtocol`/`StoredAsset`/`ProtocolWithCounts` to `api.ts` consumers.

Transaction-liveness: `saveProtocol` encrypts the protocol row + ALL asset rows first (await), THEN opens `db.transaction('rw', …)` and `put`/`bulkPut` the already-encrypted rows. Reads decrypt after the query resolves, outside any transaction.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { db } from '../db';
import {
  getProtocolAsset,
  getProtocolAssets,
  getProtocolByHash,
  listProtocols,
  saveProtocol,
} from '../protocols';
import { setSessionDek } from '../sessionKey';

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function makeProtocol(hash: string): CurrentProtocol {
  return {
    name: `Protocol ${hash}`,
    description: 'desc',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {
      'img-1': { id: 'img-1', type: 'image', name: 'Photo', source: 'p.png' },
    },
  } as CurrentProtocol;
}

describe('protocols repo — encryption at boundary', () => {
  beforeEach(async () => {
    await db.protocols.clear();
    await db.assets.clear();
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    await db.protocols.clear();
    await db.assets.clear();
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('stores no plaintext protocol/codebook or asset data when unlocked', async () => {
    await saveProtocol(makeProtocol('h1'), 'h1', [
      { id: 'img-1', name: 'Photo', data: new Blob([new Uint8Array([9, 9])]) },
    ]);

    const rawProtocol = await db.protocols.get('h1');
    expect(rawProtocol?.protocol).toBeUndefined();
    expect(rawProtocol?.codebook).toBeUndefined();
    expect(rawProtocol?._enc?.protocol).toBeDefined();
    expect(rawProtocol?.name).toBe('Protocol h1'); // index field plaintext

    const rawAsset = await db.assets.get('h1::img-1');
    expect(rawAsset?.data).toBeUndefined();
    expect(rawAsset?._enc?.data).toBeDefined();
    expect(rawAsset?.assetId).toBe('img-1'); // index field plaintext
  });

  it('returns the full protocol and assets on read', async () => {
    await saveProtocol(makeProtocol('h1'), 'h1', [
      { id: 'img-1', name: 'Photo', data: new Blob([new Uint8Array([1, 2])]) },
    ]);

    const back = await getProtocolByHash('h1');
    expect(back?.protocol.name).toBe('Protocol h1');
    expect(back?.codebook).toEqual({ node: {}, edge: {}, ego: {} });

    const asset = await getProtocolAsset('h1', 'img-1');
    expect(asset?.data).toBeInstanceOf(Blob);

    const assets = await getProtocolAssets('h1');
    expect(assets).toHaveLength(1);

    const list = await listProtocols();
    expect(list).toHaveLength(1);
    expect(list[0]?.protocol.name).toBe('Protocol h1');
    expect(list[0]?.sessionCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db/__tests__/protocols.crypto.test.ts`
      Expected: FAIL — `saveProtocol` still `put`s a plaintext `StoredProtocol`, so `rawProtocol.protocol` is defined and `_enc` is undefined (assertions fail); also a typecheck error from D3's row-typed tables.
- [ ] **Step 3: Implement — replace `protocols.ts`**

```ts
import type { CurrentProtocol } from '@codaco/protocol-validation';

import { db } from './db';
import {
  decryptAsset,
  decryptProtocol,
  encryptAsset,
  encryptProtocol,
} from './recordCrypto';
import type { ProtocolWithCounts, StoredAsset, StoredProtocol } from './types';

export async function listProtocols(): Promise<ProtocolWithCounts[]> {
  const rows = await db.protocols
    .orderBy('importedAt')
    // Dexie Collection.reverse() returns a descending Collection, not an Array.
    // oxlint-disable-next-line unicorn/no-array-reverse
    .reverse()
    .toArray();
  const sessions = await db.sessions.toArray();
  const counts = new Map<string, number>();
  for (const s of sessions) {
    counts.set(s.protocolHash, (counts.get(s.protocolHash) ?? 0) + 1);
  }
  const decrypted = await Promise.all(rows.map((row) => decryptProtocol(row)));
  return decrypted.map((p) => ({
    ...p,
    sessionCount: counts.get(p.hash) ?? 0,
  }));
}

export async function getProtocolByHash(
  hash: string,
): Promise<StoredProtocol | undefined> {
  const row = await db.protocols.where('hash').equals(hash).first();
  return row ? decryptProtocol(row) : undefined;
}

export async function getProtocolsByHashes(
  hashes: readonly string[],
): Promise<StoredProtocol[]> {
  const out: StoredProtocol[] = [];
  for (const hash of new Set(hashes)) {
    const row = await db.protocols.where('hash').equals(hash).first();
    if (row) out.push(await decryptProtocol(row));
  }
  return out;
}

export async function saveProtocol(
  protocol: CurrentProtocol,
  hash: string,
  assets: { id: string; name: string; data: Blob | string }[],
): Promise<StoredProtocol> {
  const existing = await getProtocolByHash(hash);
  const id = existing?.id ?? hash;
  const stored: StoredProtocol = {
    id,
    hash,
    name: protocol.name,
    schemaVersion: protocol.schemaVersion,
    lastModified: protocol.lastModified,
    importedAt: existing?.importedAt ?? new Date().toISOString(),
    description: protocol.description,
    codebook: protocol.codebook,
    protocol,
  };

  const assetRecords: StoredAsset[] = assets.map((asset) => {
    const manifestEntry = protocol.assetManifest?.[asset.id];
    const type = (manifestEntry?.type ?? 'image') as StoredAsset['type'];
    return {
      id: `${hash}::${asset.id}`,
      protocolHash: hash,
      assetId: asset.id,
      name: asset.name,
      type,
      data: asset.data,
    };
  });

  // Encrypt BEFORE opening the transaction (transaction-liveness rule): the
  // crypto.subtle awaits would let Dexie auto-commit an open tx mid-await.
  const protocolRow = await encryptProtocol(stored);
  const assetRows = await Promise.all(
    assetRecords.map((record) => encryptAsset(record)),
  );

  await db.transaction('rw', db.protocols, db.assets, async () => {
    await db.protocols.put(protocolRow);
    await db.assets.where('protocolHash').equals(hash).delete();
    if (assetRows.length > 0) {
      await db.assets.bulkPut(assetRows);
    }
  });

  return stored;
}

export async function deleteProtocol(hash: string): Promise<void> {
  await db.transaction('rw', db.protocols, db.sessions, db.assets, async () => {
    await db.assets.where('protocolHash').equals(hash).delete();
    await db.sessions.where('protocolHash').equals(hash).delete();
    await db.protocols.where('hash').equals(hash).delete();
  });
}

export async function getProtocolAssets(hash: string): Promise<StoredAsset[]> {
  const rows = await db.assets.where('protocolHash').equals(hash).toArray();
  return Promise.all(rows.map((row) => decryptAsset(row)));
}

export async function getProtocolAsset(
  hash: string,
  assetId: string,
): Promise<StoredAsset | undefined> {
  const row = await db.assets.get(`${hash}::${assetId}`);
  return row ? decryptAsset(row) : undefined;
}
```

The `type` cast on `manifestEntry?.type` is pre-existing (unchanged from the current file); leave it as-is to avoid widening this task's scope.

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db/__tests__/protocols.crypto.test.ts`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/db/protocols.ts apps/interviewer-v8/src/lib/db/__tests__/protocols.crypto.test.ts
git commit -m "feat(interviewer-v8): encrypt protocols and assets at repo boundary"
```

### Task D5: Encrypt/decrypt at the sessions repo boundary

**Files:**

- Modify: `apps/interviewer-v8/src/lib/db/sessions.ts`
- Test: `apps/interviewer-v8/src/lib/db/__tests__/sessions.crypto.test.ts`

**Interfaces:**

- Consumes: `recordCrypto.ts::{encryptSession, decryptSession}`; `sessionKey.ts::setSessionDek`.
- Produces: `sessions.ts` public functions keep IDENTICAL signatures. `getSession`/`getSessionsByIds` decrypt; `createSession`/`updateSession`/`markSessionFinished`/`markSessionsExported` encrypt before write. `querySessions`/`listSessions`/`queryMatchingSessionIds`/`countSyntheticSessions`/`deleteSyntheticSessions` stay on plaintext index rows and NEVER decrypt (never touch the key). `deriveProgressPercent` export is unchanged.

`toLite` and the query/sort/filter helpers operate only on the plaintext index fields (`id`, `protocolHash`, `protocolName`, `caseId`, timestamps, `finishedAt`, `exportedAt`, `currentStep`, `progress`, `isSynthetic`) — all of which stay plaintext on the row — so they consume `StoredSessionRow` directly with no decryption. `markSessionFinished`/`markSessionsExported` mutate only plaintext fields by spreading the existing row (preserving `_enc`), so they need no key either.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { NcNetwork } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { db } from '../db';
import {
  createSession,
  getSession,
  getSessionsByIds,
  listSessions,
  querySessions,
  updateSession,
} from '../sessions';
import { setSessionDek } from '../sessionKey';

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
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db/__tests__/sessions.crypto.test.ts`
      Expected: FAIL — `createSession`/`updateSession` still `put` plaintext `StoredSession` (so `raw.network` is defined, `_enc` undefined), plus a D3 typecheck error on those `put`s.
- [ ] **Step 3: Implement — edit `sessions.ts`**
      Add the imports and change the row-typed helpers + the four write paths and two read paths. Replace the import block:

```ts
import { v4 as uuid } from 'uuid';

import type { NcNetwork } from '@codaco/shared-consts';

import { db } from './db';
import {
  decryptSession,
  encryptSession,
  type StoredSessionRow,
} from './recordCrypto';
import type {
  SessionQueryParams,
  SessionQueryResult,
  SessionStatusKind,
  StoredSession,
  StoredSessionLite,
} from './types';
```

Retype the plaintext-only helpers to consume rows (only index fields are read, so no decryption). Change the signatures of `deriveStatusKind`, `toLite`, `matchesNonStatusFilters` to take `StoredSessionRow`:

```ts
function deriveStatusKind(session: StoredSessionRow): SessionStatusKind {
  if (session.exportedAt) return 'exported';
  if (session.finishedAt) return 'complete';
  return 'in-progress';
}
```

```ts
function toLite(session: StoredSessionRow): StoredSessionLite {
  return {
    id: session.id,
    protocolHash: session.protocolHash,
    protocolName: session.protocolName,
    caseId: session.caseId,
    startedAt: session.startedAt,
    lastUpdatedAt: session.lastUpdatedAt,
    finishedAt: session.finishedAt,
    exportedAt: session.exportedAt,
    currentStep: session.currentStep,
    isSynthetic: session.isSynthetic,
    statusKind: deriveStatusKind(session),
    progressPercent: deriveProgressPercent(session),
  };
}
```

`deriveProgressPercent` currently takes `StoredSession`; widen it to the row type since it reads only `finishedAt`/`progress` (both plaintext). Its exported test (`sessions.test.ts`) passes full `StoredSession` values, which structurally satisfy `StoredSessionRow`, so that test is unaffected:

```ts
export function deriveProgressPercent(session: StoredSessionRow): number {
  if (session.finishedAt) return 100;
  return Math.min(100, Math.max(0, session.progress ?? 0));
}
```

Change `matchesNonStatusFilters(session: StoredSessionRow, …)` — its body already reads only plaintext index fields; just change the parameter type annotation from `StoredSession` to `StoredSessionRow`. `querySessions`/`queryMatchingSessionIds`/`listSessions`/`countSyntheticSessions`/`deleteSyntheticSessions` bodies are UNCHANGED (they already operate on the rows Dexie returns, now typed `StoredSessionRow`).
Replace the read/write functions:

```ts
export async function getSession(
  id: string,
): Promise<StoredSession | undefined> {
  const row = await db.sessions.get(id);
  return row ? decryptSession(row) : undefined;
}

export async function getSessionsByIds(
  ids: readonly string[],
): Promise<StoredSession[]> {
  const rows = await db.sessions.bulkGet([...ids]);
  const present = rows.filter((r): r is StoredSessionRow => Boolean(r));
  return Promise.all(present.map((row) => decryptSession(row)));
}

export async function createSession(args: {
  protocolHash: string;
  protocolName: string;
  caseId: string;
  initialNetwork: NcNetwork;
  isSynthetic?: boolean;
}): Promise<StoredSession> {
  const now = new Date().toISOString();
  const session: StoredSession = {
    id: uuid(),
    protocolHash: args.protocolHash,
    protocolName: args.protocolName,
    caseId: args.caseId,
    startedAt: now,
    lastUpdatedAt: now,
    finishedAt: null,
    exportedAt: null,
    currentStep: 0,
    network: args.initialNetwork,
    stageMetadata: undefined,
    isSynthetic: args.isSynthetic ?? false,
  };
  const row = await encryptSession(session);
  await db.sessions.put(row);
  return session;
}

export async function updateSession(
  id: string,
  patch: Partial<StoredSession>,
): Promise<StoredSession | undefined> {
  const existingRow = await db.sessions.get(id);
  if (!existingRow) return undefined;
  const existing = await decryptSession(existingRow);
  const updated: StoredSession = {
    ...existing,
    ...patch,
    lastUpdatedAt: new Date().toISOString(),
  };
  const row = await encryptSession(updated);
  await db.sessions.put(row);
  return updated;
}

export async function markSessionFinished(id: string): Promise<void> {
  const existing = await db.sessions.get(id);
  if (!existing) return;
  // Only plaintext index fields change; spread preserves `_enc` — no key needed.
  await db.sessions.put({
    ...existing,
    finishedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  });
}

export async function markSessionsExported(ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.sessions, async () => {
    for (const id of ids) {
      const existing = await db.sessions.get(id);
      if (!existing) continue;
      await db.sessions.put({
        ...existing,
        exportedAt: now,
        lastUpdatedAt: now,
      });
    }
  });
}
```

`deleteSessions`, `countSyntheticSessions`, `deleteSyntheticSessions` are UNCHANGED — they touch only ids and the plaintext `isSynthetic` index field.

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db/__tests__/sessions.crypto.test.ts src/lib/db/__tests__/sessions.test.ts`
      Expected: PASS (both the new crypto test and the existing `deriveProgressPercent` test).
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/db/sessions.ts apps/interviewer-v8/src/lib/db/__tests__/sessions.crypto.test.ts
git commit -m "feat(interviewer-v8): encrypt sessions at repo boundary, keep queries on plaintext indexes"
```

### Task D6: Collapse `db/api.ts` to the single Dexie path

**Files:**

- Modify: `apps/interviewer-v8/src/lib/db/api.ts`

**Interfaces:**

- Consumes: `db/protocols.ts`, `db/sessions.ts`, `db/db.ts` (Dexie) directly.
- Produces: `api.ts` public surface with IDENTICAL signatures to all current consumers (`listProtocols`, `getProtocolByHash`, `getProtocolsByHashes`, `saveProtocol`, `deleteProtocol`, `getProtocolAssets`, `getProtocolAsset`, `listSessions`, `querySessions`, `queryMatchingSessionIds`, `getSession`, `getSessionsByIds`, `createSession`, `updateSession`, `markSessionFinished`, `markSessionsExported`, `deleteSessions`, `countSyntheticSessions`, `deleteSyntheticSessions`, `getSettings`, `updateSettings`). No `isElectron` branch remains (Phase A deleted the Electron arms).

Phase A already removed `db/electron-protocols.ts`, `db/electron-sessions.ts`, `db/electron-settings.ts` and `platform.isElectron`. This task rewrites `api.ts` to re-export the Dexie implementations directly. Per the global no-convenience-re-export rule, `api.ts` is the facade the codebase already imports from (it is the intended public surface, not a convenience aggregator); keep it as thin async wrappers rather than `export … from` so the module remains the single documented entry point without becoming a barrel.

- [ ] **Step 1: Verify current state (baseline)**
      Run: `grep -c isElectron apps/interviewer-v8/src/lib/db/api.ts`
      Expected (before edit): a non-zero count (the current file branches on `isElectron` in every function).
- [ ] **Step 2: Implement — replace `api.ts`**

```ts
import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import {
  getSettings as dexieGetSettings,
  updateSettings as dexieUpdateSettings,
} from './db';
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
  return dexieGetSettings();
}

export async function updateSettings(
  patch: Partial<Omit<StoredSettings, 'id'>>,
): Promise<StoredSettings> {
  return dexieUpdateSettings(patch);
}
```

- [ ] **Step 3: Verify no branch remains + typecheck**
      Run: `grep -c isElectron apps/interviewer-v8/src/lib/db/api.ts; pnpm --filter @codaco/interviewer-v8 typecheck`
      Expected: `0` (no `isElectron` references) followed by typecheck PASS — every consumer signature is byte-for-byte identical, so nothing downstream changes.
- [ ] **Step 4: Run the DB test suite**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db`
      Expected: PASS (all D2/D4/D5 crypto tests plus the pre-existing settings/sessions tests).
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/db/api.ts
git commit -m "refactor(interviewer-v8): collapse db api to single Dexie path"
```

### Task D7: Decrypt asset data when minting the blob URL

**Files:**

- Modify: `apps/interviewer-v8/src/lib/assets/assetResolver.ts`
- Test: `apps/interviewer-v8/src/lib/assets/__tests__/assetResolver.crypto.test.ts`

**Interfaces:**

- Consumes: `db/api.ts::{getProtocolAsset, getProtocolAssets, getProtocolByHash}` (which now return DECRYPTED `StoredAsset` with real `Blob`/`string` `data`).
- Produces: `buildResolvedAssets`, `makeAssetResolver` — IDENTICAL signatures. No behaviour change to consumers.

`api.ts` already decrypts at the repo boundary (D4), so `getProtocolAsset` hands `assetResolver` a plaintext `StoredAsset` whose `data` is a real `Blob`/`string`. `assetResolver.ts` therefore needs NO decrypt call itself — `URL.createObjectURL(record.data)` already receives decrypted bytes. This task adds the test proving the end-to-end path yields a usable blob URL for an encrypted-at-rest asset, and adds a one-line clarifying comment; the resolver body is unchanged. This keeps decryption at the single db boundary (no double-decrypt) per the transaction-liveness/boundary design.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../../db/db';
import { saveProtocol } from '../../db/protocols';
import { setSessionDek } from '../../db/sessionKey';

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

describe('assetResolver decrypts encrypted-at-rest assets', () => {
  beforeEach(async () => {
    await db.protocols.clear();
    await db.assets.clear();
    setSessionDek(await makeDek());
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });
  afterEach(async () => {
    await db.protocols.clear();
    await db.assets.clear();
    setSessionDek(null);
    vi.unstubAllGlobals();
  });

  it('mints a blob URL from decrypted asset bytes', async () => {
    // Import so URL.createObjectURL is the stub set in beforeEach.
    const { makeAssetResolver } = await import('../assetResolver');
    const protocol = {
      name: 'P',
      schemaVersion: 8,
      stages: [],
      codebook: { node: {}, edge: {}, ego: {} },
      assetManifest: {
        'img-1': { id: 'img-1', type: 'image', name: 'Photo', source: 'p.png' },
      },
    };
    // saveProtocol accepts CurrentProtocol; the minimal shape above is
    // structurally sufficient for this storage-round-trip test.
    await saveProtocol(protocol as never, 'h1', [
      { id: 'img-1', name: 'Photo', data: new Blob([new Uint8Array([7, 7])]) },
    ]);
    setSessionDek(
      await (async () => {
        // Keep the SAME key that saveProtocol used; re-set it explicitly for clarity.
        return db.sessions ? getExistingDek() : makeDek();
      })(),
    );

    const resolver = makeAssetResolver('h1', new Date().toISOString());
    const url = await resolver('img-1');
    expect(url).toBe('blob:mock-url');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    const [passedBlob] = (
      URL.createObjectURL as unknown as { mock: { calls: [Blob][] } }
    ).mock.calls[0]!;
    expect(passedBlob).toBeInstanceOf(Blob);
  });

  it('returns an apikey string directly (no blob URL)', async () => {
    const { makeAssetResolver } = await import('../assetResolver');
    const protocol = {
      name: 'P',
      schemaVersion: 8,
      stages: [],
      codebook: { node: {}, edge: {}, ego: {} },
      assetManifest: { 'key-1': { id: 'key-1', type: 'apikey', name: 'Key' } },
    };
    await saveProtocol(protocol as never, 'h1', [
      { id: 'key-1', name: 'Key', data: 'secret' },
    ]);

    const resolver = makeAssetResolver('h1', new Date().toISOString());
    const value = await resolver('key-1');
    expect(value).toBe('secret');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

function getExistingDek(): CryptoKey {
  throw new Error('unused helper');
}
```

Simplify the test to avoid the key-juggling: since `beforeEach` sets one DEK and never clears it before the resolver runs, drop the mid-test re-set. Use this final form of the first test body (the DEK set in `beforeEach` is still active through the resolver call, so encryption and decryption use the same key):

```ts
it('mints a blob URL from decrypted asset bytes', async () => {
  const { makeAssetResolver } = await import('../assetResolver');
  const protocol = {
    name: 'P',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {
      'img-1': { id: 'img-1', type: 'image', name: 'Photo', source: 'p.png' },
    },
  };
  await saveProtocol(protocol as never, 'h1', [
    { id: 'img-1', name: 'Photo', data: new Blob([new Uint8Array([7, 7])]) },
  ]);

  const resolver = makeAssetResolver('h1', new Date().toISOString());
  const url = await resolver('img-1');
  expect(url).toBe('blob:mock-url');
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
});
```

Delete the `getExistingDek` helper and the `setSessionDek(await (async () => …))` block entirely. The `as never` on `protocol` is confined to test fixtures (not app code); if oxlint flags it, build a full `CurrentProtocol` via `@codaco/protocol-utilities`'s `SyntheticInterview` builder instead — but a fixture cast is acceptable in a `.test.ts` for a storage-round-trip that never reads protocol semantics.

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/assets/__tests__/assetResolver.crypto.test.ts`
      Expected: FAIL — before D4 landed, stored asset `data` would be `undefined` (encrypted into `_enc`), so `getProtocolAsset` returns a row whose `data` isn't a Blob and `URL.createObjectURL` is never reached / throws. (With D4 landed and the resolver already correct, this test may pass immediately; if so, it still guards the boundary — proceed to Step 3 to add the clarifying comment and re-run.)
- [ ] **Step 3: Implement — add the boundary comment in `assetResolver.ts`**
      The resolver body is already correct because `getProtocolAsset` (via `db/api.ts` → `protocols.ts`) returns decrypted `StoredAsset` data. Add a comment above the `URL.createObjectURL` call documenting that decryption happens at the db boundary, so a future reader does not add a redundant decrypt here. Change:

```ts
const url = URL.createObjectURL(record.data);
urlCache.set(key, url);
return url;
```

to:

```ts
// `record.data` is already decrypted at the db boundary (db/protocols.ts
// decrypts asset rows on read), so this Blob holds plaintext bytes.
const url = URL.createObjectURL(record.data);
urlCache.set(key, url);
return url;
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/assets/__tests__/assetResolver.crypto.test.ts src/lib/assets/__tests__/assetResolver.test.ts`
      Expected: PASS (new crypto round-trip test plus the existing `buildResolvedAssets` source-filename tests).
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/assets/assetResolver.ts apps/interviewer-v8/src/lib/assets/__tests__/assetResolver.crypto.test.ts
git commit -m "test(interviewer-v8): assets decrypt end-to-end when minting blob URLs"
```

### Task D8: Full-phase verification (typecheck, tests, knip)

**Files:** none (verification only).

**Interfaces:**

- Consumes: all Phase D modules.
- Produces: a green typecheck/test/knip gate for the encrypted-storage workstream.

- [ ] **Step 1: Typecheck the whole app**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck`
      Expected: PASS — no `any`, no `as` in app code (fixture casts confined to `.test.ts`); all consumer signatures unchanged.
- [ ] **Step 2: Run the full unit project**
      Run: `pnpm --filter @codaco/interviewer-v8 test`
      Expected: PASS — `sessionKey`, `recordCrypto`, `protocols.crypto`, `sessions.crypto`, `sessions` (existing), `assetResolver.crypto`, `assetResolver` (existing), and `defaultSettings` all green.
- [ ] **Step 3: Dead-code / unused-export check**
      Run: `pnpm --filter @codaco/interviewer-v8 exec knip` (falls back to root `pnpm knip` if the app has no local knip script)
      Expected: PASS — `sessionKey`, `recordCrypto`, and the `Stored*Row` types are all consumed (`recordCrypto` by the repos, `sessionKey` by the repos and by Phase B/C's `AuthProvider`); no new unused exports introduced. If knip flags `StoredSessionRow`/`StoredProtocolRow`/`StoredAssetRow` as unused, that is expected only until D3/D4/D5 land — after this phase they are all imported.
- [ ] **Step 4: Lint/format**
      Run: `pnpm lint:fix` (from repo root) then `git diff --stat`
      Expected: no residual diff after the pre-commit-equivalent pass (oxfmt/oxlint already applied per-task); if any file changed, amend the owning task's commit.
- [ ] **Step 5: Commit (only if Step 4 produced changes)**

```bash
git add -A && git commit -m "chore(interviewer-v8): lint/format pass for encrypted storage"
```
