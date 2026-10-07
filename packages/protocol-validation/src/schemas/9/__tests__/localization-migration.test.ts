import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  escapeMessageText,
  messageText,
} from '../../../localization/messageSyntax.ts';
import { MigrationResultInvalidError } from '../../../migration/errors.ts';
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
import ProtocolSchemaV9 from '../schema.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import {
  asSchema8Protocol,
  codebookTypes,
  codebookVariables,
} from './schema-8-protocol.ts';

type Path = readonly (string | number)[];

const UNDETERMINED = { defaultLocale: 'und', locales: ['und'] };

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
 * Schema 8 held no label for a codebook definition or a Narrative highlight,
 * so the migrated label is the name of what it labels: the sibling `name` of
 * a codebook definition, and the highlighted attribute's name.
 */
const nameBehindLabel = (document: unknown, at: Path): unknown => {
  const owner = getAt(document, at.slice(0, -1));
  if (typeof owner !== 'string') {
    return getAt(document, [...at.slice(0, -1), 'name']);
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

const isUndeterminedOnly = (value: unknown) =>
  isRecord(value) &&
  Object.keys(value).length === 1 &&
  typeof value.und === 'string';

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

describe('v8 to v9 localization migration', () => {
  it('declares the undetermined language as the only language', () => {
    expect(migrateStep(schema8Protocol())).toMatchObject({
      schemaVersion: 9,
      localization: UNDETERMINED,
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
        .filter(({ value }) => isUndeterminedOnly(value))
        .map(({ schema }) => schema),
    );
    const missed = [...declarations]
      .filter(([declaration]) => !wrapped.has(declaration))
      .map(([, where]) => where);
    expect(missed).toEqual([]);
  });

  it('produces the complete fixture with its copy in the undetermined language', () => {
    const expected: unknown = structuredClone(completeProtocol());
    for (const { path: at, value } of collectLocalizedStrings(expected)) {
      setAt(expected, at, { und: escapeMessageText(value.en ?? '') });
    }
    for (const definition of codebookTypes(expected)) {
      definition.label = { und: definition.name };
    }
    for (const definition of codebookVariables(expected)) {
      definition.label = definition.name;
    }
    setAt(
      expected,
      [...stagePath(expected, 'narrative'), 'presets', 0, 'highlight', 0],
      { variable: 'flag', label: { und: 'Flag' } },
    );
    if (!isRecord(expected) || !Array.isArray(expected.stages)) {
      throw new Error('Fixture has no stages');
    }
    expected.stages = expected.stages.filter(
      (stage) => isRecord(stage) && stage.type !== 'LanguageChooser',
    );
    expected.localization = UNDETERMINED;

    expect(migrateStep(schema8Protocol())).toEqual(expected);
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

    const hits = collectLocalizedStrings(migrated);
    expect(hits.length).toBeGreaterThan(0);
    for (const { path: at, value } of hits) {
      const source = getAt(document, at);
      const expectedText =
        typeof source === 'string' ? source : nameBehindLabel(document, at);
      expect(Object.keys(value)).toEqual(['und']);
      expect(messageText(value.und ?? '')).toBe(expectedText);
    }
  });

  describe('codebook labels', () => {
    it('starts each type label as the name participants already saw', () => {
      const document = schema8Protocol();
      setAt(
        document,
        ['codebook', 'node', 'person', 'name'],
        "Friend's {circle}",
      );
      const label = getAt(migrateProtocol(document, 9), [
        'codebook',
        'node',
        'person',
        'label',
      ]);
      expect(label).toEqual({ und: escapeMessageText("Friend's {circle}") });
      expect(isRecord(label) && messageText(String(label.und))).toBe(
        "Friend's {circle}",
      );
    });

    it('uses the codebook key for a type with no name', () => {
      const document = schema8Protocol();
      setAt(document, ['codebook', 'edge', 'knows', 'name'], '');
      expect(
        getAt(migrateStep(document), ['codebook', 'edge', 'knows', 'label']),
      ).toEqual({ und: 'knows' });
    });

    it('starts each attribute label as its name, as plain text', () => {
      const document = schema8Protocol();
      const variable = ['codebook', 'node', 'person', 'variables', 'nickname'];
      setAt(document, [...variable, 'name'], "Friend's {nickname}");
      expect(getAt(migrateProtocol(document, 9), [...variable, 'label'])).toBe(
        "Friend's {nickname}",
      );
    });

    it('uses the codebook key for an attribute with no name', () => {
      const document = schema8Protocol();
      const variable = ['codebook', 'ego', 'variables', 'egoName'];
      setAt(document, [...variable, 'name'], '');
      expect(getAt(migrateStep(document), [...variable, 'label'])).toBe(
        'egoName',
      );
    });

    it('keeps a label a document already carries', () => {
      const document = schema8Protocol();
      const variable = ['codebook', 'ego', 'variables', 'egoName'];
      setAt(document, [...variable, 'label'], 'Your name');
      expect(getAt(migrateStep(document), [...variable, 'label'])).toBe(
        'Your name',
      );
    });
  });

  describe('Narrative highlights', () => {
    const presetPath = (document: unknown) => [
      ...stagePath(document, 'narrative'),
      'presets',
      0,
    ];

    it('labels each highlight with its attribute name, in the undetermined language', () => {
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
        { variable: 'flag', label: { und: 'Flag' } },
        {
          variable: 'nickname',
          label: { und: escapeMessageText("Friend's {nickname}") },
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
        { variable: 'flag', label: { und: 'flag' } },
        { variable: 'removed', label: { und: 'removed' } },
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

    it('captions a node field that has none with its attribute name, in the undetermined language', () => {
      const document = schema8Protocol();
      const field = nodeFieldPath(document, 1);
      removeCaption(document, field);

      expect(getAt(migrateProtocol(document, 9), [...field, 'label'])).toEqual({
        und: 'Nickname',
      });
    });

    it('captions an edge field with the attribute name its edge type gives', () => {
      const document = schema8Protocol();
      const field = edgeFieldPath(document);
      removeCaption(document, field);

      expect(getAt(migrateProtocol(document, 9), [...field, 'label'])).toEqual({
        und: 'Note',
      });
    });

    it('replaces an empty caption rather than leaving the field without one', () => {
      const document = schema8Protocol();
      const field = nodeFieldPath(document, 0);
      setAt(document, [...field, 'label'], '');

      expect(getAt(migrateProtocol(document, 9), [...field, 'label'])).toEqual({
        und: 'Closeness',
      });
    });

    it('keeps a caption the field already has', () => {
      const document = schema8Protocol();
      const field = nodeFieldPath(document, 1);

      expect(getAt(migrateProtocol(document, 9), [...field, 'label'])).toEqual({
        und: 'Nickname?',
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
      expect(getAt(migrated, [...named, 'label'])).toEqual({ und: 'nickname' });
      expect(getAt(migrated, [...missing, 'label'])).toEqual({
        und: 'removed',
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
        und: escapeMessageText('\\*first\\_name\\* {nick}'),
      });
    });
  });

  describe('empty text', () => {
    it('keeps empty text where the field accepts it', () => {
      const document = schema8Protocol();
      const field = [...stagePath(document, 'egoForm'), 'form', 'fields', 0];
      setAt(document, [...field, 'hint'], '');
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

      const migrated = migrateProtocol(document, 9);
      expect(getAt(migrated, [...field, 'hint'])).toEqual({ und: '' });
      expect(getAt(migrated, option)).toEqual({ und: '' });
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

    it('wraps a required field that may not be empty, so validation reports it', () => {
      const document = schema8Protocol();
      const label = [...stagePath(document, 'information'), 'label'];
      setAt(document, label, '');

      expect(getAt(migrateStep(document), label)).toEqual({ und: '' });
      expect(() => migrateProtocol(document, 9)).toThrow(
        MigrationResultInvalidError,
      );
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
});

/**
 * Every committed protocol at schema 8 or older, brought to schema 8 the way
 * an import does and then migrated to schema 9. The schema 8 documents are
 * what hosts hold today, so each must come out valid, with every localized
 * string in the undetermined language and nothing else about its structure
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
      expect(migrated.localization).toEqual(UNDETERMINED);
      expect(stageOutline(migrated)).toEqual(stageOutline(schema8));
      expect(Object.keys(migrated.codebook.node ?? {})).toEqual(
        Object.keys(getAt(schema8, ['codebook', 'node']) ?? {}),
      );

      for (const { path: at, value } of collectLocalizedStrings(migrated)) {
        expect(Object.keys(value)).toEqual(['und']);
        const source = getAt(schema8, at);
        if (typeof source === 'string') {
          expect(messageText(value.und ?? '')).toBe(source);
        }
      }
    },
  );
});
