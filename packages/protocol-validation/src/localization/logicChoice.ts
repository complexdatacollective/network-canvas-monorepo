import { dynamicValueNameFor } from '../schemas/9/dynamic-value-names.ts';
import {
  dynamicValueCaseOf,
  type DynamicValueVariable,
} from '../schemas/9/dynamic-values.ts';
import type { ContentNode, ContentNodes } from './contentDocument.ts';
import { pluralCategoryOf } from './dynamicValueMessages.ts';
import type { LocaleTag } from './localeTag.ts';
import { type Logic, logicVersions } from './logic.ts';

/**
 * A value as logic reads it: missing, or present with the value itself and,
 * for an attribute with options, the codebook variable whose options give
 * its case keys.
 */
export type LogicValue =
  | Readonly<{ missing: true }>
  | Readonly<{
      missing: false;
      value: unknown;
      variable?: Pick<DynamicValueVariable, 'options'>;
    }>;

/** What the interview, or a preview, knows when logic chooses a version. */
export type LogicInputs = Readonly<{
  /** Whether a condition is met; undefined is read as not met. */
  conditionMet: (conditionId: string) => boolean | undefined;
  /** A value by its name: `<role>_<variable id>`, `node_isParticipant`. */
  valueOf: (name: string) => LogicValue;
  /** The language of the text, whose plural rules a number is read by. */
  locale: LocaleTag;
}>;

const PARTICIPANT_NAME = dynamicValueNameFor({
  kind: 'participant',
  role: 'node',
});

/** The number a value is, or undefined when it is not one. */
const numberOf = (value: LogicValue): number | undefined => {
  if (value.missing) return undefined;
  const number = typeof value.value === 'number' ? value.value : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
};

/** The case key that a present value chooses among `keys`, if any. */
const caseOf = (
  value: LogicValue,
  keys: readonly string[],
): string | undefined =>
  value.missing
    ? undefined
    : dynamicValueCaseOf(value.value, value.variable, keys);

const isParticipant = (inputs: LogicInputs): boolean => {
  const value = inputs.valueOf(PARTICIPANT_NAME);
  return !value.missing && value.value === true;
};

const versionMatches = (
  when: 'met' | 'notMet',
  conditionId: string,
  inputs: LogicInputs,
): boolean => {
  const met = inputs.conditionMet(conditionId) === true;
  return when === 'met' ? met : !met;
};

/**
 * The version that logic shows: one version's content, or, for a number
 * written as one plural message (`NumberVersionsByMessage`), that message
 * and the number that it is formatted with.
 */
export type LogicChoice<T> =
  | Readonly<{ kind: 'version'; content: T }>
  | Readonly<{ kind: 'counted'; content: T; count: number }>;

/**
 * The version of `logic` that is shown:
 * - `conditions`: the first version whose condition result matches its
 *   `when`, else `otherwise`;
 * - `answers`: `missing` when the value is missing; else the version for the
 *   case the value chooses (`dynamicValueCaseOf`: for a categorical answer of
 *   several options, the first option in codebook order that has a
 *   version); else `other`;
 * - `number`: `missing` when the value is missing or not a number; else, for
 *   versions by plural category, the version for the number's category in
 *   the text's language, else `other`; for one plural message, that message
 *   with the number (`counted`);
 * - `participant`: `participant` when the node is the participant, else
 *   `otherwise`.
 */
export const chooseVersion = <T>(
  logic: Logic<T>,
  inputs: LogicInputs,
): LogicChoice<T> => {
  const version = (content: T): LogicChoice<T> => ({
    kind: 'version',
    content,
  });
  switch (logic.kind) {
    case 'conditions':
      return version(
        logic.versions.find(({ conditionId, when }) =>
          versionMatches(when, conditionId, inputs),
        )?.content ?? logic.otherwise,
      );
    case 'answers': {
      const value = inputs.valueOf(logic.value);
      if (value.missing) return version(logic.missing);
      const key = caseOf(
        value,
        logic.versions.map(({ caseKey }) => caseKey),
      );
      return version(
        logic.versions.find(({ caseKey }) => caseKey === key)?.content ??
          logic.other,
      );
    }
    case 'number': {
      const count = numberOf(inputs.valueOf(logic.value));
      if (count === undefined) return version(logic.missing);
      const { counted } = logic;
      if (counted.by === 'message') {
        return { kind: 'counted', content: counted.content, count };
      }
      const category = pluralCategoryOf(inputs.locale, count);
      return version(
        counted.versions.find((each) => each.category === category)?.content ??
          counted.other,
      );
    }
    case 'participant':
    default:
      return version(
        isParticipant(inputs) ? logic.participant : logic.otherwise,
      );
  }
};

/**
 * One block that a document shows (`shownContent`): a run of markdown or a
 * field, with `at`, its place in the document. `at` gives the block's index
 * and, for a block inside a logic block, the logic block's index, the index
 * of the version shown (in `logicVersions` order) and the block's index in
 * that version, and so on: so markdown in two versions of one logic block
 * is never taken for the same run, and a key built from `at` stays the same
 * while the same version is shown.
 */
export type ShownContentBlock = Readonly<{ at: readonly number[] }> &
  Extract<ContentNode, Readonly<{ kind: 'markdown' | 'field' }>>;

/**
 * The blocks that a document shows, in order, where logic reads `inputs`,
 * as one flat list: each logic block is replaced by the blocks of the
 * version that it chooses (`chooseVersion`), read in turn.
 */
export const shownContent = (
  nodes: ContentNodes,
  inputs: LogicInputs,
): ShownContentBlock[] => {
  const shown: ShownContentBlock[] = [];
  const visit = (level: ContentNodes, at: readonly number[]) => {
    level.forEach((node, index) => {
      const place = [...at, index];
      if (node.kind !== 'logic') {
        shown.push({ ...node, at: place });
        return;
      }
      const chosen = chooseVersion(node.logic, inputs).content;
      const version = logicVersions(node.logic).findIndex(
        ({ content }) => content === chosen,
      );
      visit(chosen, [...place, version]);
    });
  };
  visit(nodes, []);
  return shown;
};

/**
 * The fields a document shows, in order, where logic reads `inputs`: the
 * fields of the versions that its logic blocks choose (`shownContent`).
 */
export const shownFieldIds = (
  nodes: ContentNodes,
  inputs: LogicInputs,
): string[] =>
  shownContent(nodes, inputs).flatMap((block) =>
    block.kind === 'field' ? [block.fieldId] : [],
  );
