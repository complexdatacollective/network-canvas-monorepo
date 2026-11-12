import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { asOneLine } from '@codaco/shared-consts';

import {
  stageWithoutSuppliedText,
  withoutSuppliedWording,
} from '../../../__tests__/suppliedWording.ts';
import { dynamicValueNamesIn } from '../../../localization/dynamicValueMessages.ts';
import {
  escapeMessageText,
  messageText,
} from '../../../localization/messageSyntax.ts';
import {
  MigrationContentRefusedError,
  MigrationResultInvalidError,
} from '../../../migration/errors.ts';
import {
  detectSchemaVersion,
  migrateProtocol,
} from '../../../migration/migrate-protocol.ts';
import {
  collectLocalizedStrings,
  collectLocalizedStringSites,
} from '../../../utils/collectLocalizedStrings.ts';
import { extractProtocol } from '../../../utils/extractProtocol.ts';
import validateProtocol from '../../../validation/validate-protocol.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';
import { getLocalizedStringDescriptor } from '../localized-string.ts';
import migrationV8toV9 from '../migration.ts';
import { withoutUnshownWording } from '../protocol-wording.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { suppliedStageSettingPaths } from '../supplied-stage-text.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import {
  asSchema8Protocol,
  codebookTypes,
  codebookVariables,
} from './schema-8-protocol.ts';

type Path = readonly (string | number)[];

const ENGLISH_ONLY = { defaultLocale: 'en', locales: ['en'] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getAt = (root: unknown, at: Path): unknown =>
  at.reduce<unknown>(
    (node, key) =>
      typeof node === 'object' && node !== null
        ? Reflect.get(node, key)
        : undefined,
    root,
  );

const setAt = (root: unknown, at: Path, value: unknown): void => {
  const parent = getAt(root, at.slice(0, -1));
  const key = at.at(-1);
  if (typeof parent !== 'object' || parent === null || key === undefined) {
    throw new Error(`No value at ${JSON.stringify(at)}`);
  }
  Reflect.set(parent, key, value);
};

const stagePath = (document: unknown, id: string): (string | number)[] => {
  const stages = getAt(document, ['stages']);
  const index = Array.isArray(stages)
    ? stages.findIndex((stage) => isRecord(stage) && stage.id === id)
    : -1;
  if (index === -1) throw new Error(`No stage "${id}"`);
  return ['stages', index];
};

const schema8Protocol = (rewrite?: (text: string) => string) =>
  asSchema8Protocol(completeProtocol(), rewrite);

const migrateStep = (document: unknown) =>
  migrationV8toV9.migrate(ProtocolSchemaV8.parse(document), {});

/**
 * Schema 8 held no label for a Narrative highlight or legend edge, so the
 * migrated label is the name of what it labels: the highlighted attribute's
 * name, and the edge type's name.
 */
// Schema 8 held an Anonymisation stage's heading as a title of its own, which
// the migration writes as the first line of the text.
const explanationBehind = (source: unknown): string | undefined =>
  isRecord(source) &&
  typeof source.title === 'string' &&
  typeof source.body === 'string'
    ? `# ${source.title}\n\n${source.body}`
    : undefined;

const nameBehindLabel = (document: unknown, at: Path): unknown => {
  const owner = getAt(document, at.slice(0, -1));
  if (at.at(-3) === 'edges' && isRecord(owner) && isRecord(owner.subject)) {
    const type = owner.subject.type;
    return typeof type === 'string'
      ? getAt(document, ['codebook', 'edge', type, 'name'])
      : undefined;
  }
  if (typeof owner !== 'string') {
    return getAt(document, [...at.slice(0, -1), 'name']);
  }
  if (at.at(-3) === 'display') {
    return getAt(document, ['codebook', 'edge', owner, 'name']);
  }
  const subject = getAt(document, [...at.slice(0, 2), 'subject', 'type']);
  if (typeof subject !== 'string') return undefined;
  return getAt(document, [
    'codebook',
    'node',
    subject,
    'variables',
    owner,
    'name',
  ]);
};

const isEnglishOnly = (value: unknown) =>
  isRecord(value) &&
  Object.keys(value).length === 1 &&
  typeof value.en === 'string';

const literalLabel = (schema: z.ZodObject): string | undefined => {
  for (const field of ['type', 'component']) {
    const fieldSchema: unknown = schema.shape[field];
    if (fieldSchema instanceof z.ZodLiteral) {
      return `${field}=${[...fieldSchema.values].join('|')}`;
    }
  }
  return undefined;
};

/**
 * Every `localizedString` declaration reachable from `root`, with a readable
 * path to it. The traversal is independent of the walker the migration uses:
 * it follows every schema a definition holds, including both sides of a pipe
 * and any intersection, so a declaration the walker cannot reach is still
 * counted.
 */
const localizedDeclarations = (root: z.ZodType): Map<z.ZodType, string> => {
  const declarations = new Map<z.ZodType, string>();
  const visited = new Set<z.ZodType>();
  const visit = (schema: unknown, where: string): void => {
    if (!(schema instanceof z.ZodType) || visited.has(schema)) return;
    visited.add(schema);
    if (getLocalizedStringDescriptor(schema)) {
      declarations.set(schema, where);
      return;
    }
    if (schema instanceof z.ZodObject) {
      const label = literalLabel(schema);
      const prefix = label === undefined ? where : `${where}[${label}]`;
      for (const [key, child] of Object.entries(schema.shape)) {
        visit(child, `${prefix}.${key}`);
      }
      visit(schema.def.catchall, `${prefix}.*`);
      return;
    }
    if (schema instanceof z.ZodLazy) {
      visit(schema.def.getter(), where);
      return;
    }
    if (schema instanceof z.ZodArray) {
      visit(schema.element, `${where}[]`);
      return;
    }
    if (schema instanceof z.ZodRecord) {
      visit(schema.valueType, `${where}{}`);
      return;
    }
    for (const value of Object.values(schema.def)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        visit(child, where);
      }
    }
  };
  visit(root, 'protocol');
  return declarations;
};

/**
 * Whether the declaration at `where` (as `localizedDeclarations` names it) is
 * of wording Network Canvas supplies, which the migration does not write: an
 * interface text, or a setting of a stage that Network Canvas words.
 */
const isSuppliedDeclaration = (where: string): boolean => {
  if (where.startsWith('protocol.interfaceText.')) return true;
  const match = /^protocol\.stages\[\]\[type=(\w+)\]\.(.+)$/.exec(where);
  return (
    match !== null &&
    suppliedStageSettingPaths(match[1] ?? '').some(
      (setting) => setting.join('.') === match[2],
    )
  );
};

/** Whether the text at `at` in `document` is wording Network Canvas supplies. */
const isSuppliedSite = (document: unknown, at: Path): boolean => {
  if (at[0] === 'interfaceText') return true;
  if (at[0] !== 'stages') return false;
  const stage = getAt(document, at.slice(0, 2));
  const type = isRecord(stage) ? stage.type : undefined;
  return (
    typeof type === 'string' &&
    suppliedStageSettingPaths(type).some(
      (setting) => setting.join('.') === at.slice(2).join('.'),
    )
  );
};

describe('v8 to v9 localization migration', () => {
  it('declares English as the only language', () => {
    expect(migrateStep(schema8Protocol())).toMatchObject({
      schemaVersion: 9,
      localization: ENGLISH_ONLY,
    });
  });

  it('wraps a value for every localized string the schema declares', () => {
    const declarations = localizedDeclarations(ProtocolSchemaV9);
    expect(declarations.size).toBeGreaterThan(0);

    const wrapped = new Set(
      collectLocalizedStringSites(
        ProtocolSchemaV9,
        migrateStep(schema8Protocol()),
      )
        .filter(({ value }) => isEnglishOnly(value))
        .map(({ schema }) => schema),
    );
    // Schema 8 has no Language Chooser, so a schema 8 document has none of
    // its text to wrap. The migration writes none of the wording Network
    // Canvas supplies (the interview shows it), so those texts are not
    // wrapped either.
    const missed = [...declarations]
      .filter(([declaration]) => !wrapped.has(declaration))
      .map(([, where]) => where)
      .filter(
        (where) =>
          !where.includes('[type=LanguageChooser]') &&
          !isSuppliedDeclaration(where),
      );
    expect(missed).toEqual([]);
  });

  it('produces the complete fixture with its copy in English', () => {
    // The fixture's interface text is compared on its own, below.
    const { interfaceText: _held, ...fixture } = completeProtocol();
    const expected: unknown = structuredClone(fixture);
    for (const {
      path: at,
      value,
      arguments: declared,
    } of collectLocalizedStrings(expected)) {
      if (declared === undefined) {
        setAt(expected, at, { en: escapeMessageText(value.en ?? '') });
      }
    }
    setAt(
      expected,
      [...stagePath(expected, 'narrative'), 'presets', 0, 'highlight', 0],
      { variable: 'flag', label: { en: 'Flag' } },
    );
    setAt(
      expected,
      [...stagePath(expected, 'narrative'), 'presets', 0, 'edges', 'display'],
      [{ type: 'knows', label: { en: 'Knows' } }],
    );
    if (!isRecord(expected) || !Array.isArray(expected.stages)) {
      throw new Error('Fixture has no stages');
    }
    expected.stages = expected.stages.filter(
      (stage) => isRecord(stage) && stage.type !== 'LanguageChooser',
    );
    expected.localization = ENGLISH_ONLY;

    // The fixture words everything in Network Canvas's English. The migration
    // writes none of that wording (the finish stage it adds holds none) and
    // keeps what a document already holds, so it gives the fixture without
    // the wording of settings it does not show. Stored by a tool that has the
    // interview's catalogue, it holds none of it.
    type Stored = Parameters<typeof withoutSuppliedWording>[0];
    const kept = withoutUnshownWording(expected as unknown as Stored);
    const migrated = migrateStep(schema8Protocol());
    expect(migrated).toEqual({
      ...kept,
      stages: kept.stages?.map((stage) =>
        isRecord(stage) && stage.type === 'FinishSession'
          ? stageWithoutSuppliedText({ ...stage, type: stage.type })
          : stage,
      ),
    });
    const stored = withoutSuppliedWording(migrated as unknown as Stored);
    expect(stored).toEqual(withoutSuppliedWording(kept));
    expect(stored).not.toHaveProperty('interfaceText');
  });

  it('migrates to a protocol schema 9 accepts', () => {
    expect(() => migrateProtocol(schema8Protocol(), 9)).not.toThrow();
  });

  it('does not change the document it is given', () => {
    const document = schema8Protocol();
    const before = structuredClone(document);
    migrateStep(document);
    expect(document).toEqual(before);
  });

  it('round-trips text that MessageFormat treats as syntax', () => {
    const special = (text: string) =>
      `${text}: {braces} it's 'quoted' '{both}' don't }{`;
    const document = schema8Protocol(special);
    const migrated = migrateProtocol(document, 9);

    // The interface text is the migration's own, not the document's, and
    // text with placeholders is new in schema 9 (see `asSchema8Protocol`).
    const hits = collectLocalizedStrings(migrated).filter(
      ({ path: at, arguments: declared }) =>
        at[0] !== 'interfaceText' && declared === undefined,
    );
    expect(hits.length).toBeGreaterThan(0);
    for (const { path: at, value } of hits) {
      // The finish stage is added by the migration, with supplied text.
      if (getAt(migrated, [...at.slice(0, 2), 'type']) === 'FinishSession') {
        continue;
      }
      const source = getAt(document, at);
      const expectedText =
        typeof source === 'string'
          ? source
          : (explanationBehind(source) ?? nameBehindLabel(document, at));
      expect(Object.keys(value)).toEqual(['en']);
      expect(messageText(value.en ?? '')).toBe(expectedText);
    }
  });

  it('joins the lines of text declared one line, and leaves text of several lines as it was', () => {
    const broken = (text: string) => `${text} \n\n second\r\nthird\u2028\n`;
    const document = schema8Protocol(broken);
    const migrated = migrateProtocol(document, 9);
    const hits = collectLocalizedStrings(migrated).filter(
      ({ path: at, arguments: declared }) =>
        at[0] !== 'interfaceText' &&
        declared === undefined &&
        typeof getAt(document, at) === 'string',
    );
    const single = hits.filter(({ lines }) => lines === 'single');
    const multiple = hits.filter(({ lines }) => lines === 'multiple');
    expect(single.length).toBeGreaterThan(0);
    expect(multiple.length).toBeGreaterThan(0);
    for (const { path: at, value } of single) {
      const source = getAt(document, at) as string;
      expect({ at, text: messageText(value.en ?? '') }).toEqual({
        at,
        text: `${source.slice(0, source.indexOf(' \n'))} second third`,
      });
    }
    for (const { path: at, value } of multiple) {
      expect({ at, text: messageText(value.en ?? '') }).toEqual({
        at,
        text: getAt(document, at),
      });
    }
  });

  // Line breaks and spaces only are blank before the join as after it, so
  // the rules on blank text settle them: a stage name is repaired, a prompt
  // is refused.
  it('names a stage whose name is only line breaks by its position', () => {
    const document = schema8Protocol();
    const stage = stagePath(document, 'information');
    setAt(document, [...stage, 'label'], '\n');
    expect(getAt(migrateStep(document), [...stage, 'label'])).toEqual({
      en: `Stage ${Number(stage[1]) + 1}`,
    });
  });

  it('refuses a prompt that is only line breaks and spaces as blank content', () => {
    const document = schema8Protocol();
    setAt(
      document,
      [...stagePath(document, 'nameGenerator'), 'prompts', 0, 'text'],
      '\n  \n',
    );
    expect(() => migrateProtocol(document, 9)).toThrow(
      MigrationContentRefusedError,
    );
  });

  it("keeps braces and the fork's {{fieldName}} literal where text may now show values", () => {
    const document = schema8Protocol(
      (text) => `${text} {{fieldName}} {name} {name, select, other {x}}`,
    );
    const migrated = migrateProtocol(document, 9);
    const sites = collectLocalizedStrings(migrated).filter(
      ({ dynamicValues }) => dynamicValues !== undefined,
    );
    expect(sites.length).toBeGreaterThan(0);
    for (const { value } of sites) {
      for (const message of Object.values(value)) {
        expect(dynamicValueNamesIn(message)).toEqual([]);
      }
    }
    expect(
      (migrated.stages as Record<string, unknown>[]).some(
        (stage) => stage.dynamicValues !== undefined,
      ),
    ).toBe(false);
  });

  it('drops the reserved marker from text that may now show values, and keeps the rest of it', () => {
    const marked = (text: string) => `${text}\uE000`;
    const document = schema8Protocol(marked);
    const plain = migrateProtocol(schema8Protocol(), 9);
    const migrated = migrateProtocol(document, 9);
    const sites = collectLocalizedStrings(migrated);
    const dynamicSites = sites.filter(
      ({ dynamicValues }) => dynamicValues !== undefined,
    );
    expect(dynamicSites.length).toBeGreaterThan(0);
    // No text is lost, optional text included: every site plain text has
    // is still there. The marked text is not Network Canvas's own wording, so
    // it is also held where plain text matched the wording and was dropped.
    const siteNames = sites.map(({ path: at }) => at.join('.'));
    const plainNames = collectLocalizedStrings(plain).map(({ path: at }) =>
      at.join('.'),
    );
    expect(siteNames.filter((name) => plainNames.includes(name))).toEqual(
      plainNames,
    );
    expect(
      sites
        .filter(({ path: at }) => !plainNames.includes(at.join('.')))
        .every(({ path: at }) => isSuppliedSite(migrated, at)),
    ).toBe(true);
    // Text that may show values reads as before.
    for (const { path: at, value } of dynamicSites) {
      const before = getAt(plain, at);
      if (before !== undefined) expect(value).toEqual(before);
    }
    // Text that cannot show values may keep the character.
    expect(
      sites.some(
        ({ dynamicValues, value }) =>
          dynamicValues === undefined &&
          Object.values(value).some((message) => message.includes('\uE000')),
      ),
    ).toBe(true);
  });

  describe('codebook labels', () => {
    it('gives no type or attribute a label', () => {
      const migrated = migrateProtocol(schema8Protocol(), 9);
      for (const definition of [
        ...codebookTypes(migrated),
        ...codebookVariables(migrated),
      ]) {
        expect(definition).not.toHaveProperty('label');
      }
    });
  });

  describe('Narrative highlights', () => {
    const presetPath = (document: unknown) => [
      ...stagePath(document, 'narrative'),
      'presets',
      0,
    ];

    it('labels each highlight with its attribute name, in English', () => {
      const document = schema8Protocol();
      const preset = presetPath(document);
      setAt(document, [...preset, 'highlight'], ['flag', 'nickname']);
      setAt(
        document,
        ['codebook', 'node', 'person', 'variables', 'nickname', 'name'],
        "Friend's {nickname}",
      );

      const migrated = migrateProtocol(document, 9);
      expect(getAt(migrated, [...preset, 'highlight'])).toEqual([
        { variable: 'flag', label: { en: 'Flag' } },
        {
          variable: 'nickname',
          label: { en: escapeMessageText("Friend's {nickname}") },
        },
      ]);
    });

    it('uses the attribute id when the attribute has no name or is missing', () => {
      const document = schema8Protocol();
      const preset = presetPath(document);
      setAt(document, [...preset, 'highlight'], ['flag', 'removed']);
      setAt(
        document,
        ['codebook', 'node', 'person', 'variables', 'flag', 'name'],
        '',
      );

      expect(getAt(migrateStep(document), [...preset, 'highlight'])).toEqual([
        { variable: 'flag', label: { en: 'flag' } },
        { variable: 'removed', label: { en: 'removed' } },
      ]);
    });

    it('labels each edge type the legend shows with its name, in English', () => {
      const document = schema8Protocol();
      const preset = presetPath(document);
      setAt(document, [...preset, 'edges', 'display'], ['knows', 'family']);
      setAt(document, ['codebook', 'edge', 'knows', 'name'], 'Knows {who}');

      expect(
        getAt(migrateProtocol(document, 9), [...preset, 'edges', 'display']),
      ).toEqual([
        { type: 'knows', label: { en: escapeMessageText('Knows {who}') } },
        { type: 'family', label: { en: 'Family' } },
      ]);
    });

    it('uses the edge type id when the edge type has no name or is missing', () => {
      const document = schema8Protocol();
      const preset = presetPath(document);
      setAt(document, [...preset, 'edges', 'display'], ['knows', 'removed']);
      setAt(document, ['codebook', 'edge', 'knows', 'name'], '');

      expect(
        getAt(migrateStep(document), [...preset, 'edges', 'display']),
      ).toEqual([
        { type: 'knows', label: { en: 'knows' } },
        { type: 'removed', label: { en: 'removed' } },
      ]);
    });

    it('leaves a preset with no highlight without one', () => {
      const document = schema8Protocol();
      const preset = presetPath(document);
      const presetDocument = getAt(document, preset);
      if (!isRecord(presetDocument)) throw new Error('Fixture has no preset');
      delete presetDocument.highlight;

      const migrated = migrateProtocol(document, 9);
      expect(getAt(migrated, preset)).not.toHaveProperty('highlight');
    });
  });

  describe('Network Composer captions', () => {
    const composerPath = (document: unknown) => stagePath(document, 'composer');
    const nodeFieldPath = (document: unknown, index: number) => [
      ...composerPath(document),
      'nodeForm',
      'fields',
      index,
    ];
    const edgeFieldPath = (document: unknown) => [
      ...composerPath(document),
      'edges',
      0,
      'form',
      'fields',
      0,
    ];
    const removeCaption = (document: unknown, at: Path) => {
      const field = getAt(document, at);
      if (!isRecord(field)) throw new Error('Fixture has no composer field');
      delete field.label;
    };

    it('captions a node field that has none with its attribute name, in English', () => {
      const document = schema8Protocol();
      const field = nodeFieldPath(document, 1);
      removeCaption(document, field);

      expect(getAt(migrateProtocol(document, 9), [...field, 'label'])).toEqual({
        en: 'Nickname',
      });
    });

    it('labels each edge type with its name, in English', () => {
      const document = schema8Protocol();
      setAt(document, ['codebook', 'edge', 'knows', 'name'], 'Knows {who}');

      expect(
        getAt(migrateProtocol(document, 9), [
          ...composerPath(document),
          'edges',
          0,
          'label',
        ]),
      ).toEqual({ en: escapeMessageText('Knows {who}') });
    });

    it('captions an edge field with the attribute name its edge type gives', () => {
      const document = schema8Protocol();
      const field = edgeFieldPath(document);
      removeCaption(document, field);

      expect(getAt(migrateProtocol(document, 9), [...field, 'label'])).toEqual({
        en: 'Note',
      });
    });

    // A caption left out gets the name the interview showed; a caption given
    // as nothing is the researcher's own blank content, and is refused.
    const refusalOf = (document: unknown) => {
      try {
        migrateProtocol(document, 9);
      } catch (error) {
        if (error instanceof MigrationContentRefusedError) return error;
        throw error;
      }
      throw new Error('Expected the migration to refuse the protocol');
    };

    it.each([
      ['empty', ''],
      ['only spaces', '   '],
    ])(
      'refuses a node field caption that is %s, naming the field',
      (_, blank) => {
        const document = schema8Protocol();
        const field = nodeFieldPath(document, 0);
        setAt(document, [...field, 'label'], blank);

        const refusal = refusalOf(document);
        expect(refusal.problems.map((problem) => problem.path)).toEqual([
          ['stages', expect.any(Number), ...field.slice(2), 'label', 'en'],
        ]);
        expect(refusal.problems[0]?.place).toMatch(
          /^Stage “.+”, node form, the label of field 1$/,
        );
      },
    );

    it('refuses an edge field caption of only spaces, naming the edge type', () => {
      const document = schema8Protocol();
      const field = edgeFieldPath(document);
      setAt(document, [...field, 'label'], ' ');

      expect(refusalOf(document).problems[0]?.place).toMatch(
        /^Stage “.+”, form for edge type “.+”, the label of field 1$/,
      );
    });

    it('keeps a caption the field already has', () => {
      const document = schema8Protocol();
      const field = nodeFieldPath(document, 1);

      expect(getAt(migrateProtocol(document, 9), [...field, 'label'])).toEqual({
        en: 'Nickname?',
      });
    });

    it('uses the attribute id when the attribute has no name or is missing', () => {
      const document = schema8Protocol();
      const named = nodeFieldPath(document, 1);
      const missing = nodeFieldPath(document, 0);
      removeCaption(document, named);
      removeCaption(document, missing);
      setAt(
        document,
        ['codebook', 'node', 'person', 'variables', 'nickname', 'name'],
        '',
      );
      setAt(document, [...missing, 'variable'], 'removed');

      const migrated = migrateStep(document);
      expect(getAt(migrated, [...named, 'label'])).toEqual({ en: 'nickname' });
      expect(getAt(migrated, [...missing, 'label'])).toEqual({
        en: 'removed',
      });
    });

    it('escapes the attribute name so markdown shows it as written', () => {
      const document = schema8Protocol();
      const field = nodeFieldPath(document, 1);
      removeCaption(document, field);
      setAt(
        document,
        ['codebook', 'node', 'person', 'variables', 'nickname', 'name'],
        '*first_name* {nick}',
      );

      const label = getAt(migrateStep(document), [...field, 'label']);
      expect(label).toEqual({
        en: escapeMessageText('\\*first\\_name\\* {nick}'),
      });
    });
  });

  describe('blank form field prompts', () => {
    const fieldPath = (document: unknown, id: string, form: Path) => [
      ...stagePath(document, id),
      ...form,
      'fields',
      0,
    ];
    const alterField = (document: unknown) =>
      fieldPath(document, 'alterForm', ['form']);
    const promptOf = (document: unknown, at: Path) =>
      getAt(migrateProtocol(document, 9), [...at, 'prompt']);

    // The places schema 9 reports. The migration may add stages before the
    // field's, so its stage index is not compared.
    const refusedAt = (document: unknown, field: Path) => {
      let paths: Path[] = [];
      try {
        migrateProtocol(document, 9);
      } catch (error) {
        if (!(error instanceof MigrationResultInvalidError)) throw error;
        paths = error.issues.map((issue) => issue.path);
      }
      const [, , ...below] = field;
      expect(paths).toContainEqual([
        'stages',
        expect.any(Number),
        ...below,
        'prompt',
        'en',
      ]);
    };

    // A form field's question is the protocol's own content, which the
    // migration never writes, so the document is refused at the question.
    it.each([
      ['an empty prompt', ''],
      ['a prompt of spaces', '   '],
      ['a prompt of tabs and line breaks', '\t\n '],
      ['a prompt of non-breaking spaces', '\u00a0\u00a0'],
      ['a prompt of zero-width spaces', '\u200b\u200b'],
    ])('refuses %s at the question', (_name, blank) => {
      const document = schema8Protocol();
      const field = alterField(document);
      setAt(document, [...field, 'prompt'], blank);

      refusedAt(document, field);
    });

    it.each([
      ['an ego form', 'egoForm'],
      ['a name generator form', 'nameGenerator'],
      ['an edge form', 'alterEdgeForm'],
    ])('does so in %s', (_name, id) => {
      const document = schema8Protocol();
      const field = fieldPath(document, id, ['form']);
      setAt(document, [...field, 'prompt'], ' ');

      refusedAt(document, field);
    });

    it('keeps a prompt with text in it, spaces around the text included', () => {
      const document = schema8Protocol();
      const field = alterField(document);
      setAt(document, [...field, 'prompt'], '  Nickname?  ');

      expect(promptOf(document, field)).toEqual({ en: '  Nickname?  ' });
    });

    it('tells the researcher in the migration notes', () => {
      expect(migrationV8toV9.notes).toContain(
        'A protocol cannot be upgraded while',
      );
    });

    // A Network Composer field's caption is the form's question for that
    // field: given as nothing, it is refused like a blank prompt.
    it('refuses a Network Composer field whose caption is only spaces', () => {
      const document = schema8Protocol();
      const field = [
        ...stagePath(document, 'composer'),
        'nodeForm',
        'fields',
        1,
      ];
      setAt(document, [...field, 'label'], '   ');

      expect(() => migrateProtocol(document, 9)).toThrow(
        MigrationContentRefusedError,
      );
    });
  });

  describe('empty text', () => {
    // Every text a participant sees must say something, so an empty hint,
    // which showed nothing, is left out rather than kept as data.
    it('leaves out an empty hint', () => {
      const document = schema8Protocol();
      const field = [...stagePath(document, 'egoForm'), 'form', 'fields', 0];
      setAt(document, [...field, 'hint'], '');

      const migrated = migrateProtocol(document, 9);
      expect(getAt(migrated, field)).not.toHaveProperty('hint');
    });

    // A participant chooses between options by their labels, so an empty one
    // takes the option's value, which schema 8 accepted and schema 9 needs.
    it('gives an empty option label the option value', () => {
      const document = schema8Protocol();
      const option = [
        'codebook',
        'node',
        'person',
        'variables',
        'category',
        'options',
        0,
        'label',
      ];
      setAt(document, option, '');

      expect(getAt(migrateProtocol(document, 9), option)).toEqual({
        en: 'friend',
      });
    });

    it('leaves out an optional field that may not be empty', () => {
      const document = schema8Protocol();
      const prompt = [...stagePath(document, 'categoricalBin'), 'prompts', 0];
      setAt(document, [...prompt, 'otherVariable'], undefined);
      setAt(document, [...prompt, 'otherOptionLabel'], undefined);
      setAt(document, [...prompt, 'otherVariablePrompt'], '');

      const migrated = migrateProtocol(document, 9);
      expect(getAt(migrated, prompt)).not.toHaveProperty('otherVariablePrompt');
    });

    it('gives an empty stage name "Stage" and its position', () => {
      const document = schema8Protocol();
      const stage = stagePath(document, 'information');
      const label = [...stage, 'label'];
      setAt(document, label, '');

      expect(getAt(migrateProtocol(document, 9), label)).toEqual({
        en: `Stage ${Number(stage.at(-1)) + 1}`,
      });
    });
  });

  describe('values other than strings', () => {
    it('drops a scale end label of another type from a Network Composer field', () => {
      const document = schema8Protocol();
      const parameters = [
        ...stagePath(document, 'composer'),
        'nodeForm',
        'fields',
        0,
        'parameters',
      ];
      setAt(document, parameters, { minLabel: 5, maxLabel: null, step: 5 });

      expect(getAt(migrateProtocol(document, 9), parameters)).toEqual({
        step: 5,
      });
    });

    it('leaves end labels on any other composer control as they were', () => {
      const document = schema8Protocol();
      const parameters = [
        ...stagePath(document, 'composer'),
        'nodeForm',
        'fields',
        1,
        'parameters',
      ];
      setAt(document, parameters, { minLabel: 'Low', maxLabel: 3 });

      expect(getAt(migrateProtocol(document, 9), parameters)).toEqual({
        minLabel: 'Low',
        maxLabel: 3,
      });
    });

    it('leaves a value schema 8 already rejected for validation to report', () => {
      const document = schema8Protocol();
      const text = [...stagePath(document, 'ordinalBin'), 'prompts', 0, 'text'];
      setAt(document, text, 5);

      expect(getAt(migrateStep(document), text)).toBe(5);
      expect(() => migrateProtocol(document, 9)).toThrow(
        MigrationResultInvalidError,
      );
    });
  });

  /**
   * Fresco's deploy normalization numbers a row stored at schema 9 as schema
   * 8 and runs this step over it again, so a document whose copy is already
   * localized must come through with its languages and text unchanged.
   */
  describe('a document already in schema 9 form', () => {
    const FRENCH_AND_GERMAN = { defaultLocale: 'fr', locales: ['fr', 'de'] };

    const inFrenchAndGerman = () => {
      const document: unknown = {
        ...completeProtocol(),
        schemaVersion: 8,
        localization: FRENCH_AND_GERMAN,
      };
      for (const { path: at, value } of collectLocalizedStrings(document)) {
        setAt(document, at, {
          fr: `${value.en ?? ''} (fr)`,
          de: `${value.en ?? ''} (de)`,
        });
      }
      return document;
    };

    it('keeps the languages it declares', () => {
      expect(migrateStep(inFrenchAndGerman())).toMatchObject({
        localization: FRENCH_AND_GERMAN,
      });
    });

    it('keeps its text in every language, scale end labels included', () => {
      const document = inFrenchAndGerman();
      const text = collectLocalizedStrings(document);
      expect(text.map(({ path: at }) => at.at(-1))).toContain('minLabel');

      // The step keeps all of it, but the wording of a setting its stage does
      // not show (a gender identity label with the question off).
      expect(collectLocalizedStrings(migrateStep(document))).toEqual(
        text.filter(({ path: at }) => at.at(-1) !== 'genderIdentityLabel'),
      );
    });

    it('migrates to a protocol schema 9 accepts', () => {
      expect(() => migrateProtocol(inFrenchAndGerman(), 9)).not.toThrow();
    });

    it('records text it still holds as a string in its default language', () => {
      const document = inFrenchAndGerman();
      const title = [...stagePath(document, 'information'), 'title'];
      setAt(document, title, 'Bienvenue');

      expect(getAt(migrateStep(document), title)).toEqual({
        fr: 'Bienvenue',
      });
    });
  });
});

/**
 * Every committed protocol at schema 8 or older, brought to schema 8 the way
 * an import does and then migrated to schema 9. The schema 8 documents are
 * what hosts hold today, so each must come out valid, with every localized
 * string in English and nothing else about its structure
 * changed.
 */
describe('committed schema 8 protocols', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../../../../../..');
  const corpusRoots = [
    'packages/protocols',
    'apps/networkcanvas.com/public/protocols',
  ];
  const corpusFiles = corpusRoots
    .flatMap((root) =>
      readdirSync(path.join(repoRoot, root), { recursive: true })
        .filter((entry): entry is string => typeof entry === 'string')
        .filter((entry) => entry.endsWith('.netcanvas'))
        .map((entry) => path.join(root, entry)),
    )
    .toSorted();

  const stageOutline = (document: unknown) => {
    const stages = getAt(document, ['stages']);
    return Array.isArray(stages)
      ? stages.map((stage) =>
          isRecord(stage) ? { id: stage.id, type: stage.type } : undefined,
        )
      : [];
  };

  const stageOutlineWithIntroductions = (document: unknown) => {
    const stages = getAt(document, ['stages']);
    if (!Array.isArray(stages)) return [];
    return stages.flatMap((stage) => {
      if (!isRecord(stage)) return [undefined];
      const outline = { id: stage.id, type: stage.type };
      if (!isRecord(stage.introductionPanel) || stage.type === 'EgoForm') {
        return [outline];
      }
      return [
        { id: `${String(stage.id)}-introduction`, type: 'Information' },
        outline,
      ];
    });
  };

  // Stages move when an introduction is inserted before them, so a migrated
  // site is compared with the schema 8 stage of the same id.
  const schema8PathOf = (
    migrated: unknown,
    schema8: unknown,
    at: readonly (string | number)[],
  ): (string | number)[] => {
    if (at[0] !== 'stages' || typeof at[1] !== 'number') return [...at];
    const id = getAt(migrated, ['stages', at[1], 'id']);
    const stages = getAt(schema8, ['stages']);
    const index = Array.isArray(stages)
      ? stages.findIndex((stage) => isRecord(stage) && stage.id === id)
      : -1;
    return index === -1 ? ['missing'] : ['stages', index, ...at.slice(2)];
  };

  it('discovered the committed protocols', () => {
    expect(corpusFiles.length).toBeGreaterThan(0);
  });

  it.for(corpusFiles)(
    '%s migrates from schema 8 to a valid schema 9 protocol',
    { timeout: 60_000 },
    async (file, { skip }) => {
      const { protocol } = await extractProtocol(
        readFileSync(path.join(repoRoot, file)),
      );
      if (detectSchemaVersion(protocol) > 8) skip('already schema 9 or later');

      const schema8 = migrateProtocol(protocol, 8, {
        name: path.basename(file, '.netcanvas'),
      });
      const migrated = migrateProtocol(schema8, 9);

      const result = await validateProtocol(migrated);
      expect(
        result.success,
        JSON.stringify(result.error?.issues, null, 2),
      ).toBe(true);
      expect(migrated.localization).toEqual(ENGLISH_ONLY);
      // Every stage is kept, in order, each introduction panel but an Ego
      // Form's becomes the Information stage just before its stage, and the
      // finish stage follows them.
      expect(stageOutline(migrated)).toEqual([
        ...stageOutlineWithIntroductions(schema8),
        { id: 'finish', type: 'FinishSession' },
      ]);
      expect(Object.keys(migrated.codebook.node ?? {})).toEqual(
        Object.keys(getAt(schema8, ['codebook', 'node']) ?? {}),
      );

      for (const { path: at, value, lines } of collectLocalizedStrings(
        migrated,
      )) {
        expect(Object.keys(value)).toEqual(['en']);
        const source = getAt(schema8, schema8PathOf(migrated, schema8, at));
        if (typeof source === 'string') {
          // Text declared one line has its lines joined.
          expect(messageText(value.en ?? '')).toBe(
            lines === 'single' ? asOneLine(source) : source,
          );
        }
      }
    },
  );
});
