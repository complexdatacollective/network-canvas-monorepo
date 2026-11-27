import {
  type Conditions,
  type DynamicValueRole,
  type IntrinsicDynamicValue,
  type LocaleTag,
  type LogicInputs,
  type LogicValue,
  type ParsedDynamicValuePath,
  parseDynamicValueName,
  type Variable,
} from '@codaco/protocol-validation';
import { isUnanswered, readOwnProperty } from '@codaco/shared-consts';

import { type ConditionSubjects, conditionHolds } from './conditions.ts';

/**
 * What logic can read at one place in an interview, or about one synthetic
 * participant: the attributes of each entity on screen by role, with the
 * codebook variables that describe them, the values that the interview itself
 * knows, the label of each node on screen, and the conditions that logic can
 * choose by, with what they are asked of (see `ConditionSubjects`).
 *
 * A role with no attributes or label is not on screen, so a value about it
 * reads as missing; so does anything that a caller does not supply.
 */
export type LogicSources = ConditionSubjects &
  Readonly<{
    intrinsics?: Readonly<Partial<Record<IntrinsicDynamicValue, unknown>>>;
    labels?: Readonly<Partial<Record<DynamicValueRole, string>>>;
    /**
     * Whether each node on screen that may be the participant is (see
     * `node_isParticipant`); a role without an entry reads as missing.
     */
    participants?: Readonly<Partial<Record<DynamicValueRole, boolean>>>;
    /** The conditions that logic can choose by, by id. */
    conditions?: Conditions | undefined;
    /**
     * Conditions already judged, by id, for a caller that judges them itself
     * (a node's label, which follows each one closely). A condition without
     * an entry is judged from `conditions`.
     */
    conditionFacts?: Readonly<Record<string, boolean>>;
    variablesFor?: (
      role: DynamicValueRole,
    ) => Readonly<Record<string, Variable>> | undefined;
  }>;

/**
 * A value as it is read: missing, or present, with the raw value and what it
 * is (the codebook variable of an attribute; the intrinsic of a value that
 * the interview knows).
 */
export type DynamicValueReading =
  | Readonly<{ missing: true }>
  | Readonly<{
      missing: false;
      value: unknown;
      variable?: Variable;
      intrinsic?: IntrinsicDynamicValue;
    }>;

const MISSING: DynamicValueReading = { missing: true };

/**
 * Whether a condition is met: as judged by the caller, else as its rules find
 * what `sources` describes. Undefined for a condition that is not declared.
 */
export const conditionMet = (
  conditionId: string,
  sources: LogicSources,
): boolean | undefined => {
  const judged =
    sources.conditionFacts === undefined
      ? undefined
      : readOwnProperty(sources.conditionFacts, conditionId);
  if (judged !== undefined) return judged;
  const condition =
    sources.conditions === undefined
      ? undefined
      : readOwnProperty(sources.conditions, conditionId);
  return condition === undefined
    ? undefined
    : conditionHolds(condition, sources);
};

/**
 * The value that a name stands for, in `sources`. A value is missing when it
 * is unanswered (`isUnanswered`: null, undefined, text of only spaces, NaN and
 * an empty list; 0 and false are answers), when it is about a role that is not
 * on screen, and when it names a condition that is not declared. A dynamic
 * attribute is wording, which only text shows; read it where its wording is
 * known.
 */
export const readDynamicValue = (
  parsed: Exclude<ParsedDynamicValuePath, { kind: 'dynamicAttribute' }>,
  sources: LogicSources,
): DynamicValueReading => {
  switch (parsed.kind) {
    case 'intrinsic': {
      const value = sources.intrinsics?.[parsed.name];
      return isUnanswered(value)
        ? MISSING
        : { missing: false, value, intrinsic: parsed.name };
    }
    case 'label': {
      // A node on screen always has a label, and its text is shown as the
      // node shows it, even when that is only spaces.
      const label = sources.labels?.[parsed.role];
      return label === undefined ? MISSING : { missing: false, value: label };
    }
    case 'participant': {
      const isParticipant = sources.participants?.[parsed.role];
      return isParticipant === undefined
        ? MISSING
        : { missing: false, value: isParticipant };
    }
    case 'condition': {
      const met = conditionMet(parsed.conditionId, sources);
      return met === undefined ? MISSING : { missing: false, value: met };
    }
    case 'attribute':
    default: {
      // An entity's attributes can be keyed by a roster column's heading as
      // well as by variable ids, so only an own value counts.
      const attributes = sources.attributes[parsed.role];
      const value =
        attributes === undefined
          ? undefined
          : readOwnProperty(attributes, parsed.variableId);
      if (isUnanswered(value)) return MISSING;
      const variables = sources.variablesFor?.(parsed.role);
      const variable =
        variables === undefined
          ? undefined
          : readOwnProperty(variables, parsed.variableId);
      return {
        missing: false,
        value,
        ...(variable !== undefined && { variable }),
      };
    }
  }
};

/**
 * What logic reads in `sources` (a logic block's or a dynamic attribute's):
 * each condition as `conditionMet` finds it, and each value as
 * `readDynamicValue` reads it, so that a value that is missing in text is
 * missing to logic too. A dynamic attribute is wording, which logic never
 * reads. The interview and synthetic data both read logic through here.
 */
export const logicInputsFor = (
  sources: LogicSources,
  locale: LocaleTag,
): LogicInputs => ({
  conditionMet: (conditionId) => conditionMet(conditionId, sources),
  valueOf: (name): LogicValue => {
    const parsed = parseDynamicValueName(name);
    if (parsed === undefined || parsed.kind === 'dynamicAttribute') {
      return MISSING;
    }
    const read = readDynamicValue(parsed, sources);
    if (read.missing) return MISSING;
    const { variable } = read;
    return {
      missing: false,
      value: read.value,
      ...(variable !== undefined && 'options' in variable && { variable }),
    };
  },
  locale,
});
