import { en, Faker } from '@faker-js/faker';

import type { VariableValue } from '@codaco/shared-consts';

import {
  addSteps,
  stepsBetween,
} from './generateNetwork/constraints/dateWindow';
import type {
  ConstrainedVariable,
  VariableConstraints,
} from './generateNetwork/constraints/types';
import { TEXT_ALPHABET_SIZE } from './generateNetwork/constraints/valueSpace';
import type { VariableEntry } from './types';

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
    encoded = DISTINCT_ALPHABET[remaining % TEXT_ALPHABET_SIZE]! + encoded;
    remaining = Math.floor(remaining / TEXT_ALPHABET_SIZE);
  } while (remaining > 0);

  if (encoded.length >= length) return encoded.slice(-length);
  return DISTINCT_ALPHABET[0]!.repeat(length - encoded.length) + encoded;
}

function fitToLength(value: string, constraints: VariableConstraints): string {
  const { minLength, maxLength } = constraints;
  let result = value;
  if (maxLength !== undefined && result.length > maxLength) {
    result = result.slice(0, maxLength);
  }
  if (minLength !== undefined && result.length < minLength) {
    result = result.padEnd(minLength, DISTINCT_ALPHABET[0]!);
  }
  return result;
}

export class ValueGenerator {
  private faker: Faker;

  constructor(seed: number) {
    this.faker = new Faker({ locale: [en] });
    this.faker.seed(seed);
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
          const length =
            constraints.minLength ?? Math.min(constraints.maxLength ?? 12, 12);
          return fitToLength(distinctText(seq, length), constraints);
        }
        return fitToLength(this.faker.person.firstName(), constraints);
      }

      case 'number': {
        const min = Math.ceil(constraints.minValue ?? 18);
        // The default [18, 80] range is far too small to hold a unique value
        // per entity, and valueSpaceSize calls an unbounded number
        // "unbounded" — so a unique variable widens the range to make that
        // claim true. A non-unique variable keeps the realistic default.
        const defaultMax = constraints.unique ? min + this.uniqueHeadroom : 80;
        const max = Math.floor(
          constraints.maxValue ?? Math.max(min, defaultMax),
        );
        if (seq !== undefined) return min + (seq % Math.max(1, max - min + 1));
        return this.randomInt(min, max);
      }

      case 'scalar': {
        const min = constraints.minValue ?? 0;
        const max = constraints.maxValue ?? 1;
        if (max <= min) return min;
        return Number(this.randomFloat(min, max).toFixed(2));
      }

      case 'boolean':
        return seq !== undefined
          ? seq % 2 === 0
          : this.faker.datatype.boolean();

      case 'ordinal': {
        const options = entry.options ?? [];
        if (options.length === 0) return null;
        const pick = seq ?? index;
        return options[pick % options.length]!.value;
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
          picked.push(options[(base + i) % options.length]!.value);
        }
        return [...new Set(picked)];
      }

      case 'datetime': {
        const window = constraints.dateWindow ?? {
          resolution: 'full' as const,
        };
        const max = window.max ?? this.defaultDateMax(window.resolution);
        const defaultSpan = constraints.unique
          ? this.uniqueHeadroom
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

    if (entry.type === 'datetime') {
      const window = constraints.dateWindow ?? { resolution: 'full' as const };
      const base = String(target);
      const step = inclusive ? 0 : 1;
      const candidate = addSteps(
        base,
        wantsGreater ? step : -step,
        window.resolution,
      );
      if (wantsGreater && window.max !== undefined && candidate > window.max) {
        return window.max;
      }
      if (!wantsGreater && window.min !== undefined && candidate < window.min) {
        return window.min;
      }
      return candidate;
    }

    const numericTarget = Number(target);
    if (Number.isNaN(numericTarget)) {
      return this.generateConstrained(variable, 0);
    }

    const step = entry.type === 'scalar' ? 0.01 : 1;
    const delta = inclusive ? 0 : step;
    let candidate = wantsGreater
      ? numericTarget + delta
      : numericTarget - delta;

    if (constraints.maxValue !== undefined) {
      candidate = Math.min(candidate, constraints.maxValue);
    }
    if (constraints.minValue !== undefined) {
      candidate = Math.max(candidate, constraints.minValue);
    }

    return entry.type === 'scalar'
      ? Number(candidate.toFixed(2))
      : Math.round(candidate);
  }

  /**
   * How far an unbounded `unique` variable may range beyond its default
   * window. Set well above the largest entity count generation can reach so
   * the value space the feasibility pass calls "unbounded" really is.
   */
  private readonly uniqueHeadroom = 100_000;

  /** Roughly a decade back, replacing the old faker.date.past() window. */
  private defaultDateSpan(resolution: 'full' | 'month' | 'year'): number {
    if (resolution === 'year') return 40;
    if (resolution === 'month') return 480;
    return 3650;
  }

  private defaultDateMax(resolution: 'full' | 'month' | 'year'): string {
    const now = new Date();
    const ymd = `${String(now.getUTCFullYear()).padStart(4, '0')}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    if (resolution === 'year') return ymd.slice(0, 4);
    if (resolution === 'month') return ymd.slice(0, 7);
    return ymd;
  }
}
