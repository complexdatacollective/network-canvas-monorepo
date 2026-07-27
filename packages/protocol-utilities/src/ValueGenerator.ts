import { en, Faker } from '@faker-js/faker';

import type { VariableValue } from '@codaco/shared-consts';

import {
  addSteps,
  type DateResolution,
  stepsBetween,
  todayYmd,
  truncateToResolution,
} from './generateNetwork/constraints/dateWindow';
import type {
  ConstrainedVariable,
  VariableConstraints,
} from './generateNetwork/constraints/types';
import {
  SCALAR_DECIMAL_PLACES,
  TEXT_ALPHABET_SIZE,
  textDrawLength,
} from './generateNetwork/constraints/valueSpace';
import type { VariableEntry } from './types';

const DISTINCT_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * How far back an unbounded `unique` datetime may reach. A reach expressed in
 * steps rather than years underflows past year 0 at month or year resolution,
 * where `addSteps` emits a malformed bound that reparses as year 0.
 */
const UNIQUE_DATE_REACH_YEARS = 1000;

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

function clamp(value: number, min?: number, max?: number): number {
  let result = value;
  if (max !== undefined) result = Math.min(result, max);
  if (min !== undefined) result = Math.max(result, min);
  return result;
}

export class ValueGenerator {
  private faker: Faker;
  private readonly today: string;

  constructor(seed: number, today: string = todayYmd()) {
    this.faker = new Faker({ locale: [en] });
    this.faker.seed(seed);
    this.today = today;
  }

  generateForVariable(variable: VariableEntry, index: number): VariableValue {
    switch (variable.type) {
      case 'text':
        return this.faker.person.firstName();
      case 'number':
        return this.faker.number.int({ min: 18, max: 80 });
      case 'scalar':
        return this.faker.number.float({
          min: 0,
          max: 1,
          fractionDigits: 2,
        });
      case 'boolean':
        return this.faker.datatype.boolean();
      case 'ordinal': {
        const options = variable.options ?? [];
        if (options.length === 0) return null;
        return options[index % options.length]!.value;
      }
      case 'categorical': {
        const options = variable.options ?? [];
        if (options.length === 0) return null;
        const count = 1 + (index % 2);
        const picked: (number | string | boolean)[] = [];
        for (let i = 0; i < count && i < options.length; i++) {
          picked.push(options[(index + i) % options.length]!.value);
        }
        return picked;
      }
      case 'datetime':
        return this.faker.date.past().toISOString();
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
        return null;
    }
  }

  /**
   * Type-appropriate "unanswered" value for a variable. Used for manually
   * seeded nodes, where unset attributes must stay neutral rather than being
   * filled with random data that would corrupt a deliberately-constructed
   * scenario (e.g. a random ego or random disease flags in a pedigree).
   */
  neutralForVariable(variable: VariableEntry): unknown {
    switch (variable.type) {
      case 'boolean':
        return false;
      case 'text':
        return '';
      case 'categorical':
        return [];
      default:
        return null;
    }
  }

  generateName(): string {
    return this.faker.person.firstName();
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

  generateConstrained(
    variable: ConstrainedVariable,
    index: number,
    opts?: { distinctSeq?: number },
  ): VariableValue {
    const { entry, constraints } = variable;
    const seq = opts?.distinctSeq;

    switch (entry.type) {
      case 'text': {
        if (seq !== undefined) {
          return fitToLength(
            distinctText(seq, textDrawLength(constraints)),
            constraints,
          );
        }
        return fitToLength(this.faker.person.firstName(), constraints);
      }

      case 'number': {
        const lowerBound = constraints.minValue ?? 18;
        const min = Math.ceil(lowerBound);
        // The default [18, 80] range is far too small to hold a unique value
        // per entity, and valueSpaceSize calls an unbounded number
        // "unbounded" — so a unique variable widens the range to make that
        // claim true. A non-unique variable keeps the realistic default.
        const defaultMax = constraints.unique ? min + this.uniqueHeadroom : 80;
        const upperBound = constraints.maxValue ?? Math.max(min, defaultMax);
        const max = Math.floor(upperBound);

        // A range such as [10.5, 10.7] holds no integer. The schema does not
        // require number values to be whole, so draw inside the declared range
        // rather than emitting the nearest integer outside it.
        if (max < min) {
          if (upperBound <= lowerBound) return lowerBound;
          return clamp(
            Number(
              this.randomFloat(lowerBound, upperBound).toFixed(
                SCALAR_DECIMAL_PLACES,
              ),
            ),
            lowerBound,
            upperBound,
          );
        }

        if (seq !== undefined) return min + (seq % Math.max(1, max - min + 1));
        return this.randomInt(min, max);
      }

      case 'scalar': {
        const min = constraints.minValue ?? 0;
        const max = constraints.maxValue ?? 1;
        if (max <= min) return min;
        // Round first: rounding a clamped value can push it back outside the
        // bound it was just brought inside.
        return clamp(
          Number(this.randomFloat(min, max).toFixed(SCALAR_DECIMAL_PLACES)),
          min,
          max,
        );
      }

      case 'boolean':
        return seq !== undefined
          ? seq % 2 === 0
          : this.faker.datatype.boolean();

      case 'ordinal': {
        const options = entry.options ?? [];
        if (options.length === 0) return null;
        const pick = seq ?? index;
        return options[pick % options.length]?.value ?? null;
      }

      case 'categorical': {
        const options = entry.options ?? [];
        if (options.length === 0) return null;
        const min = Math.max(1, constraints.minSelected ?? 1);
        const defaultMax = constraints.unique ? options.length : 2;
        const max = Math.min(
          constraints.maxSelected ?? defaultMax,
          options.length,
        );
        const span = Math.max(1, max - min + 1);
        const base = seq ?? index;
        const count = Math.max(min, Math.min(max, min + (base % span)));

        const picked: (number | string | boolean)[] = [];
        for (let i = 0; i < count; i++) {
          const option = options[(base + i) % options.length];
          if (option) picked.push(option.value);
        }
        return [...new Set(picked)];
      }

      case 'datetime': {
        const window = constraints.dateWindow ?? {
          resolution: 'full' as const,
        };
        const max =
          window.max ?? truncateToResolution(this.today, window.resolution);
        const defaultSpan = constraints.unique
          ? this.uniqueDateHeadroom(window.resolution)
          : this.defaultDateSpan(window.resolution);
        const min =
          window.min ?? addSteps(max, -defaultSpan, window.resolution);
        const span = Math.max(0, stepsBetween(min, max, window.resolution));
        const offset =
          seq !== undefined ? seq % (span + 1) : this.randomInt(0, span);
        return addSteps(min, offset, window.resolution);
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
        return null;
    }
  }

  /**
   * A value standing in the requested relationship to `target`, kept inside the
   * variable's own bounds.
   *
   * Those bounds win. When they leave no room on the requested side of `target`
   * (bounds `[0, 100]`, target `100`, `'greater'`), this returns the bound
   * rather than escaping it, so the value satisfies the variable's own rules
   * but not the comparator. Callers must therefore draw a comparator target
   * with enough headroom for a step in the requested direction to land inside
   * the bounds.
   */
  generateComparedTo(
    variable: ConstrainedVariable,
    target: VariableValue,
    direction: 'greater' | 'less' | 'greaterOrEqual' | 'lessOrEqual',
  ): VariableValue {
    const { entry, constraints } = variable;
    const wantsGreater =
      direction === 'greater' || direction === 'greaterOrEqual';
    const inclusive =
      direction === 'greaterOrEqual' || direction === 'lessOrEqual';

    // Only these three types accept a comparison rule (see the variable
    // schema). Stepping any other type leaves its domain — a boolean becomes
    // 2, an ordinal becomes a value no option offers — so draw normally.
    if (
      entry.type !== 'number' &&
      entry.type !== 'scalar' &&
      entry.type !== 'datetime'
    ) {
      return this.generateConstrained(variable, 0);
    }

    if (entry.type === 'datetime') {
      if (typeof target !== 'string' || target === '') {
        return this.generateConstrained(variable, 0);
      }
      const window = constraints.dateWindow ?? { resolution: 'full' as const };
      const step = inclusive ? 0 : 1;
      const candidate = addSteps(
        target,
        wantsGreater ? step : -step,
        window.resolution,
      );
      // Clamped against both ends: a target drawn from a wider window than
      // this variable's escapes the far bound as well as the near one.
      if (window.max !== undefined && candidate > window.max) return window.max;
      if (window.min !== undefined && candidate < window.min) return window.min;
      return candidate;
    }

    const numericTarget = Number(target);
    if (target === null || Number.isNaN(numericTarget)) {
      return this.generateConstrained(variable, 0);
    }

    const isScalar = entry.type === 'scalar';
    const step = isScalar ? 10 ** -SCALAR_DECIMAL_PLACES : 1;
    const delta = inclusive ? 0 : step;
    const candidate = wantsGreater
      ? numericTarget + delta
      : numericTarget - delta;

    // Round first: rounding a clamped value can push it back outside the bound
    // it was just brought inside.
    const rounded = isScalar
      ? Number(candidate.toFixed(SCALAR_DECIMAL_PLACES))
      : Math.round(candidate);

    return clamp(rounded, constraints.minValue, constraints.maxValue);
  }

  /**
   * How far an unbounded `unique` variable may range beyond its default
   * window. Set well above the largest entity count generation can reach so
   * the value space the feasibility pass calls "unbounded" really is.
   */
  private readonly uniqueHeadroom = 100_000;

  /**
   * The same headroom for dates, in steps at the window's own resolution.
   * Bounded by the calendar rather than by entity count: no span wider than
   * {@link UNIQUE_DATE_REACH_YEARS} stays a real date at year resolution, so a
   * year-resolution space is narrower than the numeric headroom by necessity.
   */
  private uniqueDateHeadroom(resolution: DateResolution): number {
    if (resolution === 'year') return UNIQUE_DATE_REACH_YEARS;
    if (resolution === 'month') return UNIQUE_DATE_REACH_YEARS * 12;
    return Math.round(UNIQUE_DATE_REACH_YEARS * 365.25);
  }

  /** Roughly a decade back, replacing the old faker.date.past() window. */
  private defaultDateSpan(resolution: DateResolution): number {
    if (resolution === 'year') return 40;
    if (resolution === 'month') return 480;
    return 3650;
  }
}
