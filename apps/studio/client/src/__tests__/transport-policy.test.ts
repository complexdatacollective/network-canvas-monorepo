import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sourceTokens } from './support/source-tokens.ts';

// One transport, reached one way.
//
// Studio's client talked to its server through two stacks during this
// migration, and the invariants that keep the first from outliving the second
// are structural rather than conventional: every call goes through the adapter
// (so none can bypass the unauthorized report a 401 owes the router), and the
// oRPC stack shrinks to the editor's socket and then to nothing.

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const sourceFiles = (): string[] => {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(path);
      }
    }
  };
  walk(SRC);
  return files.toSorted();
};

const FILES = sourceFiles();

const read = (file: string): string => readFileSync(file, 'utf8');

const isLiteral = (raw: string | undefined): boolean =>
  raw?.startsWith("'") === true || raw?.startsWith('"') === true;

/**
 * Every module specifier in a file, in all four forms that name a module:
 * `from 'x'` for a static import or re-export, `import 'x'` for a side-effect
 * import, `import('x')` for a dynamic one, and `vi.mock('x')` / `vi.doMock('x')`
 * for the one a suite replaces. `from` is a contextual keyword, so what
 * identifies it is a `from` immediately followed by a string literal, which no
 * expression produces; `import` is reserved, so a literal after it, or after its
 * opening parenthesis, is always a specifier.
 *
 * The `vi.mock` form is here because a suite that mocks `@orpc/client` is still
 * a suite the second stack has to exist for — the allowlist should catch it —
 * and because a mocked specifier is otherwise invisible to a walk that follows
 * imports alone.
 */
function moduleSpecifiers(source: string): string[] {
  const tokens = sourceTokens(source);
  const literalAt = (index: number): string | undefined =>
    isLiteral(tokens[index]?.raw) ? tokens[index]?.value : undefined;

  /**
   * `vi` `.` `mock` `(` `'x'`. The receiver is checked, so a `mock` method on
   * something else — a query client, a fixture builder — is not read as a
   * module.
   */
  const mockedAt = (index: number): string | undefined =>
    (tokens[index]?.raw === 'mock' || tokens[index]?.raw === 'doMock') &&
    tokens[index - 1]?.raw === '.' &&
    tokens[index - 2]?.raw === 'vi' &&
    tokens[index + 1]?.raw === '('
      ? literalAt(index + 2)
      : undefined;

  const specifiers: string[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token.raw === 'from' || token.raw === 'import') {
      const specifier =
        literalAt(index + 1) ??
        (token.raw === 'import' && tokens[index + 1]?.raw === '('
          ? literalAt(index + 2)
          : undefined);
      if (specifier !== undefined) specifiers.push(specifier);
      continue;
    }
    const mocked = mockedAt(index);
    if (mocked !== undefined) specifiers.push(mocked);
  }
  return specifiers;
}

/**
 * What a static `import … from 'x'` binds, so a policy can name one export.
 *
 * A re-export (`export { StudioClient } from './runtime.ts'`) would bind the
 * name onward without appearing as an importer, and is deliberately out of
 * scope: the repository bans barrel files, so no module here re-exports
 * another's members, and the sole-importer case below would have to be read
 * transitively if one ever did.
 */
type ImportClause = {
  readonly specifier: string;
  readonly names: ReadonlyArray<string>;
};

const CLAUSE_PUNCTUATION = new Set([
  '{',
  '}',
  ',',
  '*',
  'as',
  'type',
  'import',
  'export',
  'default',
]);

function importClauses(source: string): ImportClause[] {
  const tokens = sourceTokens(source);
  const clauses: ImportClause[] = [];

  for (const [start, token] of tokens.entries()) {
    if (token.raw !== 'import' && token.raw !== 'export') continue;
    const names: string[] = [];
    for (let index = start + 1; index < tokens.length; index += 1) {
      const current = tokens[index];
      if (current === undefined) break;
      // `export const url = '…'`: a literal that no `from` introduces is a
      // value, not a specifier, so the statement ends here rather than
      // contributing one.
      if (current.raw === ';' || current.raw === '=') break;
      if (current.raw === 'from' && isLiteral(tokens[index + 1]?.raw)) {
        const specifier = tokens[index + 1]?.value;
        if (specifier !== undefined) clauses.push({ specifier, names });
        break;
      }
      if (!CLAUSE_PUNCTUATION.has(current.raw)) names.push(current.raw);
    }
  }
  return clauses;
}

/** Src-relative, with the extension the specifier already carries. */
const resolveRelative = (file: string, specifier: string): string =>
  relative(SRC, resolve(dirname(file), specifier));

const filesImporting = (predicate: (specifier: string) => boolean): string[] =>
  FILES.filter((file) => moduleSpecifiers(read(file)).some(predicate)).map(
    (file) => relative(SRC, file),
  );

describe('the import inventory', () => {
  it('follows every form one module reaches another by', () => {
    // The lists below are only as complete as this. A specifier this did not
    // follow would be an import the policy reports as absent — which is how
    // the second stack could still be here and this file still be green.
    expect(
      moduleSpecifiers(
        [
          "import { named } from './named.ts';",
          "import './side-effect.ts';",
          "const lazy = await import('./dynamic.ts');",
          "export * from './re-export.ts';",
          "import type { Shape } from './type-only.ts';",
          "vi.mock('./mocked.ts');",
          "vi.doMock('./deferred-mock.ts', () => ({}));",
          "// import './commented-out.ts';",
          'const quoted = "import \'./inside-a-string.ts\';";',
          "queryClient.mock('not-a-module');",
        ].join('\n'),
      ),
    ).toEqual([
      './named.ts',
      './side-effect.ts',
      './dynamic.ts',
      './re-export.ts',
      './type-only.ts',
      './mocked.ts',
      './deferred-mock.ts',
    ]);
  });

  it('reads what a static import binds', () => {
    expect(
      importClauses(
        [
          "import { StudioClient, type WebRuntime } from './runtime.ts';",
          "import * as everything from './all.ts';",
          "import Default, { named as renamed } from './mixed.ts';",
          "export const url = 'https://example.org/not-a-specifier';",
        ].join('\n'),
      ),
    ).toEqual([
      { specifier: './runtime.ts', names: ['StudioClient', 'WebRuntime'] },
      { specifier: './all.ts', names: ['everything'] },
      { specifier: './mixed.ts', names: ['Default', 'named', 'renamed'] },
    ]);
  });
});

describe('the rpc client', () => {
  it('is reached from runtime/rpc.ts and nowhere else', () => {
    // `runtime/rpc.ts` is where the adapter's `onFailure` reports a 401 to the
    // router. A screen holding the client itself would make a call that skips
    // that report, and the session would stay signed in on screen while the
    // server had already stopped believing it.
    const importers = FILES.filter((file) =>
      importClauses(read(file)).some(
        (clause) =>
          clause.specifier.startsWith('.') &&
          resolveRelative(file, clause.specifier) === 'runtime/runtime.ts' &&
          clause.names.includes('StudioClient'),
      ),
    ).map((file) => relative(SRC, file));

    expect(importers).toEqual(['runtime/rpc.ts']);
  });

  it('keeps the rpc machinery in the runtime layer', () => {
    // `effect/unstable/rpc` is the transport's own vocabulary. The two runtime
    // modules and the test harness are the whole of what may name it; a screen
    // that did would be building a second way to call the server.
    expect(
      filesImporting((specifier) =>
        specifier.startsWith('effect/unstable/rpc'),
      ),
    ).toEqual([
      'runtime/errors.ts',
      'runtime/runtime.ts',
      'test/rpcHarness.ts',
    ]);
  });
});

describe('the oRPC stack', () => {
  /**
   * What is left of it, and the whole of what may be left of it.
   *
   * The editor still talks to its protocol-builder host over oRPC on the
   * stage-1 websocket bridge; that is the one thing this stage does not move,
   * and stage 8 is where the contract half lands and this list empties. Every
   * other file that imports `@orpc/*` today is a screen or a screen's suite
   * that task 6 rewrites onto `runtime/rpc.ts`.
   *
   * Task 6 has moved every SOURCE file: the editor's own module is the only
   * one left. The three suites below still stand up an oRPC client of their
   * own in place of the screens they drive, which tasks 7 and 8 replace with
   * the rpc harness — and their three entries come out of this list then.
   */
  const ALLOWED = [
    'routes/Editor.tsx',
    'routes/__tests__/Editor.test.tsx',
    'routes/__tests__/TeamActivity.test.tsx',
    'routes/__tests__/auth.test.tsx',
    'routes/__tests__/setup.test.tsx',
  ];

  it('survives only in the editor’s host socket', () => {
    expect(
      filesImporting((specifier) => specifier.startsWith('@orpc/')),
    ).toEqual(ALLOWED.toSorted());
  });
});
