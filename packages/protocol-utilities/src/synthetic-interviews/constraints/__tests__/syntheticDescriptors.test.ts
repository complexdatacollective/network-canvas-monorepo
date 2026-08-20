import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Variables,
} from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import { buildEntityConstraints } from '../buildConstraints';
import type { GenerationContext } from '../context';
import {
  type EntityScopeRef,
  generateEntityAttributes,
} from '../generateEntityAttributes';
import { UniqueRegistry } from '../uniqueRegistry';
import { SyntheticDescriptorConflict, ValueGenerator } from '../ValueGenerator';

/**
 * The engine reading a variable's `synthetic` descriptor.
 *
 * Separate from `generateEntityAttributes.test.ts`, which covers what
 * `validation` alone produces. The claim under test here is the one the two
 * halves make together: the descriptor chooses among the values the RULES
 * allow, never outside them, and never in place of a rule.
 */

const TODAY = '2026-08-14';
const PERSON: EntityScopeRef = { entity: 'node', type: 'person' };

const makeContext = (seed = 1): GenerationContext => ({
  codebook: {},
  valueGen: new ValueGenerator(seed, TODAY),
  uniqueRegistry: new UniqueRegistry(),
});

/**
 * `draws` entities generated against one codebook, sharing one generator — as
 * a run of alters on one stage does, so a sequence-walking variable advances
 * across them the way it would in an interview.
 */
const drawMany = (
  variables: Record<string, unknown>,
  draws: number,
  options?: { seed?: number; only?: Set<string> },
): Record<string, VariableValue>[] => {
  const entity = buildEntityConstraints(variables as Variables, TODAY);
  const ctx = makeContext(options?.seed ?? 7);

  return Array.from({ length: draws }, (_, index) =>
    generateEntityAttributes(
      entity,
      ctx,
      PERSON,
      index,
      options?.only ? { only: options.only } : {},
    ),
  );
};

/** How often `predicate` held, as a share of the draws. */
const shareOf = <T>(values: readonly T[], predicate: (value: T) => boolean) =>
  values.filter(predicate).length / values.length;

const OPTIONS = [
  { label: 'One', value: 1 },
  { label: 'Two', value: 2 },
  { label: 'Three', value: 3 },
];

describe('synthetic descriptors in the constraint engine', () => {
  describe('probabilityTrue', () => {
    it('answers true at the declared rate', () => {
      const draws = drawMany(
        {
          close: {
            name: 'close',
            type: 'boolean',
            synthetic: { probabilityTrue: 0.8 },
          },
        },
        2000,
      );

      expect(shareOf(draws, (draw) => draw.close === true)).toBeCloseTo(0.8, 1);
    });

    it('answers either way when the variable declares nothing', () => {
      const draws = drawMany(
        { close: { name: 'close', type: 'boolean' } },
        2000,
      );

      expect(shareOf(draws, (draw) => draw.close === true)).toBeCloseTo(0.5, 1);
    });

    it('answers with the only value a one-sided option list offers', () => {
      // The variable offers "Yes" and nothing else, so a participant who did
      // not mean yes had no way to say so. The schema refuses a probability
      // such a list cannot express; whatever reaches generation is answerable.
      const draws = drawMany(
        {
          consented: {
            name: 'consented',
            type: 'boolean',
            component: 'Boolean',
            options: [{ label: 'Yes', value: true }],
            synthetic: { probabilityTrue: 0.1 },
          },
        },
        50,
      );

      expect(new Set(draws.map((draw) => draw.consented))).toEqual(
        new Set([true]),
      );
    });
  });

  describe('selectionCount', () => {
    const hobbies = (
      synthetic: Record<string, unknown>,
      validation?: Record<string, unknown>,
    ) => ({
      hobbies: {
        name: 'hobbies',
        type: 'categorical',
        options: [
          { label: 'Reading', value: 'reading' },
          { label: 'Running', value: 'running' },
          { label: 'Cooking', value: 'cooking' },
          { label: 'Climbing', value: 'climbing' },
        ],
        ...(validation ? { validation } : {}),
        synthetic,
      },
    });

    const sizesOf = (draws: Record<string, VariableValue>[]) =>
      draws.map((draw) => (draw.hobbies as unknown[]).length);

    it('selects only the sizes the table offers', () => {
      const draws = drawMany(
        hobbies(
          {
            selectionCount: {
              probabilities: [
                { count: 1, probability: 0.5 },
                { count: 3, probability: 0.5 },
              ],
            },
          },
          { maxSelected: 4 },
        ),
        500,
      );

      expect(new Set(sizesOf(draws))).toEqual(new Set([1, 3]));
    });

    it('selects each size at its declared probability', () => {
      const draws = drawMany(
        hobbies(
          {
            selectionCount: {
              probabilities: [
                { count: 1, probability: 0.75 },
                { count: 2, probability: 0.25 },
              ],
            },
          },
          { maxSelected: 4 },
        ),
        2000,
      );

      expect(shareOf(sizesOf(draws), (size) => size === 1)).toBeCloseTo(
        0.75,
        1,
      );
    });

    // A count the rules forbid never reaches generation: the schema holds
    // every entry in the table against `minSelected`, `maxSelected`, the
    // distinct option values and the weights, and refuses the protocol
    // outright (`rejectIllegalSelectionCounts`, covered in
    // protocol-validation's synthetic.test.ts). So a table that arrives here
    // is a table to draw, not one to second-guess — the engine narrowing it
    // further could only overrule what the author was allowed to say.

    it('draws a size the engine would otherwise cap', () => {
      // Nothing in this variable's rules limits the selection, so all four
      // options are askable. The generation-side default of two is not a
      // ceiling the author agreed to.
      const draws = drawMany(
        hobbies({
          selectionCount: { probabilities: [{ count: 4, probability: 1 }] },
        }),
        200,
      );

      expect(new Set(sizesOf(draws))).toEqual(new Set([4]));
    });

    it('selects nothing where the table says nothing is selected', () => {
      // A count of 0 is what the schema admits on a variable that is not
      // `required`, and what the interview itself produces: an untouched
      // checkbox group hands back an empty array (see fresco-ui's
      // `minSelected`, which short-circuits on one).
      const draws = drawMany(
        hobbies({
          selectionCount: { probabilities: [{ count: 0, probability: 1 }] },
        }),
        50,
      );

      expect(new Set(sizesOf(draws))).toEqual(new Set([0]));
    });

    it('still infers a size where the descriptor declares no table', () => {
      // Nothing declared is nothing to honour, so the rules alone decide.
      const draws = drawMany(
        hobbies({ missingProbability: 0 }, { minSelected: 2, maxSelected: 3 }),
        200,
      );

      expect(Math.min(...sizesOf(draws))).toBeGreaterThanOrEqual(2);
      expect(Math.max(...sizesOf(draws))).toBeLessThanOrEqual(3);
    });
  });

  /**
   * The value distributions a variable may declare.
   *
   * These assert that a declaration TAKES EFFECT, which is the claim the rest
   * of this file makes for the descriptors that were wired first. Rules that
   * only reject a bad declaration live in protocol-validation's
   * synthetic.test.ts; between the two, neither half can quietly stop reading
   * what the other accepts.
   */
  describe('declared value distributions', () => {
    const numbersFrom = (
      synthetic: Record<string, unknown>,
      validation?: Record<string, unknown>,
      draws = 2000,
    ): number[] =>
      drawMany(
        {
          age: {
            name: 'age',
            type: 'number',
            ...(validation ? { validation } : {}),
            synthetic,
          },
        },
        draws,
      ).map((draw) => Number(draw.age));

    const mean = (values: number[]) =>
      values.reduce((total, value) => total + value, 0) / values.length;

    const standardDeviation = (values: number[]) => {
      const centre = mean(values);
      return Math.sqrt(
        values.reduce((total, value) => total + (value - centre) ** 2, 0) /
          values.length,
      );
    };

    const median = (values: number[]) =>
      [...values].toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

    describe('number', () => {
      it('returns the declared constant', () => {
        expect(
          new Set(
            numbersFrom({ distribution: 'constant', value: 42 }, undefined, 20),
          ),
        ).toEqual(new Set([42]));
      });

      it('returns a constant outside the range an undeclared number draws in', () => {
        // The 18-80 span is the plausible window generation invents for a
        // variable that declares nothing. A declared value replaces it rather
        // than being capped by it.
        expect(
          new Set(
            numbersFrom(
              { distribution: 'constant', value: 250 },
              undefined,
              20,
            ),
          ),
        ).toEqual(new Set([250]));
      });

      it('draws uniformly across the declared range', () => {
        const values = numbersFrom({
          distribution: 'uniform',
          min: 100,
          max: 200,
        });

        expect(Math.min(...values)).toBeGreaterThanOrEqual(100);
        expect(Math.max(...values)).toBeLessThanOrEqual(200);
        expect(mean(values)).toBeGreaterThan(140);
        expect(mean(values)).toBeLessThan(160);
      });

      it('centres a normal on its declared mean and spread', () => {
        const values = numbersFrom({
          distribution: 'normal',
          mean: 40,
          sd: 5,
        });

        expect(Math.abs(mean(values) - 40)).toBeLessThan(1);
        expect(Math.abs(standardDeviation(values) - 5)).toBeLessThan(1);
      });

      it('skews a lognormal right of its median', () => {
        // The defining property: a lognormal's long right tail pulls its mean
        // above its median, which is how it differs from the normal that
        // shares its parameters.
        const values = numbersFrom({
          distribution: 'lognormal',
          mean: 40,
          sd: 20,
        });

        expect(Math.abs(mean(values) - 40)).toBeLessThan(3);
        expect(median(values)).toBeLessThan(mean(values));
        expect(Math.min(...values)).toBeGreaterThan(0);
      });

      it('truncates a declared distribution into the validation window', () => {
        // Validation stays authoritative — the schema says so, and refuses a
        // descriptor that could never reach the window at all.
        const values = numbersFrom(
          { distribution: 'normal', mean: 40, sd: 20 },
          { minValue: 30, maxValue: 50 },
        );

        expect(Math.min(...values)).toBeGreaterThanOrEqual(30);
        expect(Math.max(...values)).toBeLessThanOrEqual(50);
      });

      it('collapses a zero-deviation normal onto its mean', () => {
        expect(
          new Set(
            numbersFrom(
              { distribution: 'normal', mean: 33, sd: 0 },
              undefined,
              20,
            ),
          ),
        ).toEqual(new Set([33]));
      });
    });

    describe('scalar', () => {
      const scalarsFrom = (
        synthetic: Record<string, unknown>,
        draws = 2000,
      ): number[] =>
        drawMany(
          { ease: { name: 'ease', type: 'scalar', synthetic } },
          draws,
        ).map((draw) => Number(draw.ease));

      it('returns the declared constant', () => {
        expect(
          new Set(scalarsFrom({ distribution: 'constant', value: 0.25 }, 20)),
        ).toEqual(new Set([0.25]));
      });

      it('centres a normal on its declared mean', () => {
        const values = scalarsFrom({
          distribution: 'normal',
          mean: 0.7,
          sd: 0.1,
        });

        expect(Math.abs(mean(values) - 0.7)).toBeLessThan(0.05);
      });

      it('centres a beta on its declared mean, inside the 0-1 scale', () => {
        const values = scalarsFrom({
          distribution: 'beta',
          mean: 0.3,
          sd: 0.15,
        });

        expect(Math.abs(mean(values) - 0.3)).toBeLessThan(0.05);
        expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...values)).toBeLessThanOrEqual(1);
      });

      it('draws a uniform across its declared range', () => {
        const values = scalarsFrom({
          distribution: 'uniform',
          min: 0.4,
          max: 0.6,
        });

        expect(Math.min(...values)).toBeGreaterThanOrEqual(0.4);
        expect(Math.max(...values)).toBeLessThanOrEqual(0.6);
      });
    });

    describe('datetime', () => {
      const datesFrom = (
        synthetic: Record<string, unknown>,
        draws = 500,
      ): string[] =>
        drawMany(
          { met: { name: 'met', type: 'datetime', synthetic } },
          draws,
        ).map((draw) => String(draw.met));

      it('draws inside the declared range', () => {
        const values = datesFrom({
          distribution: 'uniform',
          min: '1990-01-01',
          max: '1995-12-31',
        });

        // Well outside the decade-back span an undeclared date falls into, so
        // this also proves that default does not clip a declared range.
        expect(values.every((value) => value >= '1990-01-01')).toBe(true);
        expect(values.every((value) => value <= '1995-12-31')).toBe(true);
      });

      it('centres a normal near its declared mean date', () => {
        const values = datesFrom({
          distribution: 'normal',
          mean: '2000-06-15',
          sdDays: 30,
          min: '1999-01-01',
          max: '2001-12-31',
        });

        const within = values.filter(
          (value) => value >= '2000-04-01' && value <= '2000-09-01',
        );
        expect(within.length / values.length).toBeGreaterThan(0.8);
      });
    });

    describe('text', () => {
      const textFrom = (
        name: string,
        synthetic?: Record<string, unknown>,
        draws = 40,
      ): string[] =>
        drawMany(
          {
            field: {
              name,
              type: 'text',
              ...(synthetic ? { synthetic } : {}),
            },
          },
          draws,
        ).map((draw) => String(draw.field));

      it('draws what the declared generator produces', () => {
        expect(
          textFrom('role', { generator: 'email' }).every((value) =>
            value.includes('@'),
          ),
        ).toBe(true);
      });

      it('lets a declaration overrule the name-shaped inference', () => {
        // The whole reason `neutralWords` is authorable: a variable called
        // `name` that does not hold one has no other way to say so.
        const drawn = textFrom('name', { generator: 'neutralWords' });

        expect(drawn.every((value) => value === value.toLowerCase())).toBe(
          true,
        );
      });

      it('draws a real name for a name-shaped variable that declares nothing', () => {
        expect(
          textFrom('name').every((value) => /^[A-Z][a-z]+ [A-Z]/.test(value)),
        ).toBe(true);
      });

      it('draws neutral words for anything else that declares nothing', () => {
        const drawn = textFrom('note');

        expect(drawn.every((value) => value === value.toLowerCase())).toBe(
          true,
        );
      });

      it('honours a length rule alongside the declared generator', () => {
        const drawn = drawMany(
          {
            field: {
              name: 'blurb',
              type: 'text',
              validation: { maxLength: 12 },
              synthetic: { generator: 'paragraph' },
            },
          },
          20,
        ).map((draw) => String(draw.field));

        expect(drawn.every((value) => value.length <= 12)).toBe(true);
      });
    });
  });

  describe('against a window the field also closes', () => {
    /**
     * Validation bounds a descriptor; it does not replace one. Reading the
     * relative window only where the field left a gap meant a field
     * collecting back to 1990 discarded a declared "last ten years"
     * wholesale — a declaration WIDENED, which is the one direction the rule
     * forbids, and the same shape as the three bugs this area was rebuilt to
     * remove.
     */
    const metOn = (
      parameters: Record<string, unknown>,
      relative: Record<string, unknown>,
    ) =>
      drawMany(
        {
          met: {
            name: 'met',
            type: 'datetime',
            component: 'DatePicker',
            parameters,
            synthetic: { distribution: 'uniform', relative },
          },
        },
        60,
      ).map((draw) => String(draw.met));

    it('narrows a field floor the descriptor reaches later than', () => {
      const drawn = metOn(
        { type: 'full', min: '1990-01-01' },
        { before: 3650, after: 0 },
      );

      // Ten years back from the session date, not thirty-six back from 1990.
      expect(
        Math.min(...drawn.map((d) => Number(d.slice(0, 4)))),
      ).toBeGreaterThan(2010);
    });

    it('keeps a field floor the descriptor reaches no further than', () => {
      // The descriptor asks for a year; the field already stops at 2020. The
      // tighter end is the descriptor's, and the field's is untouched.
      const drawn = metOn(
        { type: 'full', min: '2020-01-01' },
        { before: 365, after: 0 },
      );

      expect(drawn.every((d) => d >= '2020-01-01')).toBe(true);
    });

    it('leaves a field that declares no relative window alone', () => {
      // Nothing descriptor-side speaks about either end, so the field's own
      // window stands. A field collecting future dates must not be pulled
      // back to the session date by a descriptor that never named a ceiling.
      const drawn = drawMany(
        {
          met: {
            name: 'met',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type: 'full', min: '1990-01-01' },
          },
        },
        60,
      ).map((draw) => String(draw.met));

      expect(Math.min(...drawn.map((d) => Number(d.slice(0, 4))))).toBeLessThan(
        2010,
      );
    });
  });

  describe('optionWeights', () => {
    it('draws an ordinal in proportion to its weights', () => {
      const draws = drawMany(
        {
          closeness: {
            name: 'closeness',
            type: 'ordinal',
            options: OPTIONS,
            synthetic: { optionWeights: [{ value: 3, weight: 8 }] },
          },
        },
        2000,
      );

      // Three carries eight of the ten weight; the others keep the default.
      expect(shareOf(draws, (draw) => draw.closeness === 3)).toBeCloseTo(
        0.8,
        1,
      );
    });

    it('draws uniformly when the variable declares no table', () => {
      const draws = drawMany(
        {
          closeness: { name: 'closeness', type: 'ordinal', options: OPTIONS },
        },
        2000,
      );

      expect(shareOf(draws, (draw) => draw.closeness === 3)).toBeCloseTo(
        1 / 3,
        1,
      );
    });

    it('leaves a unique ordinal to its sequence rather than its weights', () => {
      // Distinctness is a RULE, and the descriptor only ever chooses among the
      // values a rule leaves available. Weighting one value ninety-to-one must
      // not hand it to a second alter.
      const draws = drawMany(
        {
          rank: {
            name: 'rank',
            type: 'ordinal',
            options: OPTIONS,
            validation: { unique: true },
            synthetic: { optionWeights: [{ value: 3, weight: 90 }] },
          },
        },
        3,
      );

      const values = draws.map((draw) => draw.rank);
      expect(new Set(values).size).toBe(3);
    });

    it('takes a heavily weighted categorical value once, not twice', () => {
      // A selection is a set, so weighting is applied without replacement:
      // the favoured value is taken FIRST rather than taken repeatedly, which
      // would hand back a shorter answer than the size that was selected.
      const draws = drawMany(
        {
          hobbies: {
            name: 'hobbies',
            type: 'categorical',
            options: [
              { label: 'Reading', value: 'reading' },
              { label: 'Running', value: 'running' },
              { label: 'Cooking', value: 'cooking' },
            ],
            validation: { minSelected: 2, maxSelected: 2 },
            synthetic: {
              optionWeights: [{ value: 'reading', weight: 50 }],
            },
          },
        },
        200,
      );

      for (const draw of draws) {
        const selection = draw.hobbies as unknown[];
        expect(selection).toHaveLength(2);
        expect(new Set(selection).size).toBe(2);
      }

      expect(
        shareOf(draws, (draw) =>
          (draw.hobbies as unknown[]).includes('reading'),
        ),
      ).toBeGreaterThan(0.9);
    });
  });

  describe('a descriptor its rules contradict', () => {
    it('refuses a selection whose remaining values are all weighted zero', () => {
      // Two answers are required and only one value carries weight, so the
      // second pick has nothing left the author allowed. Silently taking a
      // zero-weighted value would report data the protocol says never occurs,
      // and shortening the selection would break `minSelected`.
      const entity = buildEntityConstraints(
        {
          hobbies: {
            name: 'hobbies',
            type: 'categorical',
            options: [
              { label: 'Reading', value: 'reading' },
              { label: 'Running', value: 'running' },
              { label: 'Cooking', value: 'cooking' },
            ],
            validation: { minSelected: 2 },
            synthetic: {
              optionWeights: [
                { value: 'reading', weight: 5 },
                { value: 'running', weight: 0 },
                { value: 'cooking', weight: 0 },
              ],
            },
          },
        } as unknown as Variables,
        TODAY,
      );

      expect(() =>
        generateEntityAttributes(entity, makeContext(), PERSON, 0),
      ).toThrow(SyntheticDescriptorConflict);
    });

    it('names the variable and both halves of the contradiction', () => {
      const entity = buildEntityConstraints(
        {
          hobbies: {
            name: 'hobbies',
            type: 'categorical',
            options: [
              { label: 'Reading', value: 'reading' },
              { label: 'Running', value: 'running' },
            ],
            validation: { minSelected: 2 },
            synthetic: {
              optionWeights: [
                { value: 'reading', weight: 1 },
                { value: 'running', weight: 0 },
              ],
            },
          },
        } as unknown as Variables,
        TODAY,
      );

      expect(() =>
        generateEntityAttributes(entity, makeContext(), PERSON, 0),
      ).toThrow(
        /"hobbies".*option weights and its validation rules cannot both be satisfied/,
      );
    });
  });

  describe('missingProbability', () => {
    it('leaves the answer out at the declared rate', () => {
      const draws = drawMany(
        {
          income: {
            name: 'income',
            type: 'number',
            synthetic: { missingProbability: 0.4 },
          },
        },
        2000,
      );

      expect(shareOf(draws, (draw) => draw.income === undefined)).toBeCloseTo(
        0.4,
        1,
      );
    });

    it('answers every time when the variable declares nothing', () => {
      const draws = drawMany(
        { income: { name: 'income', type: 'number' } },
        200,
      );

      expect(draws.filter((draw) => draw.income === undefined)).toEqual([]);
    });

    it('omits the answer rather than emitting an empty one', () => {
      // A question left unanswered holds no value in the network — not null,
      // and not an empty string. Exporters read absence, so an empty answer
      // would be reported as a response that was given.
      const draws = drawMany(
        {
          income: {
            name: 'income',
            type: 'number',
            synthetic: { missingProbability: 1 },
          },
        },
        50,
      );

      for (const draw of draws) {
        expect(Object.hasOwn(draw, 'income')).toBe(false);
      }
    });

    it('applies to a variable a narrowed draw asks for', () => {
      // Bins and forms generate one variable at a time through `only`; a
      // descriptor that only worked on a whole-entity draw would silently do
      // nothing on either of the paths that actually use it.
      const draws = drawMany(
        {
          name: { name: 'name', type: 'text' },
          closeness: {
            name: 'closeness',
            type: 'ordinal',
            options: OPTIONS,
            synthetic: { missingProbability: 0.5 },
          },
        },
        1000,
        { only: new Set(['closeness']) },
      );

      expect(
        shareOf(draws, (draw) => draw.closeness === undefined),
      ).toBeCloseTo(0.5, 1);
      // `only` still means only: the unasked variable is absent because it was
      // not requested, not because it drew missing.
      expect(draws.every((draw) => draw.name === undefined)).toBe(true);
    });

    it('still lets a dependent rule read the answer that was withheld', () => {
      // `age` is never emitted, but the value the participant WOULD have given
      // is what `retired` is drawn against. The runtime's own comparators
      // no-op against an absent target rather than failing, so nothing
      // downstream is left inconsistent by the omission.
      const draws = drawMany(
        {
          age: {
            name: 'age',
            type: 'number',
            validation: { minValue: 18, maxValue: 60 },
            synthetic: { missingProbability: 1 },
          },
          retired: {
            name: 'retired',
            type: 'number',
            validation: {
              minValue: 18,
              maxValue: 90,
              greaterThanVariable: asEntityAttributeReference('age'),
            },
          },
        },
        100,
      );

      expect(draws.filter((draw) => draw.age !== undefined)).toEqual([]);
      expect(draws.filter((draw) => draw.retired === undefined)).toEqual([]);
      // Drawn above a floor of 18 rather than against nothing, which is what a
      // comparator whose target had been dropped entirely would give.
      for (const draw of draws) {
        expect(Number(draw.retired)).toBeGreaterThan(18);
      }
    });
  });
});
