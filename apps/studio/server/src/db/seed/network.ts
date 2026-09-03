// Interview sessions and the networks they collected.
//
// The graphs come from `generateNetwork`, driven by the codebook and stages of
// the published version the session pins — so a seeded network is always
// consistent with the protocol its session ran. Its entity ids are minted with
// `uuid()` rather than from the generator's own seed, so every id is remapped
// onto the seed's PRNG before anything is written; without that, two seed runs
// would differ in every node id.
//
// `refreshProjections` is injected rather than imported. ADR #1246 makes
// `src/network/` the only directory permitted to touch the rollup tables, and
// `network/__tests__/boundary.test.ts` allows exactly one bootstrap importer:
// `src/db/seed.ts`. Handing the function down keeps that allowlist honest.
import { faker } from '@faker-js/faker';
import type pg from 'pg';

import { generateNetwork } from '@codaco/protocol-utilities';
import type { NcNetwork } from '@codaco/shared-consts';
import { canonicalize } from '@codaco/studio-sync/apply';

import { insertRows, type SeedRowValue } from './insert.ts';
import type { SeededVersion } from './protocols.ts';
import { seedUuid, sha256Hex, shiftDays, shiftMinutes } from './rng.ts';
import type { SeedStudy } from './studies.ts';
import type { SeedTeam } from './teams.ts';

export type RefreshProjections = (
  client: pg.ClientBase,
  ids: { teamId: string; sessionIds: readonly string[] },
) => Promise<void>;

export type NetworkScale = { nodeCount: { min: number; max: number } };

type SessionStatus = 'completed' | 'abandoned' | 'in_progress';

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

type GeneratedInterview = {
  network: NcNetwork;
  stageMetadata: Record<string, unknown> | null;
  currentStep: number;
};

/**
 * Rewrites every entity id the generator minted onto the seeded PRNG. The
 * rewrite runs over the serialized result rather than over the entities alone,
 * because a node id also appears inside `stageMetadata` (a dyad census records
 * the pairs it asked about) and could appear inside an attribute value; a
 * structural remap would leave those pointing at ids that no longer exist.
 */
function withSeededIds(generated: GeneratedInterview): GeneratedInterview {
  const replacements = new Map<string, string>();
  const claim = (uid: string) => {
    if (!/^[0-9a-f-]{36}$/.test(uid) || replacements.has(uid)) return;
    replacements.set(uid, seedUuid());
  };
  claim(generated.network.ego._uid);
  for (const node of generated.network.nodes) claim(node._uid);
  for (const edge of generated.network.edges) claim(edge._uid);

  const rewritten = JSON.stringify(generated).replace(
    UUID_PATTERN,
    (match) => replacements.get(match) ?? match,
  );
  return JSON.parse(rewritten) as GeneratedInterview;
}

function statusMix(total: number, allCompleted: boolean): SessionStatus[] {
  if (allCompleted) return Array.from({ length: total }, () => 'completed');
  const completed = Math.round(total * 0.6);
  const abandoned = Math.round(total * 0.25);
  return Array.from({ length: total }, (_, index) => {
    if (index < completed) return 'completed';
    if (index < completed + abandoned) return 'abandoned';
    return 'in_progress';
  });
}

const SESSION_COLUMNS = [
  'id',
  'study_id',
  'team_id',
  'wave_id',
  'participant_id',
  'protocol_version_id',
  'link_id',
  'delivery_mode',
  'initiated_by_user_id',
  'status',
  'current_stage_index',
  'current_stage_id',
  'stage_metadata',
  'ego_uid',
  'ego_attributes',
  'ego_secure_attributes',
  'started_at',
  'last_activity_at',
  'completed_at',
  'abandoned_at',
] as const;

const NODE_COLUMNS = [
  'team_id',
  'session_id',
  'node_id',
  'type',
  'attributes',
  'secure_attributes',
  'stage_id',
  'prompt_ids',
] as const;

const EDGE_COLUMNS = [
  'team_id',
  'session_id',
  'edge_id',
  'type',
  'from_node',
  'to_node',
  'attributes',
  'secure_attributes',
] as const;

const SNAPSHOT_COLUMNS = [
  'session_id',
  'team_id',
  'study_id',
  'protocol_version_id',
  'schema_version',
  'payload',
  'payload_hash',
  'created_at',
] as const;

export type SeededSession = {
  id: string;
  studyId: string;
  waveId: string;
  waveNumber: number;
  participantId: string | null;
  status: SessionStatus;
  startedAt: Date;
  /** When a completed or abandoned session ended; null while in progress. */
  endedAt: Date | null;
};

/**
 * Writes every session of one team, its nodes and edges, its rollups and — for
 * the completed ones — its frozen snapshot.
 *
 * The status flip and the snapshot insert are not two steps here: a session is
 * inserted already `completed`, and `session_snapshots_insert_frozen` is
 * satisfied because the whole seed is one transaction, so the session row's
 * `xmin` is the current transaction's for the entire run. The same property is
 * what lets nodes and edges be written for an already-completed session.
 */
export async function seedSessionsAndNetworks(
  client: pg.PoolClient,
  team: SeedTeam,
  studies: SeedStudy[],
  versionsById: Map<string, SeededVersion>,
  refreshProjections: RefreshProjections,
  scale: NetworkScale,
): Promise<SeededSession[]> {
  const sessionRows: SeedRowValue[][] = [];
  const nodeRows: SeedRowValue[][] = [];
  const edgeRows: SeedRowValue[][] = [];
  const snapshotRows: SeedRowValue[][] = [];
  let pending: SeededSession[] = [];
  const sessions: SeededSession[] = [];
  const researchers = team.members.filter(
    (member) => member.userId !== team.adminUserId,
  );
  let generatorSeed = 1;

  // One study's worth of rows at a time: at `large` scale a whole team's
  // networks are millions of rows, and holding them all as JavaScript arrays
  // before the first INSERT is what would exhaust the heap.
  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    await insertRows(
      client,
      'interview_sessions',
      SESSION_COLUMNS,
      sessionRows,
    );
    // Nodes before edges: `edges.from_node` and `edges.to_node` are foreign
    // keys into `nodes`.
    await insertRows(client, 'nodes', NODE_COLUMNS, nodeRows);
    await insertRows(client, 'edges', EDGE_COLUMNS, edgeRows);
    await refreshProjections(client, {
      teamId: team.id,
      sessionIds: pending.map((session) => session.id),
    });
    // After the flip to `completed`, and in the same transaction as it, which
    // is what `session_snapshots_insert_frozen` proves.
    await insertRows(
      client,
      'session_snapshots',
      SNAPSHOT_COLUMNS,
      snapshotRows,
    );
    sessions.push(...pending);
    pending = [];
    sessionRows.length = 0;
    nodeRows.length = 0;
    edgeRows.length = 0;
    snapshotRows.length = 0;
  };

  for (const study of studies) {
    for (const [waveIndex, wave] of study.waves.entries()) {
      const count = study.sessionCounts[waveIndex] ?? 0;
      if (count === 0) continue;
      const versionId = wave.protocolVersionId;
      if (versionId === null) {
        throw new Error(`wave ${wave.id} carries sessions but pins no version`);
      }
      const version = versionsById.get(versionId);
      if (version === undefined) {
        throw new Error(`wave ${wave.id} pins an unknown version ${versionId}`);
      }
      const statuses = statusMix(count, study.key === 'closed');
      const anonymousLink = study.links.find(
        (link) => link.kind === 'anonymous',
      );

      for (let index = 0; index < count; index++) {
        const status = statuses[index]!;
        const anonymous = study.participationMode === 'anonymous';
        const participant = anonymous ? null : study.participants[index];
        if (participant === undefined) {
          throw new Error(
            `study ${study.id} has fewer participants than sessions`,
          );
        }

        // A researcher-led session is started from the dashboard, so it names
        // an initiating user and carries no link. Anonymous studies have no
        // dashboard-started sessions: every visitor arrives through the link.
        const researcherLed =
          !anonymous && researchers.length > 0 && index % 5 === 4;
        const link = anonymous
          ? (anonymousLink ?? null)
          : researcherLed || participant === null
            ? null
            : (study.links.find(
                (candidate) =>
                  candidate.waveId === wave.id &&
                  candidate.participantId === participant.id,
              ) ?? null);

        // The stage a paused interview is parked at. The generator clears the
        // values that stage has not yet collected, but reports the completion
        // cursor regardless — it only ever moves the cursor back for a
        // drop-out — so the session's own cursor is taken from here rather
        // than from what it returns.
        const inProgressStageIndex =
          status === 'in_progress'
            ? Math.max(
                0,
                Math.min(
                  version.stages.length - 1,
                  faker.number.int({ min: 2, max: 12 }),
                ),
              )
            : undefined;
        const generated = withSeededIds(
          generateNetwork({
            codebook: version.codebook,
            stages: version.stages,
            seed: generatorSeed++,
            simulateDropOut: status === 'abandoned',
            inProgressStageIndex,
            config: { nodeCount: scale.nodeCount },
          }) as GeneratedInterview,
        );

        const sessionId = seedUuid();
        // Inside the wave's window, and never before the participant was
        // enrolled — or, for a visit through their link, before the link
        // was issued (the day after enrolment, as studies.ts dates it).
        const windowStart = wave.opensAt ?? study.createdAt;
        const windowEnd = shiftDays(windowStart, 45);
        const notBefore = new Date(
          Math.max(
            windowStart.getTime(),
            participant === null
              ? 0
              : shiftDays(
                  participant.enrolledAt,
                  link === null ? 0 : 1,
                ).getTime(),
          ),
        );
        const startedAt = shiftMinutes(
          notBefore,
          faker.number.int({
            min: 1,
            max: Math.max(
              1,
              Math.floor((windowEnd.getTime() - notBefore.getTime()) / 60_000),
            ),
          }),
        );
        const lastActivityAt = shiftMinutes(
          startedAt,
          faker.number.int({ min: 8, max: 95 }),
        );
        // Completed sessions sit past the last stage, with no stage id; an
        // abandoned one at the stage it dropped out of; a paused one at the
        // stage chosen above.
        const stageIndex =
          inProgressStageIndex ?? Math.max(0, generated.currentStep);
        const stageId = version.stages[stageIndex]?.id ?? null;

        sessionRows.push([
          sessionId,
          study.id,
          team.id,
          wave.id,
          participant?.id ?? null,
          versionId,
          link?.id ?? null,
          researcherLed ? 'researcher_led' : 'self_administered',
          researcherLed
            ? (researchers[index % researchers.length]?.userId ?? null)
            : null,
          status,
          stageIndex,
          stageId,
          JSON.stringify(generated.stageMetadata ?? {}),
          generated.network.ego._uid,
          JSON.stringify(generated.network.ego.attributes),
          generated.network.ego._secureAttributes === undefined
            ? null
            : JSON.stringify(generated.network.ego._secureAttributes),
          startedAt,
          lastActivityAt,
          status === 'completed' ? lastActivityAt : null,
          status === 'abandoned' ? lastActivityAt : null,
        ]);

        for (const node of generated.network.nodes) {
          nodeRows.push([
            team.id,
            sessionId,
            node._uid,
            node.type,
            JSON.stringify(node.attributes),
            node._secureAttributes === undefined
              ? null
              : JSON.stringify(node._secureAttributes),
            node.stageId ?? null,
            node.promptIDs ?? null,
          ]);
        }
        for (const edge of generated.network.edges) {
          edgeRows.push([
            team.id,
            sessionId,
            edge._uid,
            edge.type,
            edge.from,
            edge.to,
            JSON.stringify(edge.attributes),
            edge._secureAttributes === undefined
              ? null
              : JSON.stringify(edge._secureAttributes),
          ]);
        }

        if (status === 'completed') {
          const payload = {
            network: generated.network,
            stageMetadata: generated.stageMetadata ?? {},
            currentStep: generated.currentStep,
          };
          // Hashed in canonical form: jsonb does not keep key order, so the
          // evidence must be checkable from the payload as it is read back.
          const serialized = canonicalize(payload);
          snapshotRows.push([
            sessionId,
            team.id,
            study.id,
            versionId,
            version.schemaVersion,
            serialized,
            sha256Hex(serialized),
            lastActivityAt,
          ]);
        }

        pending.push({
          id: sessionId,
          studyId: study.id,
          waveId: wave.id,
          waveNumber: wave.waveNumber,
          participantId: participant?.id ?? null,
          status,
          startedAt,
          endedAt: status === 'in_progress' ? null : lastActivityAt,
        });
      }
    }
    await flush();
  }

  return sessions;
}

/**
 * The first session per participant, for the consent records' back-link: a
 * consent captured inside a session was captured at the start of the first
 * interview, not inside a later wave that began months after the grant.
 */
export function earliestSessionByParticipant(
  sessions: SeededSession[],
): Map<string, { id: string; startedAt: Date }> {
  const earliest = new Map<string, { id: string; startedAt: Date }>();
  for (const session of sessions) {
    if (session.participantId === null) continue;
    const current = earliest.get(session.participantId);
    if (current === undefined || session.startedAt < current.startedAt) {
      earliest.set(session.participantId, {
        id: session.id,
        startedAt: session.startedAt,
      });
    }
  }
  return earliest;
}
