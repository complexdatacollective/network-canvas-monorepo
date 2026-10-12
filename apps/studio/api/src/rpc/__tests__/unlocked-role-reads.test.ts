import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';

import {
  enclosingSpan,
  productionFiles,
  spansOf,
} from '../../__tests__/support/source-spans.ts';
import { sourceTokens } from '../../__tests__/support/source-tokens.ts';

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../');

const RECEIVERS = new Set(['access', 'membership']);

function unlockedRoleReads(source: string): (string | null)[] {
  const tokens = sourceTokens(source);
  const spans = spansOf(tokens);
  const found: (string | null)[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token.kind !== SyntaxKind.Identifier || token.raw !== 'role') continue;
    if (tokens[index - 1]?.kind !== SyntaxKind.DotToken) continue;
    let receiver = tokens[index - 2];
    if (
      receiver?.raw === 'value' &&
      tokens[index - 3]?.kind === SyntaxKind.DotToken
    ) {
      receiver = tokens[index - 4];
    }
    if (receiver === undefined || !RECEIVERS.has(receiver.raw)) continue;
    found.push(enclosingSpan(spans, index));
  }
  return found;
}

function inventory(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of productionFiles(SERVER_ROOT)) {
    const path = relative(SERVER_ROOT, file);
    for (const span of unlockedRoleReads(readFileSync(file, 'utf8'))) {
      const key = span === null ? path : `${path} › ${span}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * A role read before the work's transaction opens is stale by the time it
 * runs. Anything that authorizes or decides visibility reads it with
 * `requireLockedRole` inside that transaction instead.
 */
const READS: Record<string, { count: number; why: string }> = {
  'rpc/team-scope.ts › openTeam': {
    count: 1,
    why: 'carries the role into `TeamAccess`; nothing below decides on it',
  },
  'rpc/team-scope.ts': {
    count: 1,
    why: '`requireTeamAdministration`, the `TeamAdministration` pre-filter; `protocols.create` decides again on the actor it locks',
  },
  'rpc/audit-read.ts': {
    count: 1,
    why: 'chooses only whether a denial-window slot is reserved first; the read decides on the membership it locks',
  },
  'study/tenancy.ts › study.tenancy.resolveStudy': {
    count: 1,
    why: 'labels the scope a team is probed in; `reachableStudy` decides on the role it locks',
  },
  'protocol-builder/tenancy.ts › protocolBuilder.resolveProtocolSession': {
    count: 2,
    why: 'picks the team a session opens in; every operation decides again inside its own transaction',
  },
};

describe('the team role read before any transaction', () => {
  it('is read only where it decides nothing', () => {
    const found = inventory();
    const drift = [
      ...[...found]
        .filter(([key, count]) => READS[key]?.count !== count)
        .map(
          ([key, count]) =>
            `${key}: ${count} read, listed ${READS[key]?.count ?? 0}`,
        ),
      ...Object.keys(READS)
        .filter((key) => !found.has(key))
        .map((key) => `${key}: listed, and no longer read`),
    ];
    expect(drift).toEqual([]);
  });

  it('each say why', () => {
    for (const [key, entry] of Object.entries(READS)) {
      expect(entry.why, key).not.toBe('');
    }
  });
});

describe('the unlocked role collector', () => {
  it('finds a role read off an access or a membership, and nothing else', () => {
    expect(
      unlockedRoleReads(`
        const a = Effect.fn('a')(function* () {
          seesEveryTeamStudy(access.role);
          const { role } = yield* lockActor(teamId, userId);
          actor.role;
        });
        membership.value.role;
        // access.role
        const text = 'membership.role';`),
    ).toEqual(['a', null]);
  });
});
