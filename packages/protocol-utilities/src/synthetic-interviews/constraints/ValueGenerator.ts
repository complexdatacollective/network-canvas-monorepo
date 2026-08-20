import { en, Faker } from '@faker-js/faker';

import {
  DEFAULT_OPTION_WEIGHT,
  declaresTextGenerator,
  type ResolvedDatetimeSynthetic,
  type ResolvedNumberSynthetic,
  type ResolvedVariableSynthetic,
  SCALAR_DOMAIN,
} from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import { invariant } from '../utils/invariant';
import {
  sampleBeta,
  sampleLognormal,
  sampleNormal,
  sampleTruncated,
  type UniformSource,
} from '../value-generators/distributions';
import { generateTextValue } from '../value-generators/text';
import {
  addSteps,
  daysToSteps,
  type DateResolution,
  stepsBetween,
  todayYmd,
  truncateToResolution,
} from './dateWindow';
import {
  descriptorOf,
  openDatetimeCeiling,
  openDatetimeFloor,
  relativeDatetimeCeiling,
  relativeDatetimeFloor,
} from './descriptors';
import type { ConstrainedVariable, VariableConstraints } from './types';
import {
  booleanDomainValues,
  categoricalSelectionAt,
  decimalGrid,
  decimalGridValueAt,
  distinctOptionValues,
  MAX_TEXT_DRAW_LENGTH,
  numberDrawBounds,
  SCALAR_DECIMAL_PLACES,
  TEXT_ALPHABET_SIZE,
  textDrawLength,
} from './valueSpace';
import type { VariableEntry } from './variableEntry';

/**
 * Raised where a variable's `synthetic` descriptor and its `validation` cannot
 * both be honoured — an authoring contradiction generation cannot resolve
 * without silently discarding one of the two things the protocol says.
 */
export class SyntheticDescriptorConflict extends Error {
  constructor(message: string) {
    super(`Cannot generate a synthetic interview: ${message}`);
    this.name = 'SyntheticDescriptorConflict';
  }
}

/**
 * Choose among the values a variable's rules ALLOW, weighted by what its
 * descriptor prefers.
 *
 * Weights are relative and an unlisted value keeps DEFAULT_OPTION_WEIGHT, so a
 * variable declaring no table resolves to a uniform one and draws uniformly —
 * which is what the allowed set alone would have given.
 *
 * The two can genuinely disagree: a `differentFrom` sibling may take the only
 * value the author weighted, leaving nothing but values they excluded. That is
 * an authoring contradiction rather than a draw to fudge, so it raises instead
 * of quietly producing data the protocol said should not appear.
 */
function weightedChoice<T extends string | number | boolean>(
  allowed: readonly T[],
  weights: { value: number | string; weight: number }[],
  draw: (max: number) => number,
  describe: () => string,
): T | undefined {
  if (allowed.length === 0) return undefined;

  const scored = allowed.map((value) => ({
    value,
    weight:
      typeof value === 'boolean'
        ? DEFAULT_OPTION_WEIGHT
        : (weights.find((entry) => entry.value === value)?.weight ??
          DEFAULT_OPTION_WEIGHT),
  }));

  const total = scored.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    throw new SyntheticDescriptorConflict(
      `every value still available for ${describe()} is weighted zero — its option weights and its validation rules cannot both be satisfied`,
    );
  }

  let remaining = draw(total);
  for (const entry of scored) {
    remaining -= entry.weight;
    if (remaining <= 0) return entry.value;
  }
  return scored[scored.length - 1]?.value;
}

const DISTINCT_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// valueSpaceSize's unique-text feasibility maths assumes distinctText draws
// from exactly TEXT_ALPHABET_SIZE symbols. If this literal ever drifted from
// that constant, a unique text variable could pass feasibility analysis and
// then exhaust its values mid-generation with no failing test to catch it —
// fail fast instead.
if (DISTINCT_ALPHABET.length !== TEXT_ALPHABET_SIZE) {
  throw new Error(
    `DISTINCT_ALPHABET has ${DISTINCT_ALPHABET.length} characters but TEXT_ALPHABET_SIZE is ${TEXT_ALPHABET_SIZE}; keep them in sync.`,
  );
}

/**
 * Encode `seq` in base `TEXT_ALPHABET_SIZE` and pad it to exactly `length`
 * characters, so distinct sequence numbers give distinct strings that still
 * fit a tight length budget. A suffix would break an exact-length rule such
 * as `minLength: 24, maxLength: 24`.
 */
function distinctText(seq: number, length: number): string {
  let remaining = seq;
  let encoded = '';
  do {
    encoded =
      DISTINCT_ALPHABET.charAt(remaining % TEXT_ALPHABET_SIZE) + encoded;
    remaining = Math.floor(remaining / TEXT_ALPHABET_SIZE);
  } while (remaining > 0);

  if (encoded.length >= length) return encoded.slice(-length);
  return DISTINCT_ALPHABET.charAt(0).repeat(length - encoded.length) + encoded;
}

function fitToLength(value: string, constraints: VariableConstraints): string {
  const { minLength, maxLength } = constraints;
  let result = value;
  if (maxLength !== undefined && result.length > maxLength) {
    result = result.slice(0, maxLength);
  }
  if (minLength !== undefined && result.length < minLength) {
    result = result.padEnd(minLength, DISTINCT_ALPHABET.charAt(0));
  }
  return result;
}

function fitsLength(value: string, constraints: VariableConstraints): boolean {
  const { minLength, maxLength } = constraints;
  return (
    (minLength === undefined || value.length >= minLength) &&
    (maxLength === undefined || value.length <= maxLength)
  );
}

/**
 * The later and the earlier of two dates at one resolution.
 *
 * Lexicographic, which is exact for the truncated forms these are handed
 * (`YYYY`, `YYYY-MM`, `YYYY-MM-DD` all sort as they read) and avoids parsing a
 * Date only to compare it.
 */
const maxYmd = (a: string, b: string): string => (a > b ? a : b);
const minYmd = (a: string, b: string): string => (a < b ? a : b);

function clamp(value: number, min?: number, max?: number): number {
  let result = value;
  if (max !== undefined) result = Math.min(result, max);
  if (min !== undefined) result = Math.max(result, min);
  return result;
}

export class ValueGenerator {
  private faker: Faker;
  private nameFaker: Faker;
  private readonly today: string;

  constructor(seed: number, today: string = todayYmd()) {
    this.faker = new Faker({ locale: [en] });
    this.faker.seed(seed);
    this.nameFaker = new Faker({ locale: [en] });
    this.nameFaker.seed(seed);
    this.today = today;
  }

  /**
   * Type-appropriate "unanswered" value for a variable. Used for manually
   * seeded nodes, where unset attributes must stay neutral rather than being
   * filled with random data that would corrupt a deliberately-constructed
   * scenario (e.g. a random ego or random disease flags in a pedigree).
   */
  neutralForVariable(variable: VariableEntry): VariableValue | undefined {
    switch (variable.type) {
      case 'boolean':
        return false;
      case 'text':
        return '';
      case 'categorical':
        return [];
      default:
        return undefined;
    }
  }

  generateName(): string {
    return `${this.faker.person.firstName()} ${this.faker.person.lastName()}`;
  }

  generatePromptText(stageType: string): string {
    switch (stageType) {
      case 'NameGenerator':
      case 'NameGeneratorQuickAdd':
        return 'Please name the people you are close to.';
      case 'NameGeneratorRoster':
        return 'Please select the people you know from this list.';
      case 'Sociogram':
        return 'Place people in the circles based on how close you are to them.';
      case 'Narrative':
        return 'Review the network and add any annotations.';
      case 'DyadCensus':
        return 'Do these two people know each other?';
      case 'OneToManyDyadCensus':
        return 'Does this person have a relationship with any of the people below?';
      case 'OrdinalBin':
        return 'How much do you agree with each person?';
      case 'CategoricalBin':
        return 'Which categories does each person belong to?';
      case 'EgoForm':
        return 'Please tell us about yourself.';
      case 'TieStrengthCensus':
        return 'How strong is the relationship between these two people?';
      case 'AlterForm':
        return 'Please provide details about each person.';
      case 'AlterEdgeForm':
        return 'Please describe each relationship.';
      case 'FamilyPedigree':
        return 'Please create your family pedigree by adding family members.';
      case 'Geospatial':
        return 'Please select a location on the map for this person.';
      default:
        return 'Please complete this step.';
    }
  }

  generateLabel(stageType?: string): string {
    return stageType ?? 'Stage';
  }

  /**
   * Builds the shortest conventional personal name that satisfies the field's
   * length rules. A sampled first name that is too short grows to first + last,
   * then first + middle + last; a ceiling that the next composition crosses
   * means no longer composition can fit.
   */
  private generateConstrainedName(
    constraints: VariableConstraints,
    source: Faker,
  ): string | undefined {
    // Longest-preferred: node labels drive the label-fitting and reveal
    // behaviour, so a name variable draws a full name wherever constraints
    // allow — shorter forms are fallbacks for a declared cap, not the default.
    const firstName = source.person.firstName();
    const lastName = source.person.lastName();
    const fullName = `${firstName} ${lastName}`;
    if (fitsLength(fullName, constraints)) return fullName;

    if (
      constraints.maxLength !== undefined &&
      fullName.length > constraints.maxLength
    ) {
      // The cap has no room for a full name; a first name alone may still fit.
      return fitsLength(firstName, constraints) ? firstName : undefined;
    }

    // The full name sits under a declared floor: lengthen with a middle name.
    const withMiddle = `${firstName} ${source.person.middleName()} ${lastName}`;
    return fitsLength(withMiddle, constraints) ? withMiddle : undefined;
  }

  generatePresetLabel(): string {
    return this.faker.word.words(2);
  }

  randomInt(min: number, max: number): number {
    // faker.number.int throws on an inverted range; a caller passing min > max
    // (e.g. a name generator with minNodes above maxNodes) collapses to min.
    if (min > max) {
      return min;
    }
    return this.faker.number.int({ min, max });
  }

  randomFloat(min: number, max: number): number {
    return this.faker.number.float({ min, max });
  }

  /** How many options a descriptor's selection-count table asks for. */
  private drawSelectionCount(table: {
    probabilities: { count: number; probability: number }[];
  }): number {
    let remaining = this.randomFloat(0, 1);
    for (const entry of table.probabilities) {
      remaining -= entry.probability;
      if (remaining <= 0) return entry.count;
    }
    // Only floating-point residue reaches here: the schema holds the
    // probabilities to a sum of 1, and resolution derives them the same way.
    const last = table.probabilities[table.probabilities.length - 1];
    invariant(
      last !== undefined,
      'a selection-count table declared no counts at all',
    );
    return last.count;
  }

  /** This generator's own stream, as the samplers consume it. */
  private get uniform(): UniformSource {
    return (min, max) => this.randomFloat(min, max);
  }

  /**
   * A number drawn from the shape its descriptor declares, inside the window
   * its validation allows.
   *
   * TRUNCATED into that window rather than clamped, and the schema guarantees
   * the window is reachable: `rejectDisjointNumberSynthetic` refuses a
   * descriptor whose own range cannot meet the validation bounds, so a
   * distribution that arrives here has somewhere to land.
   *
   * Whole numbers wherever the window holds one, which is the same choice an
   * undeclared number draw makes — a declared distribution changes which value
   * is likely, not what kind of value the variable records.
   */
  private drawDeclaredNumber(
    declared: ResolvedNumberSynthetic,
    constraints: VariableConstraints,
  ): number {
    // The variable's REAL bounds, not the plausible span `numberDrawBounds`
    // invents for a variable that declares nothing. That span is generation's
    // own default, and a declared distribution is the author replacing it —
    // truncating into it would cap a declared `constant 100` at the top of a
    // range no protocol ever asked for.
    const lowerBound = constraints.minValue ?? Number.NEGATIVE_INFINITY;
    const upperBound = constraints.maxValue ?? Number.POSITIVE_INFINITY;

    const floor =
      declared.distribution === 'constant'
        ? lowerBound
        : Math.max(lowerBound, declared.min ?? Number.NEGATIVE_INFINITY);
    const ceiling =
      declared.distribution === 'constant'
        ? upperBound
        : Math.min(upperBound, declared.max ?? Number.POSITIVE_INFINITY);

    // Whole numbers unless the window is a fractional sliver, which is the
    // same test an undeclared draw makes. An open window admits integers.
    const whole =
      !Number.isFinite(floor) ||
      !Number.isFinite(ceiling) ||
      Math.ceil(floor) <= Math.floor(ceiling);
    const settle = (value: number) =>
      whole ? Math.round(value) : Number(value.toFixed(SCALAR_DECIMAL_PLACES));

    switch (declared.distribution) {
      case 'constant':
        return settle(clamp(declared.value, floor, ceiling));
      case 'uniform':
        // Its support already is its bounds, so intersecting them with the
        // validation window is the whole of the TRUNCATION it needs — but
        // settling still rounds, and rounding can step outside a range holding
        // no value of its own: `[0.001, 0.009]` rounds to 0 or 0.01 at every
        // draw. Clamped after rounding, never before, since clamping first
        // only moves the problem.
        return clamp(settle(this.randomFloat(floor, ceiling)), floor, ceiling);
      case 'normal':
        return sampleTruncated(
          () => settle(sampleNormal(this.uniform, declared.mean, declared.sd)),
          floor,
          ceiling,
        );
      case 'lognormal':
        return sampleTruncated(
          () =>
            settle(sampleLognormal(this.uniform, declared.mean, declared.sd)),
          floor,
          ceiling,
        );
    }
  }

  /**
   * A scalar drawn from the shape its descriptor declares, inside the 0-1
   * scale a scalar is recorded on as narrowed by any rule that reached it.
   */
  private drawDeclaredScalar(
    declared: Extract<ResolvedVariableSynthetic, { type: 'scalar' }>,
    floor: number,
    ceiling: number,
  ): number {
    const settle = (value: number) =>
      Number(value.toFixed(SCALAR_DECIMAL_PLACES));

    switch (declared.distribution) {
      case 'constant':
        return settle(clamp(declared.value, floor, ceiling));
      case 'uniform': {
        // Rounded onto the scalar grid and then clamped back inside, for the
        // reason a number's uniform is: a range the grid does not itself hold
        // rounds outside itself at every draw.
        const min = Math.max(floor, declared.min ?? floor);
        const max = Math.min(ceiling, declared.max ?? ceiling);
        return clamp(settle(this.randomFloat(min, max)), min, max);
      }
      case 'normal':
        return sampleTruncated(
          () => settle(sampleNormal(this.uniform, declared.mean, declared.sd)),
          floor,
          ceiling,
        );
      case 'beta':
        return sampleTruncated(
          () => settle(sampleBeta(this.uniform, declared.mean, declared.sd)),
          floor,
          ceiling,
        );
    }
  }

  /**
   * A date drawn from the shape its descriptor declares, inside the window the
   * variable's own rules leave open.
   *
   * Worked in STEPS at the window's resolution rather than in dates: a
   * month-resolution variable answers in months, so an offset drawn in days
   * has to become one before it can be added or bounded. That also keeps the
   * truncation a numeric comparison rather than a string one, which mixed
   * resolutions would make unreliable.
   */
  private drawDeclaredDatetime(
    declared: ResolvedDatetimeSynthetic,
    resolution: DateResolution,
    windowMin: string,
    windowMax: string,
  ): string {
    const floorDate = declared.min
      ? maxYmd(truncateToResolution(declared.min, resolution), windowMin)
      : windowMin;
    const ceilingDate = declared.max
      ? minYmd(truncateToResolution(declared.max, resolution), windowMax)
      : windowMax;

    const span = Math.max(0, stepsBetween(floorDate, ceilingDate, resolution));

    if (declared.distribution === 'uniform') {
      return addSteps(floorDate, this.randomInt(0, span), resolution);
    }

    const centre = stepsBetween(
      floorDate,
      truncateToResolution(declared.mean, resolution),
      resolution,
    );
    const spread = daysToSteps(declared.sdDays, resolution);
    const offset = sampleTruncated(
      () => Math.round(sampleNormal(this.uniform, centre, spread)),
      0,
      span,
    );
    return addSteps(floorDate, offset, resolution);
  }

  generateConstrained(
    variable: ConstrainedVariable,
    index: number,
    opts?: {
      distinctSeq?: number;
      preferRealisticName?: boolean;
      forceRealisticName?: boolean;
    },
  ): VariableValue | undefined {
    const { entry, constraints } = variable;
    const seq = opts?.distinctSeq;

    switch (entry.type) {
      case 'text': {
        // Belt to `analyseFeasibility`'s refusal, and the last point before a
        // string of the declared length is allocated. `fitToLength` pads to
        // `minLength` on both paths below, so a floor past the cap is where the
        // hundreds of megabytes — or the `RangeError` — would come from.
        // Reaching it means the value was generated without the feasibility
        // pass that turns such a protocol away, so it throws rather than
        // allocating, naming the variable the way a researcher-facing refusal
        // does.
        if (
          constraints.minLength !== undefined &&
          constraints.minLength > MAX_TEXT_DRAW_LENGTH
        ) {
          throw new Error(
            `"${entry.name}" declares minLength ${constraints.minLength}, beyond the ${MAX_TEXT_DRAW_LENGTH} characters a generated value can hold.`,
          );
        }

        // What this variable's text should look like. The resolved descriptor
        // says: the author's generator where they named one, and otherwise the
        // one the codebook's own naming convention implies.
        //
        // A caller's hint that this field IS the entity's person label — a
        // quick-add name generator sets it, because its one field is the name —
        // overrules that CONVENTION, and never a declaration. `neutralWords` is
        // authorable precisely so a variable called `name` can be told not to
        // draw one, which it could not be if a hint could take it back. This is
        // a precedence rule between two statements about the same field rather
        // than a default standing in for an absent one.
        const generator =
          opts?.forceRealisticName === true && !declaresTextGenerator(entry)
            ? 'personName'
            : descriptorOf(variable, 'text').generator;

        // Only a full person's name is drawn through the constrained-name
        // path, which knows how to meet a length rule that plain generator
        // output would miss. A declared `firstName` or `lastName` is the
        // author asking for exactly that, so it draws exactly that below.
        const nameVariable = generator === 'personName';
        let attemptedRealisticName = false;
        if (nameVariable && opts?.preferRealisticName === true) {
          attemptedRealisticName = true;
          const realisticName = this.generateConstrainedName(
            constraints,
            this.nameFaker,
          );
          if (realisticName !== undefined) return realisticName;
        }

        if (seq !== undefined || (nameVariable && constraints.unique)) {
          return fitToLength(
            distinctText(seq ?? index, textDrawLength(constraints)),
            constraints,
          );
        }

        if (nameVariable) {
          return (
            (attemptedRealisticName
              ? undefined
              : this.generateConstrainedName(constraints, this.faker)) ??
            fitToLength(
              distinctText(index, textDrawLength(constraints)),
              constraints,
            )
          );
        }

        return fitToLength(
          generateTextValue(generator, this.faker),
          constraints,
        );
      }

      case 'number': {
        // Every number carries a shape to draw from: the author's where they
        // declared one, and otherwise a uniform over the window the schema
        // resolves from this variable's effective rules. Not on the sequence
        // path — a `unique` redraw has to land somewhere the earlier draws did
        // not, which is a walk of the value space rather than a draw from a
        // distribution.
        if (seq === undefined) {
          return this.drawDeclaredNumber(
            descriptorOf(variable, 'number'),
            constraints,
          );
        }

        const { min: lowerBound, max: upperBound } = numberDrawBounds(variable);

        const min = Math.ceil(lowerBound);
        const max = Math.floor(upperBound);

        // A range such as [10.5, 10.7] holds no integer. The schema does not
        // require number values to be whole, so the sequence walks the same
        // rounding grid the draw falls back to inside such a range: a `unique`
        // number in a fractional range used to spend its whole redraw budget
        // recolliding, and threw on a protocol `valueSpaceSize` had just called
        // wide enough.
        if (max < min)
          return decimalGridValueAt(decimalGrid(lowerBound, upperBound), seq);

        return min + (seq % (max - min + 1));
      }

      case 'scalar': {
        // These bounds are the normalised scale narrowed by whatever comparison
        // rules reached this draw, so they are folded back into it: no scalar
        // value the interview can collect, or its slider render, lies outside.
        const min = clamp(
          constraints.minValue ?? SCALAR_DOMAIN.minValue,
          SCALAR_DOMAIN.minValue,
          SCALAR_DOMAIN.maxValue,
        );
        const max = clamp(
          constraints.maxValue ?? SCALAR_DOMAIN.maxValue,
          min,
          SCALAR_DOMAIN.maxValue,
        );

        // The sequence walks the same grid a free draw is rounded onto, for
        // the same reason a fractional number's does: a redraw that went back
        // to the random stream could recollide until the budget ran out on a
        // space `valueSpaceSize` had counted as wide enough.
        if (seq !== undefined) {
          return decimalGridValueAt(decimalGrid(min, max), seq);
        }

        return this.drawDeclaredScalar(
          descriptorOf(variable, 'scalar'),
          min,
          max,
        );
      }

      case 'boolean': {
        if (seq === undefined) {
          const { probabilityTrue } = descriptorOf(variable, 'boolean');
          const domain = booleanDomainValues(entry);
          const wanted = this.randomFloat(0, 1) < probabilityTrue;
          // The domain holds both values unless a `Boolean` control narrows it
          // to one, and the schema refuses a `probabilityTrue` a one-sided
          // control could never draw — so wherever this descriptor was allowed
          // to be declared, what it asks for is answerable. A domain that
          // cannot answer falls through to the walk below, which returns what
          // the options do offer, rather than being papered over here.
          if (domain.includes(wanted)) return wanted;
        }
        const values = booleanDomainValues(entry);
        if (values.length === 0) return undefined;
        if (
          seq !== undefined &&
          values.includes(false) &&
          values.includes(true)
        ) {
          return seq % 2 === 0;
        }

        return values[(seq ?? 0) % values.length];
      }

      case 'ordinal': {
        // Walked over the values the options offer rather than over the options
        // themselves, the way the value-space count, the solver's domains and
        // the categorical draw all read an option list. The schema requires two
        // options, not two values, so an imported list can write one value under
        // many labels; indexing entries then meets that value once per entry,
        // and a `unique` variable spends its whole redraw budget on it before
        // the sequence reaches the next value — refusing a protocol the count
        // had just called satisfiable. A free draw walks the values for the
        // milder version of the same reason: answering with whichever value is
        // written most often samples the labels rather than the data.
        //
        // A list whose values are already distinct is unaffected, first
        // occurrences being kept in order.
        const values = distinctOptionValues(entry);
        if (values.length === 0) return undefined;

        if (seq === undefined) {
          const weighted = weightedChoice(
            values,
            descriptorOf(variable, 'ordinal').optionWeights,
            (max) => this.randomFloat(0, max),
            () => `"${entry.name}"`,
          );
          if (weighted !== undefined) return weighted;
        }

        const pick = seq ?? index;
        return values[pick % values.length];
      }

      case 'categorical': {
        // Drawn from the values the options offer rather than from the options
        // themselves: a selection is a set, so two entries carrying one value
        // are one thing to pick. Picking by position could take both and hand
        // back a shorter answer than the size it selected, which `minSelected`
        // then rejects.
        const values = distinctOptionValues(entry);
        if (values.length === 0) return undefined;

        // A distinct value has to be reachable for every selection the value
        // space counts, so a sequence number indexes the combination space
        // itself. A free draw only has to be plausible, and takes a run of
        // adjacent values.
        if (seq !== undefined) {
          return [...new Set(categoricalSelectionAt(variable, seq))];
        }

        // The table is drawn exactly as it stands. The schema has already held
        // every count an AUTHOR wrote against `minSelected`, `maxSelected`, the
        // distinct option values and the weights it will draw from (see
        // `rejectIllegalSelectionCounts`), and a derived table comes from those
        // same rules plus whatever the interfaces collecting this variable
        // impose — a CategoricalBin's single selection above all. Either way
        // there is nothing left here to reconcile, and narrowing the draw a
        // second time could only overrule what the protocol already said.
        const { optionWeights, selectionCount } = descriptorOf(
          variable,
          'categorical',
        );
        const count = this.drawSelectionCount(selectionCount);

        // Weighted, and without replacement: a selection is a set, so a
        // heavily-weighted value is taken first rather than taken twice.
        const remaining = [...values];
        const picked: (number | string | boolean)[] = [];
        while (picked.length < count && remaining.length > 0) {
          const value = weightedChoice(
            remaining,
            optionWeights,
            (bound) => this.randomFloat(0, bound),
            () => `"${entry.name}"`,
          );
          if (value === undefined) break;
          picked.push(value);
          remaining.splice(remaining.indexOf(value), 1);
        }
        return [...new Set(picked)];
      }

      case 'datetime': {
        const window = constraints.dateWindow ?? {
          resolution: 'full' as const,
        };

        // The field's window and the descriptor's relative one BOTH apply, and
        // the TIGHTER of each end wins. A descriptor may narrow what the field
        // offers, never widen it: "the last ten years" on a field collecting
        // back to 1990 means the last ten years, not the last thirty-six.
        //
        // Only a declared relative window intersects. Where the descriptor says
        // nothing about an end, the field's own bound stands alone — a field
        // that legitimately collects future dates must not be pulled back to
        // the session date by a descriptor that never mentioned a ceiling.
        const relativeMax = relativeDatetimeCeiling(
          variable,
          this.today,
          window.resolution,
        );
        const max =
          window.max === undefined
            ? openDatetimeCeiling(variable, this.today, window.resolution)
            : relativeMax === undefined
              ? window.max
              : minYmd(window.max, relativeMax);

        const relativeMin = relativeDatetimeFloor(
          variable,
          max,
          window.resolution,
        );
        const min =
          window.min === undefined
            ? openDatetimeFloor(variable, max, window.resolution)
            : relativeMin === undefined
              ? window.min
              : maxYmd(window.min, relativeMin);

        if (seq === undefined) {
          return this.drawDeclaredDatetime(
            descriptorOf(variable, 'datetime'),
            window.resolution,
            min,
            max,
          );
        }

        const span = Math.max(0, stepsBetween(min, max, window.resolution));
        return addSteps(min, seq % (span + 1), window.resolution);
      }

      case 'layout':
        return {
          x: 0.1 + ((index * 0.17) % 0.8),
          y: 0.1 + ((index * 0.23) % 0.8),
        };

      case 'location':
        return {
          x: this.faker.location.longitude(),
          y: this.faker.location.latitude(),
        };

      default:
        return undefined;
    }
  }
}
