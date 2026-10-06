import { describe, expect, it } from 'vitest';

import { ParticipantRpcs } from '../rpc/participant.ts';
import { RPC_PATH, StudioRpcs, WS_PATH } from '../rpc/studio.ts';

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
  'status.updateAvailable',
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
  'status.updateAvailable': [AUTHENTICATED],
  'studies.counts': [AUTHENTICATED],
  'studies.create': [AUTHENTICATED],
  'studies.get': [AUTHENTICATED],
  'studies.list': [AUTHENTICATED],
  'team.acceptInvitation': [AUTHENTICATED],
  'team.cancelInvitation': [AUTHENTICATED],
  'team.createInvitation': [AUTHENTICATED],
  'team.updateMemberRole': [AUTHENTICATED],
};

const PARTICIPANT_MIDDLEWARE: Record<string, ReadonlyArray<string>> = {
  'participant.redeem': [],
  'participant.session': [REQUIRE_SESSION],
  'participant.sync': [REQUIRE_SESSION],
  'participant.finish': [REQUIRE_SESSION],
};

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
