import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';

import {
  enclosingSpan,
  moduleClauseTokens,
  productionFiles,
  spansOf,
} from '../../__tests__/support/source-spans.ts';
import { sourceTokens } from '../../__tests__/support/source-tokens.ts';

// Where a `TeamAccess` may be minted (#1927 §10).
//
// `TenantScope.open` takes a `TeamAccess` rather than a team id, so a tenant
// transaction cannot be opened without one — but that is only "tenancy implies
// authorization" while every mint has just proved something. The brand makes
// the token impossible to fake; this is what makes its constructor impossible
// to call somewhere new without saying why.

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(HERE, '../../..');
const REPO_ROOT = resolve(SERVER_ROOT, '../../..');

const CONSTRUCTOR = 'unsafeMakeTeamAccess';

/**
 * Every use of the constructor in `source`, by the `Effect.fn` it sits in
 * (`null` outside one). A use is any mention that is not the declaration or an
 * import/export clause naming it: a call, a reference handed on, a member of a
 * namespace import, a computed `['unsafeMakeTeamAccess']`. A renaming import
 * counts too, because the calls under the new name are otherwise invisible.
 */
function constructorUses(source: string): (string | null)[] {
  const tokens = sourceTokens(source);
  const spans = spansOf(tokens);
  const clauses = moduleClauseTokens(tokens);
  const uses: (string | null)[] = [];
  for (const [index, token] of tokens.entries()) {
    const named =
      (token.kind === SyntaxKind.Identifier && token.raw === CONSTRUCTOR) ||
      (token.kind === SyntaxKind.StringLiteral && token.value === CONSTRUCTOR);
    if (!named) continue;
    if (tokens[index - 1]?.kind === SyntaxKind.ConstKeyword) continue;
    if (clauses.has(index) && tokens[index + 1]?.raw !== 'as') continue;
    uses.push(enclosingSpan(spans, index));
  }
  return uses;
}

function inventory(): Map<string, number> {
  const counts = new Map<string, number>();
  const files = [
    ...productionFiles(resolve(SERVER_ROOT, 'src')),
    ...productionFiles(resolve(SERVER_ROOT, 'scripts')),
    ...productionFiles(resolve(REPO_ROOT, 'packages/studio-sync/src')),
  ];
  for (const file of files) {
    const path = relative(REPO_ROOT, file);
    for (const span of constructorUses(readFileSync(file, 'utf8'))) {
      const key = span === null ? path : `${path} › ${span}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

const SERVER = 'apps/studio/server';

/**
 * Every production mint of a `TeamAccess`, and what it has proved first.
 * Exact in both directions, like the raw SQL allowlist: a new mint fails until
 * it is listed with its reason, and an entry whose mint has gone fails until
 * it is removed.
 */
const MINTS: Record<string, { count: number; why: string }> = {
  [`${SERVER}/src/rpc/team-scope.ts › openTeam`]: {
    count: 1,
    why: 'the rpc plane’s membership lookup for an explicit team id, after the caller’s rate budget',
  },
  [`${SERVER}/src/study/tenancy.ts › study.tenancy.resolveStudy`]: {
    count: 1,
    why: 'the membership of the team that owns the study, resolved from the study id',
  },
  [`${SERVER}/src/protocol-builder/tenancy.ts › protocolBuilder.openSession`]: {
    count: 1,
    why: 'the editor host’s gate: the membership of the team that owns the protocol it names',
  },
  [`${SERVER}/src/team/commands.ts › team.acceptInvitation`]: {
    count: 1,
    why: 'an invitee who is not yet a member; minted before the scope opens, and the locked invitation re-read inside it is the proof',
  },
  [`${SERVER}/src/jobs/team-access.ts`]: {
    count: 1,
    why: '`maintenanceTeamAccess`: the worker acting as the deployment, with no member to check; the web process cannot reach it (process-separation)',
  },
  [`${SERVER}/scripts/protocol-demo.ts`]: {
    count: 1,
    why: 'a development script run by hand against a fixture team it creates',
  },
};

describe('the TeamAccess constructor', () => {
  it('is called exactly where a mint is listed, and nowhere else', () => {
    const found = inventory();
    const drift = [
      ...[...found]
        .filter(([key, count]) => MINTS[key]?.count !== count)
        .map(
          ([key, count]) =>
            `${key}: ${count} mint(s), listed ${MINTS[key]?.count ?? 0}`,
        ),
      ...Object.keys(MINTS)
        .filter((key) => !found.has(key))
        .map((key) => `${key}: listed, and no longer mints`),
    ];
    expect(drift).toEqual([]);
  });

  it('gives every mint a reason', () => {
    for (const [key, entry] of Object.entries(MINTS)) {
      expect(entry.why, key).not.toBe('');
    }
  });
});

// The collector is itself under test: a form it missed would be a mint the
// list above never sees.
describe('the mint collector', () => {
  it('finds a call, a handed-on reference and a renaming import', () => {
    const source = `
      import { unsafeMakeTeamAccess as mint } from './tenant.ts';
      import * as tenant from './tenant.ts';
      const a = Effect.fn('a')(function* () {
        return unsafeMakeTeamAccess(team, 'owner');
      });
      const b = Effect.fnUntraced(function* () {
        return tenant.unsafeMakeTeamAccess(team, 'owner');
      });
      const c = [team].map(unsafeMakeTeamAccess);
      const d = tenant['unsafeMakeTeamAccess'];`;
    expect(constructorUses(source)).toEqual([null, 'a', 'b', null, null]);
  });

  it('does not count the declaration, a plain import or a re-export', () => {
    const source = `
      import { type TeamAccess, unsafeMakeTeamAccess } from './tenant.ts';
      export { unsafeMakeTeamAccess };
      export const unsafeMakeTeamAccess = (teamId, role) => ({ teamId, role });
      // unsafeMakeTeamAccess(team, 'owner')
      const text = "unsafeMakeTeamAccess(team, 'owner')";`;
    expect(constructorUses(source)).toEqual([]);
  });
});
