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
 * `directed` or `endpointRules`: as a property (`.directed`, `?.directed`,
 * `['directed']`), by destructuring (`const { directed } = ...`, a destructured
 * parameter, a destructuring assignment), or by testing for the key (`in`,
 * `Object.hasOwn`, `hasOwnProperty`, `Reflect.has`). Declaring the fields in a
 * type or writing them in an object literal is not a read.
 *
 * The allow-list names the helpers, the codebook check that validates the
 * fields, the stage support table (which reads its own entries, named after
 * the fields) and the SyntheticInterview writer. Later work adds only the
 * files that write the fields, and the migration once it reads them. Every
 * allow-listed file must still read a field, so a stale entry fails.
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
  'packages/protocol-utilities/src/SyntheticInterview.ts',
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
const KEY_TESTS = new Set(['hasOwn', 'hasOwnProperty', 'has']);

const isTestFile = (name) => /\.(test|spec)\.tsx?$/.test(name);
const isSourceFile = (name) =>
  /\.tsx?$/.test(name) && !name.endsWith('.d.ts') && !isTestFile(name);

const isFieldLiteral = (node) =>
  node !== undefined &&
  (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
  FIELDS.has(node.text);

const propertyNameText = (name) =>
  name !== undefined &&
  (ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name))
    ? name.text
    : undefined;

const calleeName = (callee) => {
  if (ts.isPropertyAccessExpression(callee)) {
    // `Object.prototype.hasOwnProperty.call(x, 'directed')`
    if (callee.name.text === 'call') return calleeName(callee.expression);
    return callee.name.text;
  }
  return ts.isIdentifier(callee) ? callee.text : undefined;
};

const readsField = (node) => {
  if (ts.isPropertyAccessExpression(node)) return FIELDS.has(node.name.text);
  if (ts.isElementAccessExpression(node))
    return isFieldLiteral(node.argumentExpression);
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    return FIELDS.has(propertyNameText(node.propertyName ?? node.name));
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.InKeyword
  ) {
    return isFieldLiteral(node.left);
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isObjectLiteralExpression(node.left)
  ) {
    return node.left.properties.some((property) =>
      FIELDS.has(propertyNameText(property.name)),
    );
  }
  if (ts.isCallExpression(node) && KEY_TESTS.has(calleeName(node.expression))) {
    return node.arguments.some(isFieldLiteral);
  }
  return false;
};

/** Whether this source reads `directed` or `endpointRules`. */
const readsEdgeTypeField = (source, fileName = 'source.ts') => {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node) => readsField(node) || ts.forEachChild(node, visit);
  return visit(file) === true;
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
  .filter((path) => readsEdgeTypeField(readFileSync(path, 'utf8'), path))
  .map(toRepoPath);

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
  ])('does not flag %j', (source) => {
    expect(readsEdgeTypeField(source)).toBe(false);
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
