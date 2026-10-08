import { createHash, randomUUID } from 'node:crypto';

import { Context, Effect, Exit, Schema } from 'effect';
import { RpcClient } from 'effect/rpc';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { PARTICIPANT_SESSION_HEADER } from '@codaco/studio-contract/middleware/session';
import { LinkToken } from '@codaco/studio-contract/schema/ids';
import type { SyncInput } from '@codaco/studio-contract/schema/participant';

import { authServiceStub } from '../../__tests__/support/auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  ownerRows,
  TestDatabase,
  type TestDatabaseRuntime,
  testDb,
  uniqueTeamId,
} from '../../__tests__/support/database.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from '../../__tests__/support/rpc.ts';
import { createStudio } from '../../app.ts';
import { TenantScope, unsafeMakeTeamAccess } from '../../db/tenant.ts';
import { readEnv } from '../../env.ts';
import { Analytics, RecordedAnalytics } from '../../platform/analytics.ts';
import { baseProtocol } from '../../protocol/__tests__/helpers.ts';
import { createProtocol, publishDraft } from '../../protocol/store.ts';
import type { RateLimiter } from '../../rate-limit/limiter.ts';
import { RATE_LIMITS, type RateLimitScope } from '../../rate-limit/scopes.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { STUDIO_VERSION } from '../../version.ts';
import { mintSessionToken } from '../token.ts';

const MAPBOX_KEY = 'pk.participant-test-key';
const PHOTO_SOURCE = `${'a'.repeat(64)}.png`;

const interviewProtocol = (): CurrentProtocol => ({
  ...baseProtocol(),
  assetManifest: {
    mapKey: { id: 'mapKey', name: 'Mapbox', type: 'apikey', value: MAPBOX_KEY },
    photo: { id: 'photo', name: 'Photo', type: 'image', source: PHOTO_SOURCE },
  },
});

type Fixture = {
  readonly teamId: string;
  readonly studyId: string;
  readonly waveId: string;
  readonly versionId: string;
  readonly participantId: string | null;
  readonly participantCode: string | null;
  readonly linkId: string;
  readonly linkToken: string;
};

const seed = (mode: 'managed' | 'anonymous' = 'managed') =>
  Effect.gen(function* () {
    const harness = yield* TestDatabase;
    const cipher = yield* SecretsCipher;
    const teamId = uniqueTeamId('participant');
    yield* insertTeam(teamId);
    const { protocolId, versionId } = yield* TenantScope.open(
      unsafeMakeTeamAccess(teamId, 'owner'),
      Effect.gen(function* () {
        const created = yield* createProtocol(teamId, cipher, {
          protocol: interviewProtocol(),
        });
        const published = yield* publishDraft(teamId, {
          draftId: created.draftId,
          label: 'v1',
        });
        if (published.status !== 'published') {
          return yield* Effect.die(
            new Error('the fixture protocol is invalid'),
          );
        }
        return {
          protocolId: created.protocolId,
          versionId: published.versionId,
        };
      }),
    );
    const studyId = randomUUID();
    const waveId = randomUUID();
    const participantId = mode === 'managed' ? randomUUID() : null;
    const participantCode = mode === 'managed' ? 'P-0001' : null;
    const linkId = randomUUID();
    const link = mintSessionToken(teamId);
    const { sql } = harness.owner;
    yield* harness.onOwner(
      Effect.gen(function* () {
        yield* sql`insert into studies
                     (id, team_id, name, protocol_id, participation_mode,
                      state, went_live_at)
                   values (${studyId}, ${teamId}, 'A study', ${protocolId},
                           ${mode}, 'live', now())`;
        yield* sql`insert into study_waves
                     (id, study_id, team_id, wave_number, protocol_version_id)
                   values (${waveId}, ${studyId}, ${teamId}, 1, ${versionId})`;
        if (participantId !== null) {
          yield* sql`insert into participants
                       (id, study_id, team_id, participant_code)
                     values (${participantId}, ${studyId}, ${teamId},
                             ${participantCode})`;
        }
        yield* sql`insert into interview_links
                     (id, study_id, team_id, wave_id, participant_id, kind,
                      token_hash)
                   values (${linkId}, ${studyId}, ${teamId}, ${waveId},
                           ${participantId},
                           ${participantId === null ? 'anonymous' : 'participant'},
                           ${link.secretHash})`;
      }),
    );
    const fixture: Fixture = {
      teamId,
      studyId,
      waveId,
      versionId,
      participantId,
      participantCode,
      linkId,
      linkToken: link.token,
    };
    return fixture;
  });

const network = (
  nodeIds: readonly string[],
  edges: readonly [string, string][],
) => ({
  nodes: nodeIds.map((id) => ({
    _uid: id,
    type: 'person',
    attributes: { personName: id },
  })),
  edges: edges.map(([from, to]) => ({
    _uid: `${from}-${to}`,
    type: 'knows',
    from,
    to,
    attributes: {},
  })),
  ego: { _uid: 'ego', attributes: { age: 41 } },
});

const syncInput = (
  holderEpoch: number,
  revision: string,
  nodeIds: readonly string[],
  edges: readonly [string, string][] = [],
): typeof SyncInput.Type => ({
  holderEpoch,
  revision,
  stageIndex: 1,
  stageId: 'stage-1',
  network: network(nodeIds, edges),
  stageMetadata: { 'stage-1': { seen: true } },
});

describe.skipIf(!testDb)('the participant procedures', () => {
  let database: TestDatabaseRuntime;
  let client: RpcTestClient;
  const charged: string[] = [];
  const refused = new Set<RateLimitScope>();

  const limiter: RateLimiter['Service'] = {
    configured: true,
    rules: RATE_LIMITS,
    check: (scope, subject) =>
      Effect.sync(() => {
        charged.push(`${scope}:${subject}`);
        return refused.has(scope)
          ? { allowed: false, retryAfterSeconds: 7 }
          : { allowed: true };
      }),
    consume: () => Effect.succeed({ allowed: true }),
    readiness: Effect.succeed('ok'),
  };

  beforeAll(async () => {
    database = await openTestDatabase();
    client = await createRpcClient(
      createStudio(readEnv(), {
        auth: authServiceStub(),
        services: database.services,
        limiter,
      }),
    );
  });

  afterAll(async () => {
    await client.dispose();
    await database.dispose();
  });

  beforeEach(() => {
    charged.length = 0;
    refused.clear();
  });

  const query = <A extends object = Record<string, unknown>>(
    text: string,
    params: ReadonlyArray<unknown> = [],
  ) => database.run(ownerRows<A>(text, params));
  const exec = (text: string, params: ReadonlyArray<unknown> = []) =>
    database.run(ownerAffected(text, params));

  const redeem = (linkToken: string) =>
    client.callExit(
      client.rpc('participant.redeem', {
        linkToken: Schema.decodeSync(LinkToken)(linkToken),
      }),
    );
  const redeemed = async (linkToken: string) => {
    const exit = await redeem(linkToken);
    if (Exit.isFailure(exit))
      throw new Error(`redeem failed: ${String(exit.cause)}`);
    return exit.value;
  };
  const asParticipant = <A, E, R>(
    token: string,
    effect: Effect.Effect<A, E, R>,
  ) => RpcClient.withHeaders(effect, { [PARTICIPANT_SESSION_HEADER]: token });
  const readSession = (token: string, holderId = 'page-a') =>
    client.callExit(
      asParticipant(token, client.rpc('participant.session', { holderId })),
    );
  const opened = async (token: string, holderId = 'page-a') => {
    const exit = await readSession(token, holderId);
    if (Exit.isFailure(exit))
      throw new Error(`session failed: ${String(exit.cause)}`);
    return exit.value;
  };
  const sync = (token: string, input: typeof SyncInput.Type) =>
    client.callExit(
      asParticipant(token, client.rpc('participant.sync', input)),
    );
  const finish = (token: string, holderEpoch: number, revision: string) =>
    client.callExit(
      asParticipant(
        token,
        client.rpc('participant.finish', { holderEpoch, revision }),
      ),
    );

  const fixture = (mode?: 'managed' | 'anonymous') => database.run(seed(mode));
  const sessionRow = async (sessionId: string) =>
    (
      await query<{
        status: string;
        client_revision: string;
        ego_attributes: unknown;
      }>(
        `SELECT status, client_revision::text AS client_revision, ego_attributes
         FROM interview_sessions WHERE id = $1`,
        [sessionId],
      )
    )[0];
  const auditEvents = (teamId: string) =>
    query<{
      event_type: string;
      actor_kind: string;
      actor_id: string;
      actor_label: string;
      details: Record<string, unknown>;
    }>(
      `SELECT event_type, actor_kind, actor_id, actor_label, details
       FROM audit_events WHERE team_id = $1 ORDER BY sequence`,
      [teamId],
    );

  describe('participant.redeem', () => {
    it('gives a managed participant one session and replaces its token on each redemption', async () => {
      const f = await fixture();
      const first = await redeemed(f.linkToken);
      const second = await redeemed(f.linkToken);

      expect(second.sessionId).toBe(first.sessionId);
      expect(second.sessionToken).not.toBe(first.sessionToken);
      expect(first.anonymous).toBe(false);
      await expectRpcFailure(readSession(first.sessionToken), 'Unauthorized');
      expect((await opened(second.sessionToken)).session.id).toBe(
        first.sessionId,
      );

      const links = await query<{ redemption_count: number }>(
        'SELECT redemption_count FROM interview_links WHERE id = $1',
        [f.linkId],
      );
      expect(links[0]?.redemption_count).toBe(2);

      const events = await auditEvents(f.teamId);
      expect(events.map((event) => event.event_type)).toEqual([
        'interview.started',
        'interview.started',
      ]);
      expect(events[0]).toMatchObject({
        actor_kind: 'participant',
        actor_id: first.sessionId,
        actor_label: 'P-0001',
        details: { studyId: f.studyId, waveId: f.waveId, resumed: false },
      });
      expect(events[1]?.details).toMatchObject({ resumed: true });
    });

    it('opens a new session for each anonymous redemption', async () => {
      const f = await fixture('anonymous');
      const first = await redeemed(f.linkToken);
      const second = await redeemed(f.linkToken);
      expect(second.sessionId).not.toBe(first.sessionId);
      expect(first.anonymous).toBe(true);
      const events = await auditEvents(f.teamId);
      expect(events[0]?.actor_label).toBe(first.sessionId.slice(0, 8));
    });

    it('refuses an unknown, malformed or foreign-team link as unauthorized', async () => {
      const f = await fixture();
      const secret = f.linkToken.slice(f.linkToken.lastIndexOf('.') + 1);
      await expectRpcFailure(
        redeem(mintSessionToken(f.teamId).token),
        'Unauthorized',
      );
      await expectRpcFailure(redeem('not-a-link-token-at-all'), 'Unauthorized');
      await expectRpcFailure(
        redeem(`${uniqueTeamId('nowhere')}.${secret}`),
        'Unauthorized',
      );
      expect(await auditEvents(f.teamId)).toEqual([]);
    });

    it.each([
      [
        'revoked',
        'UPDATE interview_links SET revoked_at = now() WHERE study_id = $1',
      ],
      [
        'expired',
        "UPDATE interview_links SET expires_at = now() - interval '1 minute' WHERE study_id = $1",
      ],
      [
        'paused',
        "UPDATE studies SET state = 'paused', paused_at = now() WHERE id = $1",
      ],
      [
        'closed',
        "UPDATE studies SET state = 'closed', closed_at = now() WHERE id = $1",
      ],
      [
        'not_open',
        "UPDATE study_waves SET opens_at = now() + interval '1 day' WHERE study_id = $1",
      ],
    ] as const)('answers %s, and records nothing', async (state, change) => {
      const f = await fixture();
      await exec(change, [f.studyId]);
      const refusal = await expectRpcFailure(
        redeem(f.linkToken),
        'LinkUnavailable',
      );
      expect(refusal.state).toBe(state);
      expect(await auditEvents(f.teamId)).toEqual([]);
      expect(
        await query('SELECT id FROM interview_sessions WHERE study_id = $1', [
          f.studyId,
        ]),
      ).toEqual([]);
    });

    it('answers finished once the managed session is complete', async () => {
      const f = await fixture();
      const { sessionToken } = await redeemed(f.linkToken);
      const session = await opened(sessionToken);
      await finish(sessionToken, session.holderEpoch, session.revision);
      const refusal = await expectRpcFailure(
        redeem(f.linkToken),
        'LinkUnavailable',
      );
      expect(refusal.state).toBe('finished');
    });

    it('reopens an abandoned managed session', async () => {
      const f = await fixture();
      const { sessionId } = await redeemed(f.linkToken);
      await exec(
        "UPDATE interview_sessions SET status = 'abandoned', abandoned_at = now(), session_token_hash = NULL WHERE id = $1",
        [sessionId],
      );
      const again = await redeemed(f.linkToken);
      expect(again.sessionId).toBe(sessionId);
      expect((await sessionRow(sessionId))?.status).toBe('in_progress');
    });

    it('charges the client address, then a participant link, and refuses past either limit', async () => {
      const f = await fixture();
      await redeemed(f.linkToken);
      expect(charged).toEqual([
        'participant_redeem_address:unknown',
        `participant_redeem_link:${f.linkId}`,
      ]);

      refused.add('participant_redeem_link');
      const limited = await expectRpcFailure(
        redeem(f.linkToken),
        'RateLimited',
      );
      expect(limited.retryAfterSeconds).toBe(7);
      refused.clear();
      refused.add('participant_redeem_address');
      await expectRpcFailure(redeem(f.linkToken), 'RateLimited');
    });

    it('never charges a shared anonymous link per link', async () => {
      const f = await fixture('anonymous');
      refused.add('participant_redeem_link');
      await redeemed(f.linkToken);
      await redeemed(f.linkToken);
      expect(charged).toEqual([
        'participant_redeem_address:unknown',
        'participant_redeem_address:unknown',
      ]);
    });
  });

  describe('participant.session', () => {
    it('carries no analytics configuration while telemetry is off', async () => {
      await exec(
        'INSERT INTO installation (id) VALUES (1) ON CONFLICT (id) DO NOTHING',
      );
      const f = await fixture();
      const { sessionToken } = await redeemed(f.linkToken);
      expect((await opened(sessionToken)).analytics).toBe(false);
    });

    it('returns the pinned protocol with its API key and the session as stored', async () => {
      const f = await fixture();
      const { sessionId, sessionToken } = await redeemed(f.linkToken);
      const session = await opened(sessionToken);

      expect(session).toMatchObject({
        studyId: f.studyId,
        holderEpoch: 1,
        revision: '0',
        stageIndex: 0,
        stageId: null,
        session: {
          id: sessionId,
          finishTime: null,
          exportTime: null,
          network: { nodes: [], edges: [] },
          stageMetadata: {},
        },
      });
      const protocol = session.protocol as {
        id: string;
        assets: unknown[];
        schemaVersion: number;
      };
      expect(protocol.id).toBe(f.versionId);
      expect(protocol.schemaVersion).toBe(8);
      expect(protocol.assets).toEqual(
        expect.arrayContaining([
          {
            assetId: 'mapKey',
            name: 'Mapbox',
            type: 'apikey',
            value: MAPBOX_KEY,
          },
          {
            assetId: 'photo',
            name: 'Photo',
            type: 'image',
            source: PHOTO_SOURCE,
          },
        ]),
      );
    });

    it('takes the session over for a new page and not for a refetch', async () => {
      const f = await fixture();
      const { sessionToken } = await redeemed(f.linkToken);
      expect((await opened(sessionToken, 'page-a')).holderEpoch).toBe(1);
      expect((await opened(sessionToken, 'page-a')).holderEpoch).toBe(1);
      expect((await opened(sessionToken, 'page-b')).holderEpoch).toBe(2);
    });

    it('is charged per session and refused past the limit', async () => {
      const f = await fixture();
      const { sessionId, sessionToken } = await redeemed(f.linkToken);
      charged.length = 0;
      refused.add('participant_session');
      const limited = await expectRpcFailure(
        readSession(sessionToken),
        'RateLimited',
      );
      expect(limited.retryAfterSeconds).toBe(7);
      expect(charged).toEqual([`participant_session:${sessionId}`]);
    });

    it('lets an interview continue through a pause until the grace window ends', async () => {
      const f = await fixture();
      const { sessionToken } = await redeemed(f.linkToken);
      await exec(
        "UPDATE studies SET state = 'paused', paused_at = now() WHERE id = $1",
        [f.studyId],
      );
      expect(Exit.isSuccess(await readSession(sessionToken))).toBe(true);
      await exec(
        "UPDATE studies SET paused_at = now() - interval '2 hours' WHERE id = $1",
        [f.studyId],
      );
      const refusal = await expectRpcFailure(
        readSession(sessionToken),
        'LinkUnavailable',
      );
      expect(refusal.state).toBe('paused');
    });
  });

  describe('participant.sync', () => {
    it('writes the network as rows with the stage and ego, and refreshes the projections', async () => {
      const f = await fixture();
      const { sessionId, sessionToken } = await redeemed(f.linkToken);
      const session = await opened(sessionToken);
      const exit = await sync(
        sessionToken,
        syncInput(session.holderEpoch, '1', ['n1', 'n2', 'n3'], [['n1', 'n2']]),
      );
      expect(exit).toEqual(Exit.succeed({ revision: '1', applied: true }));

      expect(
        await query(
          'SELECT node_id FROM nodes WHERE session_id = $1 ORDER BY node_id',
          [sessionId],
        ),
      ).toEqual([{ node_id: 'n1' }, { node_id: 'n2' }, { node_id: 'n3' }]);
      expect(
        await query(
          'SELECT node_count, edge_count FROM session_stats WHERE session_id = $1',
          [sessionId],
        ),
      ).toEqual([{ node_count: 3, edge_count: 1 }]);
      expect(await sessionRow(sessionId)).toMatchObject({
        client_revision: '1',
        ego_attributes: { age: 41 },
      });

      const resumed = await opened(sessionToken);
      expect(resumed.revision).toBe('1');
      expect(resumed.stageIndex).toBe(1);
      expect(resumed.stageId).toBe('stage-1');
      expect(resumed.session.stageMetadata).toEqual({
        'stage-1': { seen: true },
      });
      expect(resumed.session.network).toEqual(
        network(['n1', 'n2', 'n3'], [['n1', 'n2']]),
      );
    });

    it('removes nodes and edges the browser no longer holds', async () => {
      const f = await fixture();
      const { sessionId, sessionToken } = await redeemed(f.linkToken);
      const { holderEpoch } = await opened(sessionToken);
      await sync(
        sessionToken,
        syncInput(holderEpoch, '1', ['n1', 'n2'], [['n1', 'n2']]),
      );
      expect(
        await sync(sessionToken, syncInput(holderEpoch, '2', ['n1'])),
      ).toEqual(Exit.succeed({ revision: '2', applied: true }));
      expect(
        await query('SELECT node_id FROM nodes WHERE session_id = $1', [
          sessionId,
        ]),
      ).toEqual([{ node_id: 'n1' }]);
      expect(
        await query('SELECT edge_id FROM edges WHERE session_id = $1', [
          sessionId,
        ]),
      ).toEqual([]);
    });

    it('changes nothing for a replayed revision', async () => {
      const f = await fixture();
      const { sessionId, sessionToken } = await redeemed(f.linkToken);
      const { holderEpoch } = await opened(sessionToken);
      await sync(sessionToken, syncInput(holderEpoch, '3', ['n1']));
      const before = await query(
        'SELECT node_id, attributes FROM nodes WHERE session_id = $1',
        [sessionId],
      );
      const activity = await query(
        'SELECT last_activity_at FROM interview_sessions WHERE id = $1',
        [sessionId],
      );
      expect(
        await sync(sessionToken, syncInput(holderEpoch, '3', ['n1', 'n2'])),
      ).toEqual(Exit.succeed({ revision: '3', applied: false }));
      expect(
        await query(
          'SELECT node_id, attributes FROM nodes WHERE session_id = $1',
          [sessionId],
        ),
      ).toEqual(before);
      expect(
        await query(
          'SELECT last_activity_at FROM interview_sessions WHERE id = $1',
          [sessionId],
        ),
      ).toEqual(activity);
    });

    it('refuses a write from a page that was taken over, and writes nothing', async () => {
      const f = await fixture();
      const { sessionId, sessionToken } = await redeemed(f.linkToken);
      const first = await opened(sessionToken, 'page-a');
      await opened(sessionToken, 'page-b');
      const refusal = await expectRpcFailure(
        sync(sessionToken, syncInput(first.holderEpoch, '1', ['n1'])),
        'SessionTakenOver',
      );
      expect(refusal.holderEpoch).toBe(2);
      expect(
        await query('SELECT node_id FROM nodes WHERE session_id = $1', [
          sessionId,
        ]),
      ).toEqual([]);
    });

    it('is charged per session and refused past the limit', async () => {
      const f = await fixture();
      const { sessionId, sessionToken } = await redeemed(f.linkToken);
      const { holderEpoch } = await opened(sessionToken);
      charged.length = 0;
      refused.add('participant_sync');
      await expectRpcFailure(
        sync(sessionToken, syncInput(holderEpoch, '1', ['n1'])),
        'RateLimited',
      );
      expect(charged).toEqual([`participant_sync:${sessionId}`]);
    });
  });

  describe('participant.finish', () => {
    it('completes the session with its snapshot, job and audit event in one transaction', async () => {
      const f = await fixture();
      const { sessionId, sessionToken } = await redeemed(f.linkToken);
      const { holderEpoch } = await opened(sessionToken);
      await sync(
        sessionToken,
        syncInput(holderEpoch, '1', ['n1', 'n2'], [['n1', 'n2']]),
      );

      expect(await finish(sessionToken, holderEpoch, '1')).toEqual(
        Exit.succeed({ state: 'completed' }),
      );
      expect((await sessionRow(sessionId))?.status).toBe('completed');

      const snapshots = await query<{
        payload: unknown;
        payload_hash: string;
        schema_version: number;
      }>(
        'SELECT payload, payload_hash, schema_version FROM session_snapshots WHERE session_id = $1',
        [sessionId],
      );
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.schema_version).toBe(8);
      expect(snapshots[0]?.payload).toMatchObject({
        currentStep: 1,
        stageMetadata: { 'stage-1': { seen: true } },
        network: network(['n1', 'n2'], [['n1', 'n2']]),
      });

      const jobSchema = database.harness.jobSchema;
      expect(
        await query(
          `SELECT queue, payload FROM ${jobSchema}.jobs WHERE payload->>'sessionId' = $1`,
          [sessionId],
        ),
      ).toEqual([{ queue: 'session-completed', payload: { sessionId } }]);

      const events = await auditEvents(f.teamId);
      expect(events.at(-1)).toMatchObject({
        event_type: 'interview.completed',
        actor_kind: 'participant',
        actor_id: sessionId,
        details: {
          studyId: f.studyId,
          waveId: f.waveId,
          nodeCount: 2,
          edgeCount: 1,
        },
      });
    });

    it('leaves the token resolvable, answering finished instead of accepting writes', async () => {
      const f = await fixture();
      const { sessionToken } = await redeemed(f.linkToken);
      const { holderEpoch } = await opened(sessionToken);
      await finish(sessionToken, holderEpoch, '0');

      expect(
        (await expectRpcFailure(readSession(sessionToken), 'SessionEnded'))
          .state,
      ).toBe('completed');
      expect(
        (
          await expectRpcFailure(
            sync(sessionToken, syncInput(holderEpoch, '1', ['n1'])),
            'SessionEnded',
          )
        ).state,
      ).toBe('completed');
      expect(
        (
          await expectRpcFailure(
            finish(sessionToken, holderEpoch, '0'),
            'SessionEnded',
          )
        ).state,
      ).toBe('completed');
    });

    it("answers out of date when the server lacks the browser's last save, and commits nothing", async () => {
      const f = await fixture();
      const { sessionId, sessionToken } = await redeemed(f.linkToken);
      const { holderEpoch } = await opened(sessionToken);
      await sync(sessionToken, syncInput(holderEpoch, '1', ['n1']));

      const refusal = await expectRpcFailure(
        finish(sessionToken, holderEpoch, '2'),
        'SessionOutOfDate',
      );
      expect(refusal.revision).toBe('1');
      expect((await sessionRow(sessionId))?.status).toBe('in_progress');
      expect(
        await query(
          'SELECT session_id FROM session_snapshots WHERE session_id = $1',
          [sessionId],
        ),
      ).toEqual([]);

      await sync(sessionToken, syncInput(holderEpoch, '2', ['n1', 'n2']));
      expect(await finish(sessionToken, holderEpoch, '2')).toEqual(
        Exit.succeed({ state: 'completed' }),
      );
    });

    it('refuses a page that was taken over', async () => {
      const f = await fixture();
      const { sessionId, sessionToken } = await redeemed(f.linkToken);
      const first = await opened(sessionToken, 'page-a');
      await opened(sessionToken, 'page-b');
      await expectRpcFailure(
        finish(sessionToken, first.holderEpoch, '0'),
        'SessionTakenOver',
      );
      expect((await sessionRow(sessionId))?.status).toBe('in_progress');
    });

    it('commits nothing when the snapshot cannot be written', async () => {
      const f = await fixture();
      const { sessionId, sessionToken } = await redeemed(f.linkToken);
      const { holderEpoch } = await opened(sessionToken);
      await exec(`CREATE OR REPLACE FUNCTION refuse_test_snapshot() RETURNS trigger AS $$
                  BEGIN RAISE EXCEPTION 'snapshot refused by the test'; END;
                  $$ LANGUAGE plpgsql`);
      await exec(`CREATE TRIGGER refuse_test_snapshot BEFORE INSERT ON session_snapshots
                  FOR EACH ROW WHEN (NEW.session_id = '${sessionId}')
                  EXECUTE FUNCTION refuse_test_snapshot()`);
      try {
        const exit = await finish(sessionToken, holderEpoch, '0');
        expect(Exit.isFailure(exit)).toBe(true);
      } finally {
        await exec('DROP TRIGGER refuse_test_snapshot ON session_snapshots');
      }

      expect((await sessionRow(sessionId))?.status).toBe('in_progress');
      expect(
        await query(
          `SELECT id FROM ${database.harness.jobSchema}.jobs WHERE payload->>'sessionId' = $1`,
          [sessionId],
        ),
      ).toEqual([]);
      expect(
        (await auditEvents(f.teamId)).map((event) => event.event_type),
      ).toEqual(['interview.started']);
    });
  });
});

describe.skipIf(!testDb)('participant analytics', () => {
  let database: TestDatabaseRuntime;
  let client: RpcTestClient;
  let recorded: RecordedAnalytics['Service'];
  let installationId: string;
  const charged: string[] = [];
  const refused = new Set<RateLimitScope>();

  const limiter: RateLimiter['Service'] = {
    configured: true,
    rules: RATE_LIMITS,
    check: (scope, subject) =>
      Effect.sync(() => {
        charged.push(`${scope}:${subject}`);
        return refused.has(scope)
          ? { allowed: false, retryAfterSeconds: 7 }
          : { allowed: true };
      }),
    consume: () => Effect.succeed({ allowed: true }),
    readiness: Effect.succeed('ok'),
  };

  beforeAll(async () => {
    database = await openTestDatabase();
    const analytics = Effect.runSync(
      Effect.context<Analytics | RecordedAnalytics>().pipe(
        Effect.provide(Analytics.layerRecording),
      ),
    );
    recorded = Context.get(analytics, RecordedAnalytics);
    await database.run(
      ownerAffected(
        'INSERT INTO installation (id) VALUES (1) ON CONFLICT (id) DO NOTHING',
      ),
    );
    const rows = await database.run(
      ownerRows<{ installation_id: string }>(
        'SELECT installation_id FROM installation WHERE id = 1',
      ),
    );
    installationId = rows[0]!.installation_id;
    client = await createRpcClient(
      createStudio(readEnv(), {
        auth: authServiceStub(),
        services: Context.merge(database.services, analytics),
        limiter,
      }),
    );
  });

  afterAll(async () => {
    await client.dispose();
    await database.dispose();
  });

  beforeEach(async () => {
    charged.length = 0;
    refused.clear();
    await Effect.runPromise(recorded.clear);
  });

  const asParticipant = <A, E, R>(
    token: string,
    effect: Effect.Effect<A, E, R>,
  ) => RpcClient.withHeaders(effect, { [PARTICIPANT_SESSION_HEADER]: token });

  const begin = async (participantAnalytics?: boolean) => {
    const f = await database.run(seed());
    if (participantAnalytics !== undefined) {
      await database.run(
        ownerAffected('UPDATE studies SET settings = $2::jsonb WHERE id = $1', [
          f.studyId,
          JSON.stringify({ participantAnalytics }),
        ]),
      );
    }
    const redeemed = await client.call(
      client.rpc('participant.redeem', {
        linkToken: Schema.decodeSync(LinkToken)(f.linkToken),
      }),
    );
    const session = await client.call(
      asParticipant(
        redeemed.sessionToken,
        client.rpc('participant.session', { holderId: 'page-a' }),
      ),
    );
    return { ...redeemed, session };
  };

  const send = (
    token: string,
    events: { event: string; properties: Record<string, unknown> }[],
  ) =>
    client.callExit(
      asParticipant(
        token,
        client.rpc('participant.analytics', {
          events: events.map((captured) => ({
            ...captured,
            timestamp: '2026-10-07T09:00:00.000Z',
          })),
        }),
      ),
    );

  const captured = () => Effect.runPromise(recorded.captured);

  it('tells the page to report usability events', async () => {
    const { session } = await begin();
    expect(session.analytics).toBe(true);
    expect(JSON.stringify(session)).not.toContain(installationId);
  });

  it('tells the page not to report when the study turned participant analytics off', async () => {
    const { session } = await begin(false);
    expect(session.analytics).toBe(false);
  });

  it('treats a setting it cannot read as off', async () => {
    const f = await database.run(seed());
    await database.run(
      ownerAffected(
        `UPDATE studies SET settings = '{"participantAnalytics":"false"}'::jsonb WHERE id = $1`,
        [f.studyId],
      ),
    );
    const redeemed = await client.call(
      client.rpc('participant.redeem', {
        linkToken: Schema.decodeSync(LinkToken)(f.linkToken),
      }),
    );
    const session = await client.call(
      asParticipant(
        redeemed.sessionToken,
        client.rpc('participant.session', { holderId: 'page-a' }),
      ),
    );
    expect(session.analytics).toBe(false);
  });

  it('forwards usability events unidentified and stamped by the server', async () => {
    const { sessionId, sessionToken } = await begin();
    charged.length = 0;
    const exit = await send(sessionToken, [
      {
        event: 'stage_entered',
        properties: {
          distinct_id: 'page-pseudonym',
          stage_type: 'NameGenerator',
          installation_id: 'chosen-by-the-page',
          app: 'chosen-by-the-page',
          $app_name: 'chosen-by-the-page',
          $app_version: 'chosen-by-the-page',
          host_version: 'chosen-by-the-page',
          $process_person_profile: true,
          $geoip_disable: false,
          token: 'phc_another_project',
          api_key: 'phc_another_project',
          $set: { email: 'participant@example.com' },
          $set_once: { email: 'participant@example.com' },
          $unset: ['name'],
          $groups: { team: 'chosen-by-the-page' },
          $ip: '203.0.113.9',
          $anon_distinct_id: 'another-person',
          $session_id: 'session-token-shaped',
          $current_url: 'http://localhost/session/secret',
          $lib: 'chosen-by-the-page',
        },
      },
      {
        event: '$identify',
        properties: { distinct_id: 'page-pseudonym', $set: { name: 'Ada' } },
      },
      { event: 'stage_left', properties: { stage_type: 'NameGenerator' } },
    ]);

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(charged).toEqual([`participant_analytics:${sessionId}`]);
    const stamped = {
      app: 'studio',
      $app_name: 'Network Canvas Studio',
      $app_version: STUDIO_VERSION,
      host_version: STUDIO_VERSION,
      installation_id: installationId,
      $process_person_profile: false,
      $geoip_disable: true,
    };
    const distinctId = `participant:${createHash('sha256').update(`${installationId}:${sessionId}`).digest('hex').slice(0, 32)}`;
    expect(await captured()).toEqual([
      {
        event: 'stage_entered',
        distinctId,
        timestamp: '2026-10-07T09:00:00.000Z',
        properties: { stage_type: 'NameGenerator', ...stamped },
      },
      {
        event: 'stage_left',
        distinctId,
        timestamp: '2026-10-07T09:00:00.000Z',
        properties: { stage_type: 'NameGenerator', ...stamped },
      },
    ]);
  });

  it('keeps one identity for a session across pages, and a different one per session', async () => {
    const first = await begin();
    const second = await begin();
    const event = [
      { event: 'stage_entered', properties: { distinct_id: 'page-a' } },
    ];
    await send(first.sessionToken, event);
    await client.call(
      asParticipant(
        first.sessionToken,
        client.rpc('participant.session', { holderId: 'page-b' }),
      ),
    );
    await send(first.sessionToken, [
      { event: 'stage_entered', properties: { distinct_id: 'page-b' } },
    ]);
    await send(second.sessionToken, event);

    const [before, after, other] = (await captured()).map(
      (forwarded) => forwarded.distinctId,
    );
    expect(after).toBe(before);
    expect(other).not.toBe(before);
    expect(before).not.toContain(first.sessionId);
  });

  it('forwards an exception by its type only, never its message', async () => {
    const { sessionToken } = await begin();
    await send(sessionToken, [
      {
        event: '$exception',
        properties: {
          feature: 'external-data',
          $exception_list: [
            {
              type: 'SyntaxError',
              value: 'Unexpected token in ROSTER_ROW_SENTINEL',
              stacktrace: { frames: [{ filename: 'ROSTER_ROW_SENTINEL' }] },
            },
          ],
          $exception_message: 'ROSTER_ROW_SENTINEL',
        },
      },
      {
        event: '$exception',
        properties: {
          $exception_list: [{ type: 'not a type: ROSTER_ROW_SENTINEL' }],
        },
      },
    ]);
    const forwarded = await captured();
    expect(JSON.stringify(forwarded)).not.toContain('ROSTER_ROW_SENTINEL');
    expect(
      forwarded.map((event) => [
        event.properties.feature,
        event.properties.$exception_list,
      ]),
    ).toEqual([
      [
        'external-data',
        [
          {
            type: 'SyntaxError',
            value: 'SyntaxError',
            mechanism: { handled: true, synthetic: false },
          },
        ],
      ],
      [
        undefined,
        [
          {
            type: 'Error',
            value: 'Error',
            mechanism: { handled: true, synthetic: false },
          },
        ],
      ],
    ]);
  });

  it('forwards nothing for a study that turned participant analytics off', async () => {
    const { sessionToken } = await begin(false);
    const exit = await send(sessionToken, [
      { event: 'stage_entered', properties: { distinct_id: 'page-pseudonym' } },
    ]);
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(await captured()).toEqual([]);
  });

  it('is refused past the per-session limit', async () => {
    const { sessionToken } = await begin();
    refused.add('participant_analytics');
    const limited = await expectRpcFailure(
      send(sessionToken, [
        {
          event: 'stage_entered',
          properties: { distinct_id: 'page-pseudonym' },
        },
      ]),
      'RateLimited',
    );
    expect(limited.retryAfterSeconds).toBe(7);
    expect(await captured()).toEqual([]);
  });
});
