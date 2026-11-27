import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from '@typescript/typescript6';
import { describe, expect, it } from 'vitest';

/**
 * Interviewer runs the export pipeline of `@codaco/network-exporters` in a
 * Web Worker. The root entry of `@codaco/protocol-validation` loads every
 * schema and the Markdown parser, whose browser build calls `document` when
 * it loads, and a worker has no `document`: one runtime import of the root
 * entry makes every Interviewer export fail. So the exporter's source imports
 * only types from the root entry, and takes runtime helpers from a light
 * subpath such as `@codaco/protocol-validation/edge-type-rules`.
 *
 * It lives at the repository root so that the `//#test:invariants` turbo task
 * re-runs it when either package changes.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EXPORTER_SOURCE = join(REPO_ROOT, 'packages/network-exporters/src');
const ROOT_ENTRY = '@codaco/protocol-validation';

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
 * Whether a statement can load the root entry at runtime. An import whose
 * every specifier is marked `type` is kept as a bare import under
 * `verbatimModuleSyntax`, so it counts; only `import type` does not.
 */
const loadsRootEntry = (statement) => {
  if (
    (!ts.isImportDeclaration(statement) &&
      !ts.isExportDeclaration(statement)) ||
    statement.moduleSpecifier === undefined ||
    !ts.isStringLiteral(statement.moduleSpecifier) ||
    statement.moduleSpecifier.text !== ROOT_ENTRY
  ) {
    return false;
  }
  if (ts.isExportDeclaration(statement)) return !statement.isTypeOnly;
  return statement.importClause?.isTypeOnly !== true;
};

const importsValueFromRootEntry = (source, fileName) =>
  ts
    .createSourceFile(fileName, source, ts.ScriptTarget.Latest)
    .statements.some(loadsRootEntry);

describe('imports of @codaco/protocol-validation in the exporter', () => {
  it.each([
    "import { isDirectedEdgeType } from '@codaco/protocol-validation';",
    "import { type Codebook, isDirectedEdgeType } from '@codaco/protocol-validation';",
    "import { type Codebook } from '@codaco/protocol-validation';",
    "import * as validation from '@codaco/protocol-validation';",
    "import '@codaco/protocol-validation';",
    "export { isDirectedEdgeType } from '@codaco/protocol-validation';",
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
