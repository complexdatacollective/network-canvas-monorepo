import { safe } from '@orpc/client';
import { describe, expect, it } from 'vitest';

import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  createInMemoryHost,
  type InMemoryClient,
  type InMemoryHost,
} from '../createInMemoryHost.ts';
import type { HostPrincipal } from '../protocolStore.ts';
import { sectionsFromProtocol } from '../sectionsFromProtocol.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;

const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });

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

const REQUEST_ID = 'request-1';

/** The edit that imported the file, and a second one open beside it. */
const IMPORTING_EDIT = 'edit-1';
const OTHER_EDIT = 'edit-2';

const PORTRAIT = () =>
  ({
    kind: 'content',
    contentKind: 'image',
    name: 'Portrait',
    source: 'portrait.png',
    contentType: 'image/png',
    bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  }) as const;

/** Somebody making resource calls: a connection, and the edit they are in. */
type Caller = Readonly<{ client: InMemoryClient; editId: string }>;

/**
 * One way of getting at a staged resource, asked once by the edit that staged
 * it and once by each edit that did not.
 *
 * `reaches` answers whether the caller got at THAT resource — the same
 * question for a list, a preview and a promotion, so the table below says what
 * scoping means procedure by procedure rather than leaving each to a test of
 * its own.
 */
type Reach = Readonly<{
  /** Dotted path of the contract procedure this goes through. */
  procedure: string;
  name: string;
  reaches: (
    caller: Caller,
    owner: Caller,
    host: InMemoryHost,
    staged: string,
  ) => Promise<boolean>;
  /**
   * Whether the edit that staged the resource reaches it this way. False only
   * where the way itself is wrong for anybody: a request id reused by a
   * different picker is a different intent, not a retry.
   */
  byOwner: boolean;
}>;

async function stagedList(
  caller: Caller,
  host: InMemoryHost,
): Promise<string[]> {
  const listed = await caller.client.resources.list({
    protocolId: host.protocolId,
    editId: caller.editId,
    status: 'staged',
  });
  if (listed.status !== 'ok') throw new Error(listed.failure.message);
  return listed.data.resources.map((resource) => resource.id);
}

const REACHES: readonly Reach[] = [
  {
    procedure: 'resources.list',
    name: 'listing the staged resources',
    byOwner: true,
    reaches: async (caller, _owner, host, staged) =>
      (await stagedList(caller, host)).includes(staged),
  },
  {
    procedure: 'resources.stage',
    name: 'staging again under the same request id',
    byOwner: true,
    reaches: async (caller, _owner, host, staged) => {
      const again = await caller.client.resources.stage({
        protocolId: host.protocolId,
        editId: caller.editId,
        requestId: REQUEST_ID,
        request: PORTRAIT(),
      });
      return again.status === 'ok' && again.data.descriptor.id === staged;
    },
  },
  {
    procedure: 'resources.stage',
    name: 'staging a secret under that request id',
    // A content picker and a secret picker can carry the same request id: the
    // contract asks only that an id be stable across a retry. Answered with
    // the upload's descriptor, the secret has no handle and the submit that
    // needs one cannot promote it.
    byOwner: false,
    reaches: async (caller, _owner, host, staged) => {
      const secret = await caller.client.resources.stage({
        protocolId: host.protocolId,
        editId: caller.editId,
        requestId: REQUEST_ID,
        request: { kind: 'secret', name: 'Mapbox token', value: 'pk.secret' },
      });
      return secret.status === 'ok' && secret.data.descriptor.id === staged;
    },
  },
  {
    procedure: 'resources.inspect',
    name: 'inspecting it',
    byOwner: true,
    reaches: async (caller, _owner, host, staged) => {
      const inspected = await caller.client.resources.inspect({
        protocolId: host.protocolId,
        editId: caller.editId,
        resourceId: staged,
      });
      return inspected.status === 'ok';
    },
  },
  {
    procedure: 'resources.preview',
    name: 'previewing its bytes',
    byOwner: true,
    reaches: async (caller, _owner, host, staged) => {
      const preview = await caller.client.resources.preview({
        protocolId: host.protocolId,
        editId: caller.editId,
        resourceId: staged,
      });
      return preview.status === 'ok';
    },
  },
  {
    procedure: 'resources.discard',
    name: 'discarding it by id',
    byOwner: true,
    reaches: async (caller, owner, host, staged) => {
      const discarded = await caller.client.resources.discard({
        protocolId: host.protocolId,
        editId: caller.editId,
        resourceId: staged,
      });
      const gone = !(await stagedList(owner, host)).includes(staged);
      return discarded.status === 'ok' && gone;
    },
  },
  {
    procedure: 'resources.discard',
    name: 'discarding the whole edit',
    // The cancel of one edit. Another edit's cancel taking away the file this
    // one is about to submit is the failure the scoping is for — and a
    // researcher with a codebook dialog open over a stage editor has two
    // edits in one session.
    byOwner: true,
    reaches: async (caller, owner, host, staged) => {
      await caller.client.resources.discard({
        protocolId: host.protocolId,
        editId: caller.editId,
      });
      return !(await stagedList(owner, host)).includes(staged);
    },
  },
  {
    procedure: 'submit',
    name: 'promoting it with a submit',
    byOwner: true,
    reaches: async (caller, _owner, host, staged) => {
      const held = await caller.client.acquireLock({
        protocolId: host.protocolId,
        sectionId: INFORMATION,
      });
      if (held.lock !== 'held') throw new Error('the lock was not granted');
      const { isSuccess } = await safe(
        caller.client.submit({
          protocolId: host.protocolId,
          requestId: 'write-1',
          sectionId: INFORMATION,
          document: held.document,
          revision: held.revision,
          promote: { editId: caller.editId, resourceIds: [staged] },
        }),
      );
      return isSuccess;
    },
  },
  {
    procedure: 'create',
    name: 'promoting it with a create',
    byOwner: true,
    reaches: async (caller, _owner, host, staged) => {
      const { id: _id, ...template } = host.store.read(INFORMATION).document;
      const { isSuccess } = await safe(
        caller.client.create({
          protocolId: host.protocolId,
          requestId: 'write-1',
          kind: 'stage',
          document: {
            ...template,
            items: [{ id: 'item-1', type: 'asset', content: staged }],
          },
          promote: { editId: caller.editId, resourceIds: [staged] },
        }),
      );
      return isSuccess;
    },
  },
];

/** A host with one image staged by Ada's first edit, and the id it minted. */
async function hostWithAdasImport(): Promise<
  Readonly<{ host: InMemoryHost; owner: Caller; staged: string }>
> {
  const host = createInMemoryHost({
    sections: sectionsFromProtocol(FIXTURE),
    principal: ADA,
  });
  const owner: Caller = { client: host.client, editId: IMPORTING_EDIT };
  const staged = await host.client.resources.stage({
    protocolId: host.protocolId,
    editId: IMPORTING_EDIT,
    requestId: REQUEST_ID,
    request: PORTRAIT(),
  });
  if (staged.status !== 'ok') throw new Error(staged.failure.message);
  return { host, owner, staged: staged.data.descriptor.id };
}

/**
 * Who asks, on top of the edit that staged the file: Ada's second editor, and
 * a collaborator.
 *
 * The collaborator names the SAME edit, so the two rows separate the two
 * boundaries: one edit cannot reach another's staging in one session, and one
 * session cannot reach another's however the edit is named.
 */
const OTHERS: readonly Readonly<{
  name: string;
  caller: (host: InMemoryHost) => Caller;
}>[] = [
  {
    name: 'another edit in the same session',
    caller: (host) => ({ client: host.client, editId: OTHER_EDIT }),
  },
  {
    name: 'a collaborator naming the same edit',
    caller: (host) => ({
      client: host.asCollaborator(GRACE),
      editId: IMPORTING_EDIT,
    }),
  },
];

describe('a staged resource belongs to the edit that staged it', () => {
  it('enumerates every procedure that reaches one', () => {
    // A procedure left out escapes the table entirely, so the host's own
    // resource surface says what the table has to cover.
    expect(
      [...new Set(REACHES.map((reach) => reach.procedure))].toSorted(),
    ).toEqual([
      'create',
      'resources.discard',
      'resources.inspect',
      'resources.list',
      'resources.preview',
      'resources.stage',
      'submit',
    ]);
  });

  for (const reach of REACHES) {
    it(`${reach.name} reaches it only for the edit that staged it`, async () => {
      const forOwner = await hostWithAdasImport();
      const reached: Record<string, boolean> = {
        'the edit that staged it': await reach.reaches(
          forOwner.owner,
          forOwner.owner,
          forOwner.host,
          forOwner.staged,
        ),
      };
      const expected: Record<string, boolean> = {
        'the edit that staged it': reach.byOwner,
      };

      for (const other of OTHERS) {
        const subject = await hostWithAdasImport();
        reached[other.name] = await reach.reaches(
          other.caller(subject.host),
          subject.owner,
          subject.host,
          subject.staged,
        );
        expected[other.name] = false;
      }

      expect(reached).toEqual(expected);
    });
  }
});
