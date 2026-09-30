import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { SyntaxKind } from 'typescript/unstable/ast';

import { type SourceToken, tokenName } from './source-tokens.ts';

// The structure the call-site policies read off a token stream: which
// parenthesis closes which, which `Effect.fn` a token sits in, and which
// tokens are only an import or export clause naming a binding rather than a
// use of it.

/** Every production `.ts` under `root`: no `__tests__` directory, no `.test.ts`, no declaration file. */
export function productionFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'node_modules'
        ? []
        : productionFiles(path);
    }
    return entry.isFile() &&
      path.endsWith('.ts') &&
      !path.endsWith('.test.ts') &&
      !path.endsWith('.d.ts')
      ? [path]
      : [];
  });
}

const isName = (token: SourceToken | undefined, name: string) =>
  token?.kind === SyntaxKind.Identifier && token.raw === name;

/** The index of the parenthesis closing the one opened at `open`. */
export function closingParen(tokens: SourceToken[], open: number): number {
  let depth = 0;
  for (let index = open; index < tokens.length; index += 1) {
    const kind = tokens[index]!.kind;
    if (kind === SyntaxKind.OpenParenToken) depth += 1;
    else if (kind === SyntaxKind.CloseParenToken) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return tokens.length - 1;
}

/** The index just past a balanced `<…>` starting at `start`, or `start`. */
export function skipTypeArguments(
  tokens: SourceToken[],
  start: number,
): number {
  if (tokens[start]?.kind !== SyntaxKind.LessThanToken) return start;
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    const kind = tokens[index]!.kind;
    if (kind === SyntaxKind.LessThanToken) depth += 1;
    else if (kind === SyntaxKind.GreaterThanToken) depth -= 1;
    else if (kind === SyntaxKind.GreaterThanGreaterThanToken) depth -= 2;
    if (depth <= 0) return index + 1;
  }
  return start;
}

type Span = { name: string; start: number; end: number };

/**
 * The `Effect.fn` bodies in a file, each owning every token up to the
 * parenthesis that closes it. `Effect.fn('<span>')(…)` is named by its span;
 * `const <name> = Effect.fn(…)` / `Effect.fnUntraced(…)`, which carry none, by
 * the binding — so a site in `openTeam` is charged to `openTeam` rather than
 * to the file.
 */
export function spansOf(tokens: SourceToken[]): Span[] {
  const spans: Span[] = [];
  for (let index = 0; index + 4 < tokens.length; index += 1) {
    const fn = tokens[index + 2]?.raw;
    if (
      !isName(tokens[index], 'Effect') ||
      tokens[index + 1]?.kind !== SyntaxKind.DotToken ||
      (fn !== 'fn' && fn !== 'fnUntraced') ||
      tokens[index + 3]?.kind !== SyntaxKind.OpenParenToken
    ) {
      continue;
    }
    if (fn === 'fn' && tokens[index + 4]?.kind === SyntaxKind.StringLiteral) {
      // The formatter leaves a trailing comma after a name that wrapped.
      let close = index + 5;
      if (tokens[close]?.kind === SyntaxKind.CommaToken) close += 1;
      if (
        tokens[close]?.kind === SyntaxKind.CloseParenToken &&
        tokens[close + 1]?.kind === SyntaxKind.OpenParenToken
      ) {
        spans.push({
          name: tokenName(tokens[index + 4])!,
          start: index,
          end: closingParen(tokens, close + 1),
        });
      }
      continue;
    }
    if (
      tokens[index - 1]?.kind === SyntaxKind.EqualsToken &&
      tokens[index - 2]?.kind === SyntaxKind.Identifier
    ) {
      spans.push({
        name: tokens[index - 2]!.raw,
        start: index,
        end: closingParen(tokens, index + 3),
      });
    }
  }
  return spans;
}

/** The innermost span enclosing `index`, or `null`. */
export function enclosingSpan(spans: Span[], index: number): string | null {
  return (
    spans.filter((span) => span.start < index && index < span.end).at(-1)
      ?.name ?? null
  );
}

/**
 * The indices of every token inside an `import … from` or `export { … }`
 * clause: a name there binds or re-exports, it does not use. A renaming
 * (`x as y`) is reported by the caller, not hidden here — this only says where
 * a clause is.
 */
export function moduleClauseTokens(tokens: SourceToken[]): Set<number> {
  const inside = new Set<number>();
  for (let index = 0; index < tokens.length; index += 1) {
    const kind = tokens[index]!.kind;
    const opensClause =
      kind === SyntaxKind.ImportKeyword ||
      (kind === SyntaxKind.ExportKeyword &&
        (tokens[index + 1]?.kind === SyntaxKind.OpenBraceToken ||
          (isName(tokens[index + 1], 'type') &&
            tokens[index + 2]?.kind === SyntaxKind.OpenBraceToken)));
    // `import(` and `import.meta` are expressions, not clauses.
    if (
      !opensClause ||
      tokens[index + 1]?.kind === SyntaxKind.OpenParenToken ||
      tokens[index + 1]?.kind === SyntaxKind.DotToken
    ) {
      continue;
    }
    let cursor = index + 1;
    while (
      cursor < tokens.length &&
      tokens[cursor]!.kind !== SyntaxKind.SemicolonToken &&
      tokens[cursor]!.kind !== SyntaxKind.FromKeyword &&
      tokens[cursor]!.kind !== SyntaxKind.StringLiteral
    ) {
      inside.add(cursor);
      cursor += 1;
    }
  }
  return inside;
}
