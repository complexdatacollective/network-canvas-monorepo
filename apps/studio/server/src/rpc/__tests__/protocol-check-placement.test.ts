import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';

import {
  closingParen,
  enclosingSpan,
  moduleClauseTokens,
  productionFiles,
  skipTypeArguments,
  spansOf,
} from '../../__tests__/support/source-spans.ts';
import {
  type SourceToken,
  sourceTokens,
} from '../../__tests__/support/source-tokens.ts';

// Where #1257's protocol-line check is allowed to happen (#1927 §10).
//
// The primary guarantee is not this test. `requireProtocol` requires the
// `Transaction` service, so the compiler refuses a call outside a transaction
// altogether — which is stronger than any source walk, because it also refuses
// a call in a transaction on some other connection. What a source walk adds is
// an inventory of the callers, so that a check placed in a transaction *of its
// own*, ahead of a command that opens a second one, is a line a reader has to
// write down rather than something that slips in unnoticed.
//
// The inventory below shrinks as each command converts. It never grows.

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../');

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : typescriptFiles(path);
    }
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

/** Every production file naming `name`, as repository-relative paths. */
function callersOf(name: string): string[] {
  const named = new RegExp(`\\b${name}\\b`);
  return typescriptFiles(SERVER_ROOT)
    .filter((file) => named.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SERVER_ROOT, file))
    .toSorted();
}

const CHECK = 'requireProtocol';

/** Each transaction opener, and which of its arguments is the body it runs. */
const OPENERS: Record<string, number> = {
  'TenantScope.open': 1,
  'MaintenanceScope.openTenant': 1,
  'UntenantedScope.open': 0,
  'MaintenanceScope.open': 0,
  'OwnerScope.open': 0,
  'savepoint': 0,
  'audited': 2,
  'noAuditTransaction': 2,
  'noAuditMaintenanceTransaction': 2,
};

type OpenerCall = {
  name: string;
  open: number;
  close: number;
  /** `[start, end)` token ranges of each top-level argument. */
  args: [number, number][];
};

function openerCalls(tokens: SourceToken[]): OpenerCall[] {
  const calls: OpenerCall[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.kind !== SyntaxKind.Identifier) continue;
    if (tokens[index - 1]?.kind === SyntaxKind.DotToken) continue;
    let name = token.raw;
    let cursor = index + 1;
    if (
      tokens[cursor]?.kind === SyntaxKind.DotToken &&
      tokens[cursor + 1]?.kind === SyntaxKind.Identifier
    ) {
      name = `${token.raw}.${tokens[cursor + 1]!.raw}`;
      cursor += 2;
    }
    if (OPENERS[name] === undefined) continue;
    const open = skipTypeArguments(tokens, cursor);
    if (tokens[open]?.kind !== SyntaxKind.OpenParenToken) continue;
    const close = closingParen(tokens, open);
    const args: [number, number][] = [];
    let depth = 0;
    let start = open + 1;
    for (let at = open + 1; at < close; at += 1) {
      const kind = tokens[at]!.kind;
      if (
        kind === SyntaxKind.OpenParenToken ||
        kind === SyntaxKind.OpenBracketToken ||
        kind === SyntaxKind.OpenBraceToken
      ) {
        depth += 1;
      } else if (
        kind === SyntaxKind.CloseParenToken ||
        kind === SyntaxKind.CloseBracketToken ||
        kind === SyntaxKind.CloseBraceToken
      ) {
        depth -= 1;
      } else if (kind === SyntaxKind.CommaToken && depth === 0) {
        args.push([start, at]);
        start = at + 1;
      }
    }
    if (start < close) args.push([start, close]);
    calls.push({ name, open, close, args });
  }
  return calls;
}

/**
 * Whether `[start, end)` calls anything but the check and the `Effect.gen` /
 * `Effect.fn` wrapping it. The check's own argument list is skipped, so
 * `requireProtocol(access, lookup(id))` is still the check alone.
 */
function doesMoreThanTheCheck(
  tokens: SourceToken[],
  start: number,
  end: number,
): boolean {
  for (let index = start; index < end; index += 1) {
    const token = tokens[index]!;
    if (token.kind !== SyntaxKind.Identifier) continue;
    const call = skipTypeArguments(tokens, index + 1);
    if (tokens[call]?.kind !== SyntaxKind.OpenParenToken) continue;
    if (token.raw === CHECK) {
      index = closingParen(tokens, call);
      continue;
    }
    // Plumbing is not work: a call on the `Effect` namespace (a generator
    // wrapper, a log line, `asVoid`) or a `.pipe(` changes what the check
    // returns, not what the scope does, so a scope holding only those beside
    // the check is still a transaction of its own.
    const plumbing =
      token.raw === 'pipe' ||
      (tokens[index - 1]?.kind === SyntaxKind.DotToken &&
        tokens[index - 2]?.raw === 'Effect');
    if (!plumbing) return true;
  }
  return false;
}

type CheckUse = { span: string | null; problems: string[] };

/** Every production mention of the check in `source`, and what is wrong with where it sits. */
function checkUsesIn(source: string): CheckUse[] {
  const tokens = sourceTokens(source);
  const spans = spansOf(tokens);
  const clauses = moduleClauseTokens(tokens);
  const openers = openerCalls(tokens);
  const uses: CheckUse[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token.kind !== SyntaxKind.Identifier || token.raw !== CHECK) continue;
    if (clauses.has(index)) continue;
    if (tokens[index - 1]?.kind === SyntaxKind.ConstKeyword) continue;
    const opener = openers
      .filter((call) => call.open < index && index < call.close)
      .at(-1);
    const problems: string[] = [];
    if (opener === undefined) {
      problems.push(`${CHECK} is outside any transaction opener`);
    } else {
      const body = opener.args[OPENERS[opener.name]!];
      if (body === undefined || index < body[0] || index >= body[1]) {
        problems.push(`${CHECK} is not in the body of ${opener.name}`);
      } else if (!doesMoreThanTheCheck(tokens, body[0], body[1])) {
        problems.push(`the scope opened around ${CHECK} does nothing else`);
      }
    }
    uses.push({ span: enclosingSpan(spans, index), problems });
  }
  return uses;
}

const placementProblems = (source: string): string[] =>
  checkUsesIn(source).flatMap((use) => use.problems);

function checkUses(): { site: string; problems: string[] }[] {
  return productionFiles(SERVER_ROOT)
    .toSorted()
    .flatMap((file) => {
      const path = relative(SERVER_ROOT, file);
      return checkUsesIn(readFileSync(file, 'utf8')).map((use) => ({
        site: use.span === null ? path : `${path} › ${use.span}`,
        problems: use.problems.map((problem) => `${path}: ${problem}`),
      }));
    });
}

describe('the protocol reachability check', () => {
  it('is reached only through requireProtocol and the editor host', () => {
    // `protocol/store.ts` declares it; `rpc/team-scope.ts` is `requireProtocol`,
    // the one wrapper the rpc plane calls it through; `protocol-builder`'s host
    // has its own gate, which §10 keeps because its inputs name a protocol and
    // never a team. Anything else asking the store this question directly is a
    // second answer to "may this caller reach this line", and #1257's rule then
    // has two places to drift between.
    expect(callersOf('isReachableByCaller')).toEqual([
      'protocol-builder/tenancy.ts',
      'protocol/store.ts',
      'rpc/team-scope.ts',
    ]);
  });

  it('never runs in a transaction of its own', () => {
    // A handler that opens `TenantScope` around `requireProtocol` alone and
    // then runs a command that opens its own transaction is taking two, so the
    // check answers about a snapshot the write does not share — the TOCTOU §10
    // closes. The last two (`protocols.addInformationStage` and
    // `protocols.moveStage`) converted in stage 3: `protocol/commands.ts` now
    // calls `requireProtocol` inside the command's own `audited` body.
    const uses = checkUses();
    expect(uses.map((use) => use.site)).toEqual([
      'protocol/commands.ts › protocol.addInformationStage',
      'protocol/commands.ts › protocol.moveStage',
      'rpc/handlers/protocols.ts',
    ]);
    expect(uses.flatMap((use) => use.problems)).toEqual([]);
  });
});

// What the case above checks, precisely: every mention of `requireProtocol`
// in production code (a call or a reference handed on; not its declaration or
// an import) sits lexically inside the body argument of a transaction opener —
// `TenantScope.open`, `UntenantedScope.open`, `MaintenanceScope.open` /
// `.openTenant`, `OwnerScope.open`, `savepoint`, `audited`,
// `noAuditTransaction` or `noAuditMaintenanceTransaction` — and that body calls
// something other than the check and the `Effect.gen` / `Effect.fn` wrapping
// it. The route the compiler also allows — the check inside an `Effect.fn`
// that requires `Transaction` and is only ever called inside one — is not
// followed across calls: such a caller fails here and is taken up when it is
// written.
describe('the placement collector', () => {
  it('refuses the old separate-transaction shape', () => {
    const problems = placementProblems(`
      const handler = Effect.gen(function* () {
        yield* TenantScope.open(access, requireProtocol(access, payload.protocolId));
        return yield* addAuditedInformationStage(access, payload);
      });`);
    expect(problems).toEqual([
      'the scope opened around requireProtocol does nothing else',
    ]);
  });

  it('refuses a scope whose body is the check in a generator', () => {
    expect(
      placementProblems(`
        yield* TenantScope.open(
          access,
          Effect.gen(function* () {
            yield* requireProtocol(access, id);
          }),
        );`),
    ).toEqual(['the scope opened around requireProtocol does nothing else']);
  });

  it('counts plumbing beside the check as nothing', () => {
    // Both are the two-transaction shape with something inert added: a log
    // line or a `.pipe(` does not make the scope do the work it guards.
    expect(
      placementProblems(`
        yield* TenantScope.open(access, requireProtocol(access, id).pipe(Effect.asVoid));`),
    ).toEqual(['the scope opened around requireProtocol does nothing else']);
    expect(
      placementProblems(`
        yield* TenantScope.open(
          access,
          Effect.gen(function* () {
            yield* requireProtocol(access, id);
            yield* Effect.logDebug('checked');
          }),
        );`),
    ).toEqual(['the scope opened around requireProtocol does nothing else']);
  });

  it('refuses a check outside any scope, or in its access argument', () => {
    expect(
      placementProblems(`
        yield* requireProtocol(access, id);
        const f = Effect.flatMap(requireProtocol);
        yield* audited('x', requireProtocol(access, id), write(access));`),
    ).toEqual([
      'requireProtocol is outside any transaction opener',
      'requireProtocol is outside any transaction opener',
      'requireProtocol is not in the body of audited',
    ]);
  });

  it('accepts the check sharing a body with the work it guards', () => {
    expect(
      placementProblems(`
        import { requireProtocol } from '../rpc/team-scope.ts';
        export const requireProtocol = Effect.fnUntraced(function* () {});
        yield* audited(
          'protocol.moveStage.audited',
          access,
          Effect.gen(function* () {
            yield* requireProtocol(access, input.protocolId);
            return yield* moveStage(access.teamId, input);
          }),
        );
        // TenantScope.open(access, requireProtocol(access, id))
        const text = 'requireProtocol(access, id)';`),
    ).toEqual([]);
  });
});
