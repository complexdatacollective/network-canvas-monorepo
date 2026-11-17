import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import {
  applyFixEdits,
  describeFixTextEdits,
  fixTranslationScope,
  placeholdersReplaceable,
  resolveFindingLocation,
  resolveFixPlace,
} from '../describeFix';
import { applyOperations } from '../fixEngine';
import {
  editProtocol,
  fixStaysInBounds,
  normalizeOperations,
  protocolReplacement,
  recordFix,
  writesPlaceholder,
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

describe('a fix that replaces more than one text', () => {
  const variable = (protocol: unknown) =>
    (protocol as CurrentProtocol).codebook.node?.person?.variables?.freq;

  it('keeps the other translations of a prompt it replaces whole', () => {
    const protocol = makeProtocol();
    const normalized = normalizeOperations(protocol, [
      op('set', '/stages/names/prompts/p1', {
        id: 'p1',
        text: { en: 'In the past 6 months, who?' },
      }),
    ]);
    const applied = applyOperations(protocol, normalized);
    expect(applied.ok && promptText(applied.result)).toEqual({
      en: 'In the past 6 months, who?',
      fr: 'Nommez',
    });
  });

  it('keeps each option’s translations when the list is rewritten, matching options by value', () => {
    const protocol = makeProtocol();
    const normalized = normalizeOperations(protocol, [
      op('set', '/codebook/node/person/variables/freq/options', [
        { label: { en: 'Seldom' }, value: 2 },
        { label: { en: 'Sometimes' }, value: 3 },
        { label: { en: 'Frequently' }, value: 1 },
      ]),
    ]);
    const applied = applyOperations(protocol, normalized);
    expect(applied.ok && variable(applied.result)).toMatchObject({
      options: [
        { label: { en: 'Seldom', fr: 'Rarement' }, value: 2 },
        { label: { en: 'Sometimes' }, value: 3 },
        { label: { en: 'Frequently', fr: 'Souvent' }, value: 1 },
      ],
    });
  });

  it('keeps the translations of every text in a stage it replaces whole', () => {
    const protocol = makeProtocol();
    const stage = protocol.stages[0];
    const normalized = normalizeOperations(protocol, [
      op('set', '/stages/welcome', {
        ...stage,
        label: { en: 'Start' },
        title: { en: 'Hi' },
      }),
    ]);
    const applied = applyOperations(protocol, normalized);
    expect(
      applied.ok && (applied.result as CurrentProtocol).stages[0],
    ).toMatchObject({
      label: { en: 'Start', fr: 'Bienvenue' },
      title: { en: 'Hi', fr: 'Bonjour' },
    });
  });

  const withOptions = (options: unknown[]): CurrentProtocol => {
    const protocol = makeProtocol();
    const freq = variable(protocol);
    if (freq) Object.assign(freq, { options });
    return protocol;
  };
  const rewritten = (protocol: CurrentProtocol, options: unknown[]) => {
    const applied = applyOperations(
      protocol,
      normalizeOperations(protocol, [
        op('set', '/codebook/node/person/variables/freq/options', options),
      ]),
    );
    return applied.ok && variable(applied.result);
  };

  it('keeps Yes and No with their own answers when the list is reversed', () => {
    const protocol = withOptions([
      { label: { en: 'Yes', fr: 'Oui' }, value: true },
      { label: { en: 'No', fr: 'Non' }, value: false },
    ]);
    expect(
      rewritten(protocol, [
        { label: { en: 'No, never' }, value: false },
        { label: { en: 'Yes, sometimes' }, value: true },
      ]),
    ).toMatchObject({
      options: [
        { label: { en: 'No, never', fr: 'Non' }, value: false },
        { label: { en: 'Yes, sometimes', fr: 'Oui' }, value: true },
      ],
    });
  });

  it('keeps each translation with its label when a fix swaps the values', () => {
    const protocol = withOptions([
      { label: { en: 'Often', fr: 'Souvent' }, value: 1 },
      { label: { en: 'Rarely', fr: 'Rarement' }, value: 2 },
    ]);
    expect(
      rewritten(protocol, [
        { label: { en: 'Often' }, value: 2 },
        { label: { en: 'Rarely' }, value: 1 },
      ]),
    ).toMatchObject({
      options: [
        { label: { en: 'Often', fr: 'Souvent' }, value: 2 },
        { label: { en: 'Rarely', fr: 'Rarement' }, value: 1 },
      ],
    });
  });

  it('gives a new option nothing when it takes the value of one that keeps its label', () => {
    const protocol = withOptions([
      { label: { en: 'Often', fr: 'Souvent' }, value: 1 },
      { label: { en: 'Rarely', fr: 'Rarement' }, value: 2 },
    ]);
    const options = rewritten(protocol, [
      { label: { en: 'Often' }, value: 3 },
      { label: { en: 'Every day' }, value: 1 },
      { label: { en: 'Seldom' }, value: 2 },
    ]);
    expect(options).toMatchObject({
      options: [
        { label: { en: 'Often', fr: 'Souvent' }, value: 3 },
        { label: { en: 'Every day' }, value: 1 },
        { label: { en: 'Seldom', fr: 'Rarement' }, value: 2 },
      ],
    });
    expect(JSON.stringify(options)).toContain('{"en":"Every day"}');
  });

  it('keeps each translation with what its entry refers to when entries are reordered and reworded', () => {
    const protocol = withOptions([
      { label: { en: 'Friends', fr: 'Amis' }, type: 'friend' },
      { label: { en: 'Family', fr: 'Famille' }, type: 'family' },
    ]);
    expect(
      rewritten(protocol, [
        { label: { en: 'Relatives' }, type: 'family' },
        { label: { en: 'Close friends' }, type: 'friend' },
      ]),
    ).toMatchObject({
      options: [
        { label: { en: 'Relatives', fr: 'Famille' }, type: 'family' },
        { label: { en: 'Close friends', fr: 'Amis' }, type: 'friend' },
      ],
    });
  });

  it('carries nothing over to an entry reworded and pointed at something else', () => {
    const protocol = withOptions([
      { label: { en: 'Friends', fr: 'Amis' }, type: 'friend' },
      { label: { en: 'Family', fr: 'Famille' }, type: 'family' },
    ]);
    expect(
      JSON.stringify(
        rewritten(protocol, [
          { label: { en: 'Colleagues' }, type: 'colleague' },
          { label: { en: 'Family' }, type: 'family' },
        ]),
      ),
    ).toContain('{"en":"Colleagues"}');
  });

  it('carries nothing over to options that share a value', () => {
    const protocol = withOptions([
      { label: { en: 'Often', fr: 'Souvent' }, value: 1 },
      { label: { en: 'Rarely', fr: 'Rarement' }, value: 2 },
    ]);
    expect(
      rewritten(protocol, [
        { label: { en: 'Daily' }, value: 1 },
        { label: { en: 'Weekly' }, value: 1 },
      ]),
    ).toMatchObject({
      options: [
        { label: { en: 'Daily' }, value: 1 },
        { label: { en: 'Weekly' }, value: 1 },
      ],
    });
  });

  it('leaves a value that names every translation as written', () => {
    const protocol = makeProtocol();
    const operations = [
      op('set', '/stages/names/prompts/p1', {
        id: 'p1',
        text: { en: 'Who?', fr: 'Qui ?' },
      }),
    ];
    expect(normalizeOperations(protocol, operations)).toEqual(operations);
  });
});

describe('which translations a fix rewords and which it leaves', () => {
  const scopeOf = (operations: ReturnType<typeof op>[]) => {
    const protocol = makeProtocol();
    const fix = recordFix(protocol, operations);
    const applied = applyOperations(protocol, fix.operations);
    if (!applied.ok) throw new Error('the fix does not apply');
    return {
      before: fixTranslationScope(protocol, fix.operations, fix.targets),
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fixture with the fix applied
      after: fixTranslationScope(
        applied.result as CurrentProtocol,
        fix.operations,
        fix.targets,
      ),
    };
  };
  const english = { changed: ['en'], kept: ['fr'] };

  it.each([
    [
      'one translation',
      [op('set', '/stages/names/prompts/p1/text/en', 'Who do you know?')],
    ],
    [
      'a whole text',
      [op('set', '/stages/names/prompts/p1/text', { en: 'Who do you know?' })],
    ],
    [
      'a whole prompt',
      [
        op('set', '/stages/names/prompts/p1', {
          id: 'p1',
          text: { en: 'Who do you know?' },
        }),
      ],
    ],
    [
      'a list of options',
      [
        op('set', '/codebook/node/person/variables/freq/options', [
          { label: { en: 'Seldom' }, value: 2 },
          { label: { en: 'Frequently' }, value: 1 },
        ]),
      ],
    ],
  ])('says so for %s, before the fix and once it is made', (_, operations) => {
    expect(scopeOf(operations)).toEqual({ before: english, after: english });
  });

  it('says nothing for a fix that rewords every translation', () => {
    expect(
      scopeOf([
        op('set', '/stages/names/prompts/p1/text', { en: 'Who?', fr: 'Qui ?' }),
      ]),
    ).toEqual({ before: null, after: null });
  });

  it('says nothing for a fix that writes no text the protocol has', () => {
    expect(
      scopeOf([op('set', '/codebook/node/person/name', 'Friend')]),
    ).toEqual({ before: null, after: null });
  });
});

describe('a fix that reaches outside the interview and its data model', () => {
  it.each([
    ['an asset', op('set', '/assetManifest/map', { id: 'map', value: 'x' })],
    ['the study details', op('remove', '/experiments')],
    ['the default language', op('set', '/localization/defaultLocale', 'fr')],
    ['the protocol’s name', op('set', '/name', 'Renamed')],
    ['Network Canvas’s wording', op('remove', '/interfaceText')],
  ])('is not offered when it edits %s', (_, operation) => {
    expect(fixStaysInBounds([operation])).toBe(false);
    expect(recordFix(makeProtocol(), [operation]).targets).toBeNull();
  });

  it('is offered for edits to stages and the codebook', () => {
    const operations = [
      op('set', '/stages/names/prompts/p1/text', 'Name people you know'),
      op('set', '/codebook/node/person/name', 'Friend'),
    ];
    expect(fixStaysInBounds(operations)).toBe(true);
    expect(recordFix(makeProtocol(), operations).targets).not.toBeNull();
  });
});

describe('what counts as a placeholder', () => {
  const writes = (text: string) =>
    writesPlaceholder(op('set', '/stages/names/prompts/p1/text/en', text));

  it.each([
    '[PHONE NUMBER]',
    '[CORREO ELECTRÓNICO]',
    '[NUMÉRO DE TÉLÉPHONE]',
    '[ÖFFNUNGSZEITEN]',
    '[热线名称]',
    '[رقم الهاتف]',
    '[UNIVERSITY’S ETHICS OFFICE]',
    '[HELPLINE NAME, E.G. SAMARITANS]',
    '[PHONE NUMBER: 24H]',
    '[NAME (OPTIONAL)]',
    '[ORGANISATION & PHONE]',
    '[姓]',
    '[名]',
  ])('reads %s as one', (placeholder) => {
    expect(writes(`Call ${placeholder} now`)).toBe(true);
  });

  it.each([
    'Call [NHS 111](https://111.nhs.uk) now',
    'See note [1]',
    'Tick the box [ ]',
    'Choose one [optional]',
    'Tick [X] to agree',
    'Option [A]',
    'Montant en [€]',
    'No brackets at all',
  ])('does not read "%s" as one', (text) => {
    expect(writes(text)).toBe(false);
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
      op('set', '/stages/names/prompts/p1/text', {
        en: 'Name people, or call [PHONE NUMBER]',
      }),
    ];
    const path = '/stages/names/prompts/p1/text/en';
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
        op('set', '/stages/names/prompts/p1/text', {
          en: 'Name people, or call [PHONE NUMBER]',
        }),
      ]),
    ).toBe(true);
    expect(
      placeholdersReplaceable(protocol, [
        op('set', '/stages/names/prompts/p1', {
          id: 'p1',
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
        op('set', '/stages/names/prompts/p1/text', { en: 'Name people' }),
      ]),
    ).toBe(true);
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

describe('applyFixEdits', () => {
  it('writes the researcher’s text and number in place of the suggestion', () => {
    const protocol = makeProtocol();
    const operations = [
      op('set', '/stages/names/prompts/p1/text', { en: 'Name people you see' }),
      op('set', '/stages/names/behaviours/maxNodes', 20),
    ];
    const edited = applyFixEdits(protocol, operations, {
      '/stages/names/prompts/p1/text/en': 'Name {everyone} you see',
      '/stages/names/behaviours/maxNodes': '15',
    });
    expect(
      edited?.map((operation) => JSON.parse(operation.value ?? '')),
    ).toEqual([{ en: "Name '{'everyone'}' you see" }, 15]);
  });

  it('refuses a number field that holds no number', () => {
    const protocol = makeProtocol();
    const operations = [op('set', '/stages/names/behaviours/maxNodes', 20)];
    expect(
      applyFixEdits(protocol, operations, {
        '/stages/names/behaviours/maxNodes': '',
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
      op('set', '/stages/names/behaviours/maxNodes', 20),
      op('set', '/stages/names/behaviours/someCount', 3),
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
        path: '/stages/names/prompts/p1/id',
        now: 'p1',
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
    expect(placeOf(op('remove', '/stages/welcome'))).toEqual({
      kind: 'stages',
      href: '/protocol',
    });
    expect(
      placeOf(
        op('insert', '/stages/finish', { id: 'new', type: 'Information' }),
      ),
    ).toMatchObject({ kind: 'stages' });
  });

  it('sends a fix that adds a stage to that stage, once it is there', () => {
    const add = op('insert', '/stages/finish', {
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
        op('set', '/stages/names/prompts/p1/text/en', 'Name everyone'),
      ),
    ).toMatchObject({ kind: 'stage', stageId: 'names', position: 2 });
  });

  it('sends a fix that edits several stages to the Stages screen', () => {
    expect(
      placeOf(
        op('set', '/stages/welcome/title/en', 'Hi'),
        op('set', '/stages/names/prompts/p1/text/en', 'Name everyone'),
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
