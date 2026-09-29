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

  it('keeps the rpc and socket machinery in the runtime layer', () => {
    // `effect/unstable/rpc` and `effect/unstable/socket` are the transport's own
    // vocabulary. The two runtime modules and the two test harnesses are the
    // whole of what may name them; a screen that did would be building a
    // second way to call the server.
    expect(
      filesImporting(
        (specifier) =>
          specifier.startsWith('effect/unstable/rpc') ||
          specifier.startsWith('effect/unstable/socket'),
      ),
    ).toEqual([
      'runtime/errors.ts',
      'runtime/runtime.ts',
      'test/hostHarness.ts',
      'test/rpcHarness.ts',
    ]);
  });
});

describe('the editor’s host socket', () => {
  /** Files in which the tokens `sequence` occur in order, comments aside. */
  const filesWithTokens = (sequence: ReadonlyArray<string>): string[] =>
    FILES.filter((file) => {
      const raw = sourceTokens(read(file)).map((token) => token.raw);
      return raw.some((_, start) =>
        sequence.every((token, offset) => raw[start + offset] === token),
      );
    }).map((file) => relative(SRC, file));

  it('is dialled from the runtime module alone', () => {
    // One socket client, built in one place: a second `layerProtocolSocket`
    // or `layerWebSocket` would be a socket the host session does not own, and
    // so one that sign-out could not close.
    expect(filesWithTokens(['layerProtocolSocket'])).toEqual([
      'runtime/runtime.ts',
    ]);
    expect(filesWithTokens(['layerWebSocket'])).toEqual(['runtime/runtime.ts']);
  });

  it('never retries a transient error underneath the call waiting on it', () => {
    // With `retryTransientErrors` on, a ping timeout reconnects the socket
    // without failing the call and the stream that were in flight on it, and
    // both hang for good (the behavioural oracle is
    // runtime/__tests__/hostClient.test.ts). Off is stated, not defaulted.
    expect(filesWithTokens(['retryTransientErrors', ':', 'true'])).toEqual([]);
    expect(filesWithTokens(['retryTransientErrors', ':', 'false'])).toEqual([
      'runtime/runtime.ts',
    ]);
  });
});

describe('the oRPC stack', () => {
  it('is gone', () => {
    // The editor's host socket was the last of it; it moved onto Effect rpc
    // with the protocol-builder contract in stage 8.
    expect(
      filesImporting((specifier) => specifier.startsWith('@orpc/')),
    ).toEqual([]);
  });
});
