import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from '@typescript/typescript6';
import { describe, expect, it } from 'vitest';

/**
 * Interviewer runs the export pipeline of `@codaco/network-exporters` in a
 * Web Worker. The root entry of `@codaco/protocol-validation` loads every
 * schema and the Markdown parser, whose browser build calls `document` when
 * it loads, and a worker has no `document`: one runtime import of the root
 * entry, or of any module that reaches the schema tree, makes every
 * Interviewer export fail. So the worker may load only one module of
 * `@codaco/protocol-validation`, `src/utils/edgeTypeRules.ts` (published as
 * the `./edge-type-rules` subpath), and the exporter's source imports only
 * types from the root entry.
 *
 * The main test walks the runtime import graph of the worker from
 * `apps/interviewer/src/lib/export/exportWorker.ts`: static imports and
 * re-exports that are not `type`-only, `import x = require()`, and `import()`
 * calls anywhere in a file. Relative specifiers, Interviewer's `~/` alias and
 * `@codaco/*` specifiers (through each workspace package's `exports`) are
 * followed into source; other packages are installed code and are not.
 *
 * It lives at the repository root so that the `//#test:invariants` turbo task
 * re-runs it when any of these packages changes.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EXPORTER_SOURCE = join(REPO_ROOT, 'packages/network-exporters/src');
const INTERVIEWER_SOURCE = join(REPO_ROOT, 'apps/interviewer/src');
const WORKER_ENTRY = join(INTERVIEWER_SOURCE, 'lib/export/exportWorker.ts');
const ROOT_ENTRY = '@codaco/protocol-validation';
const PROTOCOL_VALIDATION = 'packages/protocol-validation/';
const PERMITTED_PROTOCOL_VALIDATION_MODULES = [
  'packages/protocol-validation/src/utils/edgeTypeRules.ts',
];

const isTestFile = (name) => /\.(test|spec)\.tsx?$/.test(name);

const sourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(path);
    }
    return entry.isFile() &&
      /\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts') &&
      !isTestFile(entry.name)
      ? [path]
      : [];
  });

/**
 * The specifiers a file can load at runtime. An import whose every specifier
 * is marked `type` is kept as a bare import under `verbatimModuleSyntax`, so
 * it counts; only `import type` and `export type` do not.
 */
const runtimeSpecifiers = (source, fileName) => {
  const specifiers = [];
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.importClause?.isTypeOnly !== true
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.isTypeOnly
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true));
  return specifiers;
};

const importsValueFromRootEntry = (source, fileName) =>
  runtimeSpecifiers(source, fileName).includes(ROOT_ENTRY);

const isFile = (path) => existsSync(path) && statSync(path).isFile();

const resolveFile = (base) => {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  return candidates.find(isFile);
};

const workspacePackages = () => {
  const packages = new Map();
  for (const parent of ['packages', 'apps']) {
    for (const entry of readdirSync(join(REPO_ROOT, parent), {
      withFileTypes: true,
    })) {
      const manifest = join(REPO_ROOT, parent, entry.name, 'package.json');
      if (!entry.isDirectory() || !isFile(manifest)) continue;
      const { name, exports } = JSON.parse(readFileSync(manifest, 'utf8'));
      if (typeof name === 'string') {
        packages.set(name, { directory: dirname(manifest), exports });
      }
    }
  }
  return packages;
};

const exportTarget = (target) => {
  if (typeof target === 'string') return target;
  if (target && typeof target === 'object') {
    return exportTarget(target.import ?? target.default);
  }
  return undefined;
};

/**
 * The source file a specifier names, `null` for installed code that the walk
 * does not follow. A workspace or relative specifier that resolves to nothing
 * throws, so a change of layout cannot quietly end the walk.
 */
const resolveSpecifier = (specifier, fromFile, packages) => {
  if (specifier.startsWith('.')) {
    const file = resolveFile(resolve(dirname(fromFile), specifier));
    if (file === undefined) {
      throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
    }
    return file;
  }
  if (specifier.startsWith('~/') && fromFile.startsWith(INTERVIEWER_SOURCE)) {
    const file = resolveFile(join(INTERVIEWER_SOURCE, specifier.slice(2)));
    if (file === undefined) {
      throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
    }
    return file;
  }
  if (!specifier.startsWith('@codaco/')) return null;
  const [scope, name, ...rest] = specifier.split('/');
  const workspacePackage = packages.get(`${scope}/${name}`);
  if (workspacePackage === undefined) return null;
  const subpath = rest.length === 0 ? '.' : `./${rest.join('/')}`;
  const target = exportTarget(workspacePackage.exports?.[subpath]);
  const file =
    target === undefined
      ? undefined
      : resolveFile(join(workspacePackage.directory, target));
  if (file === undefined) {
    throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
  }
  return file;
};

/** Every workspace source file the entry loads at runtime, repo-relative. */
const runtimeModuleGraph = (entry) => {
  const packages = workspacePackages();
  const seen = new Set();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    for (const specifier of runtimeSpecifiers(
      readFileSync(file, 'utf8'),
      file,
    )) {
      const target = resolveSpecifier(specifier, file, packages);
      if (target !== null) pending.push(target);
    }
  }
  return [...seen]
    .map((file) => relative(REPO_ROOT, file))
    .toSorted((a, b) => a.localeCompare(b));
};

const protocolValidationModules = (graph) =>
  graph.filter((file) => file.startsWith(PROTOCOL_VALIDATION));

const withProbeGraph = (files, run) => {
  const directory = mkdtempSync(join(tmpdir(), 'worker-graph-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(directory, name), source);
    }
    return run(join(directory, 'entry.ts'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe('imports of @codaco/protocol-validation in the exporter', () => {
  it.each([
    "import { isDirectedEdgeType } from '@codaco/protocol-validation';",
    "import { type Codebook, isDirectedEdgeType } from '@codaco/protocol-validation';",
    "import { type Codebook } from '@codaco/protocol-validation';",
    "import * as validation from '@codaco/protocol-validation';",
    "import '@codaco/protocol-validation';",
    "export { isDirectedEdgeType } from '@codaco/protocol-validation';",
    "const { isDirectedEdgeType } = await import('@codaco/protocol-validation');",
    "export const load = () => import('@codaco/protocol-validation');",
    "import validation = require('@codaco/protocol-validation');",
  ])('flags %j', (source) => {
    expect(importsValueFromRootEntry(source, 'probe.ts')).toBe(true);
  });

  it.each([
    "import type { Codebook } from '@codaco/protocol-validation';",
    "export type { Codebook } from '@codaco/protocol-validation';",
    "import { isDirectedEdgeType } from '@codaco/protocol-validation/edge-type-rules';",
  ])('does not flag %j', (source) => {
    expect(importsValueFromRootEntry(source, 'probe.ts')).toBe(false);
  });

  it('imports only types from the root entry', () => {
    const files = sourceFiles(EXPORTER_SOURCE);
    expect(files.length).toBeGreaterThan(10);
    expect(
      files
        .filter((path) =>
          importsValueFromRootEntry(readFileSync(path, 'utf8'), path),
        )
        .map((path) => relative(REPO_ROOT, path)),
    ).toEqual([]);
  });
});

describe('the runtime import graph of the Interviewer export worker', () => {
  it('follows a dynamic import of the root entry in a module the entry loads', () => {
    const graph = withProbeGraph(
      {
        'entry.ts': "import type { X } from './types';\nimport './loader';",
        'types.ts': "import '@codaco/protocol-validation';",
        'loader.ts':
          "export const load = () => import('@codaco/protocol-validation');",
      },
      runtimeModuleGraph,
    );
    expect(protocolValidationModules(graph)).toContain(
      'packages/protocol-validation/src/index.ts',
    );
  });

  it('follows a subpath module into what it loads', () => {
    const graph = withProbeGraph(
      {
        'entry.ts':
          "import { x } from '@codaco/protocol-validation/testing/information-pages';",
      },
      runtimeModuleGraph,
    );
    expect(protocolValidationModules(graph).length).toBeGreaterThan(1);
  });

  it('does not follow a type-only import', () => {
    const graph = withProbeGraph(
      {
        'entry.ts':
          "import type { Codebook } from '@codaco/protocol-validation';\nexport type { Codebook } from '@codaco/protocol-validation';",
      },
      runtimeModuleGraph,
    );
    expect(protocolValidationModules(graph)).toEqual([]);
  });

  it('fails on a relative specifier that resolves to nothing', () => {
    expect(() =>
      withProbeGraph({ 'entry.ts': "import './missing';" }, runtimeModuleGraph),
    ).toThrow(/Cannot resolve \.\/missing/);
  });

  it('loads no module of protocol-validation but the edge type rules', () => {
    const graph = runtimeModuleGraph(WORKER_ENTRY);
    expect(graph).toEqual(
      expect.arrayContaining([
        'apps/interviewer/src/lib/export/exportPipelineRunner.ts',
        'packages/network-exporters/src/pipeline.ts',
      ]),
    );
    expect(protocolValidationModules(graph)).toEqual(
      PERMITTED_PROTOCOL_VALIDATION_MODULES,
    );
  });
});
