import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import { describeFixTextEdits, resolveFindingLocation } from '../describeFix';
import { applyOperations } from '../fixEngine';
import {
  editProtocol,
  normalizeOperations,
  protocolReplacement,
  recordFix,
} from '../protocolFix';
import { makeFinding, makeProtocol, op } from './fixtures';

const promptText = (protocol: unknown) => {
  const stage = (protocol as CurrentProtocol).stages[1];
  return stage && 'prompts' in stage ? stage.prompts[0]?.text : undefined;
};

describe('the fixture', () => {
  it('is a valid protocol, so every refusal below is the fix’s doing', async () => {
    expect(
      (await validateProtocol(makeProtocol(), { draft: true })).success,
    ).toBe(true);
  });
});

describe('translations, as Architect’s editors treat them', () => {
  it('writes plain text over a localized string as the default language, keeping other translations', () => {
    const protocol = makeProtocol();
    const [normalized] = normalizeOperations(protocol, [
      op('set', '/stages/names/prompts/p1/text', 'Name everyone you know'),
    ]);
    expect(normalized).toEqual(
      op('set', '/stages/names/prompts/p1/text/en', 'Name everyone you know'),
    );
    const applied = applyOperations(protocol, normalized ? [normalized] : []);
    expect(applied.ok && promptText(applied.result)).toEqual({
      en: 'Name everyone you know',
      fr: 'Nommez',
    });
  });

  it('merges a localized string into the one it replaces', () => {
    const protocol = makeProtocol();
    const [normalized] = normalizeOperations(protocol, [
      op('set', '/stages/names/prompts/p1/text', { en: 'New' }),
    ]);
    expect(normalized?.value).toBe(JSON.stringify({ en: 'New', fr: 'Nommez' }));
  });

  it('leaves a translation path, and anything not localized, as written', () => {
    const protocol = makeProtocol();
    const operations = [
      op('set', '/stages/names/prompts/p1/text/fr', 'Nommez tout le monde'),
      op('set', '/codebook/node/person/name', 'Friend'),
    ];
    expect(normalizeOperations(protocol, operations)).toEqual(operations);
  });
});

describe('recordFix', () => {
  it('records what the reviewed protocol held at each target', () => {
    const record = recordFix(makeProtocol(), [
      op('set', '/stages/names/prompts/p1/text', 'Name people you know'),
    ]);
    expect(record.targets).toEqual([
      { op: 'set', present: true, value: 'Name people' },
    ]);
  });

  it('records no targets for edits that never applied to the reviewed protocol', () => {
    expect(
      recordFix(makeProtocol(), [op('set', '/stages/gone/label', 'x')]).targets,
    ).toBeNull();
  });
});

describe('editProtocol', () => {
  it('returns the edited protocol when the result is valid', async () => {
    const protocol = makeProtocol();
    const edit = await editProtocol(protocol, [
      op('set', '/stages/welcome/title/en', 'Welcome to the study'),
    ]);
    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    expect(edit.protocol.stages[0]).toMatchObject({
      title: { en: 'Welcome to the study', fr: 'Bonjour' },
    });
    expect(protocol.stages[0]).toMatchObject({ title: { en: 'Hello' } });
  });

  it('refuses edits that leave the protocol invalid', async () => {
    const edit = await editProtocol(makeProtocol(), [
      // A stage type that does not exist.
      op('set', '/stages/welcome/type', 'NotAStage'),
    ]);
    expect(edit).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses edits that remove a type a stage refers to', async () => {
    const edit = await editProtocol(makeProtocol(), [
      op('remove', '/codebook/node/person'),
    ]);
    expect(edit).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports edits that do not apply as changed', async () => {
    expect(
      await editProtocol(makeProtocol(), [op('remove', '/stages/zzz')]),
    ).toEqual({ ok: false, reason: 'changed' });
  });
});

describe('protocolReplacement', () => {
  it('sends a removed top-level key as undefined, because the update merges', () => {
    const from = makeProtocol({ description: 'About' });
    const { description: _removed, ...to } = from;
    const payload = protocolReplacement(from, to);
    expect(Object.hasOwn(payload, 'description')).toBe(true);
    expect(payload.description).toBeUndefined();
    expect({ ...from, ...payload }.description).toBeUndefined();
  });
});

describe('describeFixTextEdits', () => {
  it('gives the text now and after, its language, and the translations it leaves alone', () => {
    const protocol = makeProtocol();
    const { operations } = recordFix(protocol, [
      op('set', '/stages/names/prompts/p1/text', 'Name everyone'),
      op('set', '/codebook/node/person/name', 'Friend'),
      op('remove', '/stages/welcome'),
      op('set', '/stages/names/prompts/p1/id', 'not text'),
    ]);
    expect(describeFixTextEdits(protocol, operations)).toEqual([
      {
        path: '/stages/names/prompts/p1/text/en',
        now: 'Name people',
        after: 'Name everyone',
        locale: 'en',
        otherTranslations: ['fr'],
        markdown: true,
      },
      {
        path: '/codebook/node/person/name',
        now: 'Person',
        after: 'Friend',
        locale: null,
        otherTranslations: [],
        markdown: false,
      },
      {
        path: '/stages/names/prompts/p1/id',
        now: 'p1',
        after: 'not text',
        locale: null,
        otherTranslations: [],
        markdown: false,
      },
    ]);
  });

  it('shows message syntax as the plain text a participant reads', () => {
    const protocol = makeProtocol();
    const [edit] = describeFixTextEdits(protocol, [
      op('set', '/stages/welcome/title/en', "It''s '{'here'}'"),
    ]);
    expect(edit?.after).toBe("It's {here}");
  });

  it('marks text the protocol declares as markdown, and only that text', () => {
    const protocol = makeProtocol();
    const edits = describeFixTextEdits(protocol, [
      op('set', '/stages/names/prompts/p1/text', { en: '**Name** people' }),
      op('set', '/stages/welcome/title/en', 'Hi there'),
      op('set', '/stages/welcome/items/intro/content/en', '*Hi*'),
    ]);
    expect(edits.map(({ path, markdown }) => [path, markdown])).toEqual([
      ['/stages/names/prompts/p1/text/en', true],
      ['/stages/welcome/title/en', false],
      ['/stages/welcome/items/intro/content/en', true],
    ]);
  });
});

describe('resolveFindingLocation', () => {
  const protocol = makeProtocol();

  it('places a stage finding at its 1-based position, with its label and editor', () => {
    expect(
      resolveFindingLocation(
        protocol,
        makeFinding('f', [], { stageId: 'names' }),
      ),
    ).toEqual({
      kind: 'stage',
      stageId: 'names',
      position: 2,
      label: 'Names',
      href: '/protocol/stage/names',
    });
  });

  it('places a codebook finding at its type, linked to the type editor', () => {
    expect(
      resolveFindingLocation(
        protocol,
        makeFinding('f', [], {
          codebookEntity: 'node',
          codebookTypeId: 'person',
        }),
      ),
    ).toEqual({
      kind: 'codebook',
      entity: 'node',
      typeId: 'person',
      typeName: 'Person',
      href: '/protocol/codebook?entity=node&type=person',
    });
  });

  it('falls back when the stage or type no longer exists, and for the protocol as a whole', () => {
    expect(
      resolveFindingLocation(protocol, makeFinding('f', [], { stageId: 'x' })),
    ).toEqual({ kind: 'protocol' });
    expect(
      resolveFindingLocation(
        protocol,
        makeFinding('f', [], { codebookEntity: 'edge', codebookTypeId: 'x' }),
      ),
    ).toEqual({
      kind: 'codebook',
      entity: 'edge',
      typeId: null,
      typeName: null,
      href: '/protocol/codebook',
    });
    expect(
      resolveFindingLocation(
        protocol,
        makeFinding('f', [], { codebookEntity: 'ego' }),
      ),
    ).toMatchObject({
      kind: 'codebook',
      entity: 'ego',
      href: '/protocol/codebook',
    });
    expect(resolveFindingLocation(protocol, makeFinding('f', []))).toEqual({
      kind: 'protocol',
    });
  });
});
