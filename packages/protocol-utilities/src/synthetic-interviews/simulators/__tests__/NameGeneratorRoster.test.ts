import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { simulateNameGeneratorRoster } from '../NameGeneratorRoster';
import type { AssetData } from '../types';
import {
  harnessFor,
  type Harness,
  parseProtocol,
  rosterRow,
  TEST_SEED,
} from './harness';

/**
 * C4 for NameGeneratorRoster: the interface can add a roster row and nothing
 * else, so this stage may too.
 *
 * The pool arrives keyed by STAGE id, already fetched and transformed by the
 * host's `collectRosterExternalData` — which is also what gives a row the
 * content-derived `_uid` the interface's own hiding depends on. The three-way
 * key contract is the spec's: rows present, an empty array (a source known
 * empty), and an ABSENT key (a source nobody could read). All three are
 * exercised below, because the absent case is the one that used to invent
 * people a roster interface cannot create.
 */

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        // Prompt-fixed rather than drawn, so the prompt has something to say.
        colleague: { name: 'colleague', type: 'boolean' },
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

const ROSTER_STAGE_ID = 'roster';

const DEFAULT_PROMPTS = [{ id: 'p1', text: 'Who do you work with?' }];

const stageWith = ({
  count = 4,
  prompts = DEFAULT_PROMPTS,
  behaviours,
}: {
  count?: number;
  prompts?: Record<string, unknown>[];
  behaviours?: Record<string, unknown>;
} = {}) => ({
  id: ROSTER_STAGE_ID,
  type: 'NameGeneratorRoster',
  label: 'Colleagues',
  subject: { entity: 'node', type: 'person' },
  dataSource: 'colleagues',
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts,
  ...(behaviours ? { behaviours } : {}),
});

/**
 * Roster rows as `collectRosterExternalData` hands them over: whatever columns
 * the researcher's file carried, under the ids the host resolved.
 */
const roster = (
  size: number,
  attributes: (index: number) => Record<string, string> = (index) => ({
    name: `Colleague ${index}`,
  }),
): NcNode[] =>
  Array.from({ length: size }, (_, index) =>
    rosterRow(`roster-${index}`, attributes(index)),
  );

const setUp = ({
  stage = stageWith(),
  rosterNodes,
  seed = TEST_SEED,
  captureTrace = false,
}: {
  stage?: Record<string, unknown>;
  /** Undefined leaves the key ABSENT: a source nobody could read. */
  rosterNodes?: NcNode[];
  seed?: number;
  captureTrace?: boolean;
} = {}): Harness => {
  const protocol = parseProtocol(CODEBOOK, [stage], {
    assetManifest: ASSET_MANIFEST,
  });
  const assetData: AssetData = rosterNodes
    ? { rosterNodes: { [ROSTER_STAGE_ID]: rosterNodes } }
    : {};

  return harnessFor(protocol, { seed, assetData, captureTrace });
};

const runStage = (harness: Harness, promptBound?: number): void => {
  const stage = harness.context.protocol.stages[0];
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateNameGeneratorRoster(
    stage as Extract<Stage, { type: 'NameGeneratorRoster' }>,
    harness.context,
    promptBound,
  );
};

const uids = (harness: Harness): string[] =>
  harness.nodes().map((node) => node[entityPrimaryKeyProperty]);

describe('simulateNameGeneratorRoster', () => {
  it('nominates the drawn number of people, each keeping their roster id', () => {
    const harness = setUp({
      stage: stageWith({ count: 4 }),
      rosterNodes: roster(10),
    });
    runStage(harness);

    expect(harness.nodes()).toHaveLength(4);
    for (const uid of uids(harness)) expect(uid).toMatch(/^roster-\d+$/);
  });

  it('copies a row’s columns verbatim, the codebook’s and the roster’s alike', () => {
    // `Abbreviated_Name` is a column the codebook never declares — real
    // rosters carry them, and the runtime admits them through
    // `allowUnknownAttributes`. Drawing a value for a roster row would be
    // answering a question the roster already answered.
    const harness = setUp({
      stage: stageWith({ count: 1 }),
      rosterNodes: roster(6, (index) => ({
        name: `Colleague ${index}`,
        Abbreviated_Name: `C${index}`,
      })),
    });
    runStage(harness);

    const [added] = harness.nodes();
    expect(added).toBeDefined();
    const index = Number(added![entityPrimaryKeyProperty].split('-')[1]);
    expect(added![entityAttributesProperty]).toStrictEqual({
      name: `Colleague ${index}`,
      Abbreviated_Name: `C${index}`,
    });
  });

  it('nominates nobody the roster does not list', () => {
    // A roster of two cannot supply six people, and this interface has no
    // other way to produce one: the count is what the participant WOULD have
    // nominated, and the pool is what they were shown.
    const harness = setUp({
      stage: stageWith({ count: 6 }),
      rosterNodes: roster(2),
    });
    runStage(harness);

    expect(harness.nodes()).toHaveLength(2);
  });

  it('nominates nobody when the source never resolved', () => {
    // An absent key is a source nobody could read, which is an empty pool —
    // never a licence to invent the people a roster would have listed. The
    // protocol-level refusal for a pool too small to satisfy `minNodes` is
    // feasibility's, before the seed is consulted; a simulator that threw here
    // would make the same refusal seed-dependent.
    const harness = setUp({ stage: stageWith({ count: 5 }) });
    runStage(harness);

    expect(harness.nodes()).toEqual([]);
  });

  it('nominates nobody from a source known to be empty', () => {
    const harness = setUp({
      stage: stageWith({ count: 5 }),
      rosterNodes: [],
    });
    runStage(harness);

    expect(harness.nodes()).toEqual([]);
  });

  it('leaves out a row whose person is already in the network', () => {
    // The interface hides a roster row once that person has been named, and
    // the row keeping its own id is what makes the hiding work.
    const harness = setUp({
      stage: stageWith({ count: 2 }),
      rosterNodes: roster(2),
    });
    harness.engine.addNode({
      nodeType: 'person',
      uid: 'roster-0',
      attributeData: { name: 'Colleague 0' },
      currentStep: 0,
    });
    runStage(harness);

    expect(uids(harness)).toEqual(['roster-0', 'roster-1']);
  });

  it('never takes the same row twice across prompts', () => {
    const harness = setUp({
      stage: stageWith({
        count: 8,
        prompts: [
          { id: 'p1', text: 'One' },
          { id: 'p2', text: 'Two' },
        ],
      }),
      rosterNodes: roster(20),
    });
    runStage(harness);

    expect(new Set(uids(harness)).size).toBe(uids(harness).length);
  });

  it('draws uniformly rather than working down the list', () => {
    // The roster IS this interface — searchable, sortable, shown in whatever
    // order the participant asked for — so nothing privileges the rows the
    // file happens to list first. Taking in pool order would put every one of
    // these two hundred sessions on `roster-0`.
    const chosen = Array.from({ length: 200 }, (_, seed) => {
      const harness = setUp({
        stage: stageWith({ count: 1 }),
        rosterNodes: roster(12),
        seed,
      });
      runStage(harness);
      return uids(harness)[0];
    });

    const counts = new Map<string | undefined, number>();
    for (const uid of chosen) counts.set(uid, (counts.get(uid) ?? 0) + 1);

    expect(counts.size).toBeGreaterThan(6);
    expect(Math.max(...counts.values()) / chosen.length).toBeLessThan(0.4);
  });

  it('writes the prompt’s fixed attributes, and lets a roster column win', () => {
    // `handleAddNode` spreads the roster row over the prompt's attributes, so
    // where the two name the same variable the participant is handed the
    // researcher's own data about that person.
    const harness = setUp({
      stage: stageWith({
        count: 2,
        prompts: [
          {
            id: 'p1',
            text: 'Who do you work with?',
            additionalAttributes: [{ variable: 'colleague', value: true }],
          },
        ],
      }),
      rosterNodes: [
        rosterRow('roster-0', { name: 'Agrees' }),
        rosterRow('roster-1', { name: 'Disagrees', colleague: false }),
      ],
    });
    runStage(harness);

    const byUid = new Map(
      harness.nodes().map((node) => [node[entityPrimaryKeyProperty], node]),
    );
    expect(byUid.get('roster-0')?.[entityAttributesProperty].colleague).toBe(
      true,
    );
    expect(byUid.get('roster-1')?.[entityAttributesProperty].colleague).toBe(
      false,
    );
  });

  it('stamps every nomination with the prompt the participant was on', () => {
    const harness = setUp({
      stage: stageWith({
        count: 4,
        prompts: [
          { id: 'p1', text: 'One' },
          { id: 'p2', text: 'Two' },
        ],
      }),
      rosterNodes: roster(20),
    });
    runStage(harness);

    const byPrompt = harness.nodes().map((node) => node.promptIDs);
    expect(byPrompt.filter((ids) => ids?.[0] === 'p1')).toHaveLength(2);
    expect(byPrompt.filter((ids) => ids?.[0] === 'p2')).toHaveLength(2);
    for (const node of harness.nodes()) {
      expect(node.stageId).toBe(ROSTER_STAGE_ID);
    }
  });

  it('gives the earliest prompts the people a smaller count allows', () => {
    // Decision 15's lower regime, the same rule the other two name generators
    // follow: one nomination across three prompts answers the first question.
    const harness = setUp({
      stage: stageWith({
        count: 1,
        prompts: [
          { id: 'p1', text: 'One' },
          { id: 'p2', text: 'Two' },
          { id: 'p3', text: 'Three' },
        ],
      }),
      rosterNodes: roster(20),
    });
    runStage(harness);

    expect(harness.nodes().map((node) => node.promptIDs)).toEqual([['p1']]);
  });

  it('writes nothing when the participant only arrived', () => {
    const harness = setUp({
      stage: stageWith({ count: 4 }),
      rosterNodes: roster(10),
      captureTrace: true,
    });
    runStage(harness, 0);

    expect(harness.trace()).toEqual([]);
  });

  it('adds people and nothing else', () => {
    // The interface has a drag target and a delete; it creates no ties, keeps
    // no metadata, and touches nobody already in the network.
    const harness = setUp({
      stage: stageWith({
        count: 4,
        prompts: [
          { id: 'p1', text: 'One' },
          { id: 'p2', text: 'Two' },
        ],
      }),
      rosterNodes: roster(10),
      captureTrace: true,
    });
    runStage(harness);

    expect(harness.trace().map((action) => action.type)).toEqual([
      'addNode',
      'addNode',
      'updatePrompt',
      'addNode',
      'addNode',
    ]);
    expect(harness.network.edges).toEqual([]);
    expect(harness.engine.draft.stageMetadata).toEqual({});
  });

  it('takes a duplicate-valued row verbatim rather than under-filling', () => {
    // Two of the four rows carry the same `band`, and the codebook says no two
    // people may. The RUNTIME's roster add path validates no values — dedupe
    // is by _uid alone — so a researcher-supplied duplicate is a row the
    // participant can add, and the session must hold it as it arrived.
    // Passing the row over instead would leave the completed stage below the
    // count the walk drew for it — a state no finished real interview can end
    // in, and one that silently breaks an authored min-nodes floor.
    const protocol = parseProtocol(
      {
        node: {
          person: {
            ...CODEBOOK.node.person,
            variables: {
              ...CODEBOOK.node.person.variables,
              band: {
                name: 'band',
                type: 'ordinal',
                component: 'LikertScale',
                options: [
                  { label: 'One', value: 1 },
                  { label: 'Two', value: 2 },
                  { label: 'Three', value: 3 },
                ],
                validation: { unique: true },
              },
            },
          },
        },
      },
      [stageWith({ count: 3 })],
      { assetManifest: ASSET_MANIFEST },
    );

    for (let seed = 0; seed < 25; seed += 1) {
      const harness = harnessFor(protocol, {
        seed,
        assetData: {
          rosterNodes: {
            [ROSTER_STAGE_ID]: [
              rosterRow('roster-0', { name: 'First', band: 1 }),
              rosterRow('roster-1', { name: 'Second', band: 1 }),
              rosterRow('roster-2', { name: 'Third', band: 2 }),
              rosterRow('roster-3', { name: 'Fourth', band: 3 }),
            ],
          },
        },
      });
      const stage = harness.context.protocol.stages[0];
      simulateNameGeneratorRoster(
        stage as Extract<Stage, { type: 'NameGeneratorRoster' }>,
        harness.context,
        undefined,
      );

      const nodes = harness.nodes();
      // The drawn count is always met: no row is passed over.
      expect(nodes).toHaveLength(3);
      // And every nominated row kept exactly the band it arrived carrying —
      // duplicates included, when the draw picks both twins.
      for (const node of nodes) {
        const uid = node[entityPrimaryKeyProperty];
        const expected = {
          'roster-0': 1,
          'roster-1': 1,
          'roster-2': 2,
          'roster-3': 3,
        }[uid];
        expect(node[entityAttributesProperty].band).toBe(expected);
      }
    }
  });

  it('reproduces the same nominations for the same seed', () => {
    const nominations = (seed: number) => {
      const harness = setUp({
        stage: stageWith({ count: 5 }),
        rosterNodes: roster(20),
        seed,
      });
      runStage(harness);
      return uids(harness);
    };

    expect(nominations(7)).toEqual(nominations(7));
    expect(nominations(7)).not.toEqual(nominations(8));
  });
});
