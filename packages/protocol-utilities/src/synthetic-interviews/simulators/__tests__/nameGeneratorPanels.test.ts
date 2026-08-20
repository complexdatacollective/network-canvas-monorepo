import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PANEL_NOMINATION_PROBABILITY,
  type Stage,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { simulateNameGeneratorQuickAdd } from '../NameGeneratorQuickAdd';
import type { AssetData } from '../types';
import { harnessFor, type Harness, parseProtocol, rosterRow } from './harness';

/**
 * The panel half of a name generator: how a stage's drawn count divides
 * between people the participant types in and people a roster supplies, and
 * how an existing-network panel takes people back onto the current prompt.
 *
 * The roster pool arrives keyed by STAGE id, already fetched, filtered per
 * panel, pooled in panel order and deduplicated by the host's
 * `collectRosterExternalData` (see `@codaco/interview`'s
 * `contract/rosterData.ts`, where those steps are tested). What is left to
 * this side is what the participant can still see — a row already in the
 * network is not offered again — and what they do with it.
 */

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        close: { name: 'close', type: 'boolean' },
      },
    },
  },
};

/** The stage that seeded the prior alters, so they carry a real provenance. */
const priorStage = {
  id: 'earlier',
  type: 'NameGeneratorQuickAdd',
  label: 'Earlier',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  prompts: [{ id: 'earlier-prompt', text: 'Who did you know?' }],
};

/** A stage with no prompts at all, for alters that carry none. */
const unpromptedStage = {
  id: 'unprompted',
  type: 'Information',
  label: 'Information',
  title: 'Information',
  items: [{ id: 'i1', type: 'text', content: 'Some words.' }],
};

const stageWith = ({
  count = 6,
  panels,
  prompts = [{ id: 'p1', text: 'Who do you know?' }],
}: {
  count?: number;
  panels?: Record<string, unknown>[];
  prompts?: { id: string; text: string }[];
} = {}) => ({
  id: 'quick-add',
  type: 'NameGeneratorQuickAdd',
  label: 'Quick add',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts,
  ...(panels ? { panels } : {}),
});

const roster = (prefix: string, size: number, close = true): NcNode[] =>
  Array.from({ length: size }, (_, index) =>
    rosterRow(`${prefix}-${index}`, {
      name: `${prefix} person ${index}`,
      close,
    }),
  );

const setUp = ({
  stage = stageWith(),
  rosterNodes,
  priorAlters = 0,
  unprompted = 0,
}: {
  stage?: Record<string, unknown>;
  rosterNodes?: NcNode[];
  priorAlters?: number;
  unprompted?: number;
} = {}): Harness => {
  const protocol = parseProtocol(codebook, [
    priorStage,
    unpromptedStage,
    stage,
  ]);
  const assetData: AssetData = rosterNodes
    ? { rosterNodes: { 'quick-add': rosterNodes } }
    : {};
  const harness = harnessFor(protocol, { assetData });

  harness.seedAlters(priorAlters, {
    currentStep: 0,
    uid: (index) => `prior-${index}`,
    attributes: (index) => ({ name: `Prior ${index}`, close: true }),
  });
  harness.seedAlters(unprompted, {
    currentStep: 1,
    uid: (index) => `unprompted-${index}`,
    attributes: (index) => ({ name: `Prior ${index}`, close: true }),
  });

  return harness;
};

const runStage = (harness: Harness): void => {
  const stage = harness.context.protocol.stages[2];
  if (!stage) throw new Error('fixture is missing the stage under test');
  simulateNameGeneratorQuickAdd(
    stage as Extract<Stage, { type: 'NameGeneratorQuickAdd' }>,
    harness.context,
    undefined,
  );
};

/** Nodes this stage created, as opposed to any the harness seeded. */
const created = (harness: Harness): NcNode[] =>
  harness.nodes().filter((node) => node.stageId === 'quick-add');

/** The share of the prior alters an existing-network panel took back. */
const renominationRate = (harness: Harness, of: number): number =>
  harness.nodes().filter((node) => (node.promptIDs ?? []).includes('p1'))
    .length / of;

/** Nodes whose uid came from a roster rather than being fabricated here. */
const fromRoster = (harness: Harness, prefix: string): NcNode[] =>
  created(harness).filter((node) =>
    node[entityPrimaryKeyProperty].startsWith(prefix),
  );

describe('name generator panels', () => {
  describe('no panels', () => {
    it('spends the whole budget on people the participant types in', () => {
      const harness = setUp({ stage: stageWith({ count: 6 }) });
      runStage(harness);

      expect(created(harness)).toHaveLength(6);
      for (const node of created(harness)) {
        expect(node[entityAttributesProperty].name).toEqual(expect.any(String));
        expect(node.promptIDs).toEqual(['p1']);
      }
    });

    it('splits the budget across prompts', () => {
      const harness = setUp({
        stage: stageWith({
          count: 5,
          prompts: [
            { id: 'p1', text: 'One' },
            { id: 'p2', text: 'Two' },
          ],
        }),
      });
      runStage(harness);

      const byPrompt = created(harness).map((node) => node.promptIDs?.[0]);
      expect(byPrompt.filter((id) => id === 'p1')).toHaveLength(3);
      expect(byPrompt.filter((id) => id === 'p2')).toHaveLength(2);
    });

    it('gives every prompt somebody once the count reaches them', () => {
      // Decision 15's upper regime: a participant asked three questions and
      // naming three people answers all three, rather than answering the first
      // twice.
      const harness = setUp({
        stage: stageWith({
          count: 3,
          prompts: [
            { id: 'p1', text: 'One' },
            { id: 'p2', text: 'Two' },
            { id: 'p3', text: 'Three' },
          ],
        }),
      });
      runStage(harness);

      expect(created(harness).map((node) => node.promptIDs?.[0])).toEqual([
        'p1',
        'p2',
        'p3',
      ]);
    });

    it('gives the earliest prompts the people a smaller count allows', () => {
      // Decision 15's lower regime: one nomination across three prompts is an
      // answer to the first question, not a third of an answer each.
      const harness = setUp({
        stage: stageWith({
          count: 1,
          prompts: [
            { id: 'p1', text: 'One' },
            { id: 'p2', text: 'Two' },
            { id: 'p3', text: 'Three' },
          ],
        }),
      });
      runStage(harness);

      expect(created(harness).map((node) => node.promptIDs?.[0])).toEqual([
        'p1',
      ]);
    });
  });

  describe('a roster the host resolved', () => {
    const panels = [{ id: 'r', title: 'Roster', dataSource: 'asset-1' }];

    it('splits the budget between the roster and new people', () => {
      const harness = setUp({
        stage: stageWith({ count: 6, panels }),
        rosterNodes: roster('a', 20),
      });
      runStage(harness);

      expect(created(harness)).toHaveLength(6);
      const taken = fromRoster(harness, 'a-');
      expect(taken.length).toBeGreaterThan(0);
      expect(taken.length).toBeLessThan(6);
    });

    it('caps the roster at what it is displaying', () => {
      // A roster of two cannot supply six nominations; the rest are typed in.
      const harness = setUp({
        stage: stageWith({ count: 6, panels }),
        rosterNodes: roster('a', 2),
      });
      runStage(harness);

      expect(created(harness)).toHaveLength(6);
      expect(fromRoster(harness, 'a-').length).toBeLessThanOrEqual(2);
    });

    it('never nominates the same roster row twice', () => {
      const harness = setUp({
        stage: stageWith({
          count: 8,
          panels,
          prompts: [
            { id: 'p1', text: 'One' },
            { id: 'p2', text: 'Two' },
          ],
        }),
        rosterNodes: roster('a', 4),
      });
      runStage(harness);

      const uids = fromRoster(harness, 'a-').map(
        (node) => node[entityPrimaryKeyProperty],
      );
      expect(new Set(uids).size).toBe(uids.length);
    });

    it('hides roster rows already in the interview network', () => {
      // The person is already an alter, so the panel would not offer them and
      // the roster's whole displayed size is one, not two.
      const harness = setUp({
        stage: stageWith({ count: 4, panels }),
        rosterNodes: roster('a', 2),
      });
      harness.engine.addNode({
        nodeType: 'person',
        uid: 'a-0',
        attributeData: { name: 'Already named', close: true },
        currentStep: 0,
      });
      runStage(harness);

      const taken = fromRoster(harness, 'a-');
      expect(taken.map((node) => node[entityPrimaryKeyProperty])).not.toContain(
        'a-0',
      );
      expect(taken.length).toBeLessThanOrEqual(1);
    });

    it('keeps the roster row attributes and uid', () => {
      const harness = setUp({
        stage: stageWith({ count: 4, panels }),
        rosterNodes: roster('a', 10),
      });
      runStage(harness);

      const [taken] = fromRoster(harness, 'a-');
      expect(taken).toBeDefined();
      expect(taken![entityAttributesProperty].name).toMatch(/^a person /);
      expect(taken!.stageId).toBe('quick-add');
    });

    it('contributes nobody when the asset was not resolved', () => {
      // An absent key is a source nobody could read, which is an empty pool —
      // never a licence to invent the people a roster would have listed.
      const harness = setUp({ stage: stageWith({ count: 5, panels }) });
      runStage(harness);

      expect(created(harness)).toHaveLength(5);
      expect(fromRoster(harness, 'a-')).toHaveLength(0);
    });

    it('nominates nobody the pool does not list', () => {
      // The pool is authoritative: rows the host's filter left out are rows
      // this stage cannot reach, however its panel is configured.
      const harness = setUp({
        stage: stageWith({ count: 6, panels }),
        rosterNodes: roster('yes', 3),
      });
      runStage(harness);

      expect(fromRoster(harness, 'no-')).toHaveLength(0);
      expect(fromRoster(harness, 'yes-').length).toBeLessThanOrEqual(3);
    });

    it('draws in pool order', () => {
      const harness = setUp({
        stage: stageWith({ count: 8, panels }),
        rosterNodes: [...roster('a', 10), ...roster('b', 10)],
      });
      runStage(harness);

      // The second roster's rows are only reached once the first's are gone.
      if (fromRoster(harness, 'b-').length > 0) {
        expect(fromRoster(harness, 'a-')).toHaveLength(10);
      }
    });

    it('pools rosters when sizing the roster share', () => {
      // Neither roster alone could supply six; together they can.
      const harness = setUp({
        stage: stageWith({ count: 6, panels }),
        rosterNodes: [...roster('a', 3), ...roster('b', 3)],
      });
      runStage(harness);

      expect(created(harness)).toHaveLength(6);
      const taken =
        fromRoster(harness, 'a-').length + fromRoster(harness, 'b-').length;
      expect(taken).toBeGreaterThan(0);
      expect(taken).toBeLessThanOrEqual(6);
    });
  });

  describe('a single existing-network panel', () => {
    const panels = [{ id: 'e', title: 'Previously', dataSource: 'existing' }];

    it('re-nominates existing alters onto the current prompt', () => {
      const harness = setUp({
        stage: stageWith({ count: 2, panels }),
        priorAlters: 40,
      });
      runStage(harness);

      const renominated = harness
        .nodes()
        .filter((node) => (node.promptIDs ?? []).includes('p1'));
      // Two typed in, plus a share of the forty offered back.
      expect(renominated.length).toBeGreaterThan(2);
    });

    it('adds the prompt to an existing alter rather than duplicating it', () => {
      const harness = setUp({
        stage: stageWith({ count: 0, panels }),
        priorAlters: 40,
      });
      runStage(harness);

      const priors = harness
        .nodes()
        .filter((node) => node[entityPrimaryKeyProperty].startsWith('prior-'));
      expect(priors).toHaveLength(40);

      const moved = priors.filter((node) =>
        (node.promptIDs ?? []).includes('p1'),
      );
      expect(moved.length).toBeGreaterThan(0);
      for (const node of moved) {
        expect(node.promptIDs).toEqual(['earlier-prompt', 'p1']);
      }
    });

    it('re-nominates an alter that carries no prompts at all', () => {
      // A node reaches an existing-network panel from wherever it was created,
      // and a stage with no prompts records none. Re-nominating starts the
      // list.
      const harness = setUp({
        stage: stageWith({ count: 0, panels }),
        unprompted: 40,
      });
      runStage(harness);

      const moved = harness
        .nodes()
        .filter((node) => (node.promptIDs ?? []).includes('p1'));

      expect(moved.length).toBeGreaterThan(0);
      for (const node of moved) {
        expect(node.promptIDs).toEqual(['p1']);
      }
    });

    it('re-nominates at roughly the declared probability', () => {
      // Deterministic under the seed; the tolerance covers a change of random
      // generator rather than run-to-run variance.
      const harness = setUp({
        stage: stageWith({ count: 0, panels }),
        priorAlters: 2000,
      });
      runStage(harness);

      expect(
        Math.abs(
          renominationRate(harness, 2000) -
            DEFAULT_PANEL_NOMINATION_PROBABILITY,
        ),
      ).toBeLessThan(0.05);
    });

    it('re-nominates at the odds the panel itself declares', () => {
      // The whole point of moving this onto the protocol: a researcher whose
      // participants reliably take back the people they named earlier says
      // so on the panel, and the default gets out of the way.
      const harness = setUp({
        stage: stageWith({
          count: 0,
          panels: [
            {
              id: 'e',
              title: 'Previously',
              dataSource: 'existing',
              synthetic: { nominationProbability: 0.9 },
            },
          ],
        }),
        priorAlters: 2000,
      });
      runStage(harness);

      expect(Math.abs(renominationRate(harness, 2000) - 0.9)).toBeLessThan(
        0.05,
      );
    });

    it('takes nobody back from a panel declaring odds of zero', () => {
      const harness = setUp({
        stage: stageWith({
          count: 0,
          panels: [
            {
              id: 'e',
              title: 'Previously',
              dataSource: 'existing',
              synthetic: { nominationProbability: 0 },
            },
          ],
        }),
        priorAlters: 200,
      });
      runStage(harness);

      expect(renominationRate(harness, 200)).toBe(0);
    });

    it('does not draw on the stage budget', () => {
      const withoutPanel = setUp({
        stage: stageWith({ count: 4 }),
        priorAlters: 20,
      });
      runStage(withoutPanel);
      const withPanel = setUp({
        stage: stageWith({ count: 4, panels }),
        priorAlters: 20,
      });
      runStage(withPanel);

      // The panel adds no NEW people — it only moves existing ones onto the
      // prompt — so both networks hold the same number of nodes.
      expect(withPanel.nodes()).toHaveLength(withoutPanel.nodes().length);
    });

    it('ignores alters of another node type', () => {
      const harness = setUp({ stage: stageWith({ count: 0, panels }) });
      harness.engine.addNode({
        nodeType: 'person',
        uid: 'person-1',
        attributeData: { name: 'Somebody' },
        currentStep: 0,
      });
      harness.engine.addNode({
        nodeType: 'place',
        uid: 'place-1',
        attributeData: { name: 'Somewhere' },
        allowUnknownAttributes: true,
        currentStep: 0,
      });
      runStage(harness);

      const place = harness
        .nodes()
        .find((node) => node[entityPrimaryKeyProperty] === 'place-1');
      expect(place?.promptIDs).toEqual(['earlier-prompt']);
    });
  });

  describe('two existing-network panels showing the same people', () => {
    // Both panels are unfiltered, so every prior alter appears on both. Which
    // panel's odds apply is therefore the only thing separating these runs.
    const eager = {
      id: 'eager',
      title: 'People you were close to',
      dataSource: 'existing',
      synthetic: { nominationProbability: 0.9 },
    };
    const closed = {
      id: 'closed',
      title: 'Everyone else',
      dataSource: 'existing',
      synthetic: { nominationProbability: 0 },
    };

    it('lets the first panel that displays a person decide their odds', () => {
      const harness = setUp({
        stage: stageWith({ count: 0, panels: [eager, closed] }),
        priorAlters: 2000,
      });
      runStage(harness);

      // The eager panel is met first, so it is the one the participant
      // answers; the later panel is the same faces a second time, and they do
      // not reconsider.
      expect(Math.abs(renominationRate(harness, 2000) - 0.9)).toBeLessThan(
        0.05,
      );
    });

    it('reverses with the panels', () => {
      const harness = setUp({
        stage: stageWith({ count: 0, panels: [closed, eager] }),
        priorAlters: 2000,
      });
      runStage(harness);

      // Declining is a decision too. Were only nominations remembered, the
      // eager panel would re-roll everyone the closed one turned down and
      // this would come back at 0.9 as well — the closed panel's odds erased
      // by a panel placed after it.
      expect(renominationRate(harness, 2000)).toBe(0);
    });
  });

  describe('a roster panel and an existing-network panel together', () => {
    const panels = [
      { id: 'r', title: 'Roster', dataSource: 'asset-1' },
      { id: 'e', title: 'Previously', dataSource: 'existing' },
    ];

    it('draws new people and roster rows from the budget, and existing alters on top', () => {
      const harness = setUp({
        stage: stageWith({ count: 6, panels }),
        rosterNodes: roster('a', 10),
        priorAlters: 20,
      });
      runStage(harness);

      // 20 prior alters are untouched in number; the stage added exactly its
      // budget as new nodes.
      expect(harness.nodes()).toHaveLength(26);
      expect(fromRoster(harness, 'a-').length).toBeGreaterThan(0);
      expect(
        harness
          .nodes()
          .filter(
            (node) =>
              node[entityPrimaryKeyProperty].startsWith('prior-') &&
              (node.promptIDs ?? []).includes('p1'),
          ).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('count windows', () => {
    it.each([
      { label: 'a single-value window', count: 1 },
      { label: 'a small budget', count: 2 },
      { label: 'a budget larger than the roster', count: 9 },
      { label: 'a zero budget', count: 0 },
    ])('honours $label exactly', ({ count }) => {
      const harness = setUp({
        stage: stageWith({
          count,
          panels: [{ id: 'r', title: 'Roster', dataSource: 'asset-1' }],
        }),
        rosterNodes: roster('a', 4),
      });
      runStage(harness);

      // Whatever the split, the stage creates exactly its budget of nodes.
      expect(created(harness)).toHaveLength(count);
    });

    it('spreads a budget across prompts with panels present', () => {
      const harness = setUp({
        stage: stageWith({
          count: 7,
          panels: [{ id: 'r', title: 'Roster', dataSource: 'asset-1' }],
          prompts: [
            { id: 'p1', text: 'One' },
            { id: 'p2', text: 'Two' },
            { id: 'p3', text: 'Three' },
          ],
        }),
        rosterNodes: roster('a', 20),
      });
      runStage(harness);

      expect(created(harness)).toHaveLength(7);
      for (const promptId of ['p1', 'p2', 'p3']) {
        expect(
          created(harness).filter((node) =>
            (node.promptIDs ?? []).includes(promptId),
          ).length,
        ).toBeGreaterThan(0);
      }
    });
  });
});
