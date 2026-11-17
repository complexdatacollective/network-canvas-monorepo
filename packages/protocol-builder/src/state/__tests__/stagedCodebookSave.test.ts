import { QueryClient } from '@tanstack/react-query';
import { Effect, Redacted } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import type { Revision } from '@codaco/protocol-builder-core/contract/schemas';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  createInMemoryHost,
  type InMemoryHost,
} from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import type { StagedCodebook } from '../stagedCodebook.ts';
import {
  readSavedCodebook,
  stageAskHash,
  withStagedCodebook,
  type CodebookSave,
} from '../stagedCodebookSave.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;

const PERSON = sectionId({ kind: 'codebookNode', typeId: 'person' });
const FAMILY = sectionId({ kind: 'codebookNode', typeId: 'family_member' });
const PLACE = sectionId({ kind: 'codebookNode', typeId: 'place' });

const ANA = { sessionId: 'session-2', userId: 'user-2', displayName: 'Ana' };

const newHost = (): InMemoryHost =>
  createInMemoryHost({ sections: sectionsFromProtocol(FIXTURE) });

/** The section as the host holds it, which is what an edit is made from. */
const heldBy = (host: InMemoryHost, id: typeof PERSON): SectionDoc =>
  host.store.read(id).document;

/** An edit of one section: `changes` laid over the document it started from. */
const editOf = (base: SectionDoc, changes: SectionDoc) => ({
  base,
  edited: { ...base, ...changes },
});

/** What a save made of the codebook changes, kept for the test to read. */
const recordingWrite = () => {
  const saves: CodebookSave[] = [];
  return {
    saves,
    write: async (codebook: CodebookSave) => {
      saves.push(codebook);
      return 'written' as const;
    },
  };
};

/**
 * Whether a lock on the section is free for somebody else: a collaborator
 * can take it for themselves, then gives it back.
 */
async function isFreeFor(
  host: InMemoryHost,
  id: typeof PERSON,
): Promise<boolean> {
  const collaborator = host.asCollaborator(ANA);
  const answer = await collaborator.rpcCall('AcquireLock', {
    protocolId: host.protocolId,
    sectionId: id,
  });
  await collaborator.rpcCall('ReleaseLock', {
    protocolId: host.protocolId,
    sectionId: id,
  });
  return answer.lock === 'held';
}

describe('stageAskHash', () => {
  const document: SectionDoc = { id: 'stage-1', type: 'Information' };

  it('is the hash of the stage alone when nothing is carried beside it', () => {
    expect(stageAskHash(document, undefined, undefined)).toBe(
      contentHash(document),
    );
    expect(stageAskHash(document, [], {})).toBe(contentHash(document));
  });

  it('names the same ask by what the researcher staged, however the protocol has moved', () => {
    const host = newHost();
    const staged = {
      [PERSON]: editOf(heldBy(host, PERSON), { color: 'node-color-seq-3' }),
    };
    const first = stageAskHash(document, undefined, staged);

    // A collaborator's write changes the sections a save would make out of the
    // staged map, but never the map: a retry of the same ask is the same ask.
    host.store.applyAsCollaborator(PERSON, {
      ...heldBy(host, PERSON),
      icon: 'add-a-treatment',
    });
    // The same edits, rebuilt rather than reused.
    const retried = stageAskHash(document, undefined, structuredClone(staged));

    expect(retried).toBe(first);
  });

  it('differs when the staged edits differ, and from the stage alone', () => {
    const host = newHost();
    const base = heldBy(host, PERSON);
    const one = stageAskHash(document, undefined, {
      [PERSON]: editOf(base, { color: 'node-color-seq-3' }),
    });
    const other = stageAskHash(document, undefined, {
      [PERSON]: editOf(base, { color: 'node-color-seq-4' }),
    });

    expect(one).not.toBe(other);
    expect(one).not.toBe(stageAskHash(document, undefined, undefined));
  });
});

describe('withStagedCodebook', () => {
  it('writes with nothing and takes no lock when nothing is staged', async () => {
    const host = newHost();
    const acquire = vi.fn();
    const adapter = host.adapterWith({
      AcquireLock: (input) => {
        acquire();
        return host.handle.AcquireLock(input);
      },
    });
    const { saves, write } = recordingWrite();

    const outcome = await withStagedCodebook(
      adapter,
      host.protocolId,
      {},
      write,
    );

    expect(outcome).toBe('written');
    expect(saves).toHaveLength(1);
    expect(saves[0]?.sections).toEqual([]);
    expect(acquire).not.toHaveBeenCalled();
  });

  it('sends the edit laid over the section as the host holds it now', async () => {
    const host = newHost();
    const staged: StagedCodebook = {
      [PERSON]: editOf(heldBy(host, PERSON), { color: 'node-color-seq-3' }),
    };
    // Somebody changes something else after the edit was made.
    host.store.applyAsCollaborator(PERSON, {
      ...heldBy(host, PERSON),
      icon: 'add-a-treatment',
    });
    const { saves, write } = recordingWrite();

    await withStagedCodebook(host.adapter, host.protocolId, staged, write);

    expect(saves[0]?.sections).toEqual([
      {
        sectionId: PERSON,
        document: {
          ...heldBy(host, PERSON),
          color: 'node-color-seq-3',
          icon: 'add-a-treatment',
        },
      },
    ]);
    expect(saves[0]?.staged).toBe(staged);
  });

  it('leaves out a section the edit leaves as the host already holds it', async () => {
    const host = newHost();
    const base = heldBy(host, PERSON);
    // Someone has already made this very change.
    host.store.applyAsCollaborator(PERSON, {
      ...base,
      color: 'node-color-seq-3',
    });
    const { saves, write } = recordingWrite();

    await withStagedCodebook(
      host.adapter,
      host.protocolId,
      { [PERSON]: editOf(base, { color: 'node-color-seq-3' }) },
      write,
    );

    expect(saves[0]?.sections).toEqual([]);
  });

  it('sends a section the edit created as the edit left it when the host has none', async () => {
    const host = newHost();
    const created: SectionDoc = {
      name: 'Place',
      color: 'node-color-seq-1',
      icon: 'add-a-person',
    };
    const { saves, write } = recordingWrite();

    await withStagedCodebook(
      host.adapter,
      host.protocolId,
      { [PLACE]: { base: null, edited: created } },
      write,
    );

    expect(saves[0]?.sections).toEqual([
      { sectionId: PLACE, document: created },
    ]);
  });

  it('drops the edits to a section a collaborator deleted, and writes the rest', async () => {
    const host = newHost();
    const family = heldBy(host, FAMILY);
    const person = heldBy(host, PERSON);
    host.store.applyAsCollaborator(FAMILY, undefined);
    const { saves, write } = recordingWrite();

    const outcome = await withStagedCodebook(
      host.adapter,
      host.protocolId,
      {
        [FAMILY]: editOf(family, { color: 'node-color-seq-3' }),
        [PERSON]: editOf(person, { color: 'node-color-seq-4' }),
      },
      write,
    );

    // The deleted type takes the edits made to it with it; the save goes ahead
    // without it, as the write that was refused for the missing section did.
    expect(outcome).toBe('written');
    expect(saves[0]?.sections.map((section) => section.sectionId)).toEqual([
      PERSON,
    ]);
    expect(await isFreeFor(host, PERSON)).toBe(true);
  });

  it('names the collaborator holding a section, writes nothing, and gives back what it took', async () => {
    const host = newHost();
    const collaborator = host.asCollaborator(ANA);
    await collaborator.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: FAMILY,
    });
    const { saves, write } = recordingWrite();

    const outcome = await withStagedCodebook(
      host.adapter,
      host.protocolId,
      {
        // Taken first, so the refusal has a lock to give back.
        [PERSON]: editOf(heldBy(host, PERSON), { color: 'node-color-seq-3' }),
        [FAMILY]: editOf(heldBy(host, FAMILY), { color: 'node-color-seq-4' }),
      },
      write,
    );

    expect(outcome).toEqual({
      status: 'refused',
      refusal: { kind: 'held', holders: ['Ana'] },
    });
    expect(saves).toEqual([]);
    expect(await isFreeFor(host, PERSON)).toBe(true);
  });

  it('gives back a lock whose acquire was never answered', async () => {
    const host = newHost();
    // The host grants the lock, then the socket drops before the answer.
    const adapter = host.adapterWith({
      AcquireLock: (input) =>
        Effect.flatMap(host.handle.AcquireLock(input), () =>
          Effect.die(new Error('the socket dropped')),
        ),
    });
    const { saves, write } = recordingWrite();

    const outcome = await withStagedCodebook(
      adapter,
      host.protocolId,
      {
        [PERSON]: editOf(heldBy(host, PERSON), { color: 'node-color-seq-3' }),
      },
      write,
    );

    expect(outcome).toEqual({
      status: 'refused',
      refusal: { kind: 'unreachable' },
    });
    expect(saves).toEqual([]);
    expect(await isFreeFor(host, PERSON)).toBe(true);
  });

  it('gives every lock back when the write throws, and lets the error through', async () => {
    const host = newHost();

    await expect(
      withStagedCodebook(
        host.adapter,
        host.protocolId,
        {
          [PERSON]: editOf(heldBy(host, PERSON), {
            color: 'node-color-seq-3',
          }),
          [FAMILY]: editOf(heldBy(host, FAMILY), {
            color: 'node-color-seq-4',
          }),
        },
        () => Promise.reject(new Error('the save failed')),
      ),
    ).rejects.toThrow('the save failed');

    expect(await isFreeFor(host, PERSON)).toBe(true);
    expect(await isFreeFor(host, FAMILY)).toBe(true);
  });

  it('holds the sections for the length of the write', async () => {
    const host = newHost();
    let freeDuringWrite: boolean | undefined;

    await withStagedCodebook(
      host.adapter,
      host.protocolId,
      {
        [PERSON]: editOf(heldBy(host, PERSON), { color: 'node-color-seq-3' }),
      },
      async () => {
        freeDuringWrite = await isFreeFor(host, PERSON);
      },
    );

    expect(freeDuringWrite).toBe(false);
    expect(await isFreeFor(host, PERSON)).toBe(true);
  });

  it('says the protocol is gone when the host does not know it', async () => {
    const host = newHost();
    const { saves, write } = recordingWrite();

    const outcome = await withStagedCodebook(
      host.adapter,
      'a-protocol-the-host-does-not-have',
      {
        [PERSON]: editOf(heldBy(host, PERSON), { color: 'node-color-seq-3' }),
      },
      write,
    );

    expect(outcome).toEqual({
      status: 'refused',
      refusal: { kind: 'protocolGone' },
    });
    expect(saves).toEqual([]);
  });
});

describe('readSavedCodebook', () => {
  const getKey = (host: InMemoryHost, id: typeof PERSON) =>
    host.adapter.rpcKey('GetSection', {
      protocolId: host.protocolId,
      sectionId: id,
    });
  const cached = (
    queryClient: QueryClient,
    host: InMemoryHost,
    id: typeof PERSON,
  ) => {
    const entry = queryClient.getQueryData<{
      document: Redacted.Redacted<SectionDoc>;
      revision: Revision;
    }>(getKey(host, id));
    return entry === undefined
      ? undefined
      : { document: Redacted.value(entry.document), revision: entry.revision };
  };
  const savedOf = (...ids: (typeof PERSON)[]): CodebookSave => ({
    sections: ids.map((id) => ({ sectionId: id, document: {} })),
    staged: {},
  });

  it('reads the sections the save wrote back from the host, over what the cache held before it', async () => {
    const host = newHost();
    const queryClient = new QueryClient();
    // What the editor read before the save, at the revision it was read at.
    const before = host.store.read(PERSON);
    queryClient.setQueryData(getKey(host, PERSON), {
      document: Redacted.make(before.document),
      revision: before.revision,
    });
    // The save, as the host stored it.
    host.store.applyAsCollaborator(PERSON, {
      ...before.document,
      icon: 'add-a-treatment',
    });

    await readSavedCodebook(
      queryClient,
      host.adapter,
      host.protocolId,
      savedOf(PERSON),
    );

    expect(cached(queryClient, host, PERSON)).toEqual(host.store.read(PERSON));
  });

  it('lists a section the save created, so the types it enumerates include it', async () => {
    const host = newHost();
    const queryClient = new QueryClient();
    const listKey = host.adapter.rpcKey('ListSections', {
      protocolId: host.protocolId,
    });
    queryClient.setQueryData(listKey, { sectionIds: [PERSON] });
    host.store.applyAsCollaborator(PLACE, { name: 'Place', variables: {} });

    await readSavedCodebook(
      queryClient,
      host.adapter,
      host.protocolId,
      savedOf(PERSON, PLACE),
    );

    expect(queryClient.getQueryData(listKey)).toEqual({
      sectionIds: [PERSON, PLACE],
    });
    expect(cached(queryClient, host, PLACE)).toEqual(host.store.read(PLACE));
  });

  it('reads nothing for a save without a codebook', async () => {
    const host = newHost();
    const queryClient = new QueryClient();

    await readSavedCodebook(
      queryClient,
      host.adapter,
      host.protocolId,
      undefined,
    );

    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });
});
