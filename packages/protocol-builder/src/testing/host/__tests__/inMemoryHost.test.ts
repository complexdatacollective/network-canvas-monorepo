import { getEventMeta, safe } from '@orpc/client';
import { describe, expect, it } from 'vitest';

import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  createInMemoryHost,
  type InMemoryHost,
} from '../createInMemoryHost.ts';
import { sectionsFromProtocol } from '../sectionsFromProtocol.ts';
import { committedSource } from './committedSource.ts';

/** The edit these calls are made from: one editor, open throughout. */
const EDIT = 'edit-1';

/** A fresh idempotency key: every write below is its own intent. */
let writes = 0;
const nextRequestId = (): string => `write-${++writes}`;

const FIXTURE: Record<string, unknown> = allInterfaces;

const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });
const STAGE_ORDER = sectionId({ kind: 'stageOrder' });
const PERSON = sectionId({ kind: 'codebookNode', typeId: 'person' });
const ALTER_FORM = sectionId({ kind: 'stage', stageId: 'alter-form-1' });
const QUICK_ADD = sectionId({
  kind: 'stage',
  stageId: 'name-generator-quick-add-1',
});
const NAME_GENERATOR = sectionId({
  kind: 'stage',
  stageId: 'name-generator-1',
});

const EGO = sectionId({ kind: 'codebookEgo' });

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

/** The lock, then the whole section back with whatever the edit promotes. */
async function submitHeld(
  subject: InMemoryHost,
  section: ReturnType<typeof sectionId>,
  promote?: Readonly<{
    editId: string;
    resourceIds: string[];
    secretHandles?: string[];
  }>,
  requestId = nextRequestId(),
) {
  const held = await subject.client.acquireLock({
    protocolId: subject.protocolId,
    sectionId: section,
  });
  return subject.client.submit({
    protocolId: subject.protocolId,
    requestId,
    sectionId: section,
    document: held.document,
    revision: held.revision,
    ...(promote === undefined ? {} : { promote }),
  });
}

/**
 * The cursors of the protocol's first `count` events, read from a watch that
 * is then closed. Two writes under one lock produce four: the lock, the
 * presence that follows it, and a revision each.
 */
async function watchCursors(
  subject: InMemoryHost,
  count: number,
): Promise<string[]> {
  const held = await subject.client.acquireLock({
    protocolId: subject.protocolId,
    sectionId: INFORMATION,
  });
  for (const label of ['one', 'two']) {
    await subject.client.submit({
      protocolId: subject.protocolId,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: { ...held.document, label },
      revision: held.revision,
    });
  }
  const events = await subject.client.watchProtocol({
    protocolId: subject.protocolId,
  });
  const cursors: string[] = [];
  for await (const event of events) {
    cursors.push(String(getEventMeta(event)?.id));
    if (cursors.length === count) break;
  }
  await events.return?.(undefined);
  return cursors;
}

const PORTRAIT_BYTES = () =>
  new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

/** A second edit, open beside the first in the same session. */
const OTHER_EDIT = 'edit-2';

/** A file imported as `portrait.png` by one edit, whatever is inside it. */
async function stagePortraitBytes(
  subject: InMemoryHost,
  editId: string,
  requestId: string,
  bytes: Blob,
): Promise<string> {
  const staged = await subject.client.resources.stage({
    protocolId: subject.protocolId,
    editId,
    requestId,
    request: {
      kind: 'content',
      contentKind: 'image',
      name: 'Portrait',
      source: 'portrait.png',
      contentType: 'image/png',
      bytes,
    },
  });
  if (staged.status !== 'ok') throw new Error(staged.failure.message);
  return staged.data.descriptor.id;
}

/** The bytes this host hands back for a committed resource. */
async function committedBytes(
  subject: InMemoryHost,
  resourceId: string,
): Promise<string> {
  const preview = await subject.client.resources.preview({
    protocolId: subject.protocolId,
    resourceId,
  });
  if (preview.status !== 'ok') throw new Error(preview.failure.message);
  return preview.data.url;
}

async function dataUrl(bytes: Blob): Promise<string> {
  const encoded = Buffer.from(await bytes.arrayBuffer()).toString('base64');
  return `data:image/png;base64,${encoded}`;
}

function manifestSource(subject: InMemoryHost, resourceId: string): unknown {
  const entry = subject.store.read(sectionId({ kind: 'assets' })).document[
    resourceId
  ];
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`no manifest entry for ${resourceId}`);
  }
  return (entry as Record<string, unknown>).source;
}

/** A staged image, as an edit that imported a file holds one. */
async function stagePortrait(subject: InMemoryHost): Promise<string> {
  const staged = await subject.client.resources.stage({
    protocolId: subject.protocolId,
    editId: EDIT,
    requestId: 'request-1',
    request: {
      kind: 'content',
      contentKind: 'image',
      name: 'Portrait',
      source: 'portrait.png',
      contentType: 'image/png',
      bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    },
  });
  if (staged.status !== 'ok') throw new Error(staged.failure.message);
  return staged.data.descriptor.id;
}

/** An Information stage, without an id, whose body is that resource. */
function informationNaming(
  subject: InMemoryHost,
  resourceId: string,
): SectionDoc {
  const { id: _id, ...template } = subject.store.read(INFORMATION).document;
  return {
    ...template,
    items: [{ id: 'item-1', type: 'asset', content: resourceId }],
  };
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
        requestId: nextRequestId(),
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
        requestId: nextRequestId(),
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
      requestId: nextRequestId(),
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
        requestId: nextRequestId(),
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
      requestId: nextRequestId(),
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

  /**
   * The gap `submit` cannot close: a stage being ADDED can carry a file the
   * researcher imported while composing it, and there is no earlier revision
   * of that stage to promote it with.
   */
  it("promotes what a created stage names, in the created stage's own revision", async () => {
    const subject = host();
    const staged = await stagePortrait(subject);

    const created = await subject.client.create({
      protocolId: subject.protocolId,
      requestId: nextRequestId(),
      kind: 'stage',
      document: informationNaming(subject, staged),
      promote: { editId: EDIT, resourceIds: [staged] },
    });

    expect(created.promoted).toEqual([
      expect.objectContaining({ id: staged, status: 'committed' }),
    ]);
    const assets = subject.store.read(sectionId({ kind: 'assets' }));
    expect(assets.document[staged]).toMatchObject({
      name: 'Portrait',
      type: 'image',
      source: await committedSource(PORTRAIT_BYTES(), 'portrait.png'),
    });
    // The section, the pointer that holds it and the manifest are one
    // revision, which is what a watcher reading the stream in order sees.
    expect(assets.revision.sequence).toBe(created.revision.sequence);
    expect(subject.store.read(created.sectionId).revision.sequence).toBe(
      created.revision.sequence,
    );
    expect(subject.store.read(STAGE_ORDER).revision.sequence).toBe(
      created.revision.sequence,
    );
  });

  it('creates neither the stage nor its pointer when a promotion fails', async () => {
    const subject = host();
    const before = stageOrder(subject);
    const assetsBefore = subject.store.read(sectionId({ kind: 'assets' }));

    const { definedError, isSuccess } = await safe(
      subject.client.create({
        protocolId: subject.protocolId,
        requestId: nextRequestId(),
        kind: 'stage',
        document: informationNaming(subject, 'never-staged'),
        promote: { editId: EDIT, resourceIds: ['never-staged'] },
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('PROMOTION_FAILED');
    // No section id: the host mints one only for a create it is going to make.
    expect(definedError?.data).toEqual({
      failure: {
        reason: 'not-found',
        message: 'no such staged resource',
        retryable: false,
        resourceId: 'never-staged',
      },
    });
    expect(stageOrder(subject)).toEqual(before);
    expect(subject.store.read(sectionId({ kind: 'assets' }))).toEqual(
      assetsBefore,
    );
    expect(
      subject.store.has(sectionId({ kind: 'stage', stageId: 'minted-1' })),
    ).toBe(false);
  });

  it('answers a repeated create with the stage it already made', async () => {
    const subject = host();
    const staged = await stagePortrait(subject);
    const create = () =>
      subject.client.create({
        protocolId: subject.protocolId,
        // The same request id: one intent, asked again because its answer was
        // lost.
        requestId: 'write-again',
        kind: 'stage',
        document: informationNaming(subject, staged),
        promote: { editId: EDIT, resourceIds: [staged] },
      });

    const first = await create();
    const order = stageOrder(subject);
    const again = await create();

    // The answer to the first can be lost. Minting a second stage for the
    // retry would leave the protocol with two copies of it and the researcher
    // never told about the first.
    expect(again.sectionId).toBe(first.sectionId);
    expect(again.revision).toEqual(first.revision);
    expect(again.promoted).toEqual(first.promoted);
    expect(stageOrder(subject)).toEqual(order);
  });

  it('refuses to create a section whose document is not shaped like one', async () => {
    const subject = host();
    const { definedError, isSuccess } = await safe(
      subject.client.create({
        protocolId: subject.protocolId,
        requestId: nextRequestId(),
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
    await collaborator.acquireLock({
      protocolId: subject.protocolId,
      sectionId: PERSON,
    });

    const { definedError, isSuccess } = await safe(
      subject.client.refactor.deleteVariable({
        protocolId: subject.protocolId,
        subject: { entity: 'node', type: 'person' },
        variableId: 'relationship_to_ego',
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('SECTIONS_LOCKED');
    expect(definedError?.data).toMatchObject({
      blocked: [{ sectionId: PERSON, holder: { displayName: 'Grace' } }],
    });

    await collaborator.releaseLock({
      protocolId: subject.protocolId,
      sectionId: PERSON,
    });
    const applied = await subject.client.refactor.deleteVariable({
      protocolId: subject.protocolId,
      subject: { entity: 'node', type: 'person' },
      variableId: 'relationship_to_ego',
    });
    expect(applied.changedSections).toContain(PERSON);
    const variables = subject.store.read(PERSON).document.variables;
    expect(
      typeof variables === 'object' &&
        variables !== null &&
        Object.hasOwn(variables, 'relationship_to_ego'),
    ).toBe(false);
  });

  it('strips a reference the schema declares outside a prompt', async () => {
    const subject = host();
    const before = fieldVariables(subject.store.read(ALTER_FORM).document);
    expect(before).toContain('relationship_to_ego');

    const applied = await subject.client.refactor.deleteVariable({
      protocolId: subject.protocolId,
      subject: { entity: 'node', type: 'person' },
      variableId: 'relationship_to_ego',
    });

    // The only reference to it in the fixture is a form field on the alter
    // form, which nothing reading `prompts[].variable` would ever reach.
    expect(applied.changedSections).toContain(ALTER_FORM);
    expect(
      fieldVariables(subject.store.read(ALTER_FORM).document),
    ).not.toContain('relationship_to_ego');
    expect(fieldVariables(subject.store.read(ALTER_FORM).document)).toContain(
      'flagged',
    );
  });

  it('refuses a deletion whose references it cannot remove, and names them', async () => {
    const subject = host();
    const { definedError, isSuccess } = await safe(
      subject.client.refactor.deleteVariable({
        protocolId: subject.protocolId,
        subject: { entity: 'node', type: 'person' },
        variableId: 'name',
      }),
    );

    // `name` is the quick-add stage's whole reason to exist, and the name
    // generator's only form field: neither reference is a list entry the host
    // can drop and leave a stage the researcher would recognise, so it says
    // so rather than leaving them naming a variable that is gone.
    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('REFERENCES_REMAIN');
    expect(definedError?.data).toMatchObject({
      remaining: expect.arrayContaining([
        { sectionId: QUICK_ADD, path: ['quickAdd'] },
        { sectionId: NAME_GENERATOR, path: ['form', 'fields', 0, 'variable'] },
      ]),
    });
    const variables = subject.store.read(PERSON).document.variables;
    expect(
      typeof variables === 'object' &&
        variables !== null &&
        Object.hasOwn(variables, 'name'),
    ).toBe(true);
  });

  it('refuses to delete an entity type the stages are still about', async () => {
    const subject = host();
    const { definedError, isSuccess } = await safe(
      subject.client.refactor.deleteEntityType({
        protocolId: subject.protocolId,
        entity: 'node',
        typeId: 'person',
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('REFERENCES_REMAIN');
    expect(definedError?.data).toMatchObject({
      remaining: expect.arrayContaining([
        { sectionId: QUICK_ADD, path: ['subject', 'type'] },
      ]),
    });
    expect(subject.store.has(PERSON)).toBe(true);
  });

  it('deletes an entity type nothing refers to', async () => {
    const spare = sectionId({ kind: 'codebookNode', typeId: 'spare' });
    const subject = createInMemoryHost({
      sections: {
        ...sectionsFromProtocol(FIXTURE),
        [spare]: {
          name: 'Spare',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {},
        },
      },
    });

    const applied = await subject.client.refactor.deleteEntityType({
      protocolId: subject.protocolId,
      entity: 'node',
      typeId: 'spare',
    });

    expect(applied.changedSections).toEqual([spare]);
    expect(subject.store.has(spare)).toBe(false);
  });

  it('hands out a copy of a section document, not the one it stores', async () => {
    const subject = host();
    const read = await subject.client.getSection({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });
    const items = read.document.items;
    if (!Array.isArray(items)) throw new Error('the fixture has no items');

    items.push({ id: 'smuggled', type: 'text', content: 'not submitted' });

    const again = subject.store.read(INFORMATION).document.items;
    expect(Array.isArray(again) && again).toHaveLength(items.length - 1);
  });

  it('refuses every resource call that names another protocol', async () => {
    const subject = host();
    const elsewhere = 'protocol-2';
    const refusals = [
      (await safe(subject.client.resources.list({ protocolId: elsewhere })))
        .definedError?.code,
      (
        await safe(
          subject.client.resources.stage({
            protocolId: elsewhere,
            editId: EDIT,
            requestId: 'request-1',
            request: {
              kind: 'content',
              contentKind: 'image',
              name: 'Portrait',
              source: 'portrait.png',
              contentType: 'image/png',
              bytes: new Blob([new Uint8Array([1, 2, 3])], {
                type: 'image/png',
              }),
            },
          }),
        )
      ).definedError?.code,
      (
        await safe(
          subject.client.submit({
            protocolId: elsewhere,
            requestId: nextRequestId(),
            sectionId: INFORMATION,
            document: subject.store.read(INFORMATION).document,
            revision: subject.store.read(INFORMATION).revision,
            promote: { editId: EDIT, resourceIds: [] },
          }),
        )
      ).definedError?.code,
      (
        await safe(
          subject.client.resources.discard({
            protocolId: elsewhere,
            editId: EDIT,
          }),
        )
      ).definedError?.code,
      (
        await safe(
          subject.client.resources.inspect({
            protocolId: elsewhere,
            editId: EDIT,
            resourceId: 'whatever',
          }),
        )
      ).definedError?.code,
      (
        await safe(
          subject.client.resources.preview({
            protocolId: elsewhere,
            editId: EDIT,
            resourceId: 'whatever',
          }),
        )
      ).definedError?.code,
    ];

    // A resource procedure that answered one of these would be reading, and
    // `promote` writing, another protocol's assets through this host.
    expect(refusals).toEqual(Array.from(refusals, () => 'PROTOCOL_NOT_FOUND'));
    expect(
      subject.store.read(sectionId({ kind: 'assets' })).revision.sequence,
    ).toBe(0n);
  });

  it('promotes a staged secret only for the handle staging answered with', async () => {
    const subject = host();
    const staged = await subject.client.resources.stage({
      protocolId: subject.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: { kind: 'secret', name: 'Mapbox token', value: 'pk.secret' },
    });
    if (staged.status !== 'ok') throw new Error('staging a secret failed');
    const resourceId = staged.data.descriptor.id;

    const held = await subject.client.acquireLock({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });
    const withoutHandle = await safe(
      subject.client.submit({
        protocolId: subject.protocolId,
        requestId: nextRequestId(),
        sectionId: INFORMATION,
        document: held.document,
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [resourceId] },
      }),
    );

    expect(withoutHandle.definedError?.code).toBe('PROMOTION_FAILED');
    expect(
      subject.store.read(sectionId({ kind: 'assets' })).document[resourceId],
    ).toBeUndefined();

    const withHandle = await submitHeld(subject, INFORMATION, {
      editId: EDIT,
      resourceIds: [resourceId],
      ...(staged.data.handle === undefined
        ? {}
        : { secretHandles: [staged.data.handle] }),
    });

    expect(withHandle.promoted).toHaveLength(1);
    expect(
      subject.store.read(sectionId({ kind: 'assets' })).document[resourceId],
    ).toMatchObject({ type: 'apikey', value: 'pk.secret' });
  });

  it('answers a repeated promotion with the one it committed', async () => {
    const subject = host();
    const staged = await subject.client.resources.stage({
      protocolId: subject.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'Portrait',
        source: 'portrait.png',
        contentType: 'image/png',
        bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');

    const promote = () =>
      submitHeld(
        subject,
        INFORMATION,
        { editId: EDIT, resourceIds: [staged.data.descriptor.id] },
        // The same request id: one save, asked again because its answer was
        // lost.
        'write-again',
      );
    const first = await promote();
    const committed = subject.store.read(sectionId({ kind: 'assets' }));
    const again = await promote();

    // The answer to the first can be lost; the retry carries the same id, and
    // what it is told is what was committed rather than a refusal it cannot
    // act on — and the manifest is not written a second time.
    expect(first.promoted).toEqual(again.promoted);
    expect(subject.store.read(sectionId({ kind: 'assets' }))).toEqual(
      committed,
    );
    expect(committed.document[staged.data.descriptor.id]).toMatchObject({
      name: 'Portrait',
      source: await committedSource(PORTRAIT_BYTES(), 'portrait.png'),
    });
  });

  it('writes neither the section nor the manifest when a promotion fails', async () => {
    const subject = host();
    const before = subject.store.read(INFORMATION);
    const assetsBefore = subject.store.read(sectionId({ kind: 'assets' }));

    const held = await subject.client.acquireLock({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });
    const { definedError, isSuccess } = await safe(
      subject.client.submit({
        protocolId: subject.protocolId,
        requestId: nextRequestId(),
        sectionId: INFORMATION,
        document: { ...held.document, label: 'Renamed beside a bad promotion' },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: ['never-staged'] },
      }),
    );

    // The section and the bytes it names are one revision or nothing: a
    // committed rename pointing at a resource this host does not hold is the
    // half-written state the two-call shape used to allow.
    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('PROMOTION_FAILED');
    expect(definedError?.data).toMatchObject({
      sectionId: INFORMATION,
      failure: { reason: 'not-found', resourceId: 'never-staged' },
    });
    expect(subject.store.read(INFORMATION)).toEqual(before);
    expect(subject.store.read(sectionId({ kind: 'assets' }))).toEqual(
      assetsBefore,
    );
  });

  it("promotes the bytes in the submitting section's own revision", async () => {
    const subject = host();
    const staged = await subject.client.resources.stage({
      protocolId: subject.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'Portrait',
        source: 'portrait.png',
        contentType: 'image/png',
        bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');

    const written = await submitHeld(subject, INFORMATION, {
      editId: EDIT,
      resourceIds: [staged.data.descriptor.id],
    });

    // One sequence across both sections is what "atomic" means to a watcher
    // reading the stream in order.
    expect(
      subject.store.read(sectionId({ kind: 'assets' })).revision.sequence,
    ).toBe(written.revision.sequence);
    expect(subject.store.read(INFORMATION).revision.sequence).toBe(
      written.revision.sequence,
    );
  });

  it('keeps two imports of one filename as two assets', async () => {
    const subject = host();
    const mine = PORTRAIT_BYTES();
    const theirs = new Blob([new Uint8Array([4, 5, 6, 7])], {
      type: 'image/png',
    });

    const first = await stagePortraitBytes(subject, EDIT, 'request-1', mine);
    await submitHeld(subject, INFORMATION, {
      editId: EDIT,
      resourceIds: [first],
    });
    const second = await stagePortraitBytes(
      subject,
      OTHER_EDIT,
      'request-2',
      theirs,
    );
    await subject.client.create({
      protocolId: subject.protocolId,
      requestId: nextRequestId(),
      kind: 'stage',
      document: informationNaming(subject, second),
      promote: { editId: OTHER_EDIT, resourceIds: [second] },
    });

    // Committed bytes are named by their content. Keyed by the filename the
    // researcher picked, the second import would have taken the first one's
    // place and every stage already naming it would show the new picture.
    expect(manifestSource(subject, first)).not.toEqual(
      manifestSource(subject, second),
    );
    expect(await committedBytes(subject, first)).toBe(await dataUrl(mine));
    expect(await committedBytes(subject, second)).toBe(await dataUrl(theirs));
  });

  it('removes a stage and its place in the stage order in one revision', async () => {
    const subject = host();
    const before = stageOrder(subject);

    const deleted = await subject.client.delete({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });

    expect(subject.store.has(INFORMATION)).toBe(false);
    expect(stageOrder(subject)).toHaveLength(before.length - 1);
    expect(stageOrder(subject)).not.toContain('information-1');
    expect(deleted.changedSections).toEqual([INFORMATION, STAGE_ORDER]);
    expect(subject.store.read(STAGE_ORDER).revision.sequence).toBe(
      deleted.revision.sequence,
    );
    // A pointer left behind, or a section left out of the order, is a protocol
    // `assembleProtocolSections` refuses to put back together at all.
    expect(() => assembleProtocolSections(sectionsOf(subject))).not.toThrow();
  });

  it('refuses to delete a stage an editor holds, and names them', async () => {
    const subject = host();
    await subject.asCollaborator(COLLABORATOR).acquireLock({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });

    const { definedError, isSuccess } = await safe(
      subject.client.delete({
        protocolId: subject.protocolId,
        sectionId: INFORMATION,
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('SECTIONS_LOCKED');
    expect(definedError?.data).toMatchObject({
      blocked: [{ sectionId: INFORMATION, holder: { displayName: 'Grace' } }],
    });
    expect(subject.store.has(INFORMATION)).toBe(true);
    expect(stageOrder(subject)).toContain('information-1');
  });

  it('refuses to delete a stage while the stage order is held', async () => {
    const subject = host();
    await subject.asCollaborator(COLLABORATOR).acquireLock({
      protocolId: subject.protocolId,
      sectionId: STAGE_ORDER,
    });

    const { definedError, isSuccess } = await safe(
      subject.client.delete({
        protocolId: subject.protocolId,
        sectionId: INFORMATION,
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('SECTIONS_LOCKED');
    expect(definedError?.data).toMatchObject({
      blocked: [{ sectionId: STAGE_ORDER, holder: { displayName: 'Grace' } }],
    });
    expect(subject.store.has(INFORMATION)).toBe(true);
  });

  it('creates the ego codebook a protocol does not have yet', async () => {
    const subject = withoutEgo();
    expect(subject.store.has(EGO)).toBe(false);

    const created = await subject.client.create({
      protocolId: subject.protocolId,
      requestId: nextRequestId(),
      kind: 'codebookEgo',
      document: {
        variables: {
          ego_age: { name: 'ego_age', type: 'number', component: 'Number' },
        },
      },
    });

    // Adding the first ego attribute is what creates the section, and there is
    // no other way to bring one into being.
    expect(created.sectionId).toBe(EGO);
    expect(subject.store.has(EGO)).toBe(true);
    expect(
      assembleProtocolSections(sectionsOf(subject)).codebook,
    ).toMatchObject({ ego: { variables: { ego_age: { name: 'ego_age' } } } });
  });

  it('refuses to create an ego codebook the protocol already has', async () => {
    const subject = host();
    const before = subject.store.read(EGO);

    const { definedError, isSuccess } = await safe(
      subject.client.create({
        protocolId: subject.protocolId,
        requestId: nextRequestId(),
        kind: 'codebookEgo',
        document: { variables: {} },
      }),
    );

    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('SECTION_EXISTS');
    expect(definedError?.data).toMatchObject({ sectionId: EGO });
    expect(subject.store.read(EGO)).toEqual(before);
  });

  it('refuses a refactor that would rewrite a section this session is editing', async () => {
    const subject = host();
    // One tab, two editors: the stage editor and the codebook dialog issuing
    // the deletion are the same session, so the session is not what tells them
    // apart.
    await subject.client.acquireLock({
      protocolId: subject.protocolId,
      sectionId: ALTER_FORM,
    });
    const before = fieldVariables(subject.store.read(ALTER_FORM).document);

    const { definedError, isSuccess } = await safe(
      subject.client.refactor.deleteVariable({
        protocolId: subject.protocolId,
        subject: { entity: 'node', type: 'person' },
        variableId: 'relationship_to_ego',
      }),
    );

    // The stage's draft lives in its form, not in the cache, so a sweep under
    // it is undone by that editor's next whole-section submit — which would
    // leave the protocol naming a variable that no longer exists.
    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('SECTIONS_LOCKED');
    expect(definedError?.data).toMatchObject({
      blocked: [{ sectionId: ALTER_FORM, holder: { displayName: 'Ada' } }],
    });
    expect(fieldVariables(subject.store.read(ALTER_FORM).document)).toEqual(
      before,
    );
    expect(personVariables(subject)).toContain('relationship_to_ego');
  });

  it('makes the change under the lock the caller holds on the codebook section', async () => {
    const subject = host();
    await subject.client.acquireLock({
      protocolId: subject.protocolId,
      sectionId: PERSON,
    });

    const applied = await subject.client.refactor.deleteVariable({
      protocolId: subject.protocolId,
      subject: { entity: 'node', type: 'person' },
      variableId: 'relationship_to_ego',
    });

    // The dialog holding the section it is deleting from is the one lock a
    // refactor writes through rather than refusing.
    expect(applied.changedSections).toContain(PERSON);
    expect(personVariables(subject)).not.toContain('relationship_to_ego');
  });

  it('keeps a lock when the stream that reported it ends', async () => {
    const subject = host();
    const held = await subject.client.acquireLock({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });
    const events = await subject.client.watchProtocol({
      protocolId: subject.protocolId,
    });
    await events.next();

    // The stream ends, as a dropped socket ends it; the channel resumes on a
    // new one, and the editor behind it never stopped holding its draft.
    await events.return(undefined);

    const written = await subject.client.submit({
      protocolId: subject.protocolId,
      requestId: nextRequestId(),
      sectionId: INFORMATION,
      document: { ...held.document, label: 'Saved after the stream ended' },
      revision: held.revision,
    });
    expect(written.revision.sequence).toBeGreaterThan(held.revision.sequence);
    expect(subject.store.read(INFORMATION).document.label).toBe(
      'Saved after the stream ended',
    );
  });

  it('refuses a source name the asset manifest could not carry', async () => {
    const subject = host();
    const { isSuccess } = await safe(
      subject.client.resources.stage({
        protocolId: subject.protocolId,
        editId: EDIT,
        requestId: 'request-1',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'Portrait',
          source: '../portrait.png',
          contentType: 'image/png',
          bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
        },
      }),
    );

    expect(isSuccess).toBe(false);
    const staged = await subject.client.resources.list({
      protocolId: subject.protocolId,
      editId: EDIT,
      status: 'staged',
    });
    expect(staged.status === 'ok' && staged.data.resources).toEqual([]);
  });

  it('refuses to stage a file with nothing in it', async () => {
    const subject = host();
    const staged = await subject.client.resources.stage({
      protocolId: subject.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'Empty',
        source: 'empty.png',
        contentType: 'image/png',
        bytes: new Blob([], { type: 'image/png' }),
      },
    });

    // Staged, it would promote into a manifest entry naming an image with no
    // pixels, which the interview would try to show.
    expect(staged).toMatchObject({
      status: 'failed',
      failure: { reason: 'invalid-content' },
    });
    const listed = await subject.client.resources.list({
      protocolId: subject.protocolId,
      editId: EDIT,
      status: 'staged',
    });
    expect(listed.status === 'ok' && listed.data.resources).toEqual([]);
  });

  it('keeps a staged secret to the session that staged it', async () => {
    const subject = host();
    const staged = await subject.client.resources.stage({
      protocolId: subject.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: { kind: 'secret', name: 'Mapbox token', value: 'pk.secret' },
    });
    if (staged.status !== 'ok') throw new Error('staging a secret failed');

    // Neither half of what promoting somebody else's secret would take is
    // reachable from another session: staging is that edit's, so a
    // collaborator is not shown the resource id, and the handle is minted
    // independently of that id, so it cannot be worked out from one either.
    const collaborator = subject.asCollaborator(COLLABORATOR);
    const listed = await collaborator.resources.list({
      protocolId: subject.protocolId,
      editId: EDIT,
      status: 'staged',
    });
    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources).toEqual([]);
    expect(staged.data.handle).not.toContain(staged.data.descriptor.id);

    // The session that staged it still has it: this is scoping, not hiding.
    const mine = await subject.client.resources.list({
      protocolId: subject.protocolId,
      editId: EDIT,
      status: 'staged',
    });
    if (mine.status !== 'ok') throw new Error('listing failed');
    expect(mine.data.resources.map((resource) => resource.id)).toEqual([
      staged.data.descriptor.id,
    ]);

    const held = await collaborator.acquireLock({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });
    const forged = await safe(
      collaborator.submit({
        protocolId: subject.protocolId,
        requestId: nextRequestId(),
        sectionId: INFORMATION,
        document: held.document,
        revision: held.revision,
        promote: {
          editId: EDIT,
          resourceIds: [staged.data.descriptor.id],
          secretHandles: [`staged-secret:${staged.data.descriptor.id}`],
        },
      }),
    );

    expect(forged.definedError?.code).toBe('PROMOTION_FAILED');
    expect(
      subject.store.read(sectionId({ kind: 'assets' })).document[
        staged.data.descriptor.id
      ],
    ).toBeUndefined();
  });

  it('answers a retried submit with the revision it already wrote', async () => {
    const subject = host();
    const staged = await subject.client.resources.stage({
      protocolId: subject.protocolId,
      editId: EDIT,
      requestId: 'request-1',
      request: {
        kind: 'content',
        contentKind: 'image',
        name: 'Portrait',
        source: 'portrait.png',
        contentType: 'image/png',
        bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      },
    });
    if (staged.status !== 'ok') throw new Error('staging failed');
    const promotion = {
      editId: EDIT,
      resourceIds: [staged.data.descriptor.id],
    };

    const first = await submitHeld(
      subject,
      INFORMATION,
      promotion,
      'write-again',
    );
    const committed = subject.store.read(INFORMATION);
    const again = await submitHeld(
      subject,
      INFORMATION,
      promotion,
      'write-again',
    );

    // The answer to the first can be lost. What the retry is told is what that
    // attempt wrote — the same revision, not a second one nothing changed in.
    expect(again).toEqual(first);
    expect(subject.store.read(INFORMATION)).toEqual(committed);

    await subject.client.releaseLock({
      protocolId: subject.protocolId,
      sectionId: INFORMATION,
    });
    const afterRelease = await subject.client.submit({
      protocolId: subject.protocolId,
      requestId: 'write-again',
      sectionId: INFORMATION,
      document: committed.document,
      revision: committed.revision,
      promote: promotion,
    });

    // By the time a retry goes out the editor may have closed and given the
    // lock back. Refusing then would tell the researcher to discard a draft
    // that was saved.
    expect(afterRelease).toEqual(first);
  });

  it('says which section a refactor cannot find', async () => {
    const subject = host();
    const { definedError, isSuccess } = await safe(
      subject.client.refactor.deleteEntityType({
        protocolId: subject.protocolId,
        entity: 'node',
        typeId: 'ghost',
      }),
    );

    // A stale client deleting a type another editor has already removed gets
    // the refusal the contract declares, not an internal failure that reaches
    // a caller over a transport as nothing it can act on.
    expect(isSuccess).toBe(false);
    expect(definedError?.code).toBe('SECTION_NOT_FOUND');
    expect(definedError?.data).toMatchObject({
      sectionId: sectionId({ kind: 'codebookNode', typeId: 'ghost' }),
    });
  });

  it('resumes from the cursor the transport says the client reached', async () => {
    const subject = host();
    const cursors = await watchCursors(subject, 4);

    // A transport resuming a dropped socket re-invokes the handler with the
    // same input and the id of the last event it delivered. Starting from the
    // input would hand this connection everything between the two again, and
    // the channel applies what it is given.
    const resumed = await subject.client.watchProtocol(
      { protocolId: subject.protocolId, since: cursors[0] },
      { lastEventId: cursors[2] },
    );
    const replayed: string[] = [];
    for await (const event of resumed) {
      replayed.push(String(getEventMeta(event)?.id));
      break;
    }
    await resumed.return?.(undefined);

    expect(replayed).toEqual([cursors[3]]);
  });

  it('keeps a holder editing when its watch stream starts again', async () => {
    const subject = host();
    await subject.client.acquireLock({
      protocolId: subject.protocolId,
      sectionId: PERSON,
    });
    const first = await subject.client.watchProtocol({
      protocolId: subject.protocolId,
    });
    await first.next();
    await first.return(undefined);

    const second = await subject.client.watchProtocol({
      protocolId: subject.protocolId,
    });
    await second.next();
    const holder = subject.store.holderOf(PERSON);
    await second.return(undefined);

    // The lock survives the drop, so the editor behind it is still editing.
    // Rejoining as a viewer would tell every read-only editor of that section
    // that nobody is in it.
    expect(holder).toMatchObject({
      displayName: 'Ada',
      mode: 'editing',
      sectionId: PERSON,
    });
  });

  it('keeps the section it was seeded with when the seed is changed after', () => {
    const seed = sectionsFromProtocol(FIXTURE);
    const subject = createInMemoryHost({ sections: seed });
    const document = seed[INFORMATION];
    if (document === undefined) throw new Error('no information section');

    document.label = 'Changed behind the store';

    // Holding the caller's object would let it change the protocol with no
    // lock check, no revision, no event, and a content hash that no longer
    // describes what is stored.
    expect(subject.store.read(INFORMATION).document.label).not.toBe(
      'Changed behind the store',
    );
  });
});

/** The protocol as its sections currently stand, ready to be assembled. */
function sectionsOf(subject: InMemoryHost): Record<string, SectionDoc> {
  const sections: Record<string, SectionDoc> = {};
  for (const id of subject.store.sectionIds()) {
    sections[id] = subject.store.read(id).document;
  }
  return sections;
}

function withoutEgo(): InMemoryHost {
  const { [EGO]: _ego, ...sections } = sectionsFromProtocol(FIXTURE);
  return createInMemoryHost({ sections });
}

function personVariables(subject: InMemoryHost): string[] {
  const variables = subject.store.read(PERSON).document.variables;
  if (typeof variables !== 'object' || variables === null) {
    throw new Error('the person type has no variables');
  }
  return Object.keys(variables);
}

function fieldVariables(document: Record<string, unknown>): string[] {
  const form = document.form;
  const fields =
    typeof form === 'object' && form !== null && 'fields' in form
      ? (form as { fields: unknown }).fields
      : undefined;
  if (!Array.isArray(fields)) throw new Error('the stage has no form fields');
  return fields.map((field) =>
    typeof field === 'object' && field !== null && 'variable' in field
      ? String((field as { variable: unknown }).variable)
      : '',
  );
}
