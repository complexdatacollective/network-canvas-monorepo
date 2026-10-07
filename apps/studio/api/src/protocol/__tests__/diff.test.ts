import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  escapeMessageText,
} from '@codaco/protocol-validation';
import { type SectionDoc, contentHash } from '@codaco/studio-sync/apply';

import { type SectionSet, diffProtocolSections } from '../diff.ts';
import { sectionizeProtocol } from '../sectionize.ts';
import { baseProtocol } from './helpers.ts';

type Stage = CurrentProtocol['stages'][number];
type Variable = NonNullable<
  NonNullable<CurrentProtocol['codebook']['node']>[string]['variables']
>[string];
type Asset = NonNullable<CurrentProtocol['assetManifest']>[string];

function sectionSetOf(sections: Record<string, SectionDoc>): {
  set: SectionSet;
  docs: Map<string, SectionDoc>;
} {
  const set: SectionSet = {};
  const docs = new Map<string, SectionDoc>();
  for (const [id, doc] of Object.entries(sections)) {
    const hash = contentHash(doc);
    set[id] = hash;
    docs.set(hash, doc);
  }
  return { set, docs };
}

function diffSections(
  a: Record<string, SectionDoc>,
  b: Record<string, SectionDoc>,
) {
  const left = sectionSetOf(a);
  const right = sectionSetOf(b);
  return diffProtocolSections(left.set, right.set, (hash) => {
    const doc = left.docs.get(hash) ?? right.docs.get(hash);
    if (doc === undefined) throw new Error(`no doc for ${hash}`);
    return doc;
  });
}

function diff(a: CurrentProtocol, b: CurrentProtocol) {
  return diffSections(sectionizeProtocol(a), sectionizeProtocol(b));
}

function nameGenerator(protocol: CurrentProtocol) {
  const stage = protocol.stages[0];
  if (stage?.type !== 'NameGenerator') {
    throw new Error('the base protocol opens with its name generator');
  }
  return stage;
}

function informationStage(label: Stage['label']): Stage {
  return {
    id: 'info1',
    type: 'Information',
    label,
    title: { en: 'About this study' },
    items: [{ id: 'item1', type: 'text', content: { en: 'Welcome.' } }],
  };
}

describe('diffProtocolSections', () => {
  it('reports nothing for identical content', () => {
    expect(diff(baseProtocol(), baseProtocol())).toEqual([]);
  });

  it('produces the canonical example: prompt text changed, variable added', () => {
    const before = baseProtocol();
    const after = baseProtocol();
    nameGenerator(after).prompts[0]!.text = {
      en: 'Who do you spend time with?',
    };
    const person = after.codebook.node!.person!;
    person.variables = {
      ...person.variables,
      close_friend: {
        name: 'close_friend',
        label: 'Close friend',
        type: 'boolean',
      },
    };

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
    const after = baseProtocol();
    after.stages = [
      after.stages[0]!,
      informationStage({ en: 'About this study' }),
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

  it('shows a localized stage label as plain text in the default language', () => {
    const localization = { defaultLocale: 'fr', locales: ['en', 'fr'] };
    const before = baseProtocol();
    before.localization = localization;
    const after = baseProtocol();
    after.localization = localization;
    after.stages = [
      ...after.stages,
      informationStage({
        en: 'About this study',
        fr: escapeMessageText("L'étude {pilote}"),
      }),
    ];

    expect(diff(before, after)).toEqual([
      {
        kind: 'stage-added',
        stageId: 'info1',
        stageType: 'Information',
        label: "L'étude {pilote}",
        index: 2,
      },
    ]);
    expect(diff(after, before)).toEqual([
      {
        kind: 'stage-removed',
        stageId: 'info1',
        stageType: 'Information',
        label: "L'étude {pilote}",
      },
    ]);
  });

  it('passes over a blank translation', () => {
    const localization = { defaultLocale: 'fr', locales: ['de', 'en', 'fr'] };
    const before = baseProtocol();
    before.localization = localization;
    const after = baseProtocol();
    after.localization = localization;
    after.stages = [
      ...after.stages,
      informationStage({ de: ' ', en: 'About this study' }),
    ];

    expect(diff(before, after)).toMatchObject([
      { kind: 'stage-added', label: 'About this study' },
    ]);
  });

  it.each<{
    fallback: string;
    localization: { defaultLocale: string; locales: string[] };
    label: Record<string, string>;
    expected: string;
  }>([
    {
      fallback: 'a language closely related to the default',
      localization: {
        defaultLocale: 'pt-PT',
        locales: ['pt-PT', 'en', 'pt-BR'],
      },
      label: { 'en': 'About this study', 'pt-BR': 'Sobre o estudo' },
      expected: 'Sobre o estudo',
    },
    {
      fallback: 'the first language by tag, whatever the declared order',
      localization: { defaultLocale: 'fr', locales: ['fr', 'es', 'en'] },
      label: { es: 'Sobre este estudio', en: 'About this study' },
      expected: 'About this study',
    },
  ])('falls back to $fallback', ({ localization, label, expected }) => {
    const before = baseProtocol();
    before.localization = localization;
    const after = baseProtocol();
    after.localization = localization;
    after.stages = [...after.stages, informationStage(label)];

    expect(diff(before, after)).toMatchObject([
      { kind: 'stage-added', label: expected },
    ]);
  });

  it('shows a plain-string label from a stored schema-8 version as it is', () => {
    const settings = { name: 'Legacy', schemaVersion: 8 };
    const before = {
      settings,
      stageOrder: { stages: [] },
    };
    const after = {
      'settings': settings,
      'stageOrder': { stages: ['info1'] },
      'stage:info1': {
        id: 'info1',
        type: 'Information',
        label: 'About this study',
        title: 'About this study',
        items: [],
      },
    };

    expect(diffSections(before, after)).toEqual([
      {
        kind: 'stage-added',
        stageId: 'info1',
        stageType: 'Information',
        label: 'About this study',
        index: 0,
      },
    ]);
  });

  it('reports a pure reorder as exactly one stage-moved', () => {
    const before = baseProtocol();
    const after = baseProtocol();
    after.stages = [after.stages[1]!, after.stages[0]!];

    const changes = diff(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'stage-moved' });
  });

  it('reports a prompt reorder that leaves every prompt unchanged', () => {
    const before = baseProtocol();
    nameGenerator(before).prompts = [
      { id: 'prompt1', text: { en: 'Who do you know?' } },
      { id: 'prompt2', text: { en: 'Anyone else?' } },
    ];
    const after = baseProtocol();
    nameGenerator(after).prompts = [
      { id: 'prompt2', text: { en: 'Anyone else?' } },
      { id: 'prompt1', text: { en: 'Who do you know?' } },
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
    // Annotated apart: a literal key named `constructor` is not contextually
    // typed by the record it is assigned to.
    const variable: Variable = {
      name: 'constructor',
      label: 'Constructor',
      type: 'boolean',
    };
    person.variables = { ...person.variables, constructor: variable };

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
    const asset: Asset = {
      id: 'constructor',
      type: 'image',
      name: 'a.png',
      source: 'a.png',
    };
    after.assetManifest = { constructor: asset };

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
    const before = baseProtocol();
    const third = informationStage({ en: 'About this study' });
    before.stages = [before.stages[0]!, before.stages[1]!, third];
    const after = baseProtocol();
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
    };

    const after = baseProtocol();
    after.description = 'Updated description';
    after.assetManifest = {
      asset2: {
        id: 'asset2',
        type: 'image',
        name: 'b.png',
        source: 'b.png',
      },
    };

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

  it('reports a change to the declared languages as a settings change', () => {
    const before = baseProtocol();
    const after = baseProtocol();
    after.localization = { defaultLocale: 'en', locales: ['en', 'fr'] };

    expect(diff(before, after)).toEqual([
      {
        kind: 'settings-changed',
        changes: [{ path: ['localization'], change: 'changed' }],
      },
    ]);
  });
});
