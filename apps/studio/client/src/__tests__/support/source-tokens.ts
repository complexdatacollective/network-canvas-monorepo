import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

// The tokenizer the source-policy suites read an import inventory through. TS 7
// exposes its scanner independently of the compiler process, so a specifier
// named in a comment or inside a string cannot add to the inventory and a real
// one cannot hide from it — which matters here, because two of the files this
// walks mention `@orpc/*` in prose while importing nothing of the sort.
//
// A copy of `sourceTokens` from
// apps/studio/server/src/__tests__/support/source-tokens.ts (without that
// file's `tokenName`, which no policy here reads):
// the two deployables are separate packages with separate tsconfig projects and
// nothing they may both import, and a policy test that reached across that
// boundary would be the first thing to do so. Consolidate the two when there is
// a shared test-support package to put it in.

export type SourceToken = {
  kind: SyntaxKind;
  raw: string;
  value: string;
  position: number;
};

/**
 * A `/` is a regular expression where a value cannot already have been read,
 * and division where one has. Only a parser knows which, so the set below is
 * the lexer's half of that question: the token kinds a value ends with.
 */
const VALUE_ENDING_TOKENS = new Set<SyntaxKind>([
  SyntaxKind.Identifier,
  SyntaxKind.PrivateIdentifier,
  SyntaxKind.StringLiteral,
  SyntaxKind.NumericLiteral,
  SyntaxKind.BigIntLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateTail,
  SyntaxKind.RegularExpressionLiteral,
  SyntaxKind.CloseParenToken,
  SyntaxKind.CloseBracketToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.ThisKeyword,
  SyntaxKind.SuperKeyword,
  SyntaxKind.PlusPlusToken,
  SyntaxKind.MinusMinusToken,
]);

/**
 * The scanner runs without a parser to tell it what it is inside, and two
 * cases have to be handed back to it or it stops making progress:
 *
 * A `}` that closes a template substitution has to be rescanned as the rest of
 * the template; without that the scanner reports a brace and reads the
 * template's remaining text as ordinary tokens, never reaching end-of-file.
 * The depth stack is what tells a substitution's closing brace from an object
 * literal's inside one.
 *
 * A `/` that opens a regular expression has to be rescanned as one, because
 * the scanner otherwise reads the pattern as source — and a pattern beginning
 * `#` yields a zero-length private identifier at the same offset, forever. The
 * offset check below is the backstop for any other such token: a hang here
 * would look like a suite that never finishes rather than a failure.
 */
export function sourceTokens(source: string): SourceToken[] {
  const scanner = createScanner(true, undefined, source);
  const tokens: SourceToken[] = [];
  const templateBraceDepth: number[] = [];
  let scanned = -1;
  let kind = scanner.scan();
  while (kind !== SyntaxKind.EndOfFile) {
    if (
      (kind === SyntaxKind.SlashToken ||
        kind === SyntaxKind.SlashEqualsToken) &&
      !VALUE_ENDING_TOKENS.has(tokens.at(-1)?.kind ?? SyntaxKind.Unknown)
    ) {
      kind = scanner.reScanSlashToken();
    }

    if (scanner.getTokenEnd() === scanned) {
      throw new Error(
        `the scanner stopped advancing at offset ${scanned} on ${SyntaxKind[kind]}`,
      );
    }
    scanned = scanner.getTokenEnd();

    tokens.push({
      kind,
      raw: scanner.getTokenText(),
      value: scanner.getTokenValue(),
      position: scanner.getTokenStart(),
    });

    if (kind === SyntaxKind.TemplateHead) {
      templateBraceDepth.push(0);
    } else if (kind === SyntaxKind.TemplateTail) {
      templateBraceDepth.pop();
    } else if (templateBraceDepth.length > 0) {
      const index = templateBraceDepth.length - 1;
      if (kind === SyntaxKind.OpenBraceToken) {
        templateBraceDepth[index] = (templateBraceDepth[index] ?? 0) + 1;
      } else if (kind === SyntaxKind.CloseBraceToken) {
        const depth = templateBraceDepth[index] ?? 0;
        if (depth === 0) {
          kind = scanner.reScanTemplateToken(false);
          continue;
        }
        templateBraceDepth[index] = depth - 1;
      }
    }
    kind = scanner.scan();
  }
  return tokens;
}
