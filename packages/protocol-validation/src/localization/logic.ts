import {
  dynamicValueNameFor,
  TRUE_CASE,
} from '../schemas/9/dynamic-value-names.ts';
import type { PluralCategory } from './messageArguments.ts';

/**
 * Logic: what chooses which one of several versions is shown. A logic block
 * and a dynamic attribute are the same four kinds of logic; they differ only
 * in what a version is, which is `T`: a document for a logic block
 * (`ContentLogic`), wording for a dynamic attribute
 * (`logicOfDynamicAttribute`).
 *
 * The one choice between versions is `chooseVersion`; what logic reads is
 * `logicReads`; its versions, in the order they are written, are
 * `logicVersions`.
 */
export type Logic<T, Counted extends NumberVersions<T> = NumberVersions<T>> =
  /**
   * The version of the first condition whose result matches its `when`;
   * `otherwise` when none does.
   */
  | Readonly<{
      kind: 'conditions';
      versions: readonly ConditionVersion<T>[];
      otherwise: T;
    }>
  /**
   * A version for each answer of a categorical, ordinal or Boolean
   * attribute, by case key (`optionCaseKey`, `true`, `false`); `missing` for
   * no answer; `other` for any other answer.
   */
  | Readonly<{
      kind: 'answers';
      value: string;
      missing: T;
      versions: readonly AnswerVersion<T>[];
      other: T;
    }>
  /** The versions for a number (`NumberVersions`); `missing` for none. */
  | Readonly<{ kind: 'number'; value: string; missing: T; counted: Counted }>
  /** One version for the participant, and one for anyone else. */
  | Readonly<{ kind: 'participant'; participant: T; otherwise: T }>;

/** A version chosen by a condition: met, or (`notMet`) not met. */
export type ConditionVersion<T> = Readonly<{
  conditionId: string;
  when: 'met' | 'notMet';
  content: T;
}>;

/** A version chosen by one answer, named by its case key. */
type AnswerVersion<T> = Readonly<{ caseKey: string; content: T }>;

/** A version chosen by a number's plural category in the text's language. */
type NumberVersion<T> = Readonly<{
  category: PluralCategory;
  content: T;
}>;

/**
 * The versions of a number, in one of two forms:
 * - `category`: a version for each plural category, and `other` for any
 *   other number. A logic block is written this way, in its language.
 * - `message`: one message, a plural that the number is formatted with
 *   (`{count, plural, one {# child} other {# children}}`). A dynamic
 *   attribute is written this way, because its logic is the same in every
 *   language and each language has plural categories of its own.
 */
type NumberVersions<T> =
  | NumberVersionsByCategory<T>
  | NumberVersionsByMessage<T>;

export type NumberVersionsByCategory<T> = Readonly<{
  by: 'category';
  versions: readonly NumberVersion<T>[];
  other: T;
}>;

export type NumberVersionsByMessage<T> = Readonly<{
  by: 'message';
  content: T;
}>;

/** What a version is shown for. */
export type LogicVersionRole =
  | 'condition'
  | 'otherwise'
  | 'missing'
  | 'answer'
  | 'other'
  | 'number'
  | 'participant';

export type LogicVersion<T> = Readonly<{
  role: LogicVersionRole;
  /**
   * A condition version's condition id, an answer version's case key, or a
   * number version's plural category.
   */
  key?: string;
  content: T;
}>;

/**
 * Every version of `logic`, in the order they are written: a condition's
 * versions before `otherwise`; `missing`, each answer, then `other`;
 * `missing`, then the number's versions, `other` last; the participant's
 * version, then anyone else's.
 */
export const logicVersions = <T>(
  logic: Logic<T>,
): readonly LogicVersion<T>[] => {
  switch (logic.kind) {
    case 'conditions':
      return [
        ...logic.versions.map(({ conditionId, content }): LogicVersion<T> => ({
          role: 'condition',
          key: conditionId,
          content,
        })),
        { role: 'otherwise', content: logic.otherwise },
      ];
    case 'answers':
      return [
        { role: 'missing', content: logic.missing },
        ...logic.versions.map(({ caseKey, content }): LogicVersion<T> => ({
          role: 'answer',
          key: caseKey,
          content,
        })),
        { role: 'other', content: logic.other },
      ];
    case 'number':
      return [
        { role: 'missing', content: logic.missing },
        ...(logic.counted.by === 'message'
          ? [{ role: 'number' as const, content: logic.counted.content }]
          : [
              ...logic.counted.versions.map(
                ({ category, content }): LogicVersion<T> => ({
                  role: 'number',
                  key: category,
                  content,
                }),
              ),
              { role: 'other' as const, content: logic.counted.other },
            ]),
      ];
    case 'participant':
    default:
      return [
        { role: 'participant', content: logic.participant },
        { role: 'otherwise', content: logic.otherwise },
      ];
  }
};

/** A value that logic chooses by, with the case keys it gives a version for. */
type LogicValueRead = Readonly<{
  name: string;
  caseKeys: readonly string[];
}>;

/**
 * What logic reads: the conditions its versions test, each once, in order;
 * and the values it chooses by besides those: the attribute whose answers
 * (with the case keys it gives a version, each once) or number it reads, or
 * whether the node is the participant.
 */
type LogicReads = Readonly<{
  conditionIds: readonly string[];
  values: readonly LogicValueRead[];
}>;

const PARTICIPANT_NAME = dynamicValueNameFor({
  kind: 'participant',
  role: 'node',
});

/** What `logic` reads (see `LogicReads`). */
export const logicReads = (logic: Logic<unknown>): LogicReads => {
  switch (logic.kind) {
    case 'conditions':
      return {
        conditionIds: [
          ...new Set(logic.versions.map(({ conditionId }) => conditionId)),
        ],
        values: [],
      };
    case 'answers':
      return {
        conditionIds: [],
        values: [
          {
            name: logic.value,
            caseKeys: [
              ...new Set(logic.versions.map(({ caseKey }) => caseKey)),
            ],
          },
        ],
      };
    case 'number':
      return {
        conditionIds: [],
        values: [{ name: logic.value, caseKeys: [] }],
      };
    case 'participant':
    default:
      return {
        conditionIds: [],
        values: [{ name: PARTICIPANT_NAME, caseKeys: [TRUE_CASE] }],
      };
  }
};

/**
 * Every value name that `logic` reads (`logicReads`): its conditions'
 * (`condition_<id>`), then its values'. For the walkers that follow what a
 * text reads through the dynamic attributes it shows.
 */
export const logicValueNames = (logic: Logic<unknown>): readonly string[] => {
  const { conditionIds, values } = logicReads(logic);
  return [
    ...conditionIds.map((conditionId) =>
      dynamicValueNameFor({ kind: 'condition', conditionId }),
    ),
    ...values.map(({ name }) => name),
  ];
};
