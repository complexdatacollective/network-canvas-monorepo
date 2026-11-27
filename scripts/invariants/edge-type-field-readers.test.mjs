import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from '@typescript/typescript6';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * Whether an edge type is directed, and which node types it connects, is read
 * only through the helpers in
 * `packages/protocol-validation/src/utils/edgeTypeRules.ts`, so the meaning of
 * an absent setting is decided in one place. This guard parses every
 * workspace's source and fails for any file outside the allow-list that reads
 * `directed` or `endpointRules`: as a property (`.directed`, `?.directed`), by
 * destructuring (declarations, parameters, and assignments at any depth,
 * including a `for...of` head), or by naming the field in a string. A string
 * is judged by the field name, not by the call around it, so `['directed']`,
 * `in`, `Object.hasOwn`, `Reflect.get`, lodash `get` with a key, an array path
 * or a dotted path, and a constant that later indexes an object are all reads.
 * Declaring the fields in a type, writing them as the keys of an object
 * literal or class, and a sentence that mentions them are not reads.
 *
 * The allow-list names the helpers, the codebook check that validates the
 * fields, the stage support table (which reads its own entries, named after
 * the fields), the schema 8 to 9 migration (which removes them) and the
 * SyntheticInterview writer. Later work adds only files that read or write
 * the codebook fields themselves. A file that uses either word for something
 * else, such as a GraphML attribute name, is not allow-listed: its exact
 * string is listed for that file alone in `PERMITTED_LITERALS`, and every
 * other read in the file is still flagged. Every allow-listed file must still
 * read a field, and every permitted string must still be in its file, so a
 * stale entry fails.
 *
 * It lives at the repository root, not in a package, so that a change to any
 * workspace re-runs it: the `//#test:invariants` turbo task lists every
 * workspace's source and `pnpm-workspace.yaml` as its inputs.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ALLOWED_FILES = new Set([
  'packages/protocol-validation/src/utils/edgeTypeRules.ts',
  'packages/protocol-validation/src/schemas/9/codebook/codebook.ts',
  'packages/protocol-validation/src/schemas/9/stage-capabilities.ts',
  // Removes both fields from every edge type a schema 8 file carries.
  'packages/protocol-validation/src/schemas/9/migration.ts',
  'packages/protocol-utilities/src/SyntheticInterview.ts',
]);

/**
 * Strings that name a field but mean something else, by file. A string
 * literal is skipped only when its whole text is listed for the file it is in.
 */
const PERMITTED_LITERALS = new Map([
  [
    // The GraphML attribute that marks one edge as directed
    // (`setAttribute('directed', 'true')`). Whether the edge type is directed
    // is still read through `isDirectedEdgeType`.
    'packages/network-exporters/src/formatters/graphml/generateDataElements.ts',
    new Set(['directed']),
  ],
]);

const EXCLUDED_WORKSPACES = new Set([
  'apps/architect-classic',
  'apps/interviewer-classic',
  // The vendored schema 8 Fresco, kept as it shipped.
  'apps/fresco/schema-8',
]);

/** Directories a scan must not walk into: output, caches and installed code. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'storybook-static',
  'test-results',
  'playwright-report',
  '.turbo',
  '.next',
  '.source',
  '.netlify',
  '.wrangler',
  '.output',
  '.git',
  '__tests__',
  '__mocks__',
]);

const FIELDS = new Set(['directed', 'endpointRules']);

const isTestFile = (name) => /\.(test|spec)\.tsx?$/.test(name);
const isSourceFile = (name) =>
  /\.tsx?$/.test(name) && !name.endsWith('.d.ts') && !isTestFile(name);

const propertyNameText = (name) =>
  name !== undefined &&
  (ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name))
    ? name.text
    : undefined;

// Whether a dot-separated path names a field: `'directed'`, `'edge.x.directed'`.
const pathNamesField = (text) =>
  text.split('.').some((segment) => FIELDS.has(segment));

/**
 * Whether an object or array literal is the target of an assignment, so its
 * properties are read rather than written: the left of `=`, the head of a
 * `for...of` or `for...in`, or nested inside such a target.
 */
const isAssignmentTarget = (node) => {
  const { parent } = node;
  if (parent === undefined) return false;
  if (ts.isParenthesizedExpression(parent)) return isAssignmentTarget(parent);
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    return parent.left === node || isAssignmentTarget(parent);
  }
  if (
    (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) &&
    parent.initializer === node
  ) {
    return true;
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    return isAssignmentTarget(parent.parent);
  }
  if (
    ts.isArrayLiteralExpression(parent) ||
    ts.isSpreadElement(parent) ||
    ts.isSpreadAssignment(parent)
  ) {
    return isAssignmentTarget(parent);
  }
  return false;
};

const isInTypePosition = (node) => {
  for (let at = node.parent; at !== undefined; at = at.parent) {
    if (ts.isTypeNode(at) || ts.isInterfaceDeclaration(at)) return true;
  }
  return false;
};

/**
 * Whether a string naming a field is a name the code writes rather than reads:
 * a module specifier, or the key of an object literal or class member that is
 * not a destructuring target.
 */
const isWrittenName = (node) => {
  const { parent } = node;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) {
    return parent.moduleSpecifier === node;
  }
  const keyOwner = ts.isComputedPropertyName(parent) ? parent.parent : parent;
  if (
    (ts.isPropertyAssignment(keyOwner) ||
      ts.isMethodDeclaration(keyOwner) ||
      ts.isPropertyDeclaration(keyOwner) ||
      ts.isGetAccessorDeclaration(keyOwner) ||
      ts.isSetAccessorDeclaration(keyOwner)) &&
    keyOwner.name === (keyOwner === parent ? node : parent)
  ) {
    return !(
      ts.isObjectLiteralExpression(keyOwner.parent) &&
      isAssignmentTarget(keyOwner.parent)
    );
  }
  return false;
};

/**
 * A field named in a string, wherever the string is used: an element access,
 * a key test, an accessor such as `Reflect.get` or lodash `get`, a path, a
 * computed destructuring key, or a constant that later indexes an object.
 */
const namesFieldInString = (node) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return pathNamesField(node.text);
  }
  if (ts.isTemplateExpression(node)) {
    return [
      node.head,
      ...node.templateSpans.map(({ literal }) => literal),
    ].some(({ text }) => pathNamesField(text));
  }
  return false;
};

const isPermittedLiteral = (node, permitted) =>
  (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
  permitted.has(node.text);

const readsField = (node, permitted) => {
  if (ts.isPropertyAccessExpression(node)) return FIELDS.has(node.name.text);
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    return FIELDS.has(propertyNameText(node.propertyName ?? node.name));
  }
  if (ts.isObjectLiteralExpression(node) && isAssignmentTarget(node)) {
    return node.properties.some((property) =>
      FIELDS.has(propertyNameText(property.name)),
    );
  }
  if (namesFieldInString(node)) {
    return (
      !isInTypePosition(node) &&
      !isWrittenName(node) &&
      !isPermittedLiteral(node, permitted)
    );
  }
  return false;
};

const parseSource = (source, fileName) =>
  ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

/**
 * Whether this source reads `directed` or `endpointRules`. `repoPath` picks
 * the strings that `permittedLiterals` permits in this file.
 */
const readsEdgeTypeField = (
  source,
  repoPath = 'source.ts',
  permittedLiterals = PERMITTED_LITERALS,
) => {
  const permitted = permittedLiterals.get(repoPath) ?? new Set();
  const visit = (node) =>
    readsField(node, permitted) || ts.forEachChild(node, visit);
  return visit(parseSource(source, repoPath)) === true;
};

/** The text of every string literal in a source. */
const stringLiteralsIn = (source, fileName) => {
  const found = new Set();
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      found.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parseSource(source, fileName));
  return found;
};

/**
 * Each permitted string that its file no longer contains as a string literal,
 * as `[repoPath, literal]`. A missing file makes every string listed for it
 * stale.
 */
const stalePermittedLiterals = (permittedLiterals, readSource) =>
  [...permittedLiterals].flatMap(([repoPath, literals]) => {
    const source = readSource(repoPath);
    const present =
      source === undefined ? new Set() : stringLiteralsIn(source, repoPath);
    return [...literals]
      .filter((literal) => !present.has(literal))
      .map((literal) => [repoPath, literal]);
  });

const readRepoSource = (repoPath) => {
  const path = join(repoRoot, repoPath);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
};

const toRepoPath = (path) => relative(repoRoot, path).split(sep).join('/');

/** The workspace roots `pnpm-workspace.yaml` names, as globs and as folders. */
const workspaceRoots = () => {
  const { packages } = parse(
    readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'),
  );
  return packages.map((glob) => {
    if (!glob.endsWith('/*'))
      return { glob, directories: [join(repoRoot, glob)] };
    const parent = join(repoRoot, glob.slice(0, -2));
    const directories = existsSync(parent)
      ? readdirSync(parent, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name),
          )
          .map((entry) => join(parent, entry.name))
      : [];
    return { glob, directories };
  });
};

const sourceFilesUnder = (directory) => {
  if (EXCLUDED_WORKSPACES.has(toRepoPath(directory))) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourceFilesUnder(path);
    }
    return entry.isFile() && isSourceFile(entry.name) ? [path] : [];
  });
};

const scanned = new Map(
  workspaceRoots().map(({ glob, directories }) => [
    glob,
    [...new Set(directories.flatMap(sourceFilesUnder))],
  ]),
);

const readers = [...new Set([...scanned.values()].flat())]
  .map(toRepoPath)
  .filter((repoPath) =>
    readsEdgeTypeField(
      readFileSync(join(repoRoot, repoPath), 'utf8'),
      repoPath,
    ),
  );

describe('edge type field readers', () => {
  it.each([
    'const d = definition.directed;',
    'const d = codebook.edge?.[type]?.directed;',
    "const d = definition['endpointRules'];",
    'const d = definition[`directed`];',
    'const { directed } = codebook.edge[type];',
    'const { endpointRules = [] } = definition ?? {};',
    'const { directed: isDirected } = definition;',
    "const { 'endpointRules': rules } = definition;",
    'const {\n  name,\n  directed,\n} = definition;',
    'function f({ directed }: EdgeDefinition) { return directed; }',
    'const f = ({ endpointRules }) => endpointRules;',
    'let directed; ({ directed } = definition);',
    "const d = 'directed' in definition;",
    "const d = Object.hasOwn(definition, 'endpointRules');",
    "const d = definition.hasOwnProperty('directed');",
    "const d = Object.prototype.hasOwnProperty.call(definition, 'directed');",
    "const d = Reflect.has(definition, 'endpointRules');",
    "const d = Reflect.get(definition, 'directed');",
    "const d = get(definition, 'directed', false);",
    "const d = get(definition, 'endpointRules', []);",
    "const d = get(codebook, ['edge', type, 'directed']);",
    "const d = get(codebook, 'edge.knows.endpointRules');",
    'const d = get(codebook, `edge.${type}.directed`);',
    "const { ['directed']: d } = definition;",
    'let d; ({ a: { directed: d } } = wrapper);',
    'let d; [{ directed: d }] = list;',
    'let d; [{ directed: d } = {}] = list;',
    'let endpointRules; for ({ endpointRules } of definitions) {}',
    "let d; ({ ['endpointRules']: d } = definition);",
    "const d = Object.keys(definition).includes('directed');",
    "const KEY = 'directed'; const d = definition[KEY];",
    "const d = pick(definition, ['directed', 'endpointRules']);",
    "const d = Object.entries(definition).find(([k]) => k === 'directed');",
    "const f = (key: string) => { switch (key) { case 'endpointRules': return 1; } };",
  ])('flags the read %j', (source) => {
    expect(readsEdgeTypeField(source)).toBe(true);
  });

  it.each([
    'type EdgeDefinition = { directed?: true; endpointRules?: Rule[] };',
    'const definition = { name: "Knows", directed: true };',
    'const message = "Edge type is directed and has endpointRules";',
    '// definition.directed is read through the helpers',
    'const directed = isDirectedEdgeType(codebook, type);',
    'type R = EdgeDefinition["endpointRules"];',
    "interface EdgeDefinition { 'directed'?: true }",
    "type Key = 'directed' | 'endpointRules';",
    "const definition = { 'directed': true, ['endpointRules']: [] };",
    "class Edge { 'directed' = true; }",
    "import directed from 'directed';",
    'const message = `Edge type "${name}" is directed, which this stage cannot use.`;',
    "const message = 'The edge type is directed.';",
    'let d; d = { directed: true };',
  ])('does not flag %j', (source) => {
    expect(readsEdgeTypeField(source)).toBe(false);
  });

  describe('permitted literals', () => {
    const exporterFile = 'packages/elsewhere/src/graphml.ts';
    const otherFile = 'packages/elsewhere/src/other.ts';
    const permitted = new Map([[exporterFile, new Set(['directed'])]]);

    it('a permitted literal is skipped only in its own file', () => {
      expect(
        readsEdgeTypeField(
          "element.setAttribute('directed', 'true');",
          exporterFile,
          permitted,
        ),
      ).toBe(false);
    });

    it('the same literal in another file is still a read', () => {
      expect(
        readsEdgeTypeField(
          "element.setAttribute('directed', 'true');",
          otherFile,
          permitted,
        ),
      ).toBe(true);
    });

    it.each([
      'const d = definition.directed;',
      "const d = definition['endpointRules'];",
      "const d = get(codebook, 'edge.knows.directed');",
      'const d = get(codebook, `edge.${type}.directed`);',
      'const { directed } = definition;',
    ])(
      'still flags the read %j in the file that permits a literal',
      (source) => {
        expect(readsEdgeTypeField(source, exporterFile, permitted)).toBe(true);
      },
    );

    it('a permitted literal the file no longer holds fails as stale', () => {
      const sources = new Map([
        [exporterFile, "element.setAttribute('target', id);"],
      ]);
      expect(
        stalePermittedLiterals(
          new Map([
            [exporterFile, new Set(['directed'])],
            ['packages/elsewhere/src/missing.ts', new Set(['directed'])],
          ]),
          (repoPath) => sources.get(repoPath),
        ),
      ).toEqual([
        [exporterFile, 'directed'],
        ['packages/elsewhere/src/missing.ts', 'directed'],
      ]);
    });

    it('a permitted literal that appears only in a comment or a longer string is stale', () => {
      expect(
        stalePermittedLiterals(
          permitted,
          () => "// 'directed'\nconst message = 'directed edge';",
        ),
      ).toEqual([[exporterFile, 'directed']]);
    });

    it('every permitted literal is still in its file', () => {
      expect(PERMITTED_LITERALS.size).toBeGreaterThan(0);
      expect(
        stalePermittedLiterals(PERMITTED_LITERALS, readRepoSource),
      ).toEqual([]);
    });

    it('no file is both allow-listed and given permitted literals', () => {
      expect(
        [...PERMITTED_LITERALS.keys()].filter((path) =>
          ALLOWED_FILES.has(path),
        ),
      ).toEqual([]);
    });
  });

  it('scans every workspace root', () => {
    expect([...scanned.keys()]).toEqual(
      expect.arrayContaining([
        'apps/*',
        'apps/studio/*',
        'packages/*',
        'workers/*',
      ]),
    );
    for (const [glob, files] of scanned) {
      expect({ glob, scanned: files.length > 0 }).toEqual({
        glob,
        scanned: true,
      });
    }
  });

  it('reaches Fresco, Studio and the protocol review Worker', () => {
    const all = new Set([...scanned.values()].flat().map(toRepoPath));
    for (const prefix of [
      'apps/fresco/lib/',
      'apps/studio/api/src/',
      'apps/studio/web/src/',
      'workers/protocol-review/',
      'packages/interview/src/',
    ]) {
      expect({
        prefix,
        seen: [...all].some((path) => path.startsWith(prefix)),
      }).toEqual({ prefix, seen: true });
    }
  });

  it('finds a read in every allow-listed file', () => {
    expect(readers).toEqual(expect.arrayContaining([...ALLOWED_FILES]));
  });

  it('reads directed and endpointRules only through the edge type helpers', () => {
    expect(readers.filter((path) => !ALLOWED_FILES.has(path))).toEqual([]);
  });
});
