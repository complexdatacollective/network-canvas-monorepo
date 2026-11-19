import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import {
  applyFixEdits,
  describeFixTextEdits,
  placeholdersReplaceable,
  resolveFindingLocation,
  resolveFixPlace,
} from '../describeFix';
import { applyOperations } from '../fixEngine';
import {
  editProtocol,
  normalizeOperations,
  protocolReplacement,
  recordFix,
} from '../protocolFix';
import {
  makeFinding,
  makeProtocol,
  op,
  WELCOME_STAGE_ID,
  INTRO_ITEM_ID,
  NAMES_STAGE_ID,
  NAMES_PROMPT_ID,
  FINISH_STAGE_ID,
} from './fixtures';

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
      op(
        'set',
        `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text`,
        'Name everyone you know',
      ),
    ]);
    expect(normalized).toEqual(
      op(
        'set',
        `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text/en`,
        'Name everyone you know',
      ),
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
      op('set', `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text`, {
        en: 'New',
      }),
    ]);
    expect(normalized?.value).toBe(JSON.stringify({ en: 'New', fr: 'Nommez' }));
  });

  it('leaves a translation path, and anything not localized, as written', () => {
    const protocol = makeProtocol();
    const operations = [
      op(
        'set',
        `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text/fr`,
        'Nommez tout le monde',
      ),
      op('set', '/codebook/node/person/name', 'Friend'),
    ];
    expect(normalizeOperations(protocol, operations)).toEqual(operations);
  });
});

describe('recordFix', () => {
  it('records what the reviewed protocol held at each target', () => {
    const record = recordFix(makeProtocol(), [
      op(
        'set',
        `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text`,
        'Name people you know',
      ),
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

describe('a fix that writes a placeholder', () => {
  it('is not offered when the placeholder is in something it adds', () => {
    const record = recordFix(makeProtocol(), [
      op('insert', '/stages/-', {
        id: 'support',
        type: 'Information',
        label: { en: 'Support' },
        text: { en: 'Call [PHONE NUMBER]' },
      }),
    ]);
    expect(record.targets).toBeNull();
    expect(
      recordFix(makeProtocol(), [
        op('insert', '/stages/-', { id: 'plain', label: { en: 'Plain' } }),
      ]).targets,
    ).not.toBeNull();
  });

  it('is made only once the researcher has replaced the placeholder', () => {
    const protocol = makeProtocol();
    const operations = [
      op('set', `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text`, {
        en: 'Name people, or call [PHONE NUMBER]',
      }),
    ];
    const path = `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text/en`;
    expect(applyFixEdits(protocol, operations, {})).toBeNull();
    expect(
      applyFixEdits(protocol, operations, { [path]: 'Name people' }),
    ).not.toBeNull();
    expect(
      applyFixEdits(protocol, operations, { [path]: 'Call [PHONE NUMBER]' }),
    ).toBeNull();
  });

  it('is offered only when every placeholder is in a text the researcher can edit', () => {
    const protocol = makeProtocol();
    expect(
      placeholdersReplaceable(protocol, [
        op('set', `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text`, {
          en: 'Name people, or call [PHONE NUMBER]',
        }),
      ]),
    ).toBe(true);
    expect(
      placeholdersReplaceable(protocol, [
        op('set', `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}`, {
          id: NAMES_PROMPT_ID,
          text: { en: 'Name people, or call [PHONE NUMBER]' },
        }),
      ]),
    ).toBe(false);
    expect(
      placeholdersReplaceable(protocol, [
        op('insert', '/stages/-', {
          id: 'support',
          type: 'Information',
          text: { en: 'Call [PHONE NUMBER]' },
        }),
      ]),
    ).toBe(false);
    expect(
      placeholdersReplaceable(protocol, [
        op('set', `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text`, {
          en: 'Name people',
        }),
      ]),
    ).toBe(true);
  });
});

describe('editProtocol', () => {
  it('returns the edited protocol when the result is valid', async () => {
    const protocol = makeProtocol();
    const edit = await editProtocol(protocol, [
      op('set', `/stages/${WELCOME_STAGE_ID}/title/en`, 'Welcome to the study'),
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
      op('set', `/stages/${WELCOME_STAGE_ID}/type`, 'NotAStage'),
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

describe('applyFixEdits', () => {
  it('writes the researcher’s text and number in place of the suggestion', () => {
    const protocol = makeProtocol();
    const operations = [
      op('set', `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text`, {
        en: 'Name people you see',
      }),
      op('set', `/stages/${NAMES_STAGE_ID}/behaviours/maxNodes`, 20),
    ];
    const edited = applyFixEdits(protocol, operations, {
      [`/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text/en`]:
        'Name {everyone} you see',
      [`/stages/${NAMES_STAGE_ID}/behaviours/maxNodes`]: '15',
    });
    expect(
      edited?.map((operation) => JSON.parse(operation.value ?? '')),
    ).toEqual([{ en: "Name '{'everyone'}' you see" }, 15]);
  });

  it('refuses a number field that holds no number', () => {
    const protocol = makeProtocol();
    const operations = [
      op('set', `/stages/${NAMES_STAGE_ID}/behaviours/maxNodes`, 20),
    ];
    expect(
      applyFixEdits(protocol, operations, {
        [`/stages/${NAMES_STAGE_ID}/behaviours/maxNodes`]: '',
      }),
    ).toBeNull();
  });

  it('leaves a text the researcher cannot change here as suggested', () => {
    const protocol = makeProtocol();
    const operations = [op('set', '/codebook/node/person/name', 'Friend')];
    expect(
      applyFixEdits(protocol, operations, {
        '/codebook/node/person/name': 'Someone',
      }),
    ).toEqual(operations);
  });
});

describe('describeFixTextEdits', () => {
  it('names a number setting and what it belongs to, and leaves other numbers out', () => {
    const protocol = makeProtocol();
    const edits = describeFixTextEdits(protocol, [
      op(
        'set',
        '/codebook/node/person/variables/freq/validation/maxSelected',
        1,
      ),
      op('set', `/stages/${NAMES_STAGE_ID}/behaviours/maxNodes`, 20),
      op('set', `/stages/${NAMES_STAGE_ID}/behaviours/someCount`, 3),
    ]);
    expect(
      edits.map((edit) =>
        edit.kind === 'number'
          ? [edit.setting, edit.owner, edit.now, edit.after]
          : null,
      ),
    ).toEqual([
      ['maxSelected', 'freq', null, '1'],
      ['maxNodes', expect.any(String), null, '20'],
    ]);
  });

  it('gives the text now and after, its language, and the translations it leaves alone', () => {
    const protocol = makeProtocol();
    const { operations } = recordFix(protocol, [
      op(
        'set',
        `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text`,
        'Name everyone',
      ),
      op('set', '/codebook/node/person/name', 'Friend'),
      op('remove', `/stages/${WELCOME_STAGE_ID}`),
      op(
        'set',
        `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/id`,
        'not text',
      ),
    ]);
    expect(describeFixTextEdits(protocol, operations)).toEqual([
      {
        path: `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text/en`,
        now: 'Name people',
        after: 'Name everyone',
        locale: 'en',
        otherTranslations: ['fr'],
        markdown: true,
        singleLine: true,
        textPath: ['stages', 1, 'prompts', 0, 'text'],
        kind: 'text',
        editable: true,
      },
      {
        path: '/codebook/node/person/name',
        now: 'Person',
        after: 'Friend',
        locale: null,
        otherTranslations: [],
        markdown: false,
        singleLine: false,
        textPath: null,
        kind: 'text',
        editable: false,
      },
      {
        path: `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/id`,
        now: NAMES_PROMPT_ID,
        after: 'not text',
        locale: null,
        otherTranslations: [],
        markdown: false,
        singleLine: false,
        textPath: null,
        kind: 'text',
        editable: false,
      },
    ]);
  });

  it('shows message syntax as the plain text a participant reads', () => {
    const protocol = makeProtocol();
    const [edit] = describeFixTextEdits(protocol, [
      op('set', `/stages/${WELCOME_STAGE_ID}/title/en`, "It''s '{'here'}'"),
    ]);
    expect(edit?.after).toBe("It's {here}");
  });

  it('marks text the protocol declares as markdown, and only that text', () => {
    const protocol = makeProtocol();
    const edits = describeFixTextEdits(protocol, [
      op('set', `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text`, {
        en: '**Name** people',
      }),
      op('set', `/stages/${WELCOME_STAGE_ID}/title/en`, 'Hi there'),
      op(
        'set',
        `/stages/${WELCOME_STAGE_ID}/items/${INTRO_ITEM_ID}/content/en`,
        '*Hi*',
      ),
    ]);
    expect(edits.map(({ path, markdown }) => [path, markdown])).toEqual([
      [`/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text/en`, true],
      [`/stages/${WELCOME_STAGE_ID}/title/en`, false],
      [`/stages/${WELCOME_STAGE_ID}/items/${INTRO_ITEM_ID}/content/en`, true],
    ]);
  });
});

describe('resolveFixPlace', () => {
  const protocol = makeProtocol();
  const problemAt = resolveFindingLocation(protocol, {
    stageId: null,
    codebookEntity: 'node',
    codebookTypeId: 'person',
  });
  const placeOf = (...operations: ReturnType<typeof op>[]) =>
    resolveFixPlace(protocol, operations, problemAt);

  it('sends a fix that adds or removes a stage to the Stages screen', () => {
    expect(placeOf(op('remove', `/stages/${WELCOME_STAGE_ID}`))).toEqual({
      kind: 'stages',
      href: '/protocol',
    });
    expect(
      placeOf(
        op('insert', `/stages/${FINISH_STAGE_ID}`, {
          id: 'new',
          type: 'Information',
        }),
      ),
    ).toMatchObject({ kind: 'stages' });
  });

  it('sends a fix that adds a stage to that stage, once it is there', () => {
    const add = op('insert', `/stages/${FINISH_STAGE_ID}`, {
      id: 'knows',
      type: 'Information',
      label: { en: 'Who knows whom' },
    });
    expect(placeOf(add)).toMatchObject({ kind: 'stages' });
    const added = applyOperations(protocol, [add]);
    if (!added.ok) throw new Error('The insert did not apply');
    expect(
      resolveFixPlace(added.result as typeof protocol, [add], problemAt),
    ).toMatchObject({ kind: 'stage', stageId: 'knows', position: 3 });
  });

  it('sends a fix that edits one stage, even with the codebook, to that stage', () => {
    expect(
      placeOf(
        op('set', '/codebook/node/person/variables/extra', { name: 'extra' }),
        op(
          'set',
          `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text/en`,
          'Name everyone',
        ),
      ),
    ).toMatchObject({ kind: 'stage', stageId: NAMES_STAGE_ID, position: 2 });
  });

  it('sends a fix that edits several stages to the Stages screen', () => {
    expect(
      placeOf(
        op('set', `/stages/${WELCOME_STAGE_ID}/title/en`, 'Hi'),
        op(
          'set',
          `/stages/${NAMES_STAGE_ID}/prompts/${NAMES_PROMPT_ID}/text/en`,
          'Name everyone',
        ),
      ),
    ).toMatchObject({ kind: 'stages' });
  });

  it('sends a fix to one type, or to the ego, to that part of the codebook', () => {
    expect(
      placeOf(op('set', '/codebook/node/person/name', 'Friend')),
    ).toMatchObject({ kind: 'codebook', entity: 'node', typeId: 'person' });
    expect(
      placeOf(op('set', '/codebook/ego/variables/age', { name: 'age' })),
    ).toMatchObject({ kind: 'codebook', entity: 'ego', typeId: null });
  });

  it('leaves advice with no edits where the problem is', () => {
    expect(placeOf()).toBe(problemAt);
  });
});

describe('resolveFindingLocation', () => {
  const protocol = makeProtocol();

  it('places a stage finding at its 1-based position, with its label and editor', () => {
    expect(
      resolveFindingLocation(
        protocol,
        makeFinding('f', [], { stageId: NAMES_STAGE_ID }),
      ),
    ).toEqual({
      kind: 'stage',
      stageId: NAMES_STAGE_ID,
      position: 2,
      label: 'Names',
      href: `/protocol/stage/${NAMES_STAGE_ID}`,
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
