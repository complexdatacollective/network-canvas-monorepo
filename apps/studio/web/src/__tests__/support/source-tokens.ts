import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

// A copy of `sourceTokens` from apps/studio/api/src/__tests__/support/source-tokens.ts:
// the two packages have nothing they may both import.

export type SourceToken = {
  kind: SyntaxKind;
  raw: string;
  value: string;
  position: number;
};

/**
 * Token kinds a value ends with: after one, `/` is division; otherwise a regex.
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
 * The scanner runs without a parser, so a template substitution's closing `}` and
 * a regex-opening `/` must be rescanned here, or it stops making progress.
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
