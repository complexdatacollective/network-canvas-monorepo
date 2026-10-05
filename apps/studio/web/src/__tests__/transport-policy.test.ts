import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sourceTokens } from './support/source-tokens.ts';

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

function moduleSpecifiers(source: string): string[] {
  const tokens = sourceTokens(source);
  const literalAt = (index: number): string | undefined =>
    isLiteral(tokens[index]?.raw) ? tokens[index]?.value : undefined;

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
      // `export const url = '…'`: a literal no `from` introduces is a value.
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

const resolveRelative = (file: string, specifier: string): string =>
  relative(SRC, resolve(dirname(file), specifier));

const filesImporting = (predicate: (specifier: string) => boolean): string[] =>
  FILES.filter((file) => moduleSpecifiers(read(file)).some(predicate)).map(
    (file) => relative(SRC, file),
  );

describe('the import inventory', () => {
  it('follows every form one module reaches another by', () => {
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
    expect(
      filesImporting(
        (specifier) =>
          specifier.startsWith('effect/rpc') ||
          specifier.startsWith('effect/socket'),
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
  const filesWithTokens = (sequence: ReadonlyArray<string>): string[] =>
    FILES.filter((file) => {
      const raw = sourceTokens(read(file)).map((token) => token.raw);
      return raw.some((_, start) =>
        sequence.every((token, offset) => raw[start + offset] === token),
      );
    }).map((file) => relative(SRC, file));

  it('is dialled from the runtime module alone', () => {
    expect(filesWithTokens(['layerProtocolSocket'])).toEqual([
      'runtime/runtime.ts',
    ]);
    expect(filesWithTokens(['layerWebSocket'])).toEqual(['runtime/runtime.ts']);
  });

  it('never retries a transient error underneath the call waiting on it', () => {
    expect(filesWithTokens(['retryTransientErrors', ':', 'true'])).toEqual([]);
    expect(filesWithTokens(['retryTransientErrors', ':', 'false'])).toEqual([
      'runtime/runtime.ts',
    ]);
  });
});

describe('the oRPC stack', () => {
  it('is gone', () => {
    expect(
      filesImporting((specifier) => specifier.startsWith('@orpc/')),
    ).toEqual([]);
  });
});
