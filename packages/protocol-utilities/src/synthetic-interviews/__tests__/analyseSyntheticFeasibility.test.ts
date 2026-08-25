import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import {
  analyseSyntheticFeasibility,
  type ConstraintConflict,
  generateInterviews,
  SyntheticDataConstraintError,
} from '../../index';
import { FEASIBILITY_SUMMARY } from '../constraints/feasibility';
import type { AssetData } from '../simulators/types';

/**
 * The public feasibility export: the pre-seed gate callable on its own.
 *
 * The property under test is NON-DRIFT — `analyseSyntheticFeasibility` must
 * return exactly the conflicts a real `generateInterviews` run on the same
 * protocol, pools, and anchor refuses with, byte-for-byte in the refusal
 * message. Every protocol goes through the real schema, because the analysis
 * reads the `synthetic` descriptors parsing supplies.
 *
 * The refusal cases are ones that REACH the gate: a roster pool below a
 * `behaviours.minNodes` floor, and a `unique` value space below the walk's
 * ceiling. (Count support below a stage's own floor never gets here — the
 * schema refuses it at parse.)
 */

/** Pinned for both the analysis and the generation run, so the two ask the
 *  same dated question whatever wall clock the test runs under. */
const START_WINDOW = '2026-08-14T12:00:00.000Z';

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        /** Two possible values; a `unique` slot four people cannot share. */
        close: {
          name: 'close',
          type: 'boolean',
          component: 'Toggle',
          validation: { unique: true },
        },
      },
    },
  },
};

const ASSET_MANIFEST = {
  colleagues: {
    id: 'colleagues',
    name: 'Colleagues',
    type: 'network',
    source: 'colleagues.json',
  },
};

const parse = (stages: Record<string, unknown>[]): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Feasibility export test protocol',
    description: 'Exercises the public pre-seed analysis.',
    schemaVersion: 8,
    codebook,
    assetManifest: ASSET_MANIFEST,
    stages,
  });

/** A quick-add generator eliciting `count` people and asking nothing else. */
const elicits = (count: number): Record<string, unknown> => ({
  id: 'quick',
  type: 'NameGeneratorQuickAdd',
  label: 'Quick add',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts: [{ id: 'quick-p1', text: 'Who do you know?' }],
});

/** A name generator collecting the unique boolean on `count` people. */
const collectsClose = (count: number): Record<string, unknown> => ({
  id: 'ng',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'About them',
    fields: [{ variable: 'close', prompt: 'Close to you?' }],
  },
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts: [{ id: 'ng-p1', text: 'Who do you know?' }],
});

/**
 * A roster stage drawing `count` people.
 *
 * Gated by default, at the same figure: `behaviours.minNodes` is the live
 * interface's own floor, and whether a stage HAS one is what decides most of
 * the roster refusals below. `gated: false` is a stage a participant may leave
 * empty, which no pool can therefore fall short of.
 */
const rosterStage = (
  count: number,
  { gated = true }: { gated?: boolean } = {},
): Record<string, unknown> => ({
  id: 'roster',
  type: 'NameGeneratorRoster',
  label: 'Colleagues',
  subject: { entity: 'node', type: 'person' },
  dataSource: 'colleagues',
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts: [{ id: 'roster-p1', text: 'Who do you work with?' }],
  ...(gated ? { behaviours: { minNodes: count } } : {}),
});

const rows = (howMany: number): NcNode[] =>
  Array.from({ length: howMany }, (_unused, index) => ({
    [entityPrimaryKeyProperty]: `row-${index}`,
    type: 'person',
    [entityAttributesProperty]: { name: `Row ${index}` },
  }));

const analyse = (
  protocol: CurrentProtocol,
  assetData?: AssetData,
): ConstraintConflict[] =>
  analyseSyntheticFeasibility(protocol, assetData, {
    startWindow: START_WINDOW,
  });

/** The refusal a real generation run produces for the same inputs. */
const captureRefusal = (
  protocol: CurrentProtocol,
  assetData?: AssetData,
): SyntheticDataConstraintError => {
  try {
    generateInterviews(
      protocol,
      { count: 1, startWindow: START_WINDOW },
      assetData,
    );
  } catch (error) {
    if (error instanceof SyntheticDataConstraintError) return error;
    throw error;
  }
  throw new Error('expected generation to refuse this protocol');
};

describe('analyseSyntheticFeasibility', () => {
  it('returns no conflicts for a protocol nothing is wrong with', () => {
    expect(analyse(parse([elicits(4)]))).toEqual([]);
  });

  it('refuses an unparsed protocol document rather than re-defaulting it', () => {
    const document = {
      ...parse([elicits(4)]),
      stages: [
        {
          id: 'bare',
          type: 'Information',
          label: 'Bare',
          items: [],
        },
      ],
    } as unknown as CurrentProtocol;

    expect(() => analyse(document)).toThrowError(
      /declares no synthetic parameters/,
    );
  });

  describe('parity with the generation gate', () => {
    // Each case asserts the whole contract at once: the analysis returns
    // conflicts, generation on the same inputs throws, the two carry the same
    // structured conflicts, and rebuilding the refusal from the analysis
    // reproduces the thrown message byte-for-byte. Any drift between the
    // export and the gate — inputs, ordering, wording — fails here.
    const expectGateParity = (
      protocol: CurrentProtocol,
      assetData?: AssetData,
    ): ConstraintConflict[] => {
      const conflicts = analyse(protocol, assetData);
      expect(conflicts.length).toBeGreaterThan(0);

      const refusal = captureRefusal(protocol, assetData);
      expect(refusal.conflicts).toEqual(conflicts);
      expect(refusal.message).toBe(
        new SyntheticDataConstraintError(conflicts, FEASIBILITY_SUMMARY)
          .message,
      );
      return conflicts;
    };

    it('matches the refusal for a roster pool below the min-nodes floor', () => {
      const conflicts = expectGateParity(parse([rosterStage(3)]), {
        rosterNodes: { roster: rows(2) },
      });

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.rules).toEqual(['behaviours.minNodes']);
      expect(conflicts[0]?.reason).toBe(
        'stage "Colleagues" must nominate at least 3 from its roster, and only 2 rows were resolved for it',
      );
    });

    it('matches the refusal for a roster pool the host could not resolve', () => {
      // A `rosterNodes` map that omits this stage's key is the host reporting
      // a source it could not resolve — an empty pool, refused. (A caller
      // passing no map at all has not taken part in the roster contract, and
      // is not refused; that arm is covered below.)
      const conflicts = expectGateParity(parse([rosterStage(1)]), {
        rosterNodes: {},
      });

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.reason).toBe(
        'stage "Colleagues" must nominate at least 1 from its roster, and no rows were resolved for it',
      );
    });

    it('matches the refusal for a unique value space below the walk ceiling', () => {
      const conflicts = expectGateParity(parse([collectsClose(4)]));

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.rules).toEqual(['unique']);
      expect(conflicts[0]?.variableNames).toEqual(['close']);
      expect(conflicts[0]?.reason).toBe(
        'only 2 distinct values are possible, but up to 4 nodes of this type can be generated',
      );
    });
  });

  it('accepts exactly the protocols generation accepts', () => {
    // The other half of the always-or-never invariant: an empty analysis means
    // generation on the same inputs produces sessions rather than throwing.
    const protocol = parse([rosterStage(2)]);
    const assetData: AssetData = { rosterNodes: { roster: rows(2) } };

    expect(analyse(protocol, assetData)).toEqual([]);
    const results = generateInterviews(
      protocol,
      { count: 1, startWindow: START_WINDOW },
      assetData,
    );
    expect(results).toHaveLength(1);
  });

  it('does not refuse an ungated stage whose caller took no part in the roster contract', () => {
    // No `rosterNodes` map at all means the host never looked, which is
    // different from a source it looked for and could not resolve. Both the
    // analysis and generation read it that way: no refusal, an empty stage.
    //
    // The opt-out reaches exactly as far as the interface does. A stage with a
    // `behaviours.minNodes` floor is one a participant cannot leave empty, so
    // an absent map there is refused as a host-resolution failure instead —
    // pinned in `constraints/__tests__/feasibility.test.ts`, and the reason
    // this fixture states no floor rather than the one it draws.
    const protocol = parse([rosterStage(1, { gated: false })]);

    expect(analyse(protocol, {})).toEqual([]);
    const results = generateInterviews(
      protocol,
      { count: 1, startWindow: START_WINDOW },
      {},
    );
    expect(results).toHaveLength(1);
  });
});
