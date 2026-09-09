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

const PORTRAIT = () =>
  ({
    kind: 'content',
    contentKind: 'image',
    name: 'Portrait',
    source: 'portrait.png',
    contentType: 'image/png',
    bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  }) as const;

/**
 * One way of getting at a staged resource, asked once by the session that
 * staged it and once by a collaborator.
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
    caller: InMemoryClient,
    owner: InMemoryClient,
    host: InMemoryHost,
    staged: string,
  ) => Promise<boolean>;
  /**
   * Whether the session that staged the resource reaches it this way. False
   * only where the way itself is wrong for anybody: a request id reused by a
   * different picker is a different intent, not a retry.
   */
  byOwner: boolean;
}>;

async function stagedList(
  client: InMemoryClient,
  host: InMemoryHost,
): Promise<string[]> {
  const listed = await client.resources.list({
    protocolId: host.protocolId,
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
      const again = await caller.resources.stage({
        protocolId: host.protocolId,
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
      const secret = await caller.resources.stage({
        protocolId: host.protocolId,
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
      const inspected = await caller.resources.inspect({
        protocolId: host.protocolId,
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
      const preview = await caller.resources.preview({
        protocolId: host.protocolId,
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
      const discarded = await caller.resources.discard({
        protocolId: host.protocolId,
        resourceId: staged,
      });
      const gone = !(await stagedList(owner, host)).includes(staged);
      return discarded.status === 'ok' && gone;
    },
  },
  {
    procedure: 'resources.discard',
    name: 'discarding the whole edit',
    // The cancel of one edit. A collaborator's cancel taking away the file
    // this edit is about to submit is the failure the scoping is for.
    byOwner: true,
    reaches: async (caller, owner, host, staged) => {
      await caller.resources.discard({ protocolId: host.protocolId });
      return !(await stagedList(owner, host)).includes(staged);
    },
  },
  {
    procedure: 'submit',
    name: 'promoting it with a submit',
    byOwner: true,
    reaches: async (caller, _owner, host, staged) => {
      const held = await caller.acquireLock({
        protocolId: host.protocolId,
        sectionId: INFORMATION,
      });
      if (held.lock !== 'held') throw new Error('the lock was not granted');
      const { isSuccess } = await safe(
        caller.submit({
          protocolId: host.protocolId,
          sectionId: INFORMATION,
          document: held.document,
          revision: held.revision,
          promote: { promotionId: 'promotion-1', resourceIds: [staged] },
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
        caller.create({
          protocolId: host.protocolId,
          kind: 'stage',
          document: {
            ...template,
            items: [{ id: 'item-1', type: 'asset', content: staged }],
          },
          promote: { promotionId: 'promotion-1', resourceIds: [staged] },
        }),
      );
      return isSuccess;
    },
  },
];

/** A host with one image staged by Ada, and the resource id it minted. */
async function hostWithAdasImport(): Promise<
  Readonly<{ host: InMemoryHost; staged: string }>
> {
  const host = createInMemoryHost({
    sections: sectionsFromProtocol(FIXTURE),
    principal: ADA,
  });
  const staged = await host.client.resources.stage({
    protocolId: host.protocolId,
    requestId: REQUEST_ID,
    request: PORTRAIT(),
  });
  if (staged.status !== 'ok') throw new Error(staged.failure.message);
  return { host, staged: staged.data.descriptor.id };
}

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
    it(`${reach.name} reaches it only for the session that staged it`, async () => {
      const forOwner = await hostWithAdasImport();
      const owner = await reach.reaches(
        forOwner.host.client,
        forOwner.host.client,
        forOwner.host,
        forOwner.staged,
      );

      const forCollaborator = await hostWithAdasImport();
      const collaborator = await reach.reaches(
        forCollaborator.host.asCollaborator(GRACE),
        forCollaborator.host.client,
        forCollaborator.host,
        forCollaborator.staged,
      );

      expect({ owner, collaborator }).toEqual({
        owner: reach.byOwner,
        collaborator: false,
      });
    });
  }
});
