import { describe, expect, it } from 'vitest';

import { ParticipantRpcs } from '../rpc/participant.ts';
import { RPC_PATH, StudioRpcs, WS_PATH } from '../rpc/studio.ts';

// The surface itself, pinned. A procedure added to, removed from, or renamed
// in any merged group changes what a deployed client may call and what the
// audit policy walk must cover, so the tag list and the middleware each tag
// carries are written out here by hand rather than computed from the groups —
// a computed expectation would agree with any change.

const STUDIO_TAGS = [
  'account.updateLocale',
  'audit.filterOptions',
  'audit.get',
  'audit.list',
  'me',
  'protocols.addInformationStage',
  'protocols.create',
  'protocols.draft',
  'protocols.list',
  'protocols.moveStage',
  'setup.complete',
  'status',
  'studies.counts',
  'studies.create',
  'studies.get',
  'studies.list',
  'team.acceptInvitation',
  'team.cancelInvitation',
  'team.createInvitation',
  'team.updateMemberRole',
] as const;

const AUTHENTICATED = '@studio/Authenticated';
const TEAM_ADMINISTRATION = '@studio/TeamAdministration';
const REQUIRE_SESSION = '@studio/RequireSession';

/**
 * Which middleware each merged procedure declares, sorted — the *set*, with the
 * order asserted separately below because it is load-bearing. `status` answers
 * before anyone has signed in and `setup.complete` is authorized by the
 * bootstrap token in its own payload, so those two carry none; every other
 * procedure on the rpc plane is a researcher-facing one and carries
 * `Authenticated`. `protocols.create` is the one admin-only procedure, so it
 * carries the tier gate as well.
 */
const STUDIO_MIDDLEWARE: Record<
  (typeof STUDIO_TAGS)[number],
  ReadonlyArray<string>
> = {
  'account.updateLocale': [AUTHENTICATED],
  'audit.filterOptions': [AUTHENTICATED],
  'audit.get': [AUTHENTICATED],
  'audit.list': [AUTHENTICATED],
  'me': [AUTHENTICATED],
  'protocols.addInformationStage': [AUTHENTICATED],
  'protocols.create': [AUTHENTICATED, TEAM_ADMINISTRATION],
  'protocols.draft': [AUTHENTICATED],
  'protocols.list': [AUTHENTICATED],
  'protocols.moveStage': [AUTHENTICATED],
  'setup.complete': [],
  'status': [],
  'studies.counts': [AUTHENTICATED],
  'studies.create': [AUTHENTICATED],
  'studies.get': [AUTHENTICATED],
  'studies.list': [AUTHENTICATED],
  'team.acceptInvitation': [AUTHENTICATED],
  'team.cancelInvitation': [AUTHENTICATED],
  'team.createInvitation': [AUTHENTICATED],
  'team.updateMemberRole': [AUTHENTICATED],
};

/**
 * `participant.redeem` spends a link before any session exists, so it is the
 * one participant procedure without `RequireSession` — which is why
 * `rpc/participant.ts` builds two groups and merges them.
 */
const PARTICIPANT_MIDDLEWARE: Record<string, ReadonlyArray<string>> = {
  'participant.redeem': [],
  'participant.session': [REQUIRE_SESSION],
  'participant.sync': [REQUIRE_SESSION],
  'participant.finish': [REQUIRE_SESSION],
};

// The structural minimum this file reads off a declaration: enough to name the
// middleware, and nothing that ties the helper to one group's rpc union.
type DeclaredRpc = {
  readonly middlewares: ReadonlySet<{ readonly key: string }>;
};

const middlewareKeys = <R extends DeclaredRpc>(
  requests: ReadonlyMap<string, R>,
  tag: string,
): ReadonlyArray<string> => {
  const rpc = requests.get(tag);
  if (rpc === undefined) {
    throw new Error(`No procedure is declared for the tag "${tag}"`);
  }
  return [...rpc.middlewares].map((middleware) => middleware.key).toSorted();
};

describe('StudioRpcs', () => {
  it('serves exactly the procedures the merged groups declare', () => {
    expect([...StudioRpcs.requests.keys()].toSorted()).toEqual([
      ...STUDIO_TAGS,
    ]);
  });

  it.each(Object.entries(STUDIO_MIDDLEWARE))(
    'declares the expected middleware on %s',
    (tag, expected) => {
      expect(middlewareKeys(StudioRpcs.requests, tag)).toEqual([...expected]);
    },
  );

  /**
   * The order, which the sorted assertion above cannot see and which decides
   * whether `protocols.create` works at all.
   *
   * `RpcServer.applyMiddleware` walks an rpc's middleware set in INSERTION
   * order rebinding `handler = middleware(handler)`, so the one inserted last
   * is the outermost and runs first. `TeamAdministration` reads the `Principal`
   * that `Authenticated` installs, so `Authenticated` has to be last. Reverse
   * the two `.middleware()` calls in `rpc/protocols.ts` and this fails; the
   * runtime and type-level consequences of that reversal are in
   * `ordering-probe.test.ts`.
   */
  it('declares Authenticated last on protocols.create, so it runs first', () => {
    const create = StudioRpcs.requests.get('protocols.create');
    if (create === undefined) throw new Error('protocols.create is not served');
    expect([...create.middlewares].map((middleware) => middleware.key)).toEqual(
      [TEAM_ADMINISTRATION, AUTHENTICATED],
    );
  });
});

describe('ParticipantRpcs', () => {
  it('declares the four participant procedures and nothing else', () => {
    expect([...ParticipantRpcs.requests.keys()].toSorted()).toEqual([
      'participant.finish',
      'participant.redeem',
      'participant.session',
      'participant.sync',
    ]);
  });

  it.each(Object.entries(PARTICIPANT_MIDDLEWARE))(
    'declares the expected middleware on %s',
    (tag, expected) => {
      expect(middlewareKeys(ParticipantRpcs.requests, tag)).toEqual([
        ...expected,
      ]);
    },
  );

  it('is not merged into the rpc plane, because nothing serves it yet', () => {
    for (const tag of ParticipantRpcs.requests.keys()) {
      expect(StudioRpcs.requests.has(tag)).toBe(false);
    }
  });
});

describe('the paths the two planes are served on', () => {
  it('pins the rpc and websocket paths', () => {
    expect(RPC_PATH).toBe('/rpc');
    expect(WS_PATH).toBe('/ws');
  });
});
