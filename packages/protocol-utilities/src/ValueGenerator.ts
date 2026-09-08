import { en, Faker } from '@faker-js/faker';

import type { VariableValue } from '@codaco/shared-consts';

import {
  addSteps,
  type DateResolution,
  openDateFloor,
  stepsBetween,
  todayYmd,
  truncateToResolution,
} from './generateNetwork/constraints/dateWindow.ts';
import type {
  ConstrainedVariable,
  VariableConstraints,
} from './generateNetwork/constraints/types.ts';
import {
  booleanDomainValues,
  categoricalSelectionAt,
  decimalGrid,
  decimalGridValueAt,
  distinctOptionValues,
  MAX_TEXT_DRAW_LENGTH,
  numberDrawBounds,
  SCALAR_DECIMAL_PLACES,
  SCALAR_DOMAIN,
  selectionSizeRange,
  TEXT_ALPHABET_SIZE,
  textDrawLength,
} from './generateNetwork/constraints/valueSpace.ts';
import type { VariableEntry } from './types.ts';

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

function fitsLength(value: string, constraints: VariableConstraints): boolean {
  const { minLength, maxLength } = constraints;
  return (
    (minLength === undefined || value.length >= minLength) &&
    (maxLength === undefined || value.length <= maxLength)
  );
}

function isNameVariable(entry: VariableEntry): boolean {
  // Mirrors the interview runtime's label resolution (getNodeLabelAttribute):
  // a variable named "name" — or containing it — is what a node displays, so
  // it is exactly the set that should draw realistic names.
  return /name/i.test(entry.name);
}

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

        const nameVariable = isNameVariable(entry) || opts?.forceRealisticName;
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
          // A redraw has to land somewhere the earlier draws did not, and a
          // fresh random float promises nothing of the kind: a `unique` number
          // in a fractional range used to spend its whole redraw budget
          // recolliding, and threw on a protocol `valueSpaceSize` had just
          // called wide enough. The sequence walks exactly the values that
          // count describes, in the order a `unique` slot consumes them.
          const grid = decimalGrid(lowerBound, upperBound);
          if (seq !== undefined) return decimalGridValueAt(grid, seq);

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

        // The same sequence a fractional number walks, for the same reason: a
        // scalar is drawn on the same grid with the same clamp, so a redraw
        // that went back to the random stream could recollide until the budget
        // ran out on a space `valueSpaceSize` had counted as wide enough.
        if (seq !== undefined) {
          return decimalGridValueAt(decimalGrid(min, max), seq);
        }

        if (max <= min) return min;
        // Round first: rounding a clamped value can push it back outside the
        // bound it was just brought inside.
        return clamp(
          Number(this.randomFloat(min, max).toFixed(SCALAR_DECIMAL_PLACES)),
          min,
          max,
        );
      }

      case 'boolean': {
        const values = booleanDomainValues(entry);
        if (values.length === 0) return undefined;
        const hasDefaultPair = values.includes(false) && values.includes(true);
        if (seq !== undefined && hasDefaultPair) return seq % 2 === 0;

        const randomBoolean =
          seq === undefined ? this.faker.datatype.boolean() : undefined;
        if (randomBoolean !== undefined && hasDefaultPair) return randomBoolean;

        const value = values[(seq ?? 0) % values.length];
        return value;
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

        const { min, max } = selectionSizeRange(variable);
        const span = Math.max(1, max - min + 1);
        const count = Math.max(min, Math.min(max, min + (index % span)));
        const picked: (number | string | boolean)[] = [];
        for (let i = 0; i < count; i++) {
          const value = values[(index + i) % values.length];
          if (value !== undefined) picked.push(value);
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
          window.min ?? openDateFloor(max, defaultSpan, window.resolution);
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
        return undefined;
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

  /** Roughly a decade back, replacing the old faker.date.past() window. */
  private defaultDateSpan(resolution: DateResolution): number {
    if (resolution === 'year') return 40;
    if (resolution === 'month') return 480;
    return 3650;
  }
}
