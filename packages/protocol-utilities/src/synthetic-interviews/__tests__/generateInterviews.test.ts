import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  CurrentProtocolSchema,
  SYNTHETIC_START_WINDOW_DAYS,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type SessionPayload,
} from '@codaco/shared-consts';

import { DEFAULT_SYNTHETIC_SEED, MAX_SYNTHETIC_INTERVIEWS } from '../constants';
import {
  generateInterviews,
  type GenerateInterviewsOptions,
  type SyntheticInterviewResult,
} from '../index';
import type { AssetData } from '../simulators/types';

/**
 * The walk itself: what `generateInterviews` does with a protocol, as opposed
 * to what any one simulator does with a stage.
 *
 * Every protocol here is put through the real schema rather than hand-built,
 * because generation READS the `synthetic` descriptors parsing supplies. A
 * fixture that declared its own would prove the walk works on protocols no
 * host can actually produce, and would not notice a schema default going
 * missing.
 *
 * `startWindow` is pinned throughout, so a run is byte-reproducible: without
 * it the batch reads the wall clock once, which is right for a host and wrong
 * for an assertion.
 */

const START_WINDOW = '2026-08-14T12:00:00.000Z';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CLOSENESS = [
  { label: 'Distant', value: 1 },
  { label: 'Neutral', value: 2 },
  { label: 'Close', value: 3 },
];

const CONTEXT = [
  { label: 'Family', value: 'family' },
  { label: 'Work', value: 'work' },
  { label: 'School', value: 'school' },
];

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        closeness: {
          name: 'closeness',
          type: 'ordinal',
          component: 'LikertScale',
          options: CLOSENESS,
        },
        context: {
          name: 'context',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: CONTEXT,
        },
        age: { name: 'age', type: 'number', component: 'Number' },
      },
    },
  },
  // Record keys are unique across entity types, so the ego's own questions
  // cannot reuse the alter variables' keys.
  ego: {
    variables: {
      egoName: { name: 'egoName', type: 'text', component: 'Text' },
      egoAge: {
        name: 'egoAge',
        type: 'number',
        component: 'Number',
        validation: { minValue: 18, maxValue: 90 },
      },
    },
  },
};

const informationStage = {
  id: 'intro',
  type: 'Information',
  label: 'Welcome',
  title: 'Welcome',
  items: [{ id: 'i1', type: 'text', content: 'Thank you for taking part.' }],
};

const egoFormStage = {
  id: 'about-you',
  type: 'EgoForm',
  label: 'About you',
  introductionPanel: {
    title: 'About you',
    text: 'First, a few questions about yourself.',
  },
  form: {
    fields: [
      { variable: 'egoName', prompt: 'What is your name?' },
      { variable: 'egoAge', prompt: 'How old are you?' },
    ],
  },
};

const quickAddStage = (synthetic?: Record<string, unknown>) => ({
  id: 'quick-add',
  type: 'NameGeneratorQuickAdd',
  label: 'Quick add',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  prompts: [{ id: 'qa-1', text: 'Who have you felt close to?' }],
  ...(synthetic ? { synthetic } : {}),
});

const nameGeneratorStage = (synthetic?: Record<string, unknown>) => ({
  id: 'name-generator',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  form: {
    title: 'Add someone',
    fields: [{ variable: 'name', prompt: 'Their name' }],
  },
  prompts: [{ id: 'ng-1', text: 'Who else do you know?' }],
  ...(synthetic ? { synthetic } : {}),
});

const ordinalBinStage = {
  id: 'ordinal-bin',
  type: 'OrdinalBin',
  label: 'Closeness',
  subject: { entity: 'node', type: 'person' },
  prompts: [
    {
      id: 'ob-1',
      text: 'How close are they?',
      variable: 'closeness',
      color: 'ord-color-seq-1',
    },
  ],
};

const categoricalBinStage = {
  id: 'categorical-bin',
  type: 'CategoricalBin',
  label: 'Context',
  subject: { entity: 'node', type: 'person' },
  prompts: [
    { id: 'cb-1', text: 'Where do you know them from?', variable: 'context' },
  ],
};

/** A protocol as a host holds it: parsed, so its synthetic defaults exist. */
const parse = (
  stages: Record<string, unknown>[],
  personVariables?: Record<string, unknown>,
): CurrentProtocol =>
  CurrentProtocolSchema.parse({
    name: 'Walk test protocol',
    description: 'Exercises generateInterviews end to end.',
    schemaVersion: 8,
    codebook: personVariables
      ? {
          ...codebook,
          node: {
            ...codebook.node,
            person: {
              ...codebook.node.person,
              variables: {
                ...codebook.node.person.variables,
                ...personVariables,
              },
            },
          },
        }
      : codebook,
    stages,
  });

/** The same protocol before parsing — what reading straight from storage gives. */
const unparsed = (stages: Record<string, unknown>[]): CurrentProtocol =>
  ({
    name: 'Walk test protocol',
    schemaVersion: 8,
    codebook,
    stages,
  }) as unknown as CurrentProtocol;

const FULL_PROTOCOL = parse([
  informationStage,
  egoFormStage,
  quickAddStage({
    generatesData: true,
    count: { distribution: 'constant', value: 6 },
  }),
  nameGeneratorStage({
    generatesData: true,
    count: { distribution: 'constant', value: 4 },
  }),
  ordinalBinStage,
  categoricalBinStage,
]);

const batch = (
  protocol: CurrentProtocol,
  options: Partial<GenerateInterviewsOptions> = {},
  assetData?: AssetData,
): SyntheticInterviewResult[] =>
  generateInterviews(
    protocol,
    {
      count: 1,
      simulateDropOut: false,
      startWindow: START_WINDOW,
      ...options,
    },
    assetData,
  );

/** The one result a single-member batch produces. */
const run = (
  protocol: CurrentProtocol,
  options: Partial<GenerateInterviewsOptions> = {},
  assetData?: AssetData,
): SyntheticInterviewResult => {
  const [result] = batch(protocol, options, assetData);
  if (!result) throw new Error('generation produced no session');
  return result;
};

const session = (
  protocol: CurrentProtocol,
  options: Partial<GenerateInterviewsOptions> = {},
  assetData?: AssetData,
): SessionPayload => run(protocol, options, assetData).session;

const stageIds = (payload: SessionPayload): Set<string | undefined> =>
  new Set(payload.network?.nodes.map((node) => node.stageId));

describe('generateInterviews', () => {
  describe('what a completed walk produces', () => {
    const completed = run(FULL_PROTOCOL);

    it('returns a session carrying a network', () => {
      expect(completed.session.network?.nodes.length).toBeGreaterThan(0);
      expect(completed.session.network?.edges).toEqual([]);
      expect(completed.session.network?.ego).toBeDefined();
    });

    it('reports the walk reached the end', () => {
      expect(completed.droppedOut).toBe(false);
      expect(completed.currentStep).toBe(FULL_PROTOCOL.stages.length);
    });

    it('gives the session an id of its own', () => {
      expect(completed.session.id).toEqual(expect.any(String));
      expect(completed.session.id).not.toBe(
        completed.session.network?.ego[entityPrimaryKeyProperty],
      );
    });

    it('starts the session inside the window the caller pinned', () => {
      const startTime = Date.parse(completed.session.startTime);

      expect(Number.isNaN(startTime)).toBe(false);
      expect(startTime).toBeLessThanOrEqual(Date.parse(START_WINDOW));
      expect(Date.parse(START_WINDOW) - startTime).toBeLessThan(
        SYNTHETIC_START_WINDOW_DAYS * MS_PER_DAY,
      );
    });

    it('stamps a finish time after the last thing the participant did', () => {
      expect(completed.session.finishTime).toEqual(expect.any(String));
      expect(Date.parse(completed.session.finishTime!)).toBeGreaterThan(
        Date.parse(completed.session.lastUpdated),
      );
      expect(Date.parse(completed.session.lastUpdated)).toBeGreaterThan(
        Date.parse(completed.session.startTime),
      );
      expect(completed.session.exportTime).toBeNull();
    });

    it('runs every stage that elicits people', () => {
      expect(stageIds(completed.session)).toEqual(
        new Set(['quick-add', 'name-generator']),
      );
    });

    it('runs the stages that ask about the participant themselves', () => {
      const ego = completed.session.network?.ego[entityAttributesProperty];

      expect(typeof ego?.egoName).toBe('string');
      expect(typeof ego?.egoAge).toBe('number');
    });

    it('runs the stages that only annotate the people already named', () => {
      for (const node of completed.session.network?.nodes ?? []) {
        expect([1, 2, 3]).toContain(node[entityAttributesProperty].closeness);
        expect(node[entityAttributesProperty].context).toBeDefined();
      }
    });

    it('leaves stageMetadata off a session where nothing wrote any', () => {
      // Absent rather than empty, matching what the interview itself persists.
      expect(completed.session.stageMetadata).toBeUndefined();
    });

    it('takes no notice of a stage that generates nothing', () => {
      const withoutInformation = session(
        parse([
          quickAddStage({
            generatesData: true,
            count: { distribution: 'constant', value: 6 },
          }),
        ]),
      );

      expect(withoutInformation.network?.nodes).toHaveLength(
        session(
          parse([
            informationStage,
            quickAddStage({
              generatesData: true,
              count: { distribution: 'constant', value: 6 },
            }),
          ]),
        ).network?.nodes.length,
      );
    });
  });

  describe('seeding', () => {
    it('produces the same session from the same seed', () => {
      expect(run(FULL_PROTOCOL, { seed: 99 })).toStrictEqual(
        run(FULL_PROTOCOL, { seed: 99 }),
      );
    });

    it('produces a different session from a different seed', () => {
      expect(run(FULL_PROTOCOL, { seed: 1 })).not.toStrictEqual(
        run(FULL_PROTOCOL, { seed: 2 }),
      );
    });

    it('seeds from the default when the caller names none', () => {
      expect(run(FULL_PROTOCOL)).toStrictEqual(
        run(FULL_PROTOCOL, { seed: DEFAULT_SYNTHETIC_SEED }),
      );
    });

    it('seeds the ids and the clock, not just the answers', () => {
      const first = session(FULL_PROTOCOL, { seed: 21 });
      const second = session(FULL_PROTOCOL, { seed: 21 });

      expect(second.id).toBe(first.id);
      expect(second.startTime).toBe(first.startTime);
      expect(second.finishTime).toBe(first.finishTime);
      expect(
        second.network?.nodes.map((node) => node[entityPrimaryKeyProperty]),
      ).toEqual(
        first.network?.nodes.map((node) => node[entityPrimaryKeyProperty]),
      );
    });

    it('seeds the dropout rolls too', () => {
      // Dropout draws from the session's own substream, so a seed fixes where
      // the participant left as firmly as it fixes what they said.
      expect(
        run(FULL_PROTOCOL, {
          seed: 5,
          simulateDropOut: true,
          minimumCompletedRatio: 0,
        }),
      ).toStrictEqual(
        run(FULL_PROTOCOL, {
          seed: 5,
          simulateDropOut: true,
          minimumCompletedRatio: 0,
        }),
      );
    });
  });

  describe('dropout', () => {
    // Long and demanding: burden accumulates quadratically, so a protocol this
    // size makes leaving early the common case rather than a rare one.
    const longProtocol = parse([
      quickAddStage({
        generatesData: true,
        count: { distribution: 'constant', value: 2 },
      }),
      ...Array.from({ length: 40 }, (_, index) => ({
        ...ordinalBinStage,
        id: `bin-${index}`,
        prompts: [
          {
            id: `bin-${index}-p1`,
            text: 'How close are they?',
            variable: 'closeness',
            color: 'ord-color-seq-1',
          },
        ],
      })),
      nameGeneratorStage({
        generatesData: true,
        count: { distribution: 'constant', value: 3 },
      }),
    ]);

    const walks = (simulateDropOut: boolean): SyntheticInterviewResult[] =>
      Array.from({ length: 40 }, (_, seed) =>
        run(longProtocol, {
          seed,
          simulateDropOut,
          minimumCompletedRatio: 0,
        }),
      );

    /** How often the final stage was reached across the runs. */
    const reachedTheEnd = (simulateDropOut: boolean): number =>
      walks(simulateDropOut).filter((result) =>
        stageIds(result.session).has('name-generator'),
      ).length;

    it('never ends the walk early when it is switched off', () => {
      expect(reachedTheEnd(false)).toBe(40);
    });

    it('ends some walks early when it is switched on', () => {
      expect(reachedTheEnd(true)).toBeLessThan(40);
    });

    it('reports a drop-out and where the participant would have resumed', () => {
      const dropped = walks(true).find((result) => result.droppedOut);

      expect(dropped).toBeDefined();
      expect(dropped!.currentStep).toBeLessThan(longProtocol.stages.length);
      expect(dropped!.session.finishTime).toBeNull();
    });

    it('keeps everything the participant produced before leaving', () => {
      const dropped = walks(true).find(
        (result) => !stageIds(result.session).has('name-generator'),
      );

      expect(dropped?.session.network?.nodes.length).toBeGreaterThan(0);
    });

    it('tops the batch up to the completed floor', () => {
      // A deficit session re-runs on its OWN substreams with dropout disabled
      // — the same participant, finishing — so the floor stays deterministic
      // and the members who already completed are untouched.
      const floorless = batch(longProtocol, {
        count: 10,
        seed: 3,
        simulateDropOut: true,
        minimumCompletedRatio: 0,
      });
      const everyone = batch(longProtocol, {
        count: 10,
        seed: 3,
        simulateDropOut: true,
        minimumCompletedRatio: 1,
      });

      // The floor has work to do, so this is not a vacuous comparison.
      expect(floorless.some((result) => result.droppedOut)).toBe(true);
      expect(everyone.filter((result) => result.droppedOut)).toEqual([]);

      for (const [index, result] of floorless.entries()) {
        if (result.droppedOut) continue;
        expect(everyone[index]).toStrictEqual(result);
      }

      expect(
        batch(longProtocol, {
          count: 10,
          seed: 3,
          simulateDropOut: true,
          minimumCompletedRatio: 1,
        }),
      ).toStrictEqual(everyone);
    });
  });

  describe('batches', () => {
    it('returns one session per requested interview', () => {
      expect(batch(FULL_PROTOCOL, { count: 5 })).toHaveLength(5);
    });

    it('gives each member their own answers', () => {
      // A batch is a set of participants, not one participant reported five
      // times: nothing but the protocol and the roster is shared between them.
      const members = batch(FULL_PROTOCOL, { count: 5 });
      const egos = members.map((result) =>
        JSON.stringify(result.session.network?.ego[entityAttributesProperty]),
      );

      expect(new Set(egos).size).toBe(5);
    });

    it('reproduces the whole batch from one seed', () => {
      expect(batch(FULL_PROTOCOL, { count: 4, seed: 7 })).toStrictEqual(
        batch(FULL_PROTOCOL, { count: 4, seed: 7 }),
      );
    });

    it('produces a different batch from a different seed', () => {
      expect(batch(FULL_PROTOCOL, { count: 4, seed: 7 })).not.toStrictEqual(
        batch(FULL_PROTOCOL, { count: 4, seed: 8 }),
      );
    });

    it('leaves a single interview exactly as it was before batching', () => {
      // Each session's substreams come from the seed and its own position, so
      // a host asking for one interview is unaffected by the batch machinery
      // around it — and appending members never moves the ones before them.
      expect(batch(FULL_PROTOCOL, { count: 1, seed: 12 })[0]).toStrictEqual(
        batch(FULL_PROTOCOL, { count: 3, seed: 12 })[0],
      );
    });

    it('reports progress as each member lands', () => {
      const seen: [number, number][] = [];
      generateInterviews(
        FULL_PROTOCOL,
        {
          count: 3,
          simulateDropOut: false,
          startWindow: START_WINDOW,
        },
        {},
        (done, total) => seen.push([done, total]),
      );

      expect(seen).toEqual([
        [1, 3],
        [2, 3],
        [3, 3],
      ]);
    });
  });

  describe('stopping part-way', () => {
    it('leaves the stages after the stop unvisited', () => {
      const stopped = run(FULL_PROTOCOL, {
        simulateDropOut: false,
        stopAt: { stageIndex: 3 },
      });

      expect(stopped.currentStep).toBe(3);
      expect(stopped.session.finishTime).toBeNull();
      expect(stageIds(stopped.session)).toEqual(new Set(['quick-add']));
    });

    it('reproduces the prefix a full walk produced', () => {
      // A preview of stage 3 is the same interview the full walk would have
      // produced, stopped early — not a different one.
      const stopped = run(FULL_PROTOCOL, {
        simulateDropOut: false,
        stopAt: { stageIndex: 3 },
      });
      const full = run(FULL_PROTOCOL, { simulateDropOut: false });

      expect(
        stopped.session.network?.nodes.map(
          (node) => node[entityPrimaryKeyProperty],
        ),
      ).toEqual(
        full.session.network?.nodes
          .filter((node) => node.stageId === 'quick-add')
          .map((node) => node[entityPrimaryKeyProperty]),
      );
    });

    it('applies only the prompts below a prompt bound', () => {
      const arrived = run(FULL_PROTOCOL, {
        simulateDropOut: false,
        stopAt: { stageIndex: 2, promptIndex: 0 },
      });

      expect(arrived.session.network?.nodes).toEqual([]);
    });

    it('refuses to stop a walk that also rolls the dropout die', () => {
      expect(() =>
        run(FULL_PROTOCOL, {
          simulateDropOut: true,
          stopAt: { stageIndex: 2 },
        }),
      ).toThrow(/mutually exclusive/);
    });
  });

  describe('skip logic', () => {
    /** A protocol whose second stage is skipped once anyone has been named. */
    const withSkip = (skipLogic: Record<string, unknown>) =>
      parse([
        quickAddStage({
          generatesData: true,
          count: { distribution: 'constant', value: 3 },
        }),
        { ...ordinalBinStage, skipLogic },
        categoricalBinStage,
      ]);

    const anyoneNamed = {
      action: 'SKIP',
      filter: {
        rules: [
          {
            id: 'rule-1',
            type: 'node',
            options: { type: 'person', operator: 'EXISTS' },
          },
        ],
      },
    };

    it('walks a skipped stage when the option is off', () => {
      // Navigation is linear, so the stage runs whatever its rules say.
      const payload = session(withSkip(anyoneNamed), {
        respectSkipLogic: false,
      });

      for (const node of payload.network?.nodes ?? []) {
        expect(node[entityAttributesProperty].closeness).toBeDefined();
      }
    });

    it('leaves a skipped stage unvisited by default', () => {
      const payload = session(withSkip(anyoneNamed));

      expect(payload.network?.nodes.length).toBeGreaterThan(0);
      for (const node of payload.network?.nodes ?? []) {
        expect(node[entityAttributesProperty].closeness).toBeUndefined();
      }
    });

    it('keeps walking the stages after the one it skipped', () => {
      const payload = session(withSkip(anyoneNamed));

      for (const node of payload.network?.nodes ?? []) {
        expect(node[entityAttributesProperty].context).toBeDefined();
      }
    });

    it('resolves each rule against the network as it then stood', () => {
      // SHOW hides the stage while its filter does NOT match, so this bin is
      // hidden at the outset — nobody has been named — and revealed once the
      // quick-add names someone. A route resolved ONCE against the starting
      // network would bypass it for the whole interview; the interview
      // re-derives the route at every step, so this must too.
      const revealed = parse([
        quickAddStage({
          generatesData: true,
          count: { distribution: 'constant', value: 3 },
        }),
        { ...ordinalBinStage, skipLogic: { ...anyoneNamed, action: 'SHOW' } },
      ]);

      const payload = session(revealed);

      expect(payload.network?.nodes.length).toBeGreaterThan(0);
      for (const node of payload.network?.nodes ?? []) {
        expect(node[entityAttributesProperty].closeness).toBeDefined();
      }
    });

    it('ends the interview at a finish destination', () => {
      const payload = session(
        withSkip({ ...anyoneNamed, destination: { type: 'finish' } }),
      );

      // Everything after the jump is bypassed, so the last stage never runs.
      for (const node of payload.network?.nodes ?? []) {
        expect(node[entityAttributesProperty].context).toBeUndefined();
      }
    });

    it('bypasses the stages between a jump and its destination', () => {
      const jumpToLast = parse([
        quickAddStage({
          generatesData: true,
          count: { distribution: 'constant', value: 3 },
        }),
        {
          ...ordinalBinStage,
          skipLogic: {
            ...anyoneNamed,
            destination: { type: 'stage', stageId: 'categorical-bin' },
          },
        },
        categoricalBinStage,
      ]);

      const payload = session(jumpToLast);

      for (const node of payload.network?.nodes ?? []) {
        expect(node[entityAttributesProperty].closeness).toBeUndefined();
        expect(node[entityAttributesProperty].context).toBeDefined();
      }
    });
  });

  describe('rules the interfaces imply', () => {
    /**
     * The seam between the two packages: protocol-validation derives a
     * variable's effective window from the stages that write it, and
     * generation has to actually hand that window to the draw. Both halves are
     * tested in their own package; only an end-to-end walk pins the join.
     */

    it('holds a FORM to the bin rule when a bin also writes the variable', () => {
      // The bin sits FIRST, so it runs against an empty network and writes
      // nothing — the selections asserted below are the form's own. A bin
      // drop places an alter in exactly one bin, so the variable's effective
      // maxSelected is 1 wherever else it is collected; a form drawing two
      // would be describing an answer the bin then silently truncates.
      const payload = session(
        parse([
          categoricalBinStage,
          {
            ...nameGeneratorStage({
              generatesData: true,
              count: { distribution: 'constant', value: 8 },
            }),
            form: {
              title: 'About them',
              fields: [
                { variable: 'name', prompt: 'Their name' },
                { variable: 'context', prompt: 'Where from?' },
              ],
            },
          },
        ]),
      );

      const selections = (payload.network?.nodes ?? []).map(
        (node) => node[entityAttributesProperty].context,
      );

      expect(selections.length).toBeGreaterThan(0);
      for (const selection of selections) {
        expect(Array.isArray(selection)).toBe(true);
        expect(selection).toHaveLength(1);
      }
    });

    it('never leaves a quick-add name unanswered', () => {
      // The interface will not create a node from an empty field, so the
      // variable it collects is answered whenever the stage produces anybody.
      // An authored `missingProbability` describes a node no participant could
      // have made, and the effective rule zeroes it.
      const payload = session(
        parse(
          [
            quickAddStage({
              generatesData: true,
              count: { distribution: 'constant', value: 20 },
            }),
          ],
          {
            name: {
              name: 'name',
              type: 'text',
              component: 'Text',
              synthetic: { missingProbability: 0.9 },
            },
          },
        ),
      );

      const named = (payload.network?.nodes ?? []).filter(
        (node) => typeof node[entityAttributesProperty].name === 'string',
      );

      expect(named).toHaveLength(payload.network?.nodes.length ?? 0);
      expect(named.length).toBeGreaterThan(0);
    });
  });

  describe('a protocol that was never parsed', () => {
    it('refuses it rather than failing inside a simulator', () => {
      expect(() => run(unparsed([quickAddStage()]))).toThrow(
        /stage "quick-add" declares no synthetic parameters/,
      );
    });

    it('says where the missing parameters should have come from', () => {
      expect(() => run(unparsed([quickAddStage()]))).toThrow(
        /through the schema/,
      );
    });

    it('refuses it before generating anything at all', () => {
      // The check runs over every stage up front, so a protocol whose FIRST
      // stage is fine is still turned away rather than half-generated.
      expect(() =>
        run(
          unparsed([
            quickAddStage({
              generatesData: true,
              count: { distribution: 'constant', value: 3 },
            }),
            ordinalBinStage,
          ]),
        ),
      ).toThrow(/stage "ordinal-bin"/);
    });
  });

  describe('a stage type nothing simulates yet', () => {
    it('fails loudly rather than walking past it', () => {
      // A stage the walk cannot express must not fall through as a silent
      // no-op: that would be a second model of stage behaviour, quietly
      // producing a session missing everything the stage would have written.
      const withAlterForm = parse([
        quickAddStage({
          generatesData: true,
          count: { distribution: 'constant', value: 2 },
        }),
        {
          id: 'about-them',
          type: 'AlterForm',
          label: 'About each person',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: 'About them', text: 'A few questions.' },
          form: { fields: [{ variable: 'age', prompt: 'Their age' }] },
        },
      ]);

      expect(() => run(withAlterForm)).toThrow(
        /no simulator for stage type "AlterForm"/,
      );
    });
  });

  describe('options', () => {
    it('rejects a count below one', () => {
      expect(() => run(FULL_PROTOCOL, { count: 0 })).toThrow();
    });

    it('rejects a count past the ceiling', () => {
      expect(() =>
        run(FULL_PROTOCOL, { count: MAX_SYNTHETIC_INTERVIEWS + 1 }),
      ).toThrow();
    });

    it('accepts a caller who names only a count', () => {
      // Every other option is defaulted by the schema the function parses its
      // own arguments with, so a host restating them would be restating the
      // package's own decisions.
      expect(() =>
        generateInterviews(FULL_PROTOCOL, { count: 1 }),
      ).not.toThrow();
    });

    it('simulates dropout unless told otherwise', () => {
      // The default matters: a host asking for a batch of interviews without
      // saying anything should get a realistic one.
      expect(
        generateInterviews(FULL_PROTOCOL, {
          count: 1,
          seed: 3,
          startWindow: START_WINDOW,
        }),
      ).toStrictEqual(
        generateInterviews(FULL_PROTOCOL, {
          count: 1,
          seed: 3,
          simulateDropOut: true,
          startWindow: START_WINDOW,
        }),
      );
    });

    it('respects skip logic unless told otherwise', () => {
      const skipped = parse([
        quickAddStage({
          generatesData: true,
          count: { distribution: 'constant', value: 3 },
        }),
        {
          ...ordinalBinStage,
          skipLogic: {
            action: 'SKIP',
            filter: {
              rules: [
                {
                  id: 'rule-1',
                  type: 'node',
                  options: { type: 'person', operator: 'EXISTS' },
                },
              ],
            },
          },
        },
      ]);

      expect(session(skipped)).toStrictEqual(
        session(skipped, { respectSkipLogic: true }),
      );
      expect(session(skipped)).not.toStrictEqual(
        session(skipped, { respectSkipLogic: false }),
      );
    });

    it('captures a trace only when asked', () => {
      expect(run(FULL_PROTOCOL).trace).toBeUndefined();
      expect(
        run(FULL_PROTOCOL, { captureTrace: true }).trace?.length,
      ).toBeGreaterThan(0);
    });
  });

  describe('roster data the host supplies', () => {
    const withRoster = parse([
      {
        ...quickAddStage({
          generatesData: true,
          count: { distribution: 'constant', value: 8 },
        }),
        panels: [
          {
            id: 'panel-1',
            title: 'People you know',
            dataSource: 'roster-asset',
          },
        ],
      },
    ]);

    const roster = (): NcNode[] =>
      Array.from({ length: 20 }, (_, index) => ({
        [entityPrimaryKeyProperty]: `roster-${index}`,
        type: 'person',
        [entityAttributesProperty]: { name: `Roster ${index}` },
      }));

    it('takes people from a roster the host has loaded', () => {
      const payload = session(
        withRoster,
        {},
        { rosterNodes: { 'quick-add': roster() } },
      );

      const taken = (payload.network?.nodes ?? []).filter((node) =>
        node[entityPrimaryKeyProperty].startsWith('roster-'),
      );
      expect(taken.length).toBeGreaterThan(0);
    });

    it('generates without them when the host has loaded none', () => {
      // The manifest records that an asset exists, not what is in it. A host
      // that has not loaded its assets gets an interview without roster
      // nominations rather than an error.
      const payload = session(withRoster);

      expect(payload.network?.nodes.length).toBeGreaterThan(0);
      expect(
        (payload.network?.nodes ?? []).filter((node) =>
          node[entityPrimaryKeyProperty].startsWith('roster-'),
        ),
      ).toHaveLength(0);
    });

    it('leaves the caller’s roster rows untouched', () => {
      // Roster rows are taken INTO the network, where the stage stamps them
      // with its own id and prompt. Writing that onto the row the host handed
      // over would corrupt the next interview generated from the same batch.
      const rows = roster();
      const before = structuredClone(rows);

      batch(withRoster, { count: 3 }, { rosterNodes: { 'quick-add': rows } });

      expect(rows).toStrictEqual(before);
    });

    it('gives every batch member the whole roster to draw from', () => {
      const rows = roster();
      const members = batch(
        withRoster,
        { count: 3 },
        { rosterNodes: { 'quick-add': rows } },
      );

      // Each session draws from the full roster: nothing carried over.
      for (const member of members) {
        expect(member.session.network?.nodes).toHaveLength(8);
      }
    });
  });
});

describe('byte-level reproducibility (C9)', () => {
  it('serialises two same-seed batches to identical bytes', () => {
    // toStrictEqual tolerates differing key insertion order; a session
    // destined for storage and export must not even differ there.
    const first = JSON.stringify(batch(FULL_PROTOCOL, { count: 3, seed: 21 }));
    const second = JSON.stringify(batch(FULL_PROTOCOL, { count: 3, seed: 21 }));
    expect(second).toBe(first);
  });

  it('extends a batch without disturbing the members before the new one', () => {
    const three = batch(FULL_PROTOCOL, { count: 3, seed: 21 });
    const four = batch(FULL_PROTOCOL, { count: 4, seed: 21 });
    expect(four.slice(0, 3)).toStrictEqual(three);
  });
});

describe('a stopped walk is a prefix of the full one (C5)', () => {
  it('stops exactly on the full walk’s trace prefix', () => {
    // Not merely "the same node ids": every action the stopped walk emitted,
    // in order, must be exactly what the full walk emitted before that point.
    // Node ids alone would still pass if value draws desynchronised, because
    // ids come from their own substream.
    const full = run(FULL_PROTOCOL, { captureTrace: true });
    const stopped = run(FULL_PROTOCOL, {
      captureTrace: true,
      stopAt: { stageIndex: 3 },
    });

    const fullTrace = full.trace ?? [];
    const stoppedTrace = stopped.trace ?? [];
    expect(stoppedTrace.length).toBeGreaterThan(0);
    expect(stoppedTrace.length).toBeLessThan(fullTrace.length);
    expect(fullTrace.slice(0, stoppedTrace.length)).toStrictEqual(stoppedTrace);
  });

  it('holds under a prompt bound too', () => {
    const full = run(FULL_PROTOCOL, { captureTrace: true });
    const stopped = run(FULL_PROTOCOL, {
      captureTrace: true,
      stopAt: { stageIndex: 2, promptIndex: 1 },
    });

    const fullTrace = full.trace ?? [];
    const stoppedTrace = stopped.trace ?? [];
    expect(fullTrace.slice(0, stoppedTrace.length)).toStrictEqual(stoppedTrace);
  });

  it('attributes every stopped write to a visited stage', () => {
    const stopped = run(FULL_PROTOCOL, {
      captureTrace: true,
      stopAt: { stageIndex: 3, promptIndex: 1 },
    });
    const visited = new Set(stopped.visitedStages);

    expect(stopped.trace?.length ?? 0).toBeGreaterThan(0);
    for (const action of stopped.trace ?? []) {
      if ('currentStep' in action.payload) {
        expect(visited.has(action.payload.currentStep)).toBe(true);
      }
    }
  });
});
