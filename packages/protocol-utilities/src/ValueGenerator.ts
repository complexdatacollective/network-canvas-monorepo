import { en, Faker } from '@faker-js/faker';

import {
  DATE_PICKER_DEFAULT_MIN,
  type VariableValue,
} from '@codaco/shared-consts';

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
  categoricalSelectionAt,
  numberDrawBounds,
  SCALAR_DECIMAL_PLACES,
  SCALAR_DOMAIN,
  selectionSizeRange,
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

  /**
   * Type-appropriate "unanswered" value for a variable. Used for manually
   * seeded nodes, where unset attributes must stay neutral rather than being
   * filled with random data that would corrupt a deliberately-constructed
   * scenario (e.g. a random ego or random disease flags in a pedigree).
   */
  neutralForVariable(variable: VariableEntry): VariableValue {
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
        const { min: lowerBound, max: upperBound } =
          numberDrawBounds(constraints);
        const min = Math.ceil(lowerBound);
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

        if (seq !== undefined) return min + (seq % (max - min + 1));
        return this.randomInt(min, max);
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

        const picked: (number | string | boolean)[] = [];

        // A distinct value has to be reachable for every selection the value
        // space counts, so a sequence number indexes the combination space
        // itself. A free draw only has to be plausible, and takes a run of
        // adjacent options.
        if (seq !== undefined) {
          for (const at of categoricalSelectionAt(variable, seq)) {
            const option = options[at];
            if (option) picked.push(option.value);
          }
          return [...new Set(picked)];
        }

        const { min, max } = selectionSizeRange(variable);
        const span = Math.max(1, max - min + 1);
        const count = Math.max(min, Math.min(max, min + (index % span)));
        for (let i = 0; i < count; i++) {
          const option = options[(index + i) % options.length];
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
          window.min ??
          this.defaultDateMin(max, defaultSpan, window.resolution);
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
   * How far back an unbounded `unique` date may reach, in steps at the window's
   * own resolution. Bounded by the calendar rather than by entity count: no
   * span wider than {@link UNIQUE_DATE_REACH_YEARS} stays a real date at year
   * resolution, so a year-resolution space is narrower than a numeric one by
   * necessity.
   */
  private uniqueDateHeadroom(resolution: DateResolution): number {
    if (resolution === 'year') return UNIQUE_DATE_REACH_YEARS;
    if (resolution === 'month') return UNIQUE_DATE_REACH_YEARS * 12;
    return Math.round(UNIQUE_DATE_REACH_YEARS * 365.25);
  }

  /**
   * The start of a date window the protocol left open: as far back as the
   * resolution allows, held at whatever the field itself offers. A `max`
   * already below that floor is a bound the protocol declared, and reaching
   * before it is then the only way to have a range at all.
   */
  private defaultDateMin(
    max: string,
    span: number,
    resolution: DateResolution,
  ): string {
    const reach = addSteps(max, -span, resolution);
    const floor = truncateToResolution(DATE_PICKER_DEFAULT_MIN, resolution);
    return reach < floor && floor <= max ? floor : reach;
  }

  /** Roughly a decade back, replacing the old faker.date.past() window. */
  private defaultDateSpan(resolution: DateResolution): number {
    if (resolution === 'year') return 40;
    if (resolution === 'month') return 480;
    return 3650;
  }
}
