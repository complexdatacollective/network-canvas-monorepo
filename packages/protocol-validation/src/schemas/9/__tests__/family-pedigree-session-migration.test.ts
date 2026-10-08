import { describe, expect, it } from 'vitest';

import { StageMetadataSchema } from '@codaco/shared-consts';

import { migrateProtocolWithSessions } from '../../../migration/migrate-protocol.ts';
import type {
  PersistedSession,
  SessionMigrationResult,
} from '../../../migration/session.ts';
import {
  committedRecord,
  committedSession,
  friend,
  PEDIGREE_INDEX,
  pedigreePeople,
  pedigreeRelationships,
  uncommittedSession,
} from './fixtures/cegrm-schema-8-session.ts';
// The CEGRM template as `main` released it, when the Family Pedigree was a
// schema 8 stage. Its pedigree (stage 3) has an introduction screen.
import ecoGeneticTemplate from './fixtures/eco-genetic-relationship-maps.schema-8.json';

type Fields = Record<string, unknown>;

const template = () => structuredClone(ecoGeneticTemplate) as Fields;

const withStages = (
  protocol: Fields,
  change: (stages: Fields[]) => Fields[],
): Fields => ({ ...protocol, stages: change(protocol.stages as Fields[]) });

const migrate = (protocol: Fields = template()) =>
  migrateProtocolWithSessions(protocol, 9, { name: 'CEGRM' });

const migrated = (result: SessionMigrationResult) => {
  if (!result.success) throw result.error;
  return result.session;
};

const nodeById = (nodes: readonly Fields[], id: string) =>
  nodes.find((node) => node._uid === id);

// A DyadCensus after the pedigree, whose record is a list of answered pairs.
const dyadCensus: Fields = {
  id: 'dyad-family',
  type: 'DyadCensus',
  label: 'Who knows whom',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'Pairs', text: 'Who knows whom?' },
  prompts: [
    { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
  ],
};

describe('migrationV8toV9 session step', () => {
  it('inserts the pedigree introduction as stage 3, moving the pedigree to 4', () => {
    const { protocol } = migrate();
    expect(protocol.stages[PEDIGREE_INDEX]).toMatchObject({
      id: 'family-pedigree-introduction',
      type: 'Information',
    });
    expect(protocol.stages[PEDIGREE_INDEX + 1]).toMatchObject({
      id: 'family-pedigree',
      type: 'FamilyPedigree',
    });
  });

  describe('the resume position follows its stage', () => {
    const { migrateSession, protocol } = migrate();
    const resumeAt = (currentStep: number) =>
      migrated(migrateSession(committedSession(currentStep))).currentStep;

    it('stays put before the inserted introduction', () => {
      expect(resumeAt(0)).toBe(0);
      expect(resumeAt(2)).toBe(2);
    });

    it('stays on the pedigree, not its new introduction', () => {
      expect(resumeAt(PEDIGREE_INDEX)).toBe(PEDIGREE_INDEX + 1);
      expect(protocol.stages[resumeAt(PEDIGREE_INDEX)]?.id).toBe(
        'family-pedigree',
      );
    });

    it('moves one stage on after it', () => {
      expect(resumeAt(9)).toBe(10);
      expect(protocol.stages[resumeAt(9)]?.id).toBe('socio-exchanges');
    });

    it('keeps a finished session on the finish stage', () => {
      const stagesBefore = (ecoGeneticTemplate.stages as unknown[]).length;
      expect(resumeAt(stagesBefore)).toBe(protocol.stages.length);
    });
  });

  it('moves every stage record to its stage’s new index', () => {
    const source = withStages(template(), (stages) => [
      ...stages.slice(0, PEDIGREE_INDEX + 1),
      dyadCensus,
      ...stages.slice(PEDIGREE_INDEX + 1),
    ]);
    const { migrateSession, protocol } = migrate(source);
    const dyadIndex = PEDIGREE_INDEX + 1;
    const pairs = [
      [0, 'mother-1', 'father-1', true],
      [0, 'sister-1', 'friend-1', false],
    ];
    const session = committedSession(dyadIndex);
    const result = migrated(
      migrateSession({
        ...session,
        stageMetadata: { ...session.stageMetadata, [dyadIndex]: pairs },
      }),
    );

    expect(protocol.stages[dyadIndex + 1]?.id).toBe('dyad-family');
    expect(result.currentStep).toBe(dyadIndex + 1);
    expect(result.stageMetadata).toEqual({
      [PEDIGREE_INDEX + 1]: { framing: 'gendered' },
      [dyadIndex + 1]: pairs,
    });
  });

  it('leaves the record of every other stage type untouched', () => {
    // Without an introduction screen nothing moves.
    const source = withStages(template(), (stages) =>
      stages.map((stage) => {
        if (stage.type !== 'FamilyPedigree') return stage;
        const { introScreen: _introScreen, ...rest } = stage;
        return rest;
      }),
    );
    const { migrateSession } = migrate(source);
    const records = {
      2: [[0, 'a', 'b', true]],
      5: { automaticLayout: false },
      12: { framing: 'gamete' },
    };
    const result = migrated(
      migrateSession({
        network: { ego: { _uid: 'e', attributes: {} }, nodes: [], edges: [] },
        stageMetadata: records,
        currentStep: 5,
      }),
    );
    expect(result.stageMetadata).toEqual(records);
    expect(result.currentStep).toBe(5);
  });

  describe('a finalized schema 8 pedigree', () => {
    const { migrateSession } = migrate();
    const session = committedSession(9);
    const result = migrated(migrateSession(session));

    it('keeps the participant’s framing in the schema 9 record', () => {
      expect(result.stageMetadata).toEqual({
        [PEDIGREE_INDEX + 1]: { framing: 'gendered' },
      });
      expect(StageMetadataSchema.safeParse(result.stageMetadata).success).toBe(
        true,
      );
    });

    it('leaves every person and relationship as they were', () => {
      expect(result.network.edges).toEqual(pedigreeRelationships);
      expect(
        result.network.nodes.filter((node) => node._uid !== 'ego-1'),
      ).toEqual(
        [...pedigreePeople, friend].filter((node) => node._uid !== 'ego-1'),
      );
      expect(result.network.ego).toEqual(session.network.ego);
    });

    it('records "no children" on the participant', () => {
      expect(nodeById(result.network.nodes, 'ego-1')?.attributes).toEqual({
        ...(pedigreePeople[0]?.attributes as Fields),
        relativesNotRecorded: ['noChildren'],
      });
    });

    it('does not record "no children" for a participant with a child', () => {
      const withChild = committedSession(9);
      withChild.network.nodes.push({
        _uid: 'son-1',
        type: 'person',
        attributes: { is_ego: false, name: 'Leo' },
        promptIDs: [],
        stageId: 'family-pedigree',
      });
      withChild.network.edges.push({
        _uid: 'edge-ego-son',
        type: 'family_relationship',
        from: 'ego-1',
        to: 'son-1',
        attributes: { relationshipType: ['biological'] },
      });
      const ego = nodeById(
        migrated(migrateSession(withChild)).network.nodes,
        'ego-1',
      );
      expect(ego?.attributes).not.toHaveProperty('relativesNotRecorded');
    });

    it('does not duplicate relationships an older record listed by the interface’s own ids', () => {
      const legacy = committedSession(9);
      const { edgeIdVersion: _edgeIdVersion, ...record } = committedRecord();
      legacy.stageMetadata[PEDIGREE_INDEX] = {
        ...record,
        edges: record.edges.map((edge) => ({
          ...edge,
          id: `store-${edge.id}`,
        })),
      } as ReturnType<typeof committedRecord>;
      expect(migrated(migrateSession(legacy)).network.edges).toEqual(
        pedigreeRelationships,
      );
    });
  });

  describe('a schema 8 pedigree that never reached the network', () => {
    const { migrateSession } = migrate();
    const result = migrated(migrateSession(uncommittedSession()));

    it('writes every person, with their name and the participant flag', () => {
      expect(result.network.nodes).toEqual([
        {
          _uid: 'ego-1',
          type: 'person',
          attributes: { is_ego: true, relativesNotRecorded: ['noChildren'] },
          stageId: 'family-pedigree',
          promptIDs: ['pedigree'],
        },
        {
          _uid: 'mother-1',
          type: 'person',
          attributes: { name: 'Mother' },
          stageId: 'family-pedigree',
          promptIDs: ['pedigree'],
        },
        {
          _uid: 'father-1',
          type: 'person',
          attributes: { name: 'Joe' },
          stageId: 'family-pedigree',
          promptIDs: ['pedigree'],
        },
        {
          _uid: 'sister-1',
          type: 'person',
          attributes: { name: 'Ana' },
          stageId: 'family-pedigree',
          promptIDs: ['pedigree'],
        },
      ]);
    });

    it('writes every relationship with all its attributes', () => {
      expect(result.network.edges).toEqual(pedigreeRelationships);
    });

    it('keeps the chosen framing and nothing else in the record', () => {
      expect(result.stageMetadata).toEqual({
        [PEDIGREE_INDEX + 1]: { framing: 'gamete' },
      });
      expect(result.currentStep).toBe(PEDIGREE_INDEX + 1);
    });

    it('joins the family to a participant already in the network', () => {
      const session = uncommittedSession();
      session.network.nodes.push({
        _uid: 'earlier-ego',
        type: 'person',
        attributes: { is_ego: true, name: 'Me' },
        promptIDs: [],
        stageId: 'family-pedigree',
      });
      const { network } = migrated(migrateSession(session));
      expect(
        network.nodes.filter((node) => node.attributes.is_ego === true),
      ).toHaveLength(1);
      expect(
        network.edges.find((edge) => edge._uid === 'edge-mother-ego'),
      ).toMatchObject({ from: 'mother-1', to: 'earlier-ego' });
    });

    it('does not write a label into an encrypted name attribute', () => {
      const source = template();
      const codebook = source.codebook as {
        node: { person: { variables: { name: Fields } } };
      };
      codebook.node.person.variables.name.encrypted = true;
      const { network } = migrated(
        migrateProtocolWithSessions(source, 9, {
          name: 'CEGRM',
        }).migrateSession(uncommittedSession()),
      );
      expect(
        network.nodes.every((node) => !Object.hasOwn(node.attributes, 'name')),
      ).toBe(true);
    });
  });

  it('removes the record a reset pedigree left', () => {
    const { migrateSession } = migrate();
    const result = migrated(
      migrateSession({
        ...uncommittedSession(),
        stageMetadata: { [PEDIGREE_INDEX]: { isNetworkCommitted: false } },
      }),
    );
    expect(result.stageMetadata).toEqual({});
    expect(result.network.nodes).toEqual([]);
  });

  it('drops "no children" where the converted stage cannot record it', () => {
    const source = withStages(template(), (stages) =>
      stages.map((stage) =>
        stage.type === 'FamilyPedigree'
          ? { ...stage, boundaries: { requireGrandparents: 'off' } }
          : stage,
      ),
    );
    const { migrateSession } = migrate(source);
    const ego = nodeById(
      migrated(migrateSession(committedSession(9))).network.nodes,
      'ego-1',
    );
    expect(ego?.attributes).toEqual(pedigreePeople[0]?.attributes);
  });

  it('does not change the session passed in', () => {
    const { migrateSession } = migrate();
    const session: PersistedSession = uncommittedSession();
    const copy = structuredClone(session);
    const first = migrateSession(session);
    expect(session).toEqual(copy);
    expect(migrateSession(session)).toEqual(first);
  });
});
