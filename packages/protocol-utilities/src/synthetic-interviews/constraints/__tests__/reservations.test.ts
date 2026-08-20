import { describe, expect, it } from 'vitest';

import {
  collectInterfaceImpliedRules,
  type CurrentProtocol,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateInterviews } from '../../index';
import type { AssetData } from '../../simulators/types';
import { createEntityConstraintCache } from '../entityConstraintCache';
import { scopeKey } from '../generateEntityAttributes';
import {
  claimFixedValues,
  releaseRosterValues,
  reservePromptFixedValues,
  reserveRosterValues,
  rosterRowIsDrawable,
} from '../reservations';
import { UniqueRegistry } from '../uniqueRegistry';

/**
 * The `unique` bookkeeping for values a session is HANDED rather than draws.
 *
 * Both halves are asserted end to end, through `generateInterviews`, because
 * the failure they prevent is a session-wide one: a value taken by an earlier
 * stage's draw and then written again by a prompt or a roster row, which no
 * single stage can see going wrong.
 */

const START_WINDOW = '2026-08-14T12:00:00.000Z';

const BANDS = [
  { label: 'One', value: 1 },
  { label: 'Two', value: 2 },
  { label: 'Three', value: 3 },
];

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        close: {
          name: 'close',
          type: 'boolean',
          component: 'Toggle',
          validation: { unique: true },
        },
        band: {
          name: 'band',
          type: 'ordinal',
          component: 'LikertScale',
          options: BANDS,
          validation: { unique: true },
        },
      },
    },
  },
};

const parse = (
  stages: Record<string, unknown>[],
  assetManifest?: Record<string, unknown>,
): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Reservation test protocol',
    description: 'Exercises the unique holds a session takes up front.',
    schemaVersion: 8,
    codebook,
    stages,
    ...(assetManifest ? { assetManifest } : {}),
  });

const drawsInto = (variable: string, count: number, id = 'draws') => ({
  id,
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'About them',
    fields: [{ variable, prompt: 'Tell us' }],
  },
  synthetic: {
    generatesData: true,
    count: { distribution: 'constant', value: count },
  },
  prompts: [{ id: `${id}-p1`, text: 'Who do you know?' }],
});

const sessionsFor = (
  protocol: CurrentProtocol,
  seeds: number,
  assetData?: AssetData,
) =>
  Array.from({ length: seeds }, (_, seed) => {
    const [result] = generateInterviews(
      protocol,
      {
        count: 1,
        seed,
        simulateDropOut: false,
        startWindow: START_WINDOW,
      },
      assetData,
    );
    if (!result) throw new Error('generation produced no session');
    return result.session;
  });

const valuesOf = (
  nodes: NcNode[] | undefined,
  variable: string,
): VariableValue[] =>
  (nodes ?? [])
    .map((node) => node[entityAttributesProperty][variable])
    .filter((value): value is VariableValue => value !== undefined);

describe('the unique values a session holds back', () => {
  describe('a value a prompt fixes', () => {
    // The earlier stage draws `close`, whose whole value space is two values,
    // and the later stage's prompt fixes one of them onto everybody it
    // elicits. Without a hold taken before the walk starts, the earlier draw
    // takes `true` about half the time and the finished network holds it
    // twice — the duplicate `unique` forbids, on those seeds.
    const protocol = parse([
      drawsInto('close', 1),
      {
        id: 'fixes',
        type: 'NameGeneratorQuickAdd',
        label: 'Quick add',
        subject: { entity: 'node', type: 'person' },
        quickAdd: 'name',
        synthetic: {
          generatesData: true,
          count: { distribution: 'constant', value: 1 },
        },
        prompts: [
          {
            id: 'fixes-p1',
            text: 'Who else?',
            additionalAttributes: [{ variable: 'close', value: true }],
          },
        ],
      },
    ]);

    it('keeps it out of the way of every earlier draw', () => {
      for (const payload of sessionsFor(protocol, 40)) {
        const drawn = (payload.network?.nodes ?? []).find(
          (node) => node.stageId === 'draws',
        );

        expect(drawn?.[entityAttributesProperty].close).toBe(false);
      }
    });

    it('leaves the session holding each value once', () => {
      for (const payload of sessionsFor(protocol, 40)) {
        const values = valuesOf(payload.network?.nodes, 'close');

        expect(values).toHaveLength(2);
        expect(new Set(values).size).toBe(2);
      }
    });
  });

  describe('the values a roster row carries', () => {
    const protocol = parse([
      drawsInto('band', 2),
      {
        id: 'roster',
        type: 'NameGeneratorQuickAdd',
        label: 'Quick add',
        subject: { entity: 'node', type: 'person' },
        quickAdd: 'name',
        synthetic: {
          generatesData: true,
          count: { distribution: 'constant', value: 3 },
        },
        prompts: [{ id: 'roster-p1', text: 'Who else?' }],
        panels: [{ id: 'r', title: 'Roster', dataSource: 'asset-1' }],
      },
    ]);

    const assetData: AssetData = {
      rosterNodes: {
        roster: BANDS.map(({ value }, index) => ({
          [entityPrimaryKeyProperty]: `row-${index}`,
          type: 'person',
          [entityAttributesProperty]: { name: `Row ${index}`, band: value },
        })),
      },
    };

    it('never lets two people end up holding one of them', () => {
      // A row whose value the network already holds is passed over, and the
      // stage's count is met by somebody the participant types in instead.
      for (const payload of sessionsFor(protocol, 60, assetData)) {
        const values = valuesOf(payload.network?.nodes, 'band');

        expect(new Set(values).size).toBe(values.length);
      }
    });

    it('keeps a row’s value out of the way of every earlier draw', () => {
      // One row, one earlier person, and the row carries the value that
      // earlier draw takes first — an unheld `unique` sequence starts at its
      // first distinct value on every seed. Held only while its own stage was
      // drawing, the row would then be a duplicate of what the network already
      // holds and would be passed over for good, so the roster the protocol
      // was written around loses a person a different draw would have left
      // room for.
      const oneRow = parse([
        drawsInto('band', 1),
        {
          id: 'roster',
          type: 'NameGeneratorQuickAdd',
          label: 'Quick add',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          synthetic: {
            generatesData: true,
            count: { distribution: 'constant', value: 1 },
          },
          prompts: [{ id: 'roster-p1', text: 'Who else?' }],
          panels: [{ id: 'r', title: 'Roster', dataSource: 'asset-1' }],
        },
      ]);
      const single: AssetData = {
        rosterNodes: {
          roster: [
            {
              [entityPrimaryKeyProperty]: 'row-1',
              type: 'person',
              [entityAttributesProperty]: { name: 'Row', band: 1 },
            },
          ],
        },
      };

      for (const payload of sessionsFor(oneRow, 40, single)) {
        const drawn = (payload.network?.nodes ?? []).find(
          (node) => node.stageId === 'draws',
        );

        expect(drawn?.[entityAttributesProperty].band).not.toBe(1);
      }
    });

    it('lets only one of two rows offering the same value through', () => {
      // A roster is the researcher's own data, and nothing there stops two
      // rows carrying one value for a variable the codebook marks `unique`.
      // Choosing the whole set of rows before any of them lands is what would
      // let both through — the network holds the value only once the first is
      // added — so rows are offered one at a time and the second is passed
      // over, its place taken by somebody typed in.
      const twins: AssetData = {
        rosterNodes: {
          roster: [0, 1].map((index) => ({
            [entityPrimaryKeyProperty]: `row-${index}`,
            type: 'person',
            [entityAttributesProperty]: { name: `Row ${index}`, band: 1 },
          })),
        },
      };

      for (const payload of sessionsFor(protocol, 60, twins)) {
        const values = valuesOf(payload.network?.nodes, 'band');

        expect(new Set(values).size).toBe(values.length);
      }
    });

    it('takes every row it draws with the value it arrived carrying', () => {
      for (const payload of sessionsFor(protocol, 60, assetData)) {
        const rows = (payload.network?.nodes ?? []).filter((node) =>
          node[entityPrimaryKeyProperty].startsWith('row-'),
        );

        for (const row of rows) {
          const index = Number(row[entityPrimaryKeyProperty].split('-')[1]);
          expect(row[entityAttributesProperty].band).toBe(BANDS[index]?.value);
        }
      }
    });
  });

  describe('the values a roster STAGE’s rows carry', () => {
    // The same hold, taken for the stage whose whole population is a roster.
    // It reaches a roster without a panel, so a bookkeeping pass that only
    // knew about panel-bearing name generators would skip it — and the
    // consequence is not a crash but a quieter loss: the earlier draw takes
    // the row's value, the row is then a duplicate of what the network holds
    // and is passed over for good, and the roster stage nominates nobody.
    const oneRow = parse(
      [
        drawsInto('band', 1),
        {
          id: 'roster',
          type: 'NameGeneratorRoster',
          label: 'Colleagues',
          subject: { entity: 'node', type: 'person' },
          dataSource: 'colleagues',
          synthetic: {
            generatesData: true,
            count: { distribution: 'constant', value: 1 },
          },
          prompts: [{ id: 'roster-p1', text: 'Who else?' }],
        },
      ],
      {
        colleagues: {
          id: 'colleagues',
          name: 'Colleagues',
          type: 'network',
          source: 'colleagues.json',
        },
      },
    );

    const single: AssetData = {
      rosterNodes: {
        roster: [
          {
            [entityPrimaryKeyProperty]: 'row-1',
            type: 'person',
            [entityAttributesProperty]: { name: 'Row', band: 1 },
          },
        ],
      },
    };

    it('keeps a row’s value out of the way of every earlier draw', () => {
      // An unheld `unique` sequence starts at its first distinct value on
      // every seed, which is exactly the value this row carries.
      for (const payload of sessionsFor(oneRow, 40, single)) {
        const drawn = (payload.network?.nodes ?? []).find(
          (node) => node.stageId === 'draws',
        );

        expect(drawn?.[entityAttributesProperty].band).not.toBe(1);
      }
    });

    it('leaves the row nominable when its stage comes round', () => {
      for (const payload of sessionsFor(oneRow, 40, single)) {
        expect(
          (payload.network?.nodes ?? []).map(
            (node) => node[entityPrimaryKeyProperty],
          ),
        ).toContain('row-1');
      }
    });
  });

  describe('the hold itself', () => {
    const handles = () => {
      const protocol = parse([drawsInto('band', 1)]);
      return {
        protocol,
        handles: {
          entityConstraints: createEntityConstraintCache({
            codebook: protocol.codebook,
            today: '2026-08-14',
            interfaceRules: collectInterfaceImpliedRules(protocol),
          }),
          uniqueRegistry: new UniqueRegistry(),
        },
      };
    };

    const scope = { entity: 'node' as const, type: 'person' };
    const rows: NcNode[] = [
      {
        [entityPrimaryKeyProperty]: 'row-0',
        type: 'person',
        [entityAttributesProperty]: { band: 2 },
      },
    ];

    it('gives a stage’s roster hold back once the stage has drawn', () => {
      const { protocol, handles: session } = handles();
      const rosterStage = { ...protocol.stages[0]!, id: 'draws' };
      const assetData: AssetData = { rosterNodes: { draws: rows } };

      reserveRosterValues(session, [rosterStage], assetData);
      expect(
        session.uniqueRegistry.isReserved(scopeKey(scope), 'band', 2),
      ).toBe(true);

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      releaseRosterValues(session, rosterStage as never, assetData);
      expect(
        session.uniqueRegistry.isReserved(scopeKey(scope), 'band', 2),
      ).toBe(false);
    });

    it('reserves nothing for a prompt that fixes nothing', () => {
      const { protocol, handles: session } = handles();

      reservePromptFixedValues(session, protocol.stages);

      for (const { value } of BANDS) {
        expect(
          session.uniqueRegistry.isReserved(scopeKey(scope), 'band', value),
        ).toBe(false);
      }
    });

    it('passes over a row whose value the network already holds', () => {
      const { handles: session } = handles();

      expect(rosterRowIsDrawable(session, scope, { band: 2 })).toBe(true);
      claimFixedValues(session, scope, { band: 2 });
      expect(rosterRowIsDrawable(session, scope, { band: 2 })).toBe(false);
      expect(rosterRowIsDrawable(session, scope, { band: 3 })).toBe(true);
    });
  });
});
