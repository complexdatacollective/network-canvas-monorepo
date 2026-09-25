// `requireProtocol` against a role or grant that changes while the request is
// in flight. `openTeam` reads the caller's role before the command's
// transaction opens, so a check that trusted it would let a demoted Admin — or
// a Member whose grant was just revoked — through. Each case holds the change
// open in an owner transaction, starts the request, waits until the request is
// blocked behind that transaction (or has already answered), and only then
// commits: the answer has to be the committed state's.
import { randomUUID } from 'node:crypto';

import { Effect, type Exit } from 'effect';
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
import { stubAuthService } from './support/auth.ts';
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

    /**
     * A team member whose `openTeam` always answers `staleRole`, whatever the
     * row says by the time the request's transaction reads it.
     */
    const addResearcher = async (
      slug: string,
      role: string,
      staleRole: string,
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
          pool: database.appPool,
          services: database.services,
          auth: stubAuthService({
            getSession: () => Promise.resolve(principal),
            getMembership: (_userId, teamId) =>
              Promise.resolve(teamId === TEAM_ID ? { role: staleRole } : null),
            listMemberships: () =>
              Promise.resolve([{ teamId: TEAM_ID, role: staleRole }]),
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

    /**
     * Runs `change` in an owner transaction held open across `request`, and
     * commits it once the request is blocked behind that transaction or has
     * already answered — so a request that never waits for the change is not
     * given the time to see it by accident.
     */
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

      // A Member with no grant on the study cannot reach its line, and the
      // committed role is Member — whatever `openTeam` read before.
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
      // The grant reaches the line before the revocation, so the refusal below
      // is the revocation's and not a line this Member never held.
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
