import {
  createConditionId,
  type DynamicAttribute,
  dynamicAttributeOfLogic,
  type LocaleTag,
  type LocalizedString,
  type Logic,
  type LogicVersion,
  logicOfDynamicAttribute,
  logicVersions,
  type NumberVersionsByMessage,
} from '@codaco/protocol-validation';
import { isRecord } from '@codaco/shared-consts';

import {
  asConditionDraft,
  type ConditionDraft,
} from '../../localization/conditionText.ts';
import type { DynamicValueChoice } from '../../localization/dynamicValueCatalog.ts';
import {
  type ConditionVersionMeta,
  MISSING_VERSION,
  OTHERWISE_VERSION,
  PARTICIPANT_VERSION,
  conditionVersionKey,
} from '../../localization/messageDocument.ts';
import {
  type LogicBlockState,
  logicBlockWithOption,
} from './logicBlockModel.ts';
import type { LogicOption } from './logicOptions.ts';

/** The key of a `number` definition's one wording, a plural message. */
export const NUMBER_WORDING = 'number';

/**
 * A dynamic attribute as its controls edit it: its logic as a logic block's
 * settings edit it (`LogicBlockState`), the condition of each condition version
 * of an “If”, and each version's wording by its key (a condition version's
 * `conditionVersionKey`, `otherwise`, `missing`, an answer's case key, `other`,
 * `participant`, or `number`).
 */
export type DynamicAttributeDraft = LogicBlockState &
  Readonly<{
    conditions: Readonly<Record<string, ConditionDraft>>;
    wordings: Readonly<Record<string, LocalizedString>>;
  }>;

/** The logic of a dynamic attribute, whose versions are wording. */
type AttributeLogic = Logic<
  LocalizedString,
  NumberVersionsByMessage<LocalizedString>
>;

/** The key of a version's wording in a draft (see `DynamicAttributeDraft`). */
/** The key of a version in a draft (see `DynamicAttributeDraft`). */
export const draftVersionKeyOf = ({
  role,
  key,
}: Pick<LogicVersion<unknown>, 'role' | 'key'>): string => {
  switch (role) {
    case 'condition':
      return conditionVersionKey(key ?? '');
    case 'answer':
      return key ?? '';
    case 'missing':
      return MISSING_VERSION;
    case 'number':
      return NUMBER_WORDING;
    case 'participant':
      return PARTICIPANT_VERSION;
    case 'otherwise':
    case 'other':
    default:
      return OTHERWISE_VERSION;
  }
};

const EMPTY_WORDING: LocalizedString = {};

const wordingOf = (
  draft: DynamicAttributeDraft,
  key: string,
): LocalizedString => draft.wordings[key] ?? EMPTY_WORDING;

/** The logic the draft is, with each version's wording. */
const logicOfDraft = (draft: DynamicAttributeDraft): AttributeLogic => {
  switch (draft.option) {
    case 'if':
    case 'ifNot':
      return {
        kind: 'conditions',
        versions: draft.conditionVersions.map((conditionVersion) => ({
          ...conditionVersion,
          content: wordingOf(
            draft,
            conditionVersionKey(conditionVersion.conditionId),
          ),
        })),
        otherwise: wordingOf(draft, OTHERWISE_VERSION),
      };
    case 'answers':
      return {
        kind: 'answers',
        value: draft.value ?? '',
        missing: wordingOf(draft, MISSING_VERSION),
        versions: draft.answerKeys.map((caseKey) => ({
          caseKey,
          content: wordingOf(draft, caseKey),
        })),
        other: wordingOf(draft, OTHERWISE_VERSION),
      };
    case 'number':
      return {
        kind: 'number',
        value: draft.value ?? '',
        missing: wordingOf(draft, MISSING_VERSION),
        counted: { by: 'message', content: wordingOf(draft, NUMBER_WORDING) },
      };
    case 'participant':
    default:
      return {
        kind: 'participant',
        participant: wordingOf(draft, PARTICIPANT_VERSION),
        otherwise: wordingOf(draft, OTHERWISE_VERSION),
      };
  }
};

/** The keys of the draft's versions, in branch order (`logicVersions`). */
export const draftVersionKeys = (draft: DynamicAttributeDraft): string[] =>
  logicVersions(logicOfDraft(draft)).map(draftVersionKeyOf);

const asWording = (value: unknown): LocalizedString =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

/** The definition the draft is, as the stage stores it. */
export const dynamicAttributeOfDraft = (
  draft: DynamicAttributeDraft,
): DynamicAttribute => dynamicAttributeOfLogic(logicOfDraft(draft));

/**
 * The settings of a stored definition's logic, as a logic block's are edited.
 */
const stateOfLogic = (logic: AttributeLogic): LogicBlockState => {
  switch (logic.kind) {
    case 'conditions': {
      const conditionVersions = logic.versions.map(
        ({ conditionId, when }): ConditionVersionMeta => ({
          conditionId,
          when,
        }),
      );
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
        value: logic.value,
        answerKeys: logic.versions.map(({ caseKey }) => caseKey),
      };
    case 'number':
      return {
        option: 'number',
        conditionVersions: [],
        value: logic.value,
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

/**
 * The draft of a stored definition, with the conditions its condition versions
 * test read from the owner's `conditions`.
 */
export const draftOfDynamicAttribute = (
  dynamicAttribute: DynamicAttribute,
  conditions: Readonly<Record<string, unknown>>,
): DynamicAttributeDraft => {
  const logic = logicOfDynamicAttribute(dynamicAttribute);
  const state = stateOfLogic(logic);
  return {
    ...state,
    conditions: Object.fromEntries(
      state.conditionVersions.map((conditionVersion) => [
        conditionVersion.conditionId,
        asConditionDraft(
          Object.hasOwn(conditions, conditionVersion.conditionId)
            ? conditions[conditionVersion.conditionId]
            : undefined,
        ),
      ]),
    ),
    wordings: Object.fromEntries(
      logicVersions(logic).map((version) => [
        draftVersionKeyOf(version),
        asWording(version.content),
      ]),
    ),
  };
};

/**
 * A new condition version of an “If”, with a new condition that has no rules
 * yet.
 */
export const newConditionVersion = (
  when: ConditionVersionMeta['when'] = 'met',
): Readonly<{
  conditionVersion: ConditionVersionMeta;
  condition: ConditionDraft;
}> => ({
  conditionVersion: { conditionId: createConditionId(), when },
  condition: { rules: [] },
});

/**
 * `draft` with the logic `option` (`logicBlockWithOption`), and every wording
 * whose version is still there. A new first condition version of an “If” gets a
 * new condition, with no rules yet.
 */
export const draftWithOption = (
  draft: DynamicAttributeDraft,
  option: LogicOption,
  choices: readonly DynamicValueChoice[],
): DynamicAttributeDraft => {
  const added: Record<string, ConditionDraft> = {};
  const changed = logicBlockWithOption(draft, option, choices, (when) => {
    const { conditionVersion, condition } = newConditionVersion(when);
    added[conditionVersion.conditionId] = condition;
    return conditionVersion;
  });
  return Object.keys(added).length === 0
    ? changed
    : { ...changed, conditions: { ...changed.conditions, ...added } };
};

/** A new draft, with the first logic this place offers. */
export const newDraft = (
  option: LogicOption,
  choices: readonly DynamicValueChoice[],
): DynamicAttributeDraft =>
  draftWithOption(
    {
      option,
      conditionVersions: [],
      conditions: {},
      value: undefined,
      answerKeys: [],
      wordings: {},
    },
    option,
    choices,
  );

/**
 * `draft` with the wording of version `key` in `locale` set to `message`, or
 * without wording in `locale` for undefined. Empty wording is kept: the
 * version shows nothing in that language.
 */
export const draftWithWording = (
  draft: DynamicAttributeDraft,
  key: string,
  locale: LocaleTag,
  message: string | undefined,
): DynamicAttributeDraft => {
  const { [locale]: _replaced, ...others } = wordingOf(draft, key);
  return {
    ...draft,
    wordings: {
      ...draft.wordings,
      [key]: message === undefined ? others : { ...others, [locale]: message },
    },
  };
};

/**
 * `draft` with empty wording in `locale` for each version that has none
 * there yet: what a new dynamic attribute is created with, so that a version
 * left empty shows nothing rather than waiting to be written.
 */
export const draftWithEveryVersionIn = (
  draft: DynamicAttributeDraft,
  locale: LocaleTag,
): DynamicAttributeDraft =>
  draftVersionKeys(draft).reduce(
    (written, key) =>
      written.wordings[key]?.[locale] === undefined
        ? draftWithWording(written, key, locale, '')
        : written,
    draft,
  );
