import {
  type LocaleTag,
  type PluralCategory,
  pluralCategoriesOf,
} from '@codaco/protocol-validation';

import type { DynamicValueChoice } from '../../localization/dynamicValueCatalog.ts';
import {
  answerBranches,
  conditionBranches,
  type LogicBlockMeta,
  type LogicBranch,
  logicBlockMetaOf,
  conditionVersionMetaOf,
  MISSING_VERSION,
  OTHERWISE_VERSION,
  numberBranches,
  participantBranches,
  type ConditionVersionMeta,
} from '../../localization/messageDocument.ts';
import {
  answerChoices,
  type LogicOption,
  numberChoices,
} from './logicOptions.ts';

/**
 * A logic block as its settings edit it: the logic, the condition versions of
 * an “If”, the attribute an answers or number block reads, and the answers that
 * have a branch of their own.
 */
export type LogicBlockState = Readonly<{
  option: LogicOption;
  conditionVersions: readonly ConditionVersionMeta[];
  value: string | undefined;
  answerKeys: readonly string[];
}>;

/** The settings of the block with `meta` and `branches`. */
export const logicBlockStateOf = (
  meta: unknown,
  branches: readonly Readonly<{ key: string; meta: unknown }>[],
): LogicBlockState => {
  const blockMeta: LogicBlockMeta = logicBlockMetaOf(meta) ?? {
    kind: 'participant',
  };
  switch (blockMeta.kind) {
    case 'conditions': {
      const conditionVersions = branches.flatMap((branch) => {
        const conditionVersion = conditionVersionMetaOf(branch.meta);
        return conditionVersion === undefined ? [] : [conditionVersion];
      });
      return {
        option: conditionVersions[0]?.when === 'notMet' ? 'ifNot' : 'if',
        conditionVersions,
        value: undefined,
        answerKeys: [],
      };
    }
    case 'answers':
      return {
        option: 'answers',
        conditionVersions: [],
        value: blockMeta.value,
        answerKeys: branches
          .map(({ key }) => key)
          .filter(
            (key) => key !== MISSING_VERSION && key !== OTHERWISE_VERSION,
          ),
      };
    case 'number':
      return {
        option: 'number',
        conditionVersions: [],
        value: blockMeta.value,
        answerKeys: [],
      };
    case 'participant':
    default:
      return {
        option: 'participant',
        conditionVersions: [],
        value: undefined,
        answerKeys: [],
      };
  }
};

/** The plural categories of `locale`, as a number block's branches use them. */
const categoriesOf = (locale: LocaleTag): PluralCategory[] => [
  ...pluralCategoriesOf(locale),
];

/** The logic that `state` is, as a logic block's `meta` records it. */
export const logicMetaOf = (state: LogicBlockState): LogicBlockMeta => {
  switch (state.option) {
    case 'if':
    case 'ifNot':
      return { kind: 'conditions' };
    case 'answers':
    case 'number':
      return { kind: state.option, value: state.value ?? '' };
    case 'participant':
    default:
      return { kind: 'participant' };
  }
};

/** The meta and branches that `state` is, in the language `locale`. */
export const logicBlockOf = (
  state: LogicBlockState,
  locale: LocaleTag,
): Readonly<{ meta: LogicBlockMeta; branches: LogicBranch[] }> => {
  const meta = logicMetaOf(state);
  switch (state.option) {
    case 'if':
    case 'ifNot':
      return { meta, branches: conditionBranches(state.conditionVersions) };
    case 'answers':
      return { meta, branches: answerBranches(state.answerKeys) };
    case 'number':
      return { meta, branches: numberBranches(categoriesOf(locale)) };
    case 'participant':
    default:
      return { meta, branches: participantBranches() };
  }
};

/**
 * The plural forms of `locale` that a number block's `branches` have no
 * version for, as a block written in another language and pasted here
 * lacks: Arabic has versions for zero, two, few and many, which English does
 * not.
 */
export const missingNumberCategories = (
  branches: readonly Readonly<{ key: string }>[],
  locale: LocaleTag,
): PluralCategory[] =>
  categoriesOf(locale).filter(
    (category) => !branches.some(({ key }) => key === category),
  );

/**
 * A number block's `branches` with a version for each plural form of
 * `locale`, in that language's order. A version that the block has for a
 * form that the language does not use is kept, before “Any other number”,
 * so that its content is not lost.
 */
export const numberBranchesIn = (
  branches: readonly Readonly<{ key: string; meta: unknown }>[],
  locale: LocaleTag,
): LogicBranch[] => {
  const wanted = numberBranches(categoriesOf(locale));
  // A number block's branches carry no meta of their own.
  const extra: LogicBranch[] = branches
    .filter(({ key }) => !wanted.some((branch) => branch.key === key))
    .map(({ key }) => ({ key, meta: null }));
  const other = wanted.at(-1);
  return other === undefined
    ? [...wanted, ...extra]
    : [...wanted.slice(0, -1), ...extra, other];
};

/** The case keys of the answers to the attribute `value`. */
export const caseKeysOf = (
  choices: readonly DynamicValueChoice[],
  value: string | undefined,
): string[] =>
  choices
    .find((choice) => choice.name === value)
    ?.options.map((option) => option.caseKey) ?? [];

/**
 * `state` with the logic `option`: the settings of a logic block, or of a
 * dynamic attribute, whose other parts are kept. `newRow` makes the first
 * condition version of an “If” where there is none (and writes its condition).
 * The condition versions of an “If” are kept between “If” and “If not” (the
 * first condition version's `when` follows the option), and the attribute
 * between two logics that read one of the same kind.
 */
export const logicBlockWithOption = <State extends LogicBlockState>(
  state: State,
  option: LogicOption,
  choices: readonly DynamicValueChoice[],
  newRow: (when: ConditionVersionMeta['when']) => ConditionVersionMeta,
): State => {
  const when = option === 'ifNot' ? 'notMet' : 'met';
  switch (option) {
    case 'if':
    case 'ifNot':
      return {
        ...state,
        option,
        conditionVersions:
          state.conditionVersions.length > 0
            ? state.conditionVersions.map((conditionVersion, index) =>
                index === 0 ? { ...conditionVersion, when } : conditionVersion,
              )
            : [newRow(when)],
      };
    case 'answers': {
      const offered = answerChoices(choices);
      const value = offered.some((choice) => choice.name === state.value)
        ? state.value
        : offered[0]?.name;
      return {
        ...state,
        option,
        value,
        answerKeys: caseKeysOf(choices, value),
      };
    }
    case 'number': {
      const offered = numberChoices(choices);
      const value = offered.some((choice) => choice.name === state.value)
        ? state.value
        : offered[0]?.name;
      return { ...state, option, value, answerKeys: [] };
    }
    case 'participant':
    default:
      return { ...state, option };
  }
};

/**
 * `state` reading the attribute `value`, with a version for each of its
 * answers: the settings of a logic block, or of a dynamic attribute.
 */
export const logicBlockWithValue = <State extends LogicBlockState>(
  state: State,
  value: string,
  choices: readonly DynamicValueChoice[],
): State => ({
  ...state,
  value,
  answerKeys: state.option === 'answers' ? caseKeysOf(choices, value) : [],
});
