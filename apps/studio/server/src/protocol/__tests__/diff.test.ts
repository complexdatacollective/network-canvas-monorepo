import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { type SectionDoc, contentHash } from '@codaco/studio-sync/apply';

import { type SectionSet, diffProtocolSections } from '../diff.ts';
import { sectionizeProtocol } from '../sectionize.ts';
import { baseProtocol } from './helpers.ts';

function sectionSet(protocol: CurrentProtocol): {
  set: SectionSet;
  docs: Map<string, SectionDoc>;
} {
  const set: SectionSet = {};
  const docs = new Map<string, SectionDoc>();
  for (const [id, doc] of Object.entries(sectionizeProtocol(protocol))) {
    const hash = contentHash(doc);
    set[id] = hash;
    docs.set(hash, doc);
  }
  return { set, docs };
}

function diff(a: CurrentProtocol, b: CurrentProtocol) {
  const left = sectionSet(a);
  const right = sectionSet(b);
  return diffProtocolSections(left.set, right.set, (hash) => {
    const doc = left.docs.get(hash) ?? right.docs.get(hash);
    if (doc === undefined) throw new Error(`no doc for ${hash}`);
    return doc;
  });
}

type MutableProtocol = CurrentProtocol & {
  stages: (CurrentProtocol['stages'][number] & {
    prompts?: { id: string; text: string }[];
  })[];
};

describe('diffProtocolSections', () => {
  it('reports nothing for identical content', () => {
    expect(diff(baseProtocol(), baseProtocol())).toEqual([]);
  });

  it('produces the canonical example: prompt text changed, variable added', () => {
    const before = baseProtocol();
    const after = baseProtocol() as MutableProtocol;
    after.stages[0]!.prompts![0]!.text = 'Who do you spend time with?';
    const person = after.codebook.node!.person!;
    person.variables = {
      ...person.variables,
      close_friend: { name: 'close_friend', type: 'boolean' },
    } as typeof person.variables;

    const changes = diff(before, after);
    expect(changes).toHaveLength(2);

    const stageChange = changes.find(
      (change) => change.kind === 'stage-changed',
    );
    expect(stageChange).toMatchObject({
      stageId: 'nameGenerator1',
      stageType: 'NameGenerator',
      changes: [{ path: ['prompts', 'prompt1', 'text'], change: 'changed' }],
    });

    const entityChange = changes.find(
      (change) => change.kind === 'entity-changed',
    );
    expect(entityChange).toMatchObject({
      entity: 'node',
      typeId: 'person',
      name: 'Person',
      changes: [],
      variables: [
        { variableId: 'close_friend', name: 'close_friend', change: 'added' },
      ],
    });
  });

  it('reports stage add and remove with position and identity', () => {
    const before = baseProtocol();
    const after = baseProtocol() as MutableProtocol;
    after.stages = [
      after.stages[0]!,
      {
        id: 'info1',
        type: 'Information',
        label: 'About this study',
        title: 'About this study',
        items: [{ id: 'item1', type: 'text', content: 'Welcome.' }],
      } as unknown as MutableProtocol['stages'][number],
      after.stages[1]!,
    ];

    const added = diff(before, after);
    expect(added).toEqual([
      {
        kind: 'stage-added',
        stageId: 'info1',
        stageType: 'Information',
        label: 'About this study',
        index: 1,
      },
    ]);

    const removed = diff(after, before);
    expect(removed).toEqual([
      {
        kind: 'stage-removed',
        stageId: 'info1',
        stageType: 'Information',
        label: 'About this study',
      },
    ]);
  });

  it('reports a pure reorder as exactly one stage-moved', () => {
    const before = baseProtocol();
    const after = baseProtocol() as MutableProtocol;
    after.stages = [after.stages[1]!, after.stages[0]!];

    const changes = diff(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'stage-moved' });
  });

  it('reports a prompt reorder that leaves every prompt unchanged', () => {
    const before = baseProtocol() as MutableProtocol;
    before.stages[0]!.prompts = [
      { id: 'prompt1', text: 'Who do you know?' },
      { id: 'prompt2', text: 'Anyone else?' },
    ];
    const after = baseProtocol() as MutableProtocol;
    after.stages[0]!.prompts = [
      { id: 'prompt2', text: 'Anyone else?' },
      { id: 'prompt1', text: 'Who do you know?' },
    ];

    const changes = diff(before, after);
    expect(changes).toEqual([
      {
        kind: 'stage-changed',
        stageId: 'nameGenerator1',
        stageType: 'NameGenerator',
        changes: [{ path: ['prompts'], change: 'changed' }],
      },
    ]);
  });

  it('classifies a variable named after a prototype member', () => {
    const before = baseProtocol();
    const after = baseProtocol();
    const person = after.codebook.node!.person!;
    person.variables = {
      ...person.variables,
      constructor: { name: 'constructor', type: 'boolean' },
    } as typeof person.variables;

    const changes = diff(before, after);
    expect(changes).toEqual([
      {
        kind: 'entity-changed',
        entity: 'node',
        typeId: 'person',
        name: 'Person',
        changes: [],
        variables: [
          { variableId: 'constructor', name: 'constructor', change: 'added' },
        ],
      },
    ]);
  });

  it('classifies an asset named after a prototype member', () => {
    const before = baseProtocol();
    const after = baseProtocol();
    after.assetManifest = {
      constructor: {
        id: 'constructor',
        type: 'image',
        name: 'a.png',
        source: 'a.png',
      },
    } as CurrentProtocol['assetManifest'];

    expect(diff(before, after)).toEqual([
      {
        kind: 'assets-changed',
        added: ['constructor'],
        removed: [],
        changed: [],
      },
    ]);
  });

  it('describes a full reversal with the endpoints that moved', () => {
    const before = baseProtocol() as MutableProtocol;
    const third = {
      id: 'info1',
      type: 'Information',
      label: 'About this study',
      title: 'About this study',
      items: [{ id: 'item1', type: 'text', content: 'Welcome.' }],
    } as unknown as MutableProtocol['stages'][number];
    before.stages = [before.stages[0]!, before.stages[1]!, third];
    const after = baseProtocol() as MutableProtocol;
    after.stages = [third, before.stages[1]!, before.stages[0]!];

    const changes = diff(before, after);
    expect(changes).toEqual([
      { kind: 'stage-moved', stageId: 'nameGenerator1', from: 0, to: 2 },
      { kind: 'stage-moved', stageId: 'info1', from: 2, to: 0 },
    ]);
  });

  it('reports settings and asset changes', () => {
    const before = baseProtocol();
    before.assetManifest = {
      asset1: {
        id: 'asset1',
        type: 'image',
        name: 'a.png',
        source: 'a.png',
      },
    } as CurrentProtocol['assetManifest'];

    const after = baseProtocol();
    after.description = 'Updated description';
    after.assetManifest = {
      asset2: {
        id: 'asset2',
        type: 'image',
        name: 'b.png',
        source: 'b.png',
      },
    } as CurrentProtocol['assetManifest'];

    const changes = diff(before, after);
    expect(changes).toContainEqual({
      kind: 'settings-changed',
      changes: [{ path: ['description'], change: 'added' }],
    });
    expect(changes).toContainEqual({
      kind: 'assets-changed',
      added: ['asset2'],
      removed: ['asset1'],
      changed: [],
    });
  });
});
