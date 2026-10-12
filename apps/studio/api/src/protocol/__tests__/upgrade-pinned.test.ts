import { randomUUID } from 'node:crypto';

import { Cause, Effect, Exit } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { testCipher } from '../../__tests__/support/secrets.ts';
import { OwnerScope, type Transaction } from '../../db/tenant.ts';
import { completeSession } from '../../interview/__tests__/fixture.ts';
import { participantProtocolPayload } from '../../interview/protocol.ts';
import {
  readSessionNetwork,
  replaceSessionNetwork,
} from '../../network/session-network.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { listVersions, publishDraft } from '../store.ts';
import {
  PinnedUpgradeFailed,
  upgradePinnedStudies,
} from '../upgrade-pinned.ts';
import {
  TEST_TEAM_ID,
  makeStoreSchema,
  makeTestSyncServer,
  type StoreSchema,
  storeDb,
} from './helpers.ts';

/**
 * A stored schema 8 version, as Studio held them before schema 9: two
 * information stages and no finish stage (the engine supplied its own finish
 * screen, at index `stages.length`), and a categorical variable whose options
 * `1` and `"1"` the migration to schema 9 merges, so the answers recorded
 * against it are rewritten with the protocol.
 */
const v8Sections = (
  options: { readonly ordinalWithOneOption?: boolean } = {},
): Record<string, SectionDoc> => ({
  [sectionId({ kind: 'settings' })]: { name: 'Legacy study', schemaVersion: 8 },
  [sectionId({ kind: 'stageOrder' })]: { stages: ['intro', 'outro'] },
  [sectionId({ kind: 'stage', stageId: 'intro' })]: {
    id: 'intro',
    type: 'Information',
    label: 'Intro',
    title: 'Welcome',
    items: [{ id: 'intro-text', type: 'text', content: 'Hello' }],
  },
  [sectionId({ kind: 'stage', stageId: 'outro' })]: {
    id: 'outro',
    type: 'Information',
    label: 'Outro',
    title: 'Thanks',
    items: [{ id: 'outro-text', type: 'text', content: 'Bye' }],
  },
  [sectionId({ kind: 'codebookNode', typeId: 'person' })]: {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {
      personName: { name: 'Name', type: 'text' },
      category: {
        name: 'Category',
        type: 'categorical',
        options: [
          { label: 'One', value: 1 },
          { label: 'Work', value: 'work' },
          { label: 'One again', value: '1' },
        ],
      },
      // Schema 9 requires two options, so a version holding this cannot be
      // migrated.
      ...(options.ordinalWithOneOption === true && {
        closeness: {
          name: 'Closeness',
          type: 'ordinal',
          options: [{ label: 'Close', value: 1 }],
        },
      }),
    },
  },
  [sectionId({ kind: 'codebookEdge', typeId: 'knows' })]: {
    name: 'Knows',
    color: 'edge-color-seq-1',
  },
});

type SessionRow = {
  protocol_version_id: string;
  current_stage_index: number;
  current_stage_id: string | null;
  stage_metadata: unknown;
  holder_epoch: string;
  status: string;
};

describe.skipIf(!storeDb)('upgradePinnedStudies', () => {
  let store: StoreSchema;
  const inTeam = <A, E>(body: Effect.Effect<A, E, Transaction>) =>
    store.inTeam(TEST_TEAM_ID, body);
  const upgrade = () =>
    store.run(Effect.exit(OwnerScope.open(upgradePinnedStudies())));

  beforeEach(async () => {
    store = await makeStoreSchema();
  }, 180_000);
  afterEach(async () => {
    await store.dispose();
  });

  async function seedV8Version(sections: Record<string, SectionDoc>) {
    const protocolId = randomUUID();
    const draftId = randomUUID();
    await store.affected(
      `INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, 'Legacy study')`,
      [protocolId, TEST_TEAM_ID],
    );
    await inTeam(makeTestSyncServer().createDraft(draftId, sections));
    await store.affected(
      `INSERT INTO protocol_drafts (draft_id, team_id, protocol_id)
       VALUES ($1, $2, $3)`,
      [draftId, TEST_TEAM_ID, protocolId],
    );
    const published = await inTeam(publishDraft(TEST_TEAM_ID, { draftId }));
    if (published.status !== 'published') {
      throw new Error(`seeded publish failed: ${published.status}`);
    }
    return { protocolId, versionId: published.versionId };
  }

  async function seedStudy(protocolId: string, versionId: string) {
    const studyId = randomUUID();
    const waveId = randomUUID();
    await store.affected(
      `INSERT INTO studies (id, team_id, name, protocol_id, state, went_live_at)
       VALUES ($1, $2, 'A study', $3, 'live', now())`,
      [studyId, TEST_TEAM_ID, protocolId],
    );
    await store.affected(
      `INSERT INTO study_waves (id, study_id, team_id, wave_number, protocol_version_id)
       VALUES ($1, $2, $3, 1, $4)`,
      [waveId, studyId, TEST_TEAM_ID, versionId],
    );
    return { studyId, waveId, versionId };
  }

  async function seedSession(
    study: { studyId: string; waveId: string; versionId: string },
    options: {
      readonly status?: 'in_progress' | 'abandoned';
      readonly stageIndex?: number;
      readonly category?: unknown;
    } = {},
  ) {
    const sessionId = randomUUID();
    const participantId = randomUUID();
    await store.affected(
      `INSERT INTO participants (id, study_id, team_id, participant_code)
       VALUES ($1, $2, $3, $4)`,
      [
        participantId,
        study.studyId,
        TEST_TEAM_ID,
        `P-${sessionId.slice(0, 8)}`,
      ],
    );
    await store.affected(
      `INSERT INTO interview_sessions
         (id, study_id, team_id, wave_id, participant_id, protocol_version_id,
          current_stage_index, current_stage_id, stage_metadata, ego_uid,
          ego_attributes, holder_id, holder_epoch)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL,
               '{"1": {"automaticLayout": true}}'::jsonb, 'ego-1',
               '{"age": 40}'::jsonb, 'tab-a', 3)`,
      [
        sessionId,
        study.studyId,
        TEST_TEAM_ID,
        study.waveId,
        participantId,
        study.versionId,
        options.stageIndex ?? 1,
      ],
    );
    await inTeam(
      replaceSessionNetwork({
        sessionId,
        network: {
          nodes: [
            {
              _uid: 'alex',
              type: 'person',
              attributes: { personName: 'Alex', category: ['1'] },
              stageId: 'intro',
            },
            {
              _uid: 'sam',
              type: 'person',
              attributes: {
                personName: [1, 2, 3],
                category: options.category ?? ['work'],
              },
              _secureAttributes: { personName: { iv: [9, 9, 9] } },
            },
          ],
          edges: [
            {
              _uid: 'alex-sam',
              type: 'knows',
              from: 'alex',
              to: 'sam',
              attributes: {},
            },
          ],
        },
      }),
    );
    if (options.status === 'abandoned') {
      await store.affected(
        `UPDATE interview_sessions SET status = 'abandoned', abandoned_at = now()
         WHERE id = $1`,
        [sessionId],
      );
    }
    return sessionId;
  }

  const sessionRow = async (sessionId: string) => {
    const rows = await store.rows<SessionRow>(
      `SELECT protocol_version_id, current_stage_index, current_stage_id,
              stage_metadata, holder_epoch::text AS holder_epoch, status
       FROM interview_sessions WHERE id = $1`,
      [sessionId],
    );
    return rows[0];
  };

  const wavePin = async (waveId: string) =>
    (
      await store.rows<{ protocol_version_id: string }>(
        `SELECT protocol_version_id FROM study_waves WHERE id = $1`,
        [waveId],
      )
    )[0]?.protocol_version_id;

  const guardState = async () =>
    store.rows<{ enabled: string }>(
      `SELECT tgenabled::text AS enabled FROM pg_trigger
       WHERE tgname = 'interview_sessions_writable'`,
    );

  const payloadFor = (
    protocolId: string,
    versionId: string,
    schemaVersion: number,
  ) =>
    inTeam(
      participantProtocolPayload({
        protocolId,
        protocolVersionId: versionId,
        schemaVersion,
        publishedAt: new Date(),
      }).pipe(Effect.provideService(SecretsCipher, testCipher())),
    );

  it('migrates the pinned version, re-pins its live wave and carries its in-flight sessions across', async () => {
    const { protocolId, versionId } = await seedV8Version(v8Sections());
    const study = await seedStudy(protocolId, versionId);
    // On the engine's own finish screen, past the last of the two stages.
    const atFinish = await seedSession(study, { stageIndex: 2 });
    const abandoned = await seedSession(study, {
      status: 'abandoned',
      stageIndex: 1,
    });
    const completed = await seedSession(study, { stageIndex: 1 });
    await store.run(completeSession(completed));

    // A closed study is read-only, and stays on its version.
    const closedLine = await seedV8Version(v8Sections());
    const closedStudy = await seedStudy(
      closedLine.protocolId,
      closedLine.versionId,
    );
    const closedSession = await seedSession(closedStudy);
    await store.affected(
      `UPDATE studies SET state = 'closed', closed_at = now() WHERE id = $1`,
      [closedStudy.studyId],
    );

    // Before the upgrade the runtime refuses the pinned version, and says
    // what to do about it.
    await expect(payloadFor(protocolId, versionId, 8)).rejects.toThrow(
      /run `studio-api migrate`/,
    );

    const exit = await upgrade();
    expect(Exit.isSuccess(exit) && exit.value).toEqual({
      versions: 1,
      waves: 1,
      sessions: 2,
    });

    const versions = await inTeam(listVersions(TEST_TEAM_ID, protocolId));
    expect(versions).toHaveLength(2);
    const migrated = versions[0]!;
    expect(migrated).toMatchObject({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      migratedFromVersionId: versionId,
    });
    expect(await wavePin(study.waveId)).toBe(migrated.id);

    // Resumes on the finish stage the migration appended where the engine's
    // own finish screen was, and a tab still open on the old protocol is
    // taken over rather than syncing into the migrated one.
    expect(await sessionRow(atFinish)).toMatchObject({
      protocol_version_id: migrated.id,
      current_stage_index: 2,
      current_stage_id: 'finish',
      stage_metadata: { '1': { automaticLayout: true } },
      holder_epoch: '4',
      status: 'in_progress',
    });
    expect(await sessionRow(abandoned)).toMatchObject({
      protocol_version_id: migrated.id,
      current_stage_index: 1,
      current_stage_id: 'outro',
      holder_epoch: '4',
      status: 'abandoned',
    });

    // The network is rewritten with the protocol: the merged option's
    // answers now hold the value it was merged into, and nothing else moved.
    const network = await inTeam(readSessionNetwork(atFinish));
    expect(network.nodes).toEqual([
      {
        nodeId: 'alex',
        type: 'person',
        attributes: { personName: 'Alex', category: [1] },
        secureAttributes: null,
        stageId: 'intro',
        promptIds: null,
      },
      {
        nodeId: 'sam',
        type: 'person',
        attributes: { personName: [1, 2, 3], category: ['work'] },
        secureAttributes: { personName: { iv: [9, 9, 9] } },
        stageId: null,
        promptIds: null,
      },
    ]);
    expect(network.edges.map((edge) => edge.edgeId)).toEqual(['alex-sam']);
    const ego = await store.rows(
      `SELECT ego_uid, ego_attributes FROM interview_sessions WHERE id = $1`,
      [atFinish],
    );
    expect(ego[0]).toEqual({ ego_uid: 'ego-1', ego_attributes: { age: 40 } });

    // Finalized and closed data is untouched.
    expect(await sessionRow(completed)).toMatchObject({
      protocol_version_id: versionId,
      status: 'completed',
      holder_epoch: '3',
    });
    expect(await sessionRow(closedSession)).toMatchObject({
      protocol_version_id: closedLine.versionId,
      holder_epoch: '3',
    });
    expect(await wavePin(closedStudy.waveId)).toBe(closedLine.versionId);
    expect(
      await inTeam(listVersions(TEST_TEAM_ID, closedLine.protocolId)),
    ).toHaveLength(1);

    // The guard is back, and the draft the migration went through is gone.
    expect(await guardState()).toEqual([{ enabled: 'O' }]);
    expect(
      await store.rows(
        `SELECT draft_id FROM protocol_drafts WHERE based_on_version_id = $1`,
        [versionId],
      ),
    ).toEqual([]);

    const payload = await payloadFor(
      protocolId,
      migrated.id,
      migrated.schemaVersion,
    );
    expect(payload).toMatchObject({
      id: migrated.id,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    // A second run finds nothing to do.
    const again = await upgrade();
    expect(Exit.isSuccess(again) && again.value).toEqual({
      versions: 0,
      waves: 0,
      sessions: 0,
    });
    expect(await inTeam(listVersions(TEST_TEAM_ID, protocolId))).toHaveLength(
      2,
    );
    expect((await sessionRow(atFinish))?.holder_epoch).toBe('4');
  });

  it('reports every version and session it cannot carry across, and changes nothing', async () => {
    const good = await seedV8Version(v8Sections());
    const goodStudy = await seedStudy(good.protocolId, good.versionId);
    const fine = await seedSession(goodStudy);
    // An answer no schema accepts: the migrated session would be invalid.
    const broken = await seedSession(goodStudy, {
      category: { not: 'an answer' },
    });

    const unmigratable = await seedV8Version(
      v8Sections({ ordinalWithOneOption: true }),
    );
    const unmigratableStudy = await seedStudy(
      unmigratable.protocolId,
      unmigratable.versionId,
    );

    const exit = await upgrade();
    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) return;
    const failure = Cause.squash(exit.cause);
    expect(failure).toBeInstanceOf(PinnedUpgradeFailed);
    if (!(failure instanceof PinnedUpgradeFailed)) return;
    expect(
      failure.failures.map(({ versionId, sessionId }) => ({
        versionId,
        sessionId,
      })),
    ).toEqual(
      expect.arrayContaining([
        { versionId: good.versionId, sessionId: broken },
        { versionId: unmigratable.versionId, sessionId: null },
      ]),
    );
    expect(failure.failures).toHaveLength(2);
    expect(failure.message).toContain(`interview session ${broken}`);
    expect(failure.message).toContain(
      `protocol version ${unmigratable.versionId}`,
    );

    // Rolled back: no version published, every pin and session as it was,
    // and the guard firing.
    expect(
      await inTeam(listVersions(TEST_TEAM_ID, good.protocolId)),
    ).toHaveLength(1);
    expect(await wavePin(goodStudy.waveId)).toBe(good.versionId);
    expect(await wavePin(unmigratableStudy.waveId)).toBe(
      unmigratable.versionId,
    );
    expect(await sessionRow(fine)).toMatchObject({
      protocol_version_id: good.versionId,
      holder_epoch: '3',
    });
    expect(await guardState()).toEqual([{ enabled: 'O' }]);
  });
});
