import { describe, expect, it } from 'vitest';

import { analyseSyntheticFeasibility } from '@codaco/protocol-utilities';
import {
  CURRENT_SCHEMA_VERSION,
  validateProtocol,
  type VersionedProtocolDocument,
} from '@codaco/protocol-validation';

import {
  conflictBelongsToStage,
  conflictStageName,
} from '../syntheticConflicts';

/**
 * Which live-feasibility conflicts a stage editor shows.
 *
 * The conflicts here are produced by the ENGINE, not written by hand: the only
 * link between a `ConstraintConflict` and a stage is the wording the engine
 * chooses, so a test that invented that wording would prove nothing about the
 * matcher's fitness for the real thing.
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

const rosterIdentity = {
  label: ROSTER_STAGE.label,
  subject: { entity: 'node', type: 'person' },
};

const nameGeneratorIdentity = {
  label: NAME_GENERATOR_STAGE.label,
  subject: { entity: 'node', type: 'person' },
};

describe('matching engine conflicts to a stage', () => {
  it('produces both classes of conflict from the real analysis', async () => {
    const conflicts = await engineConflicts();

    expect(conflicts.some((c) => c.rules.includes('behaviours.minNodes'))).toBe(
      true,
    );
    expect(conflicts.some((c) => c.rules.includes('unique'))).toBe(true);
  });

  it('keeps a stage-named conflict on the stage it names', async () => {
    const conflicts = await engineConflicts();
    const roster = conflicts.find((c) =>
      c.rules.includes('behaviours.minNodes'),
    )!;

    expect(conflictStageName(roster)).toBe(ROSTER_STAGE.label);
    expect(conflictBelongsToStage(roster, rosterIdentity)).toBe(true);
    // The other stage elicits the very same node type, and must not inherit a
    // refusal about a roster it has nothing to do with.
    expect(conflictBelongsToStage(roster, nameGeneratorIdentity)).toBe(false);
  });

  it('shows an entity-scoped conflict on every stage writing that entity', async () => {
    const conflicts = await engineConflicts();
    const unique = conflicts.find((c) => c.rules.includes('unique'))!;

    expect(conflictStageName(unique)).toBeUndefined();
    expect(conflictBelongsToStage(unique, rosterIdentity)).toBe(true);
    expect(conflictBelongsToStage(unique, nameGeneratorIdentity)).toBe(true);
  });

  it('does not show an entity-scoped conflict on a stage of another entity', async () => {
    const conflicts = await engineConflicts();
    const unique = conflicts.find((c) => c.rules.includes('unique'))!;

    expect(
      conflictBelongsToStage(unique, {
        label: 'About you',
        subject: { entity: 'ego' },
      }),
    ).toBe(false);
    expect(
      conflictBelongsToStage(unique, {
        label: 'Other people',
        subject: { entity: 'node', type: 'venue' },
      }),
    ).toBe(false);
  });

  it('shows nothing on a stage with no subject at all', async () => {
    const conflicts = await engineConflicts();
    const unique = conflicts.find((c) => c.rules.includes('unique'))!;

    expect(
      conflictBelongsToStage(unique, {
        label: 'Read this',
        subject: undefined,
      }),
    ).toBe(false);
  });
});
