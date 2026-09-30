import { describe, expect, it } from 'vitest';

import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  createInMemoryHost,
  type InMemoryHost,
} from '../createInMemoryHost.ts';
import { sectionsFromProtocol } from '../sectionsFromProtocol.ts';
import { keyedProcedures } from './contractProcedures.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;

const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });

const EDIT = 'edit-1';
/** The id the retried call repeats: one intent, asked twice. */
const REQUEST = 'write-1';

/**
 * A call that carries an idempotency key, and what it takes to make it.
 *
 * `run` is given the key rather than minting one, because the whole question
 * is what a host does when the same one arrives again: the first answer was
 * lost on its way back, not never sent.
 */
type KeyedWrite = Readonly<{
  /** Dotted path of the contract procedure this exercises. */
  procedure: string;
  name: string;
  prepare?: (host: InMemoryHost) => Promise<void>;
  /**
   * `staged` is a file this edit imported before either attempt: staging it
   * inside the call would import it again for the retry, which is a second
   * intent rather than the same one.
   */
  run: (
    host: InMemoryHost,
    requestId: string,
    staged: string,
  ) => Promise<unknown>;
}>;

const PORTRAIT = () =>
  ({
    kind: 'content',
    contentKind: 'image',
    name: 'Portrait',
    source: 'portrait.png',
    contentType: 'image/png',
    bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  }) as const;

function fixtureHost(): InMemoryHost {
  let minted = 0;
  return createInMemoryHost({
    sections: sectionsFromProtocol(FIXTURE),
    nextId: () => `minted-${++minted}`,
  });
}

async function stagePortrait(host: InMemoryHost): Promise<string> {
  const staged = await host.client.resources.stage({
    protocolId: host.protocolId,
    editId: EDIT,
    requestId: 'staging-1',
    request: PORTRAIT(),
  });
  if (staged.status !== 'ok') throw new Error(staged.failure.message);
  return staged.data.descriptor.id;
}

async function takeLock(host: InMemoryHost): Promise<void> {
  await host.client.acquireLock({
    protocolId: host.protocolId,
    sectionId: INFORMATION,
  });
}

function stageTemplate(host: InMemoryHost): Record<string, unknown> {
  const { id: _id, ...template } = host.store.read(INFORMATION).document;
  return template;
}

const WRITES: readonly KeyedWrite[] = [
  {
    procedure: 'submit',
    name: 'submitting a stage',
    prepare: takeLock,
    run: (host, requestId) =>
      host.client.submit({
        protocolId: host.protocolId,
        requestId,
        sectionId: INFORMATION,
        document: {
          ...host.store.read(INFORMATION).document,
          label: 'Renamed by the retry enumeration',
        },
        revision: host.store.read(INFORMATION).revision,
      }),
  },
  {
    procedure: 'submit',
    name: 'submitting a stage that promotes a resource',
    prepare: takeLock,
    run: (host, requestId, staged) =>
      host.client.submit({
        protocolId: host.protocolId,
        requestId,
        sectionId: INFORMATION,
        document: host.store.read(INFORMATION).document,
        revision: host.store.read(INFORMATION).revision,
        promote: { editId: EDIT, resourceIds: [staged] },
      }),
  },
  {
    procedure: 'create',
    // The retry a promotion never covered: a create with nothing staged
    // carried no key at all, so a second attempt minted a second stage.
    name: 'creating a stage',
    run: (host, requestId) =>
      host.client.create({
        protocolId: host.protocolId,
        requestId,
        kind: 'stage',
        document: stageTemplate(host),
      }),
  },
  {
    procedure: 'create',
    name: 'creating a stage that promotes a resource',
    run: (host, requestId, staged) =>
      host.client.create({
        protocolId: host.protocolId,
        requestId,
        kind: 'stage',
        document: {
          ...stageTemplate(host),
          items: [{ id: 'item-1', type: 'asset', content: staged }],
        },
        promote: { editId: EDIT, resourceIds: [staged] },
      }),
  },
  {
    procedure: 'resources.stage',
    name: 'staging a file',
    run: (host, requestId) =>
      host.client.resources.stage({
        protocolId: host.protocolId,
        editId: EDIT,
        requestId,
        request: PORTRAIT(),
      }),
  },
];

/** Everything a retry must leave alone: the protocol, and what is staged. */
type State = Readonly<{ sections: string[]; staged: string[] }>;

async function state(host: InMemoryHost): Promise<State> {
  const listed = await host.client.resources.list({
    protocolId: host.protocolId,
    editId: EDIT,
    status: 'staged',
  });
  if (listed.status !== 'ok') throw new Error(listed.failure.message);
  return {
    sections: host.store.sectionIds().map((id) => {
      const { revision } = host.store.read(id);
      return `${id}=${revision.sequence}:${revision.contentHash}`;
    }),
    staged: listed.data.resources.map((resource) => resource.id),
  };
}

describe('a write is made once for its request id', () => {
  it('enumerates every procedure the contract gives a key to', () => {
    // Read off the contract, so a procedure that gains a key without a row
    // here fails rather than going unchecked.
    expect(
      [...new Set(WRITES.map((write) => write.procedure))].toSorted(),
    ).toEqual(keyedProcedures().toSorted());
  });

  for (const write of WRITES) {
    it(`${write.name} answers the same and writes once`, async () => {
      const host = fixtureHost();
      await write.prepare?.(host);
      const staged = await stagePortrait(host);

      const first = await write.run(host, REQUEST, staged);
      const after = await state(host);
      const again = await write.run(host, REQUEST, staged);

      // The answer to the first attempt can be lost on its way back. The
      // retry is told what that attempt did — a create that minted a second
      // id would leave the protocol holding the stage twice, with the
      // researcher told about only one of them.
      expect(again).toEqual(first);
      expect(await state(host)).toEqual(after);
    });
  }

  it('imports one file when the retry overlaps the attempt it repeats', async () => {
    const host = fixtureHost();

    // A client whose socket dropped mid-import retries under the id it used,
    // and the host is still reading the first attempt's bytes: the second
    // attempt sees no record of the first because there is nothing to record
    // until the digest is in. Two staged copies is the researcher's one
    // imported file listed twice, with the id their submit promotes being the
    // one attempt they never heard about.
    const [first, again] = await Promise.all([
      host.client.resources.stage({
        protocolId: host.protocolId,
        editId: EDIT,
        requestId: REQUEST,
        request: PORTRAIT(),
      }),
      host.client.resources.stage({
        protocolId: host.protocolId,
        editId: EDIT,
        requestId: REQUEST,
        request: PORTRAIT(),
      }),
    ]);

    expect(again).toEqual(first);
    const listed = await host.client.resources.list({
      protocolId: host.protocolId,
      editId: EDIT,
      status: 'staged',
    });
    expect(listed.status === 'ok' && listed.data.resources).toHaveLength(1);
  });
});
