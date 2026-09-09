import { safe } from '@orpc/client';
import { describe, expect, it } from 'vitest';

import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  createInMemoryHost,
  type InMemoryHost,
} from '../createInMemoryHost.ts';
import { sectionsFromProtocol } from '../sectionsFromProtocol.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;

const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });
const STAGE_ORDER = sectionId({ kind: 'stageOrder' });

const COLLABORATOR = {
  sessionId: 'session-2',
  userId: 'user-2',
  displayName: 'Grace',
};

function host(): InMemoryHost {
  let minted = 0;
  return createInMemoryHost({
    sections: sectionsFromProtocol(FIXTURE),
    nextId: () => `minted-${++minted}`,
  });
}

function stageOrder(subject: InMemoryHost): string[] {
  const order = subject.store.read(STAGE_ORDER).document.stages;
  if (!Array.isArray(order)) throw new Error('stage order is not a list');
  return order.filter((entry): entry is string => typeof entry === 'string');
}

describe('the in-memory host', () => {
  it('seeds every stage of the fixture as its own section', () => {
    const subject = host();
    const stages = stageOrder(subject);
    expect(stages.length).toBeGreaterThan(0);
    for (const stage of stages) {
      expect(
        subject.store.has(sectionId({ kind: 'stage', stageId: stage })),
      ).toBe(true);
    }
  });

  it('refuses a submit from a caller that never took the lock', async () => {
    const subject = host();
    const before = subject.store.read(INFORMATION);
    const { definedError, isSuccess } = await safe(
      subject.client.submit({
        protocolId: subject.protocolId,
        sectionId: INFORMATION,
        document: { ...before.document, label: 'Renamed by a non-holder' },
        revision: before.revision,
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('NOT_LOCK_HOLDER');
    expect(subject.store.read(INFORMATION).document.label).toBe(
      before.document.label,
    );
  });

  it('refuses a submit while a collaborator holds the lock, and names them', async () => {
    const subject = host();
    const collaborator = subject.asCollaborator(COLLABORATOR);
    await collaborator.acquireLock({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });

    const readOnly = await subject.client.acquireLock({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });
    expect(readOnly.lock).toBe('readOnly');
    expect(readOnly.lock === 'readOnly' && readOnly.holder.displayName).toBe(
      'Grace',
    );

    const { definedError, isSuccess } = await safe(
      subject.client.submit({
        protocolId: subject.protocolId,
        sectionId: INFORMATION,
        document: { ...readOnly.document, label: 'Renamed by a spectator' },
        revision: readOnly.revision,
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('NOT_LOCK_HOLDER');
    expect(definedError?.data).toMatchObject({
      sectionId: INFORMATION,
      holder: { displayName: 'Grace' },
    });
    expect(subject.store.read(INFORMATION).document.label).not.toBe(
      'Renamed by a spectator',
    );
  });

  it('writes the whole section for the lock holder', async () => {
    const subject = host();
    const held = await subject.client.acquireLock({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });
    const { revision } = await subject.client.submit({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Renamed by the holder' },
      revision: held.revision,
    });

    expect(revision.sequence).toBeGreaterThan(held.revision.sequence);
    expect(subject.store.read(INFORMATION).document.label).toBe(
      'Renamed by the holder',
    );
  });

  it('refuses a submit whose document is not shaped like the section', async () => {
    const subject = host();
    await subject.client.acquireLock({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });
    const { definedError, isSuccess } = await safe(
      subject.client.submit({
        protocolId: subject.protocolId,
        sectionId: INFORMATION,
        document: { id: 'information-1', type: 'NotAnInterface' },
        revision: subject.store.read(INFORMATION).revision,
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('INVALID_SHAPE');
  });

  it('registers a created stage in the stage order in the same revision', async () => {
    const subject = host();
    const template = subject.store.read(INFORMATION).document;
    const { id: _id, ...withoutId } = template;
    const before = stageOrder(subject);

    const created = await subject.client.create({
      protocolId: subject.protocolId,
      kind: 'stage',
      document: withoutId,
      position: 1,
    });

    const stageIdOfCreated = sectionId({
      kind: 'stage',
      stageId: 'minted-1',
    });
    expect(created.sectionId).toBe(stageIdOfCreated);
    expect(subject.store.has(stageIdOfCreated)).toBe(true);
    expect(subject.store.read(stageIdOfCreated).document.id).toBe('minted-1');

    const after = stageOrder(subject);
    expect(after).toHaveLength(before.length + 1);
    expect(after[1]).toBe('minted-1');
    // Both writes carry the protocol revision the create advanced to, which is
    // what "atomic" means for a watcher reading the stream in order.
    expect(subject.store.read(STAGE_ORDER).revision.sequence).toBe(
      created.revision.sequence,
    );
  });

  it('refuses to create a section whose document is not shaped like one', async () => {
    const subject = host();
    const { definedError, isSuccess } = await safe(
      subject.client.create({
        protocolId: subject.protocolId,
        kind: 'stage',
        document: { type: 'NotAnInterface' },
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('INVALID_SHAPE');
    expect(stageOrder(host())).toEqual(stageOrder(subject));
  });

  it('takes every section a refactor writes, or names who holds one', async () => {
    const subject = host();
    const collaborator = subject.asCollaborator(COLLABORATOR);
    const person = sectionId({ kind: 'codebookNode', typeId: 'person' });
    await collaborator.acquireLock({
      protocolId: subject.protocolId,
      sectionId: person,
    });

    const { definedError, isSuccess } = await safe(
      subject.client.refactor.deleteVariable({
        protocolId: subject.protocolId,
        subject: { entity: 'node', type: 'person' },
        variableId: 'name',
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('SECTIONS_LOCKED');
    expect(definedError?.data).toMatchObject({
      blocked: [{ sectionId: person, holder: { displayName: 'Grace' } }],
    });

    await collaborator.releaseLock({
      protocolId: subject.protocolId,
      sectionId: person,
    });
    const applied = await subject.client.refactor.deleteVariable({
      protocolId: subject.protocolId,
      subject: { entity: 'node', type: 'person' },
      variableId: 'name',
    });
    expect(applied.changedSections).toContain(person);
    const variables = subject.store.read(person).document.variables;
    expect(
      typeof variables === 'object' &&
        variables !== null &&
        Object.hasOwn(variables, 'name'),
    ).toBe(false);
  });
});
