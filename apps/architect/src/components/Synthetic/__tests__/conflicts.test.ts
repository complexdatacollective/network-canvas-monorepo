import { describe, expect, it } from 'vitest';

import { analyseSyntheticFeasibility } from '@codaco/protocol-utilities';
import {
  CURRENT_SCHEMA_VERSION,
  validateProtocol,
  type VersionedProtocolDocument,
} from '@codaco/protocol-validation';

import { conflictsForStage } from '../conflicts';

/**
 * Which live-feasibility conflicts a stage owns.
 *
 * The conflicts here are produced by the ENGINE, not written by hand: the
 * whole claim under test is that the engine says which stage owns a refusal
 * and this reads that answer, so conflicts invented here would prove nothing
 * about the real ones.
 */

const ROSTER_STAGE = {
  id: 'roster-stage',
  type: 'NameGeneratorRoster' as const,
  label: 'Pick from the roster',
  subject: { entity: 'node' as const, type: 'person' },
  dataSource: 'roster-asset',
  behaviours: { minNodes: 5 },
  prompts: [{ id: 'prompt-1', text: 'Who do you know?' }],
};

const NAME_GENERATOR_STAGE = {
  id: 'name-generator-stage',
  type: 'NameGenerator' as const,
  label: 'Name some people',
  subject: { entity: 'node' as const, type: 'person' },
  form: { title: 'Add person', fields: [{ variable: 'code', prompt: 'Code' }] },
  prompts: [{ id: 'prompt-2', text: 'Who else?' }],
};

const protocolDocument = {
  name: 'Feasibility fixture',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          code: {
            name: 'Code',
            type: 'boolean',
            component: 'Toggle',
            // Two values for up to a hundred people: a slot that always runs
            // dry, which is what the pre-seed gate refuses.
            validation: { unique: true },
          },
        },
      },
    },
    edge: {},
    ego: { variables: {} },
  },
  assetManifest: {
    'roster-asset': {
      id: 'roster-asset',
      type: 'network',
      name: 'roster.csv',
      source: 'roster.csv',
    },
  },
  stages: [ROSTER_STAGE, NAME_GENERATOR_STAGE],
} as unknown as VersionedProtocolDocument;

const engineConflicts = async () => {
  const validation = await validateProtocol(protocolDocument);
  if (!validation.success) {
    throw new Error(
      `fixture protocol did not parse: ${JSON.stringify(validation.error)}`,
    );
  }
  if (validation.data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error('fixture protocol parsed as the wrong schema version');
  }
  // An empty pool is "source known empty" under the engine's three-way asset
  // contract, which is what makes the roster stage's floor unreachable.
  return analyseSyntheticFeasibility(validation.data, {
    rosterNodes: { 'roster-asset': [] },
  });
};

describe('the conflicts a stage owns', () => {
  it('produces both classes of conflict from the real analysis', async () => {
    const conflicts = await engineConflicts();

    expect(conflicts.some((c) => c.rules.includes('behaviours.minNodes'))).toBe(
      true,
    );
    expect(conflicts.some((c) => c.rules.includes('unique'))).toBe(true);
  });

  it('gives a stage-owned conflict to the stage that owns it, and no other', async () => {
    const conflicts = await engineConflicts();
    const roster = conflicts.find((c) =>
      c.rules.includes('behaviours.minNodes'),
    )!;

    expect(roster.stageId).toBe(ROSTER_STAGE.id);
    expect(conflictsForStage(conflicts, ROSTER_STAGE.id)).toEqual([roster]);
    // The other stage elicits the very same node type, and must not inherit a
    // refusal about a roster it has nothing to do with.
    expect(conflictsForStage(conflicts, NAME_GENERATOR_STAGE.id)).toEqual([]);
  });

  it('leaves an entity-wide conflict to the protocol verdict', async () => {
    const conflicts = await engineConflicts();
    const unique = conflicts.find((c) => c.rules.includes('unique'))!;

    // The exhausted slot is the sum of what BOTH stages draw, so neither
    // stage is the one to change and neither stage's editor claims it.
    expect(unique.stageId).toBeUndefined();
    expect(conflictsForStage(conflicts, ROSTER_STAGE.id)).not.toContain(unique);
    expect(conflictsForStage(conflicts, NAME_GENERATOR_STAGE.id)).not.toContain(
      unique,
    );
  });

  it('claims nothing for a stage that has no id yet', async () => {
    expect(conflictsForStage(await engineConflicts(), undefined)).toEqual([]);
  });

  it('claims nothing for a stage the analysis said nothing about', async () => {
    expect(conflictsForStage(await engineConflicts(), 'another-stage')).toEqual(
      [],
    );
  });
});
