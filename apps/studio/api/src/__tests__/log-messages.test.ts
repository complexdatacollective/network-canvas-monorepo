import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';

import { productionFiles } from './support/source-spans.ts';
import { type SourceToken, sourceTokens } from './support/source-tokens.ts';

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const LOG_FUNCTIONS = new Set([
  'log',
  'logTrace',
  'logDebug',
  'logInfo',
  'logWarning',
  'logError',
  'logFatal',
  'logWithLevel',
]);

const LITERALS = new Set<SyntaxKind>([
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
]);

const ARGUMENT_ENDS = new Set<SyntaxKind>([
  SyntaxKind.CommaToken,
  SyntaxKind.CloseParenToken,
]);

function lineOf(source: string, position: number): number {
  return source.slice(0, position).split('\n').length;
}

function literalMessageAt(tokens: SourceToken[], open: number): boolean {
  const message = tokens[open + 1];
  const after = tokens[open + 2];
  return (
    message !== undefined &&
    LITERALS.has(message.kind) &&
    after !== undefined &&
    ARGUMENT_ENDS.has(after.kind)
  );
}

export function logCallsWithoutLiteralMessage(
  source: string,
): { line: number; call: string }[] {
  const tokens = sourceTokens(source);
  const offenders: { line: number; call: string }[] = [];
  for (let index = 0; index + 2 < tokens.length; index += 1) {
    const name = tokens[index + 2]!;
    if (
      tokens[index]!.kind !== SyntaxKind.Identifier ||
      tokens[index]!.raw !== 'Effect' ||
      tokens[index + 1]!.kind !== SyntaxKind.DotToken ||
      !LOG_FUNCTIONS.has(name.raw)
    ) {
      continue;
    }
    let open = index + 3;
    if (name.raw === 'logWithLevel') {
      const levelOpen = open;
      if (tokens[levelOpen]?.kind !== SyntaxKind.OpenParenToken) {
        offenders.push({
          line: lineOf(source, name.position),
          call: name.raw,
        });
        continue;
      }
      let depth = 0;
      let cursor = levelOpen;
      for (; cursor < tokens.length; cursor += 1) {
        const kind = tokens[cursor]!.kind;
        if (kind === SyntaxKind.OpenParenToken) depth += 1;
        else if (kind === SyntaxKind.CloseParenToken) {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      open = cursor + 1;
    }
    if (
      tokens[open]?.kind !== SyntaxKind.OpenParenToken ||
      !literalMessageAt(tokens, open)
    ) {
      offenders.push({ line: lineOf(source, name.position), call: name.raw });
    }
  }
  return offenders;
}

describe('log messages', () => {
  it('are string literals in every production module, so no message is built from data', () => {
    const offenders = productionFiles(SERVER_ROOT).flatMap((file) =>
      logCallsWithoutLiteralMessage(readFileSync(file, 'utf8')).map(
        ({ line, call }) =>
          `${relative(SERVER_ROOT, file)}:${line} Effect.${call}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('flags a template, a variable, a concatenation and a point-free logger', () => {
    const source = [
      'Effect.logInfo(`job ${id} done`);',
      'Effect.logWarning(message);',
      "Effect.logError('failed: ' + reason);",
      'Effect.tapErrorCause(Effect.logError);',
      "Effect.logWithLevel('Info')(text);",
    ].join('\n');
    expect(
      logCallsWithoutLiteralMessage(source).map(({ line }) => line),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it('accepts a literal message followed by a cause', () => {
    const source = [
      "Effect.logError('Collecting staged resources failed', cause);",
      'Effect.log(`Studio started`);',
      "Effect.logWithLevel('Info')('a fixed line');",
      "Effect.logInfo('ready').pipe(Effect.annotateLogs({ queue }));",
    ].join('\n');
    expect(logCallsWithoutLiteralMessage(source)).toEqual([]);
  });
});
