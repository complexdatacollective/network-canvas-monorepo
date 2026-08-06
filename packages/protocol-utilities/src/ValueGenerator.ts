import type { Faker } from '@faker-js/faker';

import type { Variable } from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import {
  addSteps,
  type DateResolution,
  openDateFloor,
  stepsBetween,
  todayYmd,
  truncateToResolution,
} from './generateNetwork/constraints/dateWindow';
import type {
  ConstrainedVariable,
  VariableConstraints,
} from './generateNetwork/constraints/types';
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
} from './generateNetwork/constraints/valueSpace';
import {
  sampleContinuous,
  sampleWeightedIndex,
  sampleWithoutReplacement,
} from './generateNetwork/plan/distributions';
import {
  createRandomSource,
  type RandomSource,
  type RandomStream,
} from './generateNetwork/plan/random';
import {
  type ResolvedVariableSynthetic,
  resolveVariableSynthetic,
} from './generateNetwork/plan/resolveSynthetic';
import type { VariableEntry } from './types';

const DISTINCT_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * How far back an unbounded `unique` datetime may reach. A reach expressed in
 * steps rather than years underflows past year 0 at month or year resolution,
 * where `addSteps` emits a malformed bound that reparses as year 0.
 */
const UNIQUE_DATE_REACH_YEARS = 1000;

/** Days per step at each date resolution, for sdDays → step conversion. */
const DAYS_PER_STEP: Record<DateResolution, number> = {
  full: 1,
  month: 30.44,
  year: 365.25,
};

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

function clamp(value: number, min?: number, max?: number): number {
  let result = value;
  if (max !== undefined) result = Math.min(result, max);
  if (min !== undefined) result = Math.max(result, min);
  return result;
}

/**
 * Draws values that are both rule-satisfying and distribution-shaped.
 *
 * Free draws sample the variable's resolved `synthetic` descriptor (declared
 * metadata or documented defaults) from a semantic substream owned by that
 * variable, so an unrelated variable or entity can never perturb another's
 * sequence. Sequence draws (`distinctSeq`) keep the exhaustive value-space
 * walks the `unique` machinery depends on — realism yields to satisfiability
 * exactly where it always has.
 */
export class ValueGenerator {
  private readonly source: RandomSource;
  private readonly today: string;
  private readonly resolved = new Map<string, ResolvedVariableSynthetic>();

  constructor(seed: number, today: string = todayYmd()) {
    this.source = createRandomSource(seed);
    this.today = today;
  }

  /**
   * The run's semantic stream source, shared with the planner so every
   * consumer draws from one memoised stream per path.
   */
  get randomSource(): RandomSource {
    return this.source;
  }

  /** Stream for draws not owned by one variable (shuffles, legacy helpers). */
  private general(): RandomStream {
    return this.source.stream('general');
  }

  private streamFor(entry: VariableEntry): RandomStream {
    return this.source.stream('variable', entry.id);
  }

  /**
   * Resolution is memoised per variable id: one run resolves each variable
   * once, and the Architect-facing resolver stays the single source of what
   * defaults apply.
   */
  private resolvedFor(entry: VariableEntry): ResolvedVariableSynthetic {
    const cached = this.resolved.get(entry.id);
    if (cached) return cached;
    // A VariableEntry mirrors the codebook variable's synthetic-relevant
    // fields (type, name, options, validation, synthetic) structurally;
    // resolution reads nothing else.
    const resolved = resolveVariableSynthetic(entry as unknown as Variable);
    this.resolved.set(entry.id, resolved);
    return resolved;
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
    return this.source.stream('names').faker().person.firstName();
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
    return this.source.stream('labels').faker().word.words(2);
  }

  randomInt(min: number, max: number): number {
    return this.general().int(min, max);
  }

  randomFloat(min: number, max: number): number {
    return this.general().float(min, max);
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
    const firstName = source.person.firstName();
    if (fitsLength(firstName, constraints)) return firstName;
    if (
      constraints.maxLength !== undefined &&
      firstName.length > constraints.maxLength
    ) {
      return undefined;
    }

    const lastName = source.person.lastName();
    const firstAndLast = `${firstName} ${lastName}`;
    if (fitsLength(firstAndLast, constraints)) return firstAndLast;
    if (
      constraints.maxLength !== undefined &&
      firstAndLast.length > constraints.maxLength
    ) {
      return undefined;
    }

    const fullName = `${firstName} ${source.person.middleName()} ${lastName}`;
    return fitsLength(fullName, constraints) ? fullName : undefined;
  }

  /**
   * One curated-generator draw, fitted to the field's length rules. Only
   * `personName` can conclude that no fitting value exists (its compositions
   * have a shortest form); every other recipe truncates or pads.
   */
  private generateText(
    generator: ResolvedVariableSynthetic & { kind: 'text' },
    constraints: VariableConstraints,
    faker: Faker,
  ): string | undefined {
    switch (generator.generator) {
      case 'personName':
        return this.generateConstrainedName(constraints, faker);
      case 'firstName':
        return fitToLength(faker.person.firstName(), constraints);
      case 'lastName':
        return fitToLength(faker.person.lastName(), constraints);
      case 'placeName':
        return fitToLength(faker.location.city(), constraints);
      case 'organisationName':
        return fitToLength(faker.company.name(), constraints);
      case 'occupation':
        return fitToLength(faker.person.jobTitle(), constraints);
      case 'email':
        return fitToLength(faker.internet.email(), constraints);
      case 'phoneNumber':
        return fitToLength(faker.phone.number(), constraints);
      case 'streetAddress':
        return fitToLength(faker.location.streetAddress(), constraints);
      case 'sentence':
        return fitToLength(faker.lorem.sentence(), constraints);
      case 'paragraph':
        return fitToLength(faker.lorem.paragraph(), constraints);
      case 'neutralWords':
        return fitToLength(
          faker.word.words({ count: { min: 1, max: 3 } }),
          constraints,
        );
    }
  }

  generateConstrained(
    variable: ConstrainedVariable,
    index: number,
    opts?: {
      distinctSeq?: number;
      preferRealisticName?: boolean;
      forceRealisticName?: boolean;
    },
  ): VariableValue {
    const { entry, constraints } = variable;
    const seq = opts?.distinctSeq;
    const stream = this.streamFor(entry);

    switch (entry.type) {
      case 'text': {
        // Belt to `analyseFeasibility`'s refusal, and the last point before a
        // string of the declared length is allocated. `fitToLength` pads to
        // `minLength` on both paths below, so a floor past the cap is where
        // the hundreds of megabytes — or the `RangeError` — would come from.
        if (
          constraints.minLength !== undefined &&
          constraints.minLength > MAX_TEXT_DRAW_LENGTH
        ) {
          throw new Error(
            `"${entry.name}" declares minLength ${constraints.minLength}, beyond the ${MAX_TEXT_DRAW_LENGTH} characters a generated value can hold.`,
          );
        }

        // A caller can insist on a person's name for a variable the codebook
        // gives no generator and the name heuristic does not recognise — a
        // family pedigree's name field is a person's name whatever it is
        // called — so this overrides the resolved generator rather than
        // deferring to it.
        if (opts?.forceRealisticName === true) {
          const name = this.generateConstrainedName(constraints, stream.faker());
          if (name !== undefined) return name;
        }

        // A first attempt tries the realistic recipe even when a distinct
        // sequence number is supplied: the caller verifies uniqueness and
        // retries, so realism only yields to the exhaustive walk once a
        // recipe draw has actually collided.
        const resolved = this.resolvedFor(entry);
        if (
          resolved.kind === 'text' &&
          (seq === undefined || opts?.preferRealisticName === true)
        ) {
          const value = this.generateText(
            resolved,
            constraints,
            stream.faker(),
          );
          if (value !== undefined) return value;
        }

        return fitToLength(
          distinctText(seq ?? index, textDrawLength(constraints)),
          constraints,
        );
      }

      case 'number': {
        const { min: lowerBound, max: upperBound } =
          numberDrawBounds(constraints);
        const min = Math.ceil(lowerBound);
        const max = Math.floor(upperBound);

        const resolved = this.resolvedFor(entry);
        const descriptor =
          resolved.kind === 'number'
            ? resolved.descriptor
            : ({
                distribution: 'uniform',
                min: lowerBound,
                max: upperBound,
              } as const);

        // A range such as [10.5, 10.7] holds no integer. The schema does not
        // require number values to be whole, so draw inside the declared range
        // rather than emitting the nearest integer outside it.
        if (max < min) {
          // The sequence walks exactly the values `valueSpaceSize` counts, in
          // the order a `unique` slot consumes them.
          const grid = decimalGrid(lowerBound, upperBound);
          if (seq !== undefined) return decimalGridValueAt(grid, seq);

          if (upperBound <= lowerBound) return lowerBound;
          return clamp(
            Number(
              sampleContinuous(
                descriptor,
                { min: lowerBound, max: upperBound },
                stream,
              ).toFixed(SCALAR_DECIMAL_PLACES),
            ),
            lowerBound,
            upperBound,
          );
        }

        if (seq !== undefined) return min + (seq % (max - min + 1));
        // Whole values wherever the window admits them, matching how real
        // participants answer integer controls; the distribution shapes which
        // whole value is likely.
        return clamp(
          Math.round(
            sampleContinuous(
              descriptor,
              { min: lowerBound, max: upperBound },
              stream,
            ),
          ),
          min,
          max,
        );
      }

      case 'scalar': {
        // These bounds are the normalised scale narrowed by whatever
        // comparison rules reached this draw, so they are folded back into
        // it: no scalar value the interview can collect lies outside.
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

        if (seq !== undefined) {
          return decimalGridValueAt(decimalGrid(min, max), seq);
        }

        if (max <= min) return min;
        const resolved = this.resolvedFor(entry);
        const descriptor =
          resolved.kind === 'scalar'
            ? resolved.descriptor
            : ({ distribution: 'uniform' } as const);
        // Round first: rounding a clamped value can push it back outside the
        // bound it was just brought inside.
        return clamp(
          Number(
            sampleContinuous(descriptor, { min, max }, stream).toFixed(
              SCALAR_DECIMAL_PLACES,
            ),
          ),
          min,
          max,
        );
      }

      case 'boolean': {
        const values = booleanDomainValues(entry);
        if (values.length === 0) return null;
        const hasDefaultPair = values.includes(false) && values.includes(true);
        if (seq !== undefined && hasDefaultPair) return seq % 2 === 0;

        if (seq === undefined && hasDefaultPair) {
          const resolved = this.resolvedFor(entry);
          const probabilityTrue =
            resolved.kind === 'boolean' ? resolved.probabilityTrue : 0.5;
          return stream.bool(probabilityTrue);
        }

        const value = values[(seq ?? 0) % values.length];
        return value ?? null;
      }

      case 'ordinal': {
        // Walked over the values the options offer rather than over the
        // options themselves — an imported list can write one value under
        // many labels, and a `unique` walk must meet each value once.
        const values = distinctOptionValues(entry);
        if (values.length === 0) return null;
        if (seq !== undefined) return values[seq % values.length] ?? null;

        const resolved = this.resolvedFor(entry);
        if (resolved.kind === 'ordinal' && resolved.values.length > 0) {
          return (
            resolved.values[sampleWeightedIndex(resolved.weights, stream)] ??
            null
          );
        }
        return values[index % values.length] ?? null;
      }

      case 'categorical': {
        const values = distinctOptionValues(entry);
        if (values.length === 0) return null;

        // A distinct value has to be reachable for every selection the value
        // space counts, so a sequence number indexes the combination space
        // itself.
        if (seq !== undefined) {
          return [...new Set(categoricalSelectionAt(variable, seq))];
        }

        const { min, max } = selectionSizeRange(variable);
        const resolved = this.resolvedFor(entry);
        if (resolved.kind === 'categorical') {
          // The resolved table already respects the variable's own
          // validation; the constraint window can only be narrower (e.g. a
          // composer rendering), so illegal counts are dropped here.
          const legal = resolved.selectionCounts.filter(
            (entry_) => entry_.count >= min && entry_.count <= max,
          );
          const count =
            legal.length > 0
              ? (legal[
                  sampleWeightedIndex(
                    legal.map((entry_) => entry_.probability),
                    stream,
                  )
                ]?.count ?? min)
              : min;
          const picked = sampleWithoutReplacement(
            resolved.values,
            resolved.weights,
            count,
            stream,
          );
          // A count above the positively-weighted pool (possible only under a
          // narrowed constraint window) pads from the remaining values —
          // satisfying `minSelected` outranks weight fidelity.
          for (const value of resolved.values) {
            if (picked.length >= count) break;
            if (!picked.includes(value)) picked.push(value);
          }
          return picked;
        }

        const span = Math.max(1, max - min + 1);
        const count = Math.max(min, Math.min(max, min + (index % span)));
        return values.slice(0, count);
      }

      case 'datetime': {
        const window = constraints.dateWindow ?? {
          resolution: 'full' as const,
        };
        const resolution = window.resolution;
        let max = window.max ?? truncateToResolution(this.today, resolution);
        const defaultSpan = constraints.unique
          ? this.uniqueDateHeadroom(resolution)
          : this.defaultDateSpan(resolution);
        let min = window.min ?? openDateFloor(max, defaultSpan, resolution);

        const resolved = this.resolvedFor(entry);
        const descriptor =
          resolved.kind === 'datetime'
            ? resolved.descriptor
            : ({ distribution: 'uniform' } as const);

        // Narrow the effective window by the descriptor's own bounds (same
        // resolution, so lexicographic comparison is date order). A
        // descriptor window disjoint from the effective one is ignored:
        // validation stays authoritative and the metadata is target-only.
        if ('min' in descriptor && descriptor.min !== undefined) {
          const narrowed = descriptor.min > min ? descriptor.min : min;
          if (narrowed <= max) min = narrowed;
        }
        if ('max' in descriptor && descriptor.max !== undefined) {
          const narrowed = descriptor.max < max ? descriptor.max : max;
          if (narrowed >= min) max = narrowed;
        }

        const span = Math.max(0, stepsBetween(min, max, resolution));
        if (seq !== undefined) {
          return addSteps(min, seq % (span + 1), resolution);
        }

        if (descriptor.distribution === 'normal') {
          const meanStep = clamp(
            stepsBetween(
              min,
              truncateToResolution(descriptor.mean, resolution),
              resolution,
            ),
            0,
            span,
          );
          const sdSteps = descriptor.sdDays / DAYS_PER_STEP[resolution];
          const offset = clamp(
            Math.round(stream.normal(meanStep, sdSteps)),
            0,
            span,
          );
          return addSteps(min, offset, resolution);
        }

        return addSteps(min, stream.int(0, span), resolution);
      }

      case 'layout':
        return {
          x: 0.1 + ((index * 0.17) % 0.8),
          y: 0.1 + ((index * 0.23) % 0.8),
        };

      case 'location': {
        const faker = stream.faker();
        return {
          x: faker.location.longitude(),
          y: faker.location.latitude(),
        };
      }

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

  /** Roughly a decade back, replacing the old faker.date.past() window. */
  private defaultDateSpan(resolution: DateResolution): number {
    if (resolution === 'year') return 40;
    if (resolution === 'month') return 480;
    return 3650;
  }
}
