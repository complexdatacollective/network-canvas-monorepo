import { createHash, randomUUID } from 'node:crypto';

import type pg from 'pg';

import { generateNetwork } from '@codaco/protocol-utilities';
import { asEntityAttributeReference } from '@codaco/protocol-validation';
import { canonicalize } from '@codaco/studio-sync/apply';

import { insertRows, type SeedRowValue } from '../src/db/seed/insert.ts';
import { refreshProjectionsForSessions } from '../src/network/projections.ts';

// The #1246 spike's protocol and network density, retained as a synthetic
// benchmark fixture. Production migrations, constraints, indexes and the
// production projection writer remain enabled throughout the load.
const protocol = {
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          name: { name: 'name', type: 'text' },
          age: { name: 'age', type: 'number' },
          support: { name: 'providesSupport', type: 'boolean' },
        },
      },
    },
    edge: {
      know: { name: 'Knows', color: 'edge-color-seq-1' },
      support: { name: 'Supports', color: 'edge-color-seq-2' },
    },
  },
  stages: [
    {
      id: 'stage-ng',
      type: 'NameGenerator',
      label: 'People you know',
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'Add a person',
        fields: [
          { variable: asEntityAttributeReference('name'), prompt: 'Name' },
          { variable: asEntityAttributeReference('age'), prompt: 'Age' },
          {
            variable: asEntityAttributeReference('support'),
            prompt: 'Support',
          },
        ],
      },
      prompts: [{ id: 'p-ng', text: 'Who do you know?' }],
    },
    ...(['know', 'support'] as const).map((type) => ({
      id: `stage-${type}`,
      type: 'DyadCensus' as const,
      label: type,
      introductionPanel: {
        title: 'Connections',
        text: 'Describe these connections.',
      },
      subject: { entity: 'node' as const, type: 'person' },
      prompts: [
        { id: `p-${type}`, text: 'Are they connected?', createEdge: type },
      ],
    })),
  ],
} satisfies Pick<Parameters<typeof generateNetwork>[0], 'codebook' | 'stages'>;

type GraphTruth = {
  degree: Map<number, number>;
  ties: Map<string, number>;
  waves: number[][];
  nodes: number;
  edges: number;
  sessions: number;
};

export async function seedAggregateCorpus(admin: pg.Pool, scale: 1 | 10) {
  const truth: GraphTruth = {
    degree: new Map(),
    ties: new Map(),
    waves: [[], [], []],
    nodes: 0,
    edges: 0,
    sessions: 0,
  };
  const teams = [randomUUID(), randomUUID(), randomUUID()];
  const mainTeam = teams[0]!;
  const mainStudy = randomUUID();
  const author = randomUUID();
  await admin.query(
    'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $1, $2, true, now(), now())',
    [author, `${author}@example.test`],
  );
  let seed = 1;
  for (const [teamIndex, teamId] of teams.entries()) {
    const main = teamIndex === 0;
    const studyId = main ? mainStudy : randomUUID();
    const protocolId = randomUUID();
    const versionId = randomUUID();
    const waveIds = Array.from({ length: main ? 3 : 1 }, () => randomUUID());
    const participants = Array.from(
      { length: (main ? 700 : 200) * scale },
      () => randomUUID(),
    );
    await admin.query(
      'INSERT INTO teams (id, name, slug) VALUES ($1, $1, $1)',
      [teamId],
    );
    await admin.query(
      "INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, 'owner')",
      [randomUUID(), teamId, author],
    );
    await admin.query(
      "INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, 'Aggregate qualification')",
      [protocolId, teamId],
    );
    const hash = createHash('sha256')
      .update(canonicalize(protocol))
      .digest('hex');
    await admin.query(
      'INSERT INTO protocol_versions (id, protocol_id, team_id, version_number, version_hash, manifest, schema_version, source_manifest_hash) VALUES ($1, $2, $3, 1, $4, $5, 8, $4)',
      [versionId, protocolId, teamId, hash, protocol],
    );
    await admin.query(
      "INSERT INTO studies (id, team_id, protocol_id, name) VALUES ($1, $2, $3, 'Aggregate qualification')",
      [studyId, teamId, protocolId],
    );
    const parents = await admin.connect();
    try {
      await insertRows(
        parents,
        'study_waves',
        ['id', 'team_id', 'study_id', 'wave_number', 'protocol_version_id'],
        waveIds.map((id, index) => [id, teamId, studyId, index + 1, versionId]),
      );
      await insertRows(
        parents,
        'participants',
        ['id', 'team_id', 'study_id', 'participant_code'],
        participants.map((id, index) => [id, teamId, studyId, `P-${index}`]),
      );
    } finally {
      parents.release();
    }

    for (const [waveIndex, waveId] of waveIds.entries()) {
      for (let start = 0; start < participants.length; start += 100) {
        const sessions: SeedRowValue[][] = [];
        const nodes: SeedRowValue[][] = [];
        const edges: SeedRowValue[][] = [];
        const snapshots: SeedRowValue[][] = [];
        const ids: string[] = [];
        for (const participantId of participants.slice(start, start + 100)) {
          const generated = generateNetwork({
            ...protocol,
            seed: seed++,
            simulateDropOut: false,
            config: {
              nodeCount: { min: 70, max: 95 },
              censusEdgeProbability: { min: 0.025, max: 0.045 },
            },
          });
          const network = generated.network;
          const sessionId = randomUUID();
          ids.push(sessionId);
          sessions.push([
            sessionId,
            teamId,
            studyId,
            waveId,
            participantId,
            versionId,
            network.ego._uid,
            'completed',
            new Date(),
          ]);
          const degrees = new Map(network.nodes.map((node) => [node._uid, 0]));
          const ties = new Map<string, number>();
          for (const node of network.nodes)
            nodes.push([
              teamId,
              sessionId,
              node._uid,
              node.type,
              JSON.stringify(node.attributes),
            ]);
          for (const edge of network.edges) {
            edges.push([
              teamId,
              sessionId,
              edge._uid,
              edge.type,
              edge.from,
              edge.to,
              JSON.stringify(edge.attributes),
            ]);
            for (const endpoint of [edge.from, edge.to])
              degrees.set(endpoint, degrees.get(endpoint)! + 1);
            ties.set(edge.type, (ties.get(edge.type) ?? 0) + 1);
          }
          const payload = canonicalize({
            network,
            stageMetadata: generated.stageMetadata ?? {},
            currentStep: generated.currentStep,
          });
          snapshots.push([
            sessionId,
            teamId,
            studyId,
            versionId,
            8,
            payload,
            createHash('sha256').update(payload).digest('hex'),
          ]);
          truth.nodes += network.nodes.length;
          truth.edges += network.edges.length;
          truth.sessions++;
          if (main) {
            truth.waves[waveIndex]!.push(network.edges.length);
            if (waveIndex === 1) {
              for (const degree of degrees.values())
                truth.degree.set(degree, (truth.degree.get(degree) ?? 0) + 1);
              for (const [type, count] of ties)
                truth.ties.set(`${sessionId}/${type}`, count);
            }
          }
        }
        const client = await admin.connect();
        try {
          await client.query('BEGIN');
          await insertRows(
            client,
            'interview_sessions',
            [
              'id',
              'team_id',
              'study_id',
              'wave_id',
              'participant_id',
              'protocol_version_id',
              'ego_uid',
              'status',
              'completed_at',
            ],
            sessions,
          );
          await insertRows(
            client,
            'nodes',
            ['team_id', 'session_id', 'node_id', 'type', 'attributes'],
            nodes,
          );
          await insertRows(
            client,
            'edges',
            [
              'team_id',
              'session_id',
              'edge_id',
              'type',
              'from_node',
              'to_node',
              'attributes',
            ],
            edges,
          );
          await refreshProjectionsForSessions(client, {
            teamId,
            sessionIds: ids,
          });
          await insertRows(
            client,
            'session_snapshots',
            [
              'session_id',
              'team_id',
              'study_id',
              'protocol_version_id',
              'schema_version',
              'payload',
              'payload_hash',
            ],
            snapshots,
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    }
  }
  return { mainTeam, mainStudy, noiseTeam: teams[1]!, author, truth };
}
