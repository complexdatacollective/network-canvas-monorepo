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
  migratedRelationships,
  PEDIGREE_INDEX,
  pedigreePeople,
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

    // The schema 8 interview showed a pedigree's introduction as the first
    // step of the setup questions it opened whenever the participant had no
    // family on the pedigree yet, and kept no record of how far through those
    // questions they were. Such a session had not yet passed the
    // introduction, so it resumes on the stage the introduction became.
    describe('on a pedigree the participant had not started', () => {
      const unstarted = (
        nodes: Fields[] = [],
        stageMetadata: Fields = {},
      ): PersistedSession => ({
        network: {
          ego: { _uid: 'network-ego', attributes: {} },
          nodes,
          edges: [],
        },
        stageMetadata,
        currentStep: PEDIGREE_INDEX,
      });

      it('resumes at its introduction', () => {
        const result = migrated(migrateSession(unstarted()));
        expect(result.currentStep).toBe(PEDIGREE_INDEX);
        expect(protocol.stages[result.currentStep]?.id).toBe(
          'family-pedigree-introduction',
        );
      });

      it('resumes at its introduction after a reset', () => {
        expect(
          migrated(
            migrateSession(
              unstarted([], {
                [PEDIGREE_INDEX]: { isNetworkCommitted: false },
              }),
            ),
          ).currentStep,
        ).toBe(PEDIGREE_INDEX);
      });

      it('resumes at its introduction when only the participant is on it', () => {
        const [participant] = pedigreePeople;
        expect(
          migrated(migrateSession(unstarted([structuredClone(participant!)])))
            .currentStep,
        ).toBe(PEDIGREE_INDEX);
      });

      // Without a membership list, schema 8 showed every person of the
      // pedigree's type on it, so a relative named on an earlier stage meant
      // the setup questions were not shown.
      it('stays on the pedigree when an earlier stage put someone on it', () => {
        expect(
          migrated(
            migrateSession(
              unstarted([{ ...structuredClone(friend), stageId: 'earlier' }]),
            ),
          ).currentStep,
        ).toBe(PEDIGREE_INDEX + 1);
      });

      it('does not count someone of another type', () => {
        expect(
          migrated(
            migrateSession(
              unstarted([{ ...structuredClone(friend), type: 'place' }]),
            ),
          ).currentStep,
        ).toBe(PEDIGREE_INDEX);
      });
    });

    it('moves one stage on after it', () => {
      expect(resumeAt(9)).toBe(10);
      expect(protocol.stages[resumeAt(9)]?.id).toBe('socio-exchanges');
    });

    // The engine's own finish screen, one place past the last stage, is now
    // the finish stage the migration appends.
    it('keeps a finished session on the finish stage', () => {
      const stagesBefore = (ecoGeneticTemplate.stages as unknown[]).length;
      expect(resumeAt(stagesBefore)).toBe(protocol.stages.length - 1);
      expect(protocol.stages[resumeAt(stagesBefore)]?.type).toBe(
        'FinishSession',
      );
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

    it('leaves every person as they were', () => {
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

    // The redesigned stage draws neither a relationship without a kind nor
    // one of a kind it does not know, so neither makes a child.
    it.each([
      ['no kind', {}],
      ['a kind schema 9 does not know', { relationshipType: ['cousin'] }],
    ])(
      'records "no children" beside a relationship from the participant with %s',
      (_description, attributes) => {
        const withUnrelated = committedSession(9);
        withUnrelated.network.nodes.push({
          _uid: 'other-1',
          type: 'person',
          attributes: { is_ego: false, name: 'Sam' },
          promptIDs: [],
          stageId: 'family-pedigree',
        });
        withUnrelated.network.edges.push({
          _uid: 'edge-ego-other',
          type: 'family_relationship',
          from: 'ego-1',
          to: 'other-1',
          attributes,
        });
        const ego = nodeById(
          migrated(migrateSession(withUnrelated)).network.nodes,
          'ego-1',
        );
        expect(ego?.attributes).toHaveProperty('relativesNotRecorded', [
          'noChildren',
        ]);
      },
    );

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
        migratedRelationships,
      );
    });

    it('writes each relationship as the redesigned interface does', () => {
      expect(result.network.edges).toEqual(migratedRelationships);
    });
  });

  describe('the relationships of a converted pedigree', () => {
    const { migrateSession } = migrate();
    const edgeById = (edges: readonly Fields[], id: string) =>
      edges.find((edge) => edge._uid === id)?.attributes;

    it.for(['biological', 'adoptive', 'social', 'donor', 'surrogate'] as const)(
      'gives a %s parent no current partner flag, as the redesigned interface does',
      (kind) => {
        const session = committedSession(9);
        session.network.edges.push({
          _uid: 'edge-other-parent',
          type: 'family_relationship',
          from: 'friend-1',
          to: 'ego-1',
          attributes: { relationshipType: [kind], isActive: true },
        });
        const { edges } = migrated(migrateSession(session)).network;
        expect(edgeById(edges, 'edge-other-parent')).toEqual({
          relationshipType: [kind],
          isGestationalCarrier: false,
        });
      },
    );

    it.for([true, false])(
      'keeps a partnership recorded as current %s',
      (current) => {
        const session = committedSession(9);
        session.network.edges.push({
          _uid: 'edge-ego-partner',
          type: 'family_relationship',
          from: 'ego-1',
          to: 'friend-1',
          attributes: { relationshipType: ['partner'], isActive: current },
        });
        const { edges } = migrated(migrateSession(session)).network;
        expect(edgeById(edges, 'edge-ego-partner')).toEqual({
          relationshipType: ['partner'],
          isActive: current,
        });
      },
    );

    it('leaves relationships of another type as they were', () => {
      const session = committedSession(9);
      const knows = {
        _uid: 'edge-knows',
        type: 'knows',
        from: 'ego-1',
        to: 'friend-1',
        attributes: { relationshipType: ['biological'], isActive: true },
      };
      session.network.edges.push(structuredClone(knows));
      const { edges } = migrated(migrateSession(session)).network;
      expect(edges.find((edge) => edge._uid === 'edge-knows')).toEqual(knows);
    });

    it('leaves an edge of its type to someone outside the pedigree as it was', () => {
      // Another interface joined the participant to a place by an edge of the
      // pedigree's type; the redesigned stage does not read it as family.
      const session = committedSession(9);
      session.network.nodes.push({
        _uid: 'place-1',
        type: 'place',
        attributes: {},
      });
      const visited = {
        _uid: 'edge-visited',
        type: 'family_relationship',
        from: 'place-1',
        to: 'ego-1',
        attributes: { relationshipType: ['biological'], isActive: true },
      };
      session.network.edges.push(structuredClone(visited));
      const { edges } = migrated(migrateSession(session)).network;
      expect(edges.find((edge) => edge._uid === 'edge-visited')).toEqual(
        visited,
      );
    });

    it('rewrites them when the pedigree left no record', () => {
      const session = { ...committedSession(9), stageMetadata: {} };
      expect(migrated(migrateSession(session)).network.edges).toEqual(
        migratedRelationships,
      );
    });
  });

  describe('sex at birth from the gamete someone gave', () => {
    const { migrateSession } = migrate();
    const withoutSex = (ids: readonly string[]) => {
      const session = committedSession(9);
      for (const node of session.network.nodes) {
        if (typeof node._uid !== 'string' || !ids.includes(node._uid)) {
          continue;
        }
        const { biologicalSex: _biologicalSex, ...attributes } =
          node.attributes as Fields;
        node.attributes = attributes;
      }
      return session;
    };
    const sexOf = (nodes: readonly Fields[], id: string) =>
      (nodeById(nodes, id)?.attributes as Fields | undefined)?.biologicalSex;

    it('records an egg parent as female and a sperm parent as male', () => {
      const { nodes } = migrated(
        migrateSession(withoutSex(['mother-1', 'father-1'])),
      ).network;
      expect(sexOf(nodes, 'mother-1')).toEqual(['female']);
      expect(sexOf(nodes, 'father-1')).toEqual(['male']);
    });

    it('records a gamete donor the same way', () => {
      const session = withoutSex(['friend-1']);
      session.network.edges.push({
        _uid: 'edge-donor',
        type: 'family_relationship',
        from: 'friend-1',
        to: 'sister-1',
        attributes: { relationshipType: ['donor'], gameteRole: ['sperm'] },
      });
      const { nodes } = migrated(migrateSession(session)).network;
      expect(sexOf(nodes, 'friend-1')).toEqual(['male']);
    });

    it('treats a sex at birth left as an empty answer as not recorded', () => {
      const session = committedSession(9);
      const mother = nodeById(session.network.nodes, 'mother-1');
      if (mother) {
        mother.attributes = {
          ...(mother.attributes as Fields),
          biologicalSex: [],
        };
      }
      const { nodes } = migrated(migrateSession(session)).network;
      expect(sexOf(nodes, 'mother-1')).toEqual(['female']);
    });

    it.for([['intersex'], ['unknown'], ['male']])(
      'never replaces a recorded %o',
      (recorded) => {
        const session = committedSession(9);
        const mother = nodeById(session.network.nodes, 'mother-1');
        if (mother) {
          mother.attributes = {
            ...(mother.attributes as Fields),
            biologicalSex: recorded,
          };
        }
        const { nodes } = migrated(migrateSession(session)).network;
        expect(sexOf(nodes, 'mother-1')).toEqual(recorded);
      },
    );

    it('leaves someone recorded as giving both gametes unrecorded', () => {
      const session = withoutSex(['mother-1']);
      session.network.edges.push({
        _uid: 'edge-mother-friend',
        type: 'family_relationship',
        from: 'mother-1',
        to: 'friend-1',
        attributes: { relationshipType: ['biological'], gameteRole: ['sperm'] },
      });
      const { nodes } = migrated(migrateSession(session)).network;
      expect(sexOf(nodes, 'mother-1')).toBeUndefined();
    });

    it('reads a gamete role only on a biological or donor relationship', () => {
      const session = withoutSex(['friend-1']);
      session.network.edges.push({
        _uid: 'edge-adoptive',
        type: 'family_relationship',
        from: 'friend-1',
        to: 'sister-1',
        attributes: { relationshipType: ['adoptive'], gameteRole: ['egg'] },
      });
      const { nodes } = migrated(migrateSession(session)).network;
      expect(sexOf(nodes, 'friend-1')).toBeUndefined();
    });

    it('leaves people without a gamete role unrecorded', () => {
      const { nodes } = migrated(
        migrateSession(withoutSex(['ego-1', 'sister-1'])),
      ).network;
      expect(sexOf(nodes, 'ego-1')).toBeUndefined();
      expect(sexOf(nodes, 'sister-1')).toBeUndefined();
    });
  });

  describe('a schema 8 pedigree that never reached the network', () => {
    const { migrateSession } = migrate();
    const result = migrated(migrateSession(uncommittedSession()));

    it('writes every person, with their name, the participant flag and the sex at birth their gamete gives', () => {
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
          attributes: { name: 'Mother', biologicalSex: ['female'] },
          stageId: 'family-pedigree',
          promptIDs: ['pedigree'],
        },
        {
          _uid: 'father-1',
          type: 'person',
          attributes: { name: 'Joe', biologicalSex: ['male'] },
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

    it('writes every relationship as the redesigned interface does', () => {
      expect(result.network.edges).toEqual(migratedRelationships);
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

    const withNameMarkedEncrypted = (experiments: Fields) => {
      const source = template();
      const codebook = source.codebook as {
        node: { person: { variables: { name: Fields } } };
      };
      codebook.node.person.variables.name.encrypted = true;
      return { ...source, experiments };
    };

    it('does not write a label into an encrypted name attribute', () => {
      const source = withNameMarkedEncrypted({ encryptedVariables: true });
      const { network } = migrated(
        migrateProtocolWithSessions(source, 9, {
          name: 'CEGRM',
        }).migrateSession(uncommittedSession()),
      );
      expect(
        network.nodes.every((node) => !Object.hasOwn(node.attributes, 'name')),
      ).toBe(true);
    });

    // Schema 8 encrypted nothing without the experiment, so the migration
    // unmarks the name and it is written like any other.
    it('writes the label into a name only marked encrypted without the experiment', () => {
      const source = withNameMarkedEncrypted({});
      const { network } = migrated(
        migrateProtocolWithSessions(source, 9, {
          name: 'CEGRM',
        }).migrateSession(uncommittedSession()),
      );
      expect(
        network.nodes.some((node) => typeof node.attributes.name === 'string'),
      ).toBe(true);
    });
  });

  // The conversion leaves out a form field collecting the name or sex at
  // birth, which the redesigned stage asks itself. The answers already
  // recorded stay on each person.
  describe('a pedigree whose form collected the name and sex at birth', () => {
    const source = withStages(template(), (stages) =>
      stages.map((stage) => {
        if (stage.type !== 'FamilyPedigree') return stage;
        const nodeConfig = stage.nodeConfig as Fields;
        return {
          ...stage,
          nodeConfig: {
            ...nodeConfig,
            form: [
              { variable: 'name', prompt: 'Their name?' },
              { variable: 'biologicalSex', prompt: 'Their sex at birth?' },
              ...(nodeConfig.form as Fields[]),
            ],
          },
        };
      }),
    );
    const codebook = source.codebook as {
      node: { person: { variables: { biologicalSex: Fields } } };
    };
    codebook.node.person.variables.biologicalSex.component =
      'ToggleButtonGroup';
    const { migrateSession, protocol } = migrate(source);

    it('converts the stage without those fields', () => {
      expect(protocol.stages[PEDIGREE_INDEX + 1]).toMatchObject({
        form: {
          fields: [{ variable: 'living_status' }, { variable: 'birth_year' }],
        },
      });
    });

    it('keeps every person’s recorded name and sex at birth', () => {
      const session = committedSession(9);
      const result = migrated(migrateSession(session));
      expect(
        result.network.nodes.filter((node) => node._uid !== 'ego-1'),
      ).toEqual(
        [...pedigreePeople, friend].filter((node) => node._uid !== 'ego-1'),
      );
      expect(result.stageMetadata).toEqual({
        [PEDIGREE_INDEX + 1]: { framing: 'gendered' },
      });
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

  // Every converted stage has a completeness setting, and so the attribute
  // that records "no children": schema 8 always required both parents.
  it.for(['off', 'required', 'recommended'] as const)(
    'records "no children" when the grandparents boundary was %s',
    (requireGrandparents) => {
      const source = withStages(template(), (stages) =>
        stages.map((stage) =>
          stage.type === 'FamilyPedigree'
            ? {
                ...stage,
                boundaries: {
                  requireGrandparents,
                  requireChildrenContributors: 'off',
                },
              }
            : stage,
        ),
      );
      const { migrateSession } = migrate(source);
      const ego = nodeById(
        migrated(migrateSession(committedSession(9))).network.nodes,
        'ego-1',
      );
      expect(ego?.attributes).toEqual({
        ...(pedigreePeople[0]?.attributes as Fields),
        relativesNotRecorded: ['noChildren'],
      });
    },
  );

  it('does not change the session passed in', () => {
    const { migrateSession } = migrate();
    const session: PersistedSession = uncommittedSession();
    const copy = structuredClone(session);
    const first = migrateSession(session);
    expect(session).toEqual(copy);
    expect(migrateSession(session)).toEqual(first);
  });
});
