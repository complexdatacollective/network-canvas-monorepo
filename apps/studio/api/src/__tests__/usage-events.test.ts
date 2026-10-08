import { randomUUID } from 'node:crypto';

import { Context, Effect, Layer, Redacted, Schema } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DraftId,
  ProtocolId,
  StageId,
  StudyId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';
import {
  AnalyticsDeliveryJobSchema,
  type UsageEvent,
} from '@codaco/studio-sync/jobs';

import { usageCapture } from '../analytics/usage-events.ts';
import { createStudio } from '../app.ts';
import type { AuthService } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { analyticsDelivery } from '../jobs/handlers/analytics-delivery.ts';
import { knownInstallation } from '../platform/__tests__/support/installation.ts';
import { Analytics, RecordedAnalytics } from '../platform/analytics.ts';
import { liveAuthService } from './support/auth.ts';
import {
  openTestDatabase,
  ownerAffected,
  ownerRows,
  type TestDatabaseRuntime,
  testDb,
  uniqueTeamId,
} from './support/database.ts';
import { createRpcClient, type RpcTestClient } from './support/rpc.ts';

const env = readEnv();

const TEAM_NAME = 'LEVEL2_TEAM_NAME';
const STUDY_NAME = 'LEVEL2_STUDY_NAME';
const RESEARCHER_NAME = 'LEVEL2_RESEARCHER_NAME';

const decodeJob = Schema.decodeUnknownSync(AnalyticsDeliveryJobSchema);

describe.skipIf(!testDb || !env.auth)('researcher usage events', () => {
  let database: TestDatabaseRuntime;
  let auth: AuthService['Service'];
  let client: RpcTestClient;
  let silentClient: RpcTestClient;
  let accountId: string;
  const email = `level2-${randomUUID()}@example.com`;
  const password = `a-long-test-password-${randomUUID()}`;
  const teamId = TeamId.make(uniqueTeamId('usage-events-team'));

  const usageFor = async (account: string): Promise<UsageEvent[]> => {
    const rows = await database.run(
      ownerRows<{ payload: unknown }>(
        `SELECT payload FROM ${database.harness.jobSchema}.jobs
          WHERE queue = 'analytics-delivery'
            AND (payload->'usage'->>'accountId' = $1
                 OR payload->'usage'->>'teamId' = $2)
          ORDER BY created_at, id`,
        [account, teamId],
      ),
    );
    return rows.map(({ payload }) => decodeJob(payload).usage);
  };

  const deliver = (usage: UsageEvent) =>
    Effect.gen(function* () {
      yield* analyticsDelivery({
        id: randomUUID(),
        queue: 'analytics-delivery',
        payload: { usage },
        attempt: 1,
        finalAttempt: false,
      });
      return yield* Effect.flatMap(
        RecordedAnalytics,
        (recorded) => recorded.captured,
      );
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Analytics.layerRecording,
          knownInstallation(randomUUID()),
        ),
      ),
      Effect.runPromise,
    );

  const createStudy = async (via: RpcTestClient, name: string) => {
    const input = {
      teamId,
      studyId: StudyId.make(randomUUID()),
      protocolId: ProtocolId.make(randomUUID()),
      draftId: DraftId.make(randomUUID()),
      name: Redacted.make(name),
    };
    await via.call(via.rpc('studies.create', input));
    return input;
  };

  beforeAll(async () => {
    database = await openTestDatabase();
    const recording = Effect.runSync(
      Effect.context<Analytics | RecordedAnalytics>().pipe(
        Effect.provide(Analytics.layerRecording),
      ),
    );
    const services = Context.merge(database.services, recording);
    auth = liveAuthService(env, services);

    const signedUp = await Effect.runPromise(
      auth.signUpEmail({
        name: Redacted.make(RESEARCHER_NAME),
        email: Redacted.make(email),
        password: Redacted.make(password),
      }),
    );
    if (signedUp.kind !== 'created') throw new Error(signedUp.kind);
    accountId = signedUp.session.userId;

    await database.run(
      ownerAffected(`INSERT INTO teams (id, name, slug) VALUES ($1, $2, $1)`, [
        teamId,
        TEAM_NAME,
      ]),
    );
    await database.run(
      ownerAffected(
        `INSERT INTO team_members (id, team_id, user_id, role)
         VALUES ($1, $2, $3, 'owner')`,
        [randomUUID(), teamId, accountId],
      ),
    );

    const cookie = signedUp.session.setCookies
      .map((setCookie) => setCookie.split(';')[0])
      .join('; ');
    client = await createRpcClient(createStudio(env, { auth, services }), {
      cookie,
    });
    silentClient = await createRpcClient(
      createStudio(env, {
        auth: liveAuthService(env, database.services),
        services: database.services,
      }),
      { cookie },
    );
  });

  afterAll(async () => {
    await client?.dispose();
    await silentClient?.dispose();
    await database?.dispose();
  });

  it('queues a sign-up and a sign-in for the new account', async () => {
    expect((await usageFor(accountId)).map(({ event }) => event)).toEqual([
      'researcher_signed_up',
      'researcher_signed_in',
    ]);
  });

  it('identifies the researcher at sign-in as the actor its audited requests record', async () => {
    const signedIn = await Effect.runPromise(
      auth.signInEmail({
        email: Redacted.make(email),
        password: Redacted.make(password),
      }),
    );
    expect(signedIn.kind).toBe('signedIn');

    const study = await createStudy(client, STUDY_NAME);

    const [audit] = await database.run(
      ownerRows<{ actor_id: string; request_id: string }>(
        `SELECT actor_id, request_id FROM audit_events
          WHERE team_id = $1 AND resource_id = $2
            AND event_type = 'study.created'`,
        [teamId, study.studyId],
      ),
    );
    const usage = await usageFor(accountId);
    const signIns = usage.filter(
      ({ event }) => event === 'researcher_signed_in',
    );
    expect(signIns).toHaveLength(2);
    const signIn = signIns[1];
    const created = usage.filter(({ event }) => event === 'study_created');
    expect(signIn).toBeDefined();
    expect(created).toHaveLength(1);

    const identified = (await deliver(signIn!)).find(
      ({ event }) => event === '$identify',
    );
    expect(identified?.distinctId).toBe(audit?.actor_id);
    expect(identified?.properties).toEqual({});

    const [sent] = await deliver(created[0]!);
    expect(sent?.distinctId).toBe(audit?.actor_id);
    expect(sent?.groups).toEqual({ team: teamId });
    expect(sent?.properties.study_id).toBe(study.studyId);
  });

  it('queues a committed draft with the interface types its protocol uses', async () => {
    const study = await createStudy(client, `${STUDY_NAME} draft`);
    await client.call(
      client.rpc('protocols.addInformationStage', {
        teamId,
        protocolId: study.protocolId,
        draftId: study.draftId,
        stageId: StageId.make(randomUUID()),
      }),
    );

    const committed = (await usageFor(accountId)).filter(
      (usage) =>
        usage.event === 'protocol_draft_committed' &&
        usage.protocolId === study.protocolId,
    );
    expect(committed).toEqual([
      {
        event: 'protocol_draft_committed',
        occurredAt: expect.any(Number),
        accountId,
        teamId,
        protocolId: study.protocolId,
        // A new Studio protocol starts with its Finish Screen stage, so the
        // draft holds that stage and the Information stage added here.
        interfaceTypes: ['FinishSession', 'Information'],
        operationCount: 1,
      },
    ]);
  });

  it('queues nothing for an action taken while telemetry is off', async () => {
    const study = await createStudy(silentClient, `${STUDY_NAME} silent`);
    expect(
      (await usageFor(accountId)).filter(
        (usage) =>
          'studyId' in usage &&
          usage.studyId === study.studyId &&
          usage.event === 'study_created',
      ),
    ).toEqual([]);
  });

  it('sends nothing but Level 1 values', async () => {
    const usage = await usageFor(accountId);
    expect(usage.length).toBeGreaterThan(4);
    const sent = JSON.stringify(
      usage.map((event) => [event, usageCapture(event, randomUUID())]),
    );
    for (const excluded of [TEAM_NAME, STUDY_NAME, RESEARCHER_NAME, email]) {
      expect(sent).not.toContain(excluded);
    }
  });
});
