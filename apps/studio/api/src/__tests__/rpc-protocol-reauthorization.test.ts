import { randomUUID } from 'node:crypto';

import { Effect, Exit, Option } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DraftId,
  ProtocolId,
  StageId,
  StudyId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';

import { createStudio } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import type { RateLimiter } from '../rate-limit/limiter.ts';
import { authServiceStub } from './support/auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  ownerRows,
  type TestDatabaseRuntime,
  testDb,
} from './support/database.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';
import { limiterWithoutStore } from './support/valkey.ts';

const TEAM_ID = TeamId.make('rpc-protocol-reauth-team');

type Researcher = {
  principal: SessionPrincipal;
  memberId: string;
  client: RpcTestClient;
};

type CreatedStudy = {
  studyId: StudyId;
  protocolId: ProtocolId;
  draftId: DraftId;
};

describe.skipIf(!testDb)(
  'protocol reachability under a concurrent change',
  () => {
    let database: TestDatabaseRuntime;
    const clients: RpcTestClient[] = [];
    let admin: Researcher;

    const addResearcher = async (
      slug: string,
      role: string,
      staleRole: string,
      limiter?: RateLimiter['Service'],
    ): Promise<Researcher> => {
      const principal: SessionPrincipal = {
        kind: 'user',
        userId: `rpc-protocol-reauth-${slug}-user`,
        email: `rpc-protocol-reauth-${slug}@example.com`,
        emailVerified: true,
        name: `RPC Protocol Reauth ${slug}`,
        locale: null,
        sessionId: `rpc-protocol-reauth-${slug}-session`,
      };
      const memberId = `rpc-protocol-reauth-${slug}-member`;
      await database.run(
        ownerAffected(
          `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true)`,
          [principal.userId, principal.name, principal.email],
        ),
      );
      await database.run(
        ownerAffected(
          `INSERT INTO team_members (id, team_id, user_id, role)
         VALUES ($1, $2, $3, $4)`,
          [memberId, TEAM_ID, principal.userId, role],
        ),
      );
      const client = await createRpcClient(
        createStudio(readEnv(), {
          services: database.services,
          ...(limiter === undefined ? {} : { limiter }),
          auth: authServiceStub({
            getSession: () => Effect.succeedSome(principal),
            getMembership: (_userId, teamId) =>
              Effect.succeed(
                Option.fromNullishOr(
                  teamId === TEAM_ID ? { role: staleRole } : null,
                ),
              ),
            listMemberships: () =>
              Effect.succeed([{ teamId: TEAM_ID, role: staleRole }]),
          }),
        }),
      );
      clients.push(client);
      return { principal, memberId, client };
    };

    const createStudy = async (name: string): Promise<CreatedStudy> => {
      const input = {
        teamId: TEAM_ID,
        studyId: StudyId.make(randomUUID()),
        protocolId: ProtocolId.make(randomUUID()),
        draftId: DraftId.make(randomUUID()),
        name,
      };
      await admin.client.call(admin.client.rpc('studies.create', input));
      return {
        studyId: input.studyId,
        protocolId: input.protocolId,
        draftId: input.draftId,
      };
    };

    const withChangeInFlight = async <A, E>(
      change: { statement: string; params: readonly unknown[] },
      request: () => Promise<Exit.Exit<A, E>>,
    ): Promise<Exit.Exit<A, E>> => {
      const { harness } = database;
      const holding = Promise.withResolvers<number>();
      const commit = Promise.withResolvers<void>();
      const blocker = database.run(
        harness.onOwner(
          Effect.gen(function* () {
            const [self] = yield* harness.owner.sql.unsafe<{ pid: number }>(
              'SELECT pg_backend_pid() AS pid',
            );
            yield* harness.owner.sql.unsafe(change.statement, change.params);
            holding.resolve(self?.pid ?? -1);
            yield* Effect.promise(() => commit.promise);
          }),
        ),
      );
      const pid = await Promise.race([
        holding.promise,
        blocker.then(() => {
          throw new Error('the change committed before it was held');
        }),
      ]);

      const pending = request();
      const state = { answered: false };
      void pending.then(() => {
        state.answered = true;
        return undefined;
      });
      const blockedOrAnswered = async (attempt: number): Promise<void> => {
        if (state.answered) return;
        if (attempt >= 400) {
          throw new Error('the request neither waited nor answered');
        }
        const [row] = await database.run(
          ownerRows<{ waiting: number }>(
            `SELECT count(*)::int AS waiting FROM pg_stat_activity
             WHERE $1 = ANY (pg_blocking_pids(pid))`,
            [pid],
          ),
        );
        if ((row?.waiting ?? 0) > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
        await blockedOrAnswered(attempt + 1);
      };
      await blockedOrAnswered(0);
      commit.resolve();
      await blocker;
      return pending;
    };

    const stageOrder = async (study: CreatedStudy) => {
      const draft = await admin.client.call(
        admin.client.rpc('protocols.draft', { teamId: TEAM_ID, ...study }),
      );
      return draft.sections.stageOrder;
    };

    beforeAll(async () => {
      database = await openTestDatabase();
      await database.run(insertTeam(TEAM_ID));
      admin = await addResearcher('admin', 'owner', 'owner');
    });

    afterAll(async () => {
      for (const client of clients) await client.dispose();
      await database.dispose();
    });

    it('refuses an edit from an Admin demoted while the request is in flight', async () => {
      const study = await createStudy('Demoted editor study');
      const demoted = await addResearcher('demoted-editor', 'admin', 'admin');
      const stageId = StageId.make(randomUUID());

      const exit = await withChangeInFlight(
        {
          statement: `UPDATE team_members SET role = 'member' WHERE id = $1`,
          params: [demoted.memberId],
        },
        () =>
          demoted.client.callExit(
            demoted.client.rpc('protocols.addInformationStage', {
              teamId: TEAM_ID,
              protocolId: study.protocolId,
              draftId: study.draftId,
              stageId,
            }),
          ),
      );

      await expectRpcFailure(Promise.resolve(exit), 'Forbidden');
      expect(await stageOrder(study)).toEqual({ stages: [] });
    });

    it('refuses a draft read from an Admin demoted while the request is in flight', async () => {
      const study = await createStudy('Demoted reader study');
      const demoted = await addResearcher('demoted-reader', 'admin', 'admin');

      const exit = await withChangeInFlight(
        {
          statement: `UPDATE team_members SET role = 'member' WHERE id = $1`,
          params: [demoted.memberId],
        },
        () =>
          demoted.client.callExit(
            demoted.client.rpc('protocols.draft', {
              teamId: TEAM_ID,
              ...study,
            }),
          ),
      );

      await expectRpcFailure(Promise.resolve(exit), 'Forbidden');
    });

    it('lists only what the role committed while the request is in flight can see', async () => {
      const study = await createStudy('Demoted lister study');
      const demoted = await addResearcher('demoted-lister', 'admin', 'admin');

      const exit = await withChangeInFlight(
        {
          statement: `UPDATE team_members SET role = 'member' WHERE id = $1`,
          params: [demoted.memberId],
        },
        () =>
          demoted.client.callExit(
            demoted.client.rpc('protocols.list', { teamId: TEAM_ID }),
          ),
      );

      if (Exit.isFailure(exit)) throw new Error('the list was refused');
      expect(exit.value.map((protocol) => protocol.id)).not.toContain(
        study.protocolId,
      );
    });

    const demotion = (memberId: string) => ({
      statement: `UPDATE team_members SET role = 'member' WHERE id = $1`,
      params: [memberId],
    });

    it('lists only the studies the role committed while the request is in flight can see', async () => {
      const study = await createStudy('Demoted study lister study');
      const demoted = await addResearcher('demoted-studies', 'admin', 'admin');

      const exit = await withChangeInFlight(demotion(demoted.memberId), () =>
        demoted.client.callExit(
          demoted.client.rpc('studies.list', { teamId: TEAM_ID }),
        ),
      );

      if (Exit.isFailure(exit)) throw new Error('the list was refused');
      expect(exit.value.map((listed) => listed.id)).not.toContain(
        study.studyId,
      );
    });

    it('refuses a study read from an Admin demoted while the request is in flight', async () => {
      const study = await createStudy('Demoted study reader study');
      const demoted = await addResearcher('demoted-study', 'admin', 'admin');

      const exit = await withChangeInFlight(demotion(demoted.memberId), () =>
        demoted.client.callExit(
          demoted.client.rpc('studies.get', { studyId: study.studyId }),
        ),
      );

      await expectRpcFailure(Promise.resolve(exit), 'Forbidden');
    });

    it('refuses study counts to an Admin demoted after the study was resolved', async () => {
      const study = await createStudy('Demoted counter study');
      const resolved = Promise.withResolvers<void>();
      const demoted = Promise.withResolvers<void>();
      const holding: RateLimiter['Service'] = {
        ...limiterWithoutStore,
        check: (scope, subject) =>
          scope === 'rpc_team'
            ? Effect.andThen(
                Effect.promise(async () => {
                  resolved.resolve();
                  await demoted.promise;
                }),
                limiterWithoutStore.check(scope, subject),
              )
            : limiterWithoutStore.check(scope, subject),
      };
      const counter = await addResearcher(
        'demoted-counter',
        'admin',
        'admin',
        holding,
      );

      const pending = counter.client.callExit(
        counter.client.rpc('studies.counts', { studyId: study.studyId }),
      );
      await resolved.promise;
      await database.run(
        ownerAffected(`UPDATE team_members SET role = 'member' WHERE id = $1`, [
          counter.memberId,
        ]),
      );
      demoted.resolve();

      await expectRpcFailure(pending, 'Forbidden');
    });

    it('refuses an edit through a grant revoked while the request is in flight', async () => {
      const study = await createStudy('Revoked grant study');
      const member = await addResearcher('revoked', 'member', 'member');
      const grantId = randomUUID();
      await database.run(
        ownerAffected(
          `INSERT INTO study_role_grants
           (id, team_id, study_id, user_id, role, granted_by_user_id)
         VALUES ($1, $2, $3, $4, 'protocol_designer', $5)`,
          [
            grantId,
            TEAM_ID,
            study.studyId,
            member.principal.userId,
            admin.principal.userId,
          ],
        ),
      );
      await member.client.call(
        member.client.rpc('protocols.draft', { teamId: TEAM_ID, ...study }),
      );

      const stageId = StageId.make(randomUUID());
      const exit = await withChangeInFlight(
        {
          statement: `DELETE FROM study_role_grants WHERE id = $1`,
          params: [grantId],
        },
        () =>
          member.client.callExit(
            member.client.rpc('protocols.addInformationStage', {
              teamId: TEAM_ID,
              protocolId: study.protocolId,
              draftId: study.draftId,
              stageId,
            }),
          ),
      );

      await expectRpcFailure(Promise.resolve(exit), 'Forbidden');
      expect(await stageOrder(study)).toEqual({ stages: [] });
    });
  },
);
