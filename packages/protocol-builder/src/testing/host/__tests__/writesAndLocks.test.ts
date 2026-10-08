import { Redacted } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  NotLockHolder,
  SectionsLocked,
} from '@codaco/protocol-builder-core/contract/errors';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import {
  createInMemoryHost,
  type InMemoryHost,
} from '../createInMemoryHost.ts';
import type { HostPrincipal } from '../protocolStore.ts';
import { sectionsFromProtocol } from '../sectionsFromProtocol.ts';
import { procedureTags } from './contractProcedures.ts';

/** The edit these calls are made from: one editor, open throughout. */
const EDIT = 'edit-1';

/** A fresh idempotency key: every write below is its own intent. */
let writes = 0;
const nextRequestId = (): string => `write-${++writes}`;

const FIXTURE: Record<string, unknown> = allInterfaces;

const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });
const PERSON = sectionId({ kind: 'codebookNode', typeId: 'person' });
const SPARE = sectionId({ kind: 'codebookNode', typeId: 'spare' });
const EGO = sectionId({ kind: 'codebookEgo' });

const ADA: HostPrincipal = {
  sessionId: 'session-1',
  userId: 'user-1',
  displayName: 'Ada',
};
const GRACE: HostPrincipal = {
  sessionId: 'session-2',
  userId: 'user-2',
  displayName: 'Grace',
};

const IMAGE = () => new Uint8Array([1, 2, 3]);

/** Where a section can be when a write reaches it. */
const LOCK_STATES = ['nobody', 'the caller', 'a collaborator'] as const;
type LockState = (typeof LOCK_STATES)[number];

type Call = Readonly<{
  procedure: string;
  name: string;
  host?: () => InMemoryHost;
  /**
   * Sections the caller holds while making the call, and may go on holding: the
   * section a submit is for, the codebook section a refactor deletes from.
   */
  mayHold?: readonly ProtocolSectionId[];
  /** The section the caller has to hold for the call to be taken at all. */
  requires?: ProtocolSectionId;
  prepare?: (host: InMemoryHost) => Promise<void>;
  run: (host: InMemoryHost) => Promise<unknown>;
}>;

/**
 * What a write did to the sections it touched, as one row per section and lock
 * state. `wrote` is how a refusal that changed the protocol anyway shows up:
 * every refusal in the expected table carries `wrote: false`.
 */
type Row = Readonly<{
  section: ProtocolSectionId;
  held: LockState;
  outcome: 'taken' | 'refused';
  names?: string;
  wrote: boolean;
}>;

type Snapshot = ReadonlyMap<ProtocolSectionId, string>;

function fixtureHost(): InMemoryHost {
  let minted = 0;
  return createInMemoryHost({
    sections: sectionsFromProtocol(FIXTURE),
    nextId: () => `minted-${++minted}`,
    principal: ADA,
  });
}

function hostWithoutEgo(): InMemoryHost {
  const { [EGO]: _ego, ...sections } = sectionsFromProtocol(FIXTURE);
  return createInMemoryHost({ sections, principal: ADA });
}

function hostWithSpareType(): InMemoryHost {
  return createInMemoryHost({
    sections: {
      ...sectionsFromProtocol(FIXTURE),
      [SPARE]: {
        name: 'Spare',
        label: { 'en-US': 'Spare' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {},
      },
    },
    principal: ADA,
  });
}

async function stagePortrait(host: InMemoryHost): Promise<string> {
  const staged = await host.adapter.rpcCall('ResourcesStage', {
    protocolId: host.protocolId,
    editId: EDIT,
    requestId: 'request-1',
    request: {
      kind: 'content',
      contentKind: 'image',
      name: Redacted.make('Portrait'),
      source: Redacted.make('portrait.png'),
      contentType: 'image/png',
      bytes: Redacted.make(IMAGE()),
    },
  });
  if (staged.status !== 'ok') throw new Error('staging failed');
  return staged.data.descriptor.id;
}

/**
 * Every call the contract offers, with the locks its caller is entitled to
 * hold. Which sections each one writes is never written down here: the
 * enumeration runs the call and reads that off the protocol, so a write that
 * starts touching another section is enumerated against that section's lock
 * without anybody remembering to add it.
 */
const CALLS: readonly Call[] = [
  {
    procedure: 'AcquireLock',
    name: 'taking a lock',
    run: (host) =>
      host.adapter.rpcCall('AcquireLock', {
        protocolId: host.protocolId,
        sectionId: INFORMATION,
      }),
  },
  {
    procedure: 'ReleaseLock',
    name: 'giving a lock back',
    prepare: async (host) => {
      await host.adapter.rpcCall('AcquireLock', {
        protocolId: host.protocolId,
        sectionId: INFORMATION,
      });
    },
    run: (host) =>
      host.adapter.rpcCall('ReleaseLock', {
        protocolId: host.protocolId,
        sectionId: INFORMATION,
      }),
  },
  {
    procedure: 'GetSection',
    name: 'reading a section',
    run: (host) =>
      host.adapter.rpcCall('GetSection', {
        protocolId: host.protocolId,
        sectionId: INFORMATION,
      }),
  },
  {
    procedure: 'ListSections',
    name: 'listing the sections',
    run: (host) =>
      host.adapter.rpcCall('ListSections', { protocolId: host.protocolId }),
  },
  {
    procedure: 'WatchProtocol',
    name: 'watching the protocol',
    run: async (host) => {
      const controller = new AbortController();
      await host.adapter
        .rpcStream(
          'WatchProtocol',
          { protocolId: host.protocolId },
          () => controller.abort(),
          controller.signal,
        )
        .catch((error: unknown) => {
          if (!controller.signal.aborted) throw error;
        });
    },
  },
  {
    procedure: 'Submit',
    name: 'submitting a stage',
    mayHold: [INFORMATION],
    requires: INFORMATION,
    run: async (host) =>
      host.adapter.rpcCall('Submit', {
        protocolId: host.protocolId,
        requestId: nextRequestId(),
        sectionId: INFORMATION,
        document: Redacted.make({
          ...host.store.read(INFORMATION).document,
          label: { 'en-US': 'Renamed by the enumeration' },
        }),
        revision: host.store.read(INFORMATION).revision,
      }),
  },
  {
    procedure: 'Submit',
    name: 'submitting a stage that promotes a resource',
    mayHold: [INFORMATION],
    requires: INFORMATION,
    run: async (host) => {
      const resourceId = await stagePortrait(host);
      return host.adapter.rpcCall('Submit', {
        protocolId: host.protocolId,
        requestId: nextRequestId(),
        sectionId: INFORMATION,
        document: Redacted.make(host.store.read(INFORMATION).document),
        revision: host.store.read(INFORMATION).revision,
        promote: { editId: EDIT, resourceIds: [resourceId] },
      });
    },
  },
  {
    procedure: 'Create',
    name: 'creating a stage',
    run: async (host) => {
      const { id: _id, ...template } = host.store.read(INFORMATION).document;
      return host.adapter.rpcCall('Create', {
        protocolId: host.protocolId,
        requestId: nextRequestId(),
        kind: 'stage',
        document: Redacted.make(template),
      });
    },
  },
  {
    procedure: 'Create',
    name: 'creating a stage that promotes a resource',
    run: async (host) => {
      const resourceId = await stagePortrait(host);
      const { id: _id, ...template } = host.store.read(INFORMATION).document;
      return host.adapter.rpcCall('Create', {
        protocolId: host.protocolId,
        requestId: nextRequestId(),
        kind: 'stage',
        document: Redacted.make({
          ...template,
          items: [{ id: 'item-1', type: 'asset', content: resourceId }],
        }),
        promote: { editId: EDIT, resourceIds: [resourceId] },
      });
    },
  },
  {
    procedure: 'Create',
    name: 'creating a node type',
    run: (host) =>
      host.adapter.rpcCall('Create', {
        protocolId: host.protocolId,
        requestId: nextRequestId(),
        kind: 'codebookNode',
        document: Redacted.make({
          name: 'Place',
          label: { 'en-US': 'Place' },
          color: 'node-color-seq-3',
          shape: { default: 'circle' },
          variables: {},
        }),
      }),
  },
  {
    procedure: 'Create',
    name: 'creating an edge type',
    run: (host) =>
      host.adapter.rpcCall('Create', {
        protocolId: host.protocolId,
        requestId: nextRequestId(),
        kind: 'codebookEdge',
        document: Redacted.make({
          name: 'Knows',
          label: { 'en-US': 'Knows' },
          color: 'edge-color-seq-1',
        }),
      }),
  },
  {
    procedure: 'Create',
    name: 'creating the ego codebook',
    host: hostWithoutEgo,
    run: (host) =>
      host.adapter.rpcCall('Create', {
        protocolId: host.protocolId,
        requestId: nextRequestId(),
        kind: 'codebookEgo',
        document: Redacted.make({
          variables: {
            ego_age: {
              name: 'ego_age',
              label: 'Age',
              type: 'number',
              component: 'Number',
            },
          },
        }),
      }),
  },
  {
    procedure: 'Delete',
    name: 'deleting a stage',
    run: (host) =>
      host.adapter.rpcCall('Delete', {
        protocolId: host.protocolId,
        sectionId: INFORMATION,
      }),
  },
  {
    procedure: 'RefactorDeleteVariable',
    name: 'deleting a codebook variable',
    mayHold: [PERSON],
    run: (host) =>
      host.adapter.rpcCall('RefactorDeleteVariable', {
        protocolId: host.protocolId,
        subject: { entity: 'node', type: 'person' },
        variableId: 'relationship_to_ego',
      }),
  },
  {
    procedure: 'RefactorDeleteEntityType',
    name: 'deleting an entity type',
    host: hostWithSpareType,
    mayHold: [SPARE],
    run: (host) =>
      host.adapter.rpcCall('RefactorDeleteEntityType', {
        protocolId: host.protocolId,
        entity: 'node',
        typeId: 'spare',
      }),
  },
  {
    procedure: 'ResourcesList',
    name: 'listing resources',
    run: (host) =>
      host.adapter.rpcCall('ResourcesList', { protocolId: host.protocolId }),
  },
  {
    procedure: 'ResourcesStage',
    name: 'staging a resource',
    run: async (host) => {
      await stagePortrait(host);
    },
  },
  {
    procedure: 'ResourcesDiscard',
    name: 'discarding a staged resource',
    prepare: async (host) => {
      await stagePortrait(host);
    },
    run: (host) =>
      host.adapter.rpcCall('ResourcesDiscard', {
        protocolId: host.protocolId,
        editId: EDIT,
      }),
  },
  {
    procedure: 'ResourcesInspect',
    name: 'inspecting a resource',
    run: (host) =>
      host.adapter.rpcCall('ResourcesInspect', {
        protocolId: host.protocolId,
        editId: EDIT,
        resourceId: 'geo_data',
      }),
  },
  {
    procedure: 'ResourcesPreview',
    name: 'previewing a resource',
    run: (host) =>
      host.adapter.rpcCall('ResourcesPreview', {
        protocolId: host.protocolId,
        editId: EDIT,
        resourceId: 'geo_data',
      }),
  },
];

describe('every write, against every lock on every section it touches', () => {
  it('enumerates a call for every procedure the contract has', () => {
    // A procedure nobody exercises escapes the enumeration below entirely, so
    // the contract itself says what the list has to contain.
    expect([...new Set(CALLS.map((call) => call.procedure))].sort()).toEqual(
      procedureTags().sort(),
    );
  });

  for (const call of CALLS) {
    it(`${call.name} is taken only where the sections it writes are free`, async () => {
      const touched = await touchedSections(call);
      const rows: Row[] = [];
      const expected: Row[] = [];
      for (const section of touched) {
        for (const held of LOCK_STATES) {
          rows.push(await attempt(call, section, held));
          expected.push(expectedRow(call, section, held));
        }
      }
      expect(rows).toEqual(expected);
    });
  }
});

/**
 * The sections a call writes, read off the protocol rather than declared: it is
 * made once with every lock it is entitled to, and the sections whose revision
 * moved are what it touched. Sections it creates are left out, since a section
 * that does not exist yet cannot be held by anybody.
 */
async function touchedSections(call: Call): Promise<ProtocolSectionId[]> {
  const host = (call.host ?? fixtureHost)();
  await call.prepare?.(host);
  await holdFor(call, host, undefined);
  const before = snapshot(host);
  const { isSuccess, error } = await settled(call.run(host));
  if (!isSuccess) {
    throw new Error(`${call.name} was refused with every lock it may hold`, {
      cause: error,
    });
  }
  const after = snapshot(host);
  return [...before.keys()].filter((id) => before.get(id) !== after.get(id));
}

/** One row: the call made with `section` in `held`, and what came of it. */
async function attempt(
  call: Call,
  section: ProtocolSectionId,
  held: LockState,
): Promise<Row> {
  const host = (call.host ?? fixtureHost)();
  await call.prepare?.(host);
  if (held === 'a collaborator') {
    await host.asCollaborator(GRACE).rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: section,
    });
  }
  if (held === 'the caller') {
    await host.adapter.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: section,
    });
  }
  await holdFor(call, host, held === 'nobody' ? section : undefined);
  const before = snapshot(host);
  const { isSuccess, error } = await settled(call.run(host));
  const wrote = changed(before, snapshot(host));
  if (isSuccess) return { section, held, outcome: 'taken', wrote };
  const names = holderNamedBy(error);
  return {
    section,
    held,
    outcome: 'refused',
    ...(names === undefined ? {} : { names }),
    wrote,
  };
}

/** Whether any section was written, created or removed between two snapshots. */
function changed(before: Snapshot, after: Snapshot): boolean {
  if (before.size !== after.size) return true;
  return [...before.keys()].some((id) => before.get(id) !== after.get(id));
}

/** Takes the locks the caller is entitled to, except `except`. */
async function holdFor(
  call: Call,
  host: InMemoryHost,
  except: ProtocolSectionId | undefined,
): Promise<void> {
  for (const id of call.mayHold ?? []) {
    if (id === except) continue;
    await host.adapter.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: id,
    });
  }
}

/**
 * The rule the whole enumeration is: a write is taken when every section it
 * writes is either free or one this caller holds and is entitled to hold, and
 * refused naming the holder otherwise, having written nothing.
 */
function expectedRow(
  call: Call,
  section: ProtocolSectionId,
  held: LockState,
): Row {
  const mayHold = call.mayHold ?? [];
  if (held === 'nobody') {
    return call.requires === section
      ? { section, held, outcome: 'refused', wrote: false }
      : { section, held, outcome: 'taken', wrote: true };
  }
  if (held === 'the caller' && mayHold.includes(section)) {
    return { section, held, outcome: 'taken', wrote: true };
  }
  return {
    section,
    held,
    outcome: 'refused',
    names: held === 'the caller' ? 'Ada' : 'Grace',
    wrote: false,
  };
}

/** Who a refusal says is holding the section, if it says. */
function holderNamedBy(error: unknown): string | undefined {
  if (error instanceof NotLockHolder) {
    return error.holder === undefined
      ? undefined
      : Redacted.value(error.holder.displayName);
  }
  if (!(error instanceof SectionsLocked)) return undefined;
  return error.blocked.flatMap((entry) =>
    entry.holder === undefined
      ? []
      : [Redacted.value(entry.holder.displayName)],
  )[0];
}

async function settled(
  run: Promise<unknown>,
): Promise<Readonly<{ isSuccess: boolean; error: unknown }>> {
  try {
    await run;
    return { isSuccess: true, error: undefined };
  } catch (error: unknown) {
    return { isSuccess: false, error };
  }
}

/** Every section as it stands, by content, so a write of any kind shows up. */
function snapshot(host: InMemoryHost): Snapshot {
  const state = new Map<ProtocolSectionId, string>();
  for (const id of host.store.sectionIds()) {
    const section = host.store.read(id);
    state.set(
      id,
      `${section.revision.sequence}:${section.revision.contentHash}`,
    );
  }
  return state;
}
