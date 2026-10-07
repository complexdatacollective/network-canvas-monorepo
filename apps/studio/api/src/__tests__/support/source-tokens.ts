import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

// Shared by the suites that assert a source policy — which modules may import
// what, and where a call is allowed to appear. TS 7 exposes its tokenizer
// independently of the compiler process, so comments and strings cannot spoof
// an inventory, and the test stays independent of a typecheck.

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

/** A literal's contents, anything else as written. */
export function tokenName(token: SourceToken | undefined): string | undefined {
  if (token === undefined) return undefined;
  return token.kind === SyntaxKind.StringLiteral ||
    token.kind === SyntaxKind.NoSubstitutionTemplateLiteral ||
    token.kind === SyntaxKind.TemplateHead ||
    token.kind === SyntaxKind.TemplateMiddle ||
    token.kind === SyntaxKind.TemplateTail
    ? token.value
    : token.raw;
}
