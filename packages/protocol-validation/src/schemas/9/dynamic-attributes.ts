import { z } from 'zod';

import { dynamicValueNamesIn } from '../../localization/dynamicValueMessages.ts';
import {
  type Logic,
  logicValueNames,
  logicVersions,
  type LogicVersionRole,
  type NumberVersionsByMessage,
} from '../../localization/logic.ts';
import type { MessageArguments } from '../../localization/messageArguments.ts';
import { parseDynamicValueName } from './dynamic-value-names.ts';
import {
  emptyOrNonBlankText,
  heldTranslations,
  localizedString,
  type LocalizedString,
} from './localized-string.ts';
import {
  createProtocolObjectId,
  type ProtocolObjectId,
} from './protocol-object-id.ts';

/**
 * A dynamic attribute: a value that text shows in a sentence, whose wording
 * is chosen by logic. "Ask {their / her / his} doctor" is one dynamic
 * attribute, which shows "her" when the participant's gender is "Woman".
 *
 * Text names one as `dynamic_<id>` (see `dynamicValueNameFor`). A dynamic
 * attribute belongs to the stage whose text uses it (`stage.dynamicAttributes`),
 * or to the node type label that uses it (`dynamicLabel.dynamicAttributes`).
 * Its logic is the same in every language; each version's wording is a
 * translatable string, which each language translates.
 */

/**
 * The wording of one version: a few words on one line, written as any other
 * one line of text is (markdown, so bold and italics, and the values its
 * owner's text can show, including other dynamic attributes). An empty
 * version shows nothing (a mark shown only for some answers, say). Which
 * values it shows, and that no dynamic attribute shows itself through it, is
 * checked against its owner (`findDynamicAttributeProblems`).
 */
const versionWording = () =>
  localizedString(
    emptyOrNonBlankText(),
    { format: 'markdown', lines: 'single' },
    { dynamicValues: 'dynamicAttribute' },
  );

/**
 * The name, in number wording, of the number that it is worded for.
 */
export const NUMBER_WORDING_COUNT = 'count';

/**
 * What number wording may use besides the values that other wording shows:
 * the number it is worded for, as a plural whose versions may be empty.
 */
export const NUMBER_WORDING_ARGUMENTS: MessageArguments = {
  [NUMBER_WORDING_COUNT]: { kind: 'plural', emptyVersions: true },
};

/**
 * The wording for a number, with a version for each plural category that the
 * language has (`{count, plural, one {# child} other {# children}}`), each
 * written as other wording is (`versionWording`). The wording, or the
 * version of any plural category, may be empty, and then shows nothing.
 */
const numberWording = () =>
  localizedString(
    emptyOrNonBlankText(),
    { format: 'markdown', lines: 'single' },
    { dynamicValues: 'dynamicAttribute', arguments: NUMBER_WORDING_ARGUMENTS },
  );

const DYNAMIC_VALUE_NAME = 'dynamicValueName' as const;

/**
 * The name of a value that text can show (`<role>_<variable id>`), stored
 * outside any text: what a dynamic attribute's logic reads. Marked, so that
 * the walkers that find the attributes that a protocol uses find it (see
 * `schemaReferenceWalk.ts`).
 */
const dynamicValueNameReference = () =>
  z.string().meta({ [DYNAMIC_VALUE_NAME]: true });

/** Whether this schema node is a `dynamicValueNameReference`. */
export const isDynamicValueNameReference = (schema: z.ZodType): boolean =>
  schema.meta()?.[DYNAMIC_VALUE_NAME] === true;

/**
 * The stored shape of a dynamic attribute, with each version's wording
 * written by `wording`, a number's plural message by `pluralWording`, and
 * the condition id of a condition's version by `conditionId`.
 */
const dynamicAttributeSchemaWith = <
  Wording extends z.ZodType,
  NumberWording extends z.ZodType,
>({
  wording,
  pluralWording,
  conditionId,
}: Readonly<{
  wording: () => Wording;
  pluralWording: () => NumberWording;
  conditionId: () => z.ZodType<string>;
}>) =>
  z.discriminatedUnion('logic', [
    /** A wording for each condition, in order, and one for when none is met. */
    z.strictObject({
      logic: z.literal('conditions'),
      cases: z
        .array(
          z.strictObject({
            /** The id of a condition of the owner (its `conditions`). */
            condition: conditionId(),
            when: z.enum(['met', 'notMet']),
            wording: wording(),
          }),
        )
        .min(1),
      otherwise: wording(),
    }),
    /**
     * A wording for each answer of a categorical, ordinal or Boolean
     * attribute, one for when it has no answer, and one for any other answer.
     */
    z.strictObject({
      logic: z.literal('answers'),
      value: dynamicValueNameReference(),
      missing: wording(),
      answers: z.array(
        z.strictObject({
          /** An option's case key (`optionCaseKey`), `true` or `false`. */
          answer: z.string(),
          wording: wording(),
        }),
      ),
      other: wording(),
    }),
    /** The wording for a number, by its plural category. */
    z.strictObject({
      logic: z.literal('number'),
      value: dynamicValueNameReference(),
      missing: wording(),
      wording: pluralWording(),
    }),
    /** A wording for the participant, and one for anyone else. */
    z.strictObject({
      logic: z.literal('participant'),
      participant: wording(),
      otherwise: wording(),
    }),
  ]);

export const DynamicAttributeSchema = dynamicAttributeSchemaWith({
  wording: versionWording,
  pluralWording: numberWording,
  conditionId: () => z.uuid(),
});

export type DynamicAttribute = z.infer<typeof DynamicAttributeSchema>;

/**
 * Dynamic attributes by id. Declared with its type written out, as
 * `Conditions` is: every stage schema contains it.
 */
export type DynamicAttributes = Record<string, DynamicAttribute>;

export const DynamicAttributesSchema: z.ZodType<DynamicAttributes> = z.record(
  z.uuid(),
  DynamicAttributeSchema,
  {
    error: (issue) =>
      issue.code === 'invalid_key'
        ? `The dynamic attribute id ${JSON.stringify(issue.input)} is not a UUID. Every dynamic attribute id must be a UUID.`
        : undefined,
  },
);

/** A new, random dynamic attribute id, for a dynamic attribute being created. */
export const createDynamicAttributeId = (): ProtocolObjectId =>
  createProtocolObjectId();

/** Wording that may be anything, or not written yet. */
const anyWording = () =>
  z
    .unknown()
    .optional()
    .transform((wording): unknown => wording);

/**
 * A dynamic attribute whose wording is read as anything, and whose
 * conditions are named by any id: its logic, as a dynamic attribute that is
 * still being written has it.
 */
const DynamicAttributeLogicSchema = dynamicAttributeSchemaWith({
  wording: () => anyWording(),
  pluralWording: () => anyWording(),
  conditionId: () => z.string(),
});

type Path = readonly (string | number)[];

/** A stored dynamic attribute whose wording, and number wording, are `W`. */
type StoredDynamicAttribute<W> = z.infer<
  ReturnType<typeof dynamicAttributeSchemaWith<z.ZodType<W>, z.ZodType<W>>>
>;

/**
 * Where a version is stored, from the dynamic attribute: its wording, and,
 * for a
 * condition's or an answer's version, what chooses it (the condition id or
 * the case key).
 */
type VersionPlace = Readonly<{ path: Path; keyPath?: Path }>;

/**
 * A stored dynamic attribute as `Logic`, each version given by `version`
 * from its stored wording and its place. A number's versions are its one
 * plural message. Every view of a stored dynamic attribute's logic is built
 * here
 * (`logicOfDynamicAttribute`, `readDynamicAttributeLogic`,
 * `dynamicAttributeVersions`); `dynamicAttributeOfLogic` writes it back.
 */
const logicOfStored = <W, V>(
  dynamicAttribute: StoredDynamicAttribute<W>,
  version: (wording: W, place: VersionPlace) => V,
): Logic<V, NumberVersionsByMessage<V>> => {
  switch (dynamicAttribute.logic) {
    case 'conditions':
      return {
        kind: 'conditions',
        versions: dynamicAttribute.cases.map((entry, index) => ({
          conditionId: entry.condition,
          when: entry.when,
          content: version(entry.wording, {
            path: ['cases', index, 'wording'],
            keyPath: ['cases', index, 'condition'],
          }),
        })),
        otherwise: version(dynamicAttribute.otherwise, { path: ['otherwise'] }),
      };
    case 'answers':
      return {
        kind: 'answers',
        value: dynamicAttribute.value,
        missing: version(dynamicAttribute.missing, { path: ['missing'] }),
        versions: dynamicAttribute.answers.map((entry, index) => ({
          caseKey: entry.answer,
          content: version(entry.wording, {
            path: ['answers', index, 'wording'],
            keyPath: ['answers', index, 'answer'],
          }),
        })),
        other: version(dynamicAttribute.other, { path: ['other'] }),
      };
    case 'number':
      return {
        kind: 'number',
        value: dynamicAttribute.value,
        missing: version(dynamicAttribute.missing, { path: ['missing'] }),
        counted: {
          by: 'message',
          content: version(dynamicAttribute.wording, { path: ['wording'] }),
        },
      };
    case 'participant':
    default:
      return {
        kind: 'participant',
        participant: version(dynamicAttribute.participant, {
          path: ['participant'],
        }),
        otherwise: version(dynamicAttribute.otherwise, { path: ['otherwise'] }),
      };
  }
};

/** The logic of a dynamic attribute (see `Logic`), whose versions are wording. */
export const logicOfDynamicAttribute = (
  dynamicAttribute: DynamicAttribute,
): Logic<LocalizedString, NumberVersionsByMessage<LocalizedString>> =>
  logicOfStored(dynamicAttribute, (wording) => wording);

/**
 * The dynamic attribute that `logic` is, as an owner stores it: the inverse
 * of
 * `logicOfDynamicAttribute`.
 */
export const dynamicAttributeOfLogic = (
  logic: Logic<LocalizedString, NumberVersionsByMessage<LocalizedString>>,
): DynamicAttribute => {
  switch (logic.kind) {
    case 'conditions':
      return {
        logic: 'conditions',
        cases: logic.versions.map(({ conditionId, when, content }) => ({
          condition: conditionId,
          when,
          wording: content,
        })),
        otherwise: logic.otherwise,
      };
    case 'answers':
      return {
        logic: 'answers',
        value: logic.value,
        missing: logic.missing,
        answers: logic.versions.map(({ caseKey, content }) => ({
          answer: caseKey,
          wording: content,
        })),
        other: logic.other,
      };
    case 'number':
      return {
        logic: 'number',
        value: logic.value,
        missing: logic.missing,
        wording: logic.counted.content,
      };
    case 'participant':
    default:
      return {
        logic: 'participant',
        participant: logic.participant,
        otherwise: logic.otherwise,
      };
  }
};

/**
 * The logic of `value` read leniently, as a dynamic attribute that is still
 * being written has it: its wording may be anything, and is not read.
 * Undefined when `value` is not a dynamic attribute's logic.
 */
export const readDynamicAttributeLogic = (
  value: unknown,
): Logic<unknown> | undefined => {
  const parsed = DynamicAttributeLogicSchema.safeParse(value);
  return parsed.success
    ? logicOfStored(parsed.data, (wording) => wording)
    : undefined;
};

export type DynamicAttributeVersion = Readonly<{
  /** The path of its wording, from the dynamic attribute. */
  path: Path;
  /**
   * The path of what chooses it, from the dynamic attribute: a condition
   * version's
   * condition id, or an answer version's case key.
   */
  keyPath?: Path;
  role: LogicVersionRole;
  /** A condition version's condition id, or an answer version's case key. */
  key?: string;
  /** Its wording. */
  wording: LocalizedString;
}>;

/**
 * Every version of a dynamic attribute, in the order of its versions
 * (`logicVersions`): what a pill that shows the dynamic attribute lists, and
 * what the translation table names. A condition's versions come before
 * "Otherwise"; an answer's versions are "If not known", each answer, then
 * "Any other answer".
 */
export const dynamicAttributeVersions = (
  dynamicAttribute: DynamicAttribute,
): readonly DynamicAttributeVersion[] =>
  logicVersions(
    logicOfStored(dynamicAttribute, (wording, place) => ({
      ...place,
      wording,
    })),
  ).map(({ role, key, content }) => ({
    ...content,
    role,
    ...(key !== undefined && { key }),
  }));

/**
 * Every value name that the wording of a dynamic attribute's versions shows,
 * in any language, each once: attributes, other dynamic attributes and the
 * rest. The number that number wording is worded for is not a value.
 * `definition` is read leniently, as a dynamic attribute that is still being
 * written has it; one that is not a dynamic attribute shows none.
 */
export const dynamicAttributeWordingNames = (
  definition: unknown,
): readonly string[] => {
  const logic = readDynamicAttributeLogic(definition);
  if (logic === undefined) return [];
  const names = new Set<string>();
  for (const { role, content } of logicVersions(logic)) {
    for (const message of Object.values(heldTranslations(content))) {
      for (const name of dynamicValueNamesIn(message)) {
        if (role === 'number' && name === NUMBER_WORDING_COUNT) continue;
        names.add(name);
      }
    }
  }
  return [...names];
};

/**
 * Every value name that a dynamic attribute reads, each once: what its logic
 * chooses a version by (`logicValueNames`), then what its versions' wording
 * shows (`dynamicAttributeWordingNames`). Read leniently.
 */
export const dynamicAttributeValueNames = (
  definition: unknown,
): readonly string[] => {
  const logic = readDynamicAttributeLogic(definition);
  return [
    ...new Set([
      ...(logic === undefined ? [] : logicValueNames(logic)),
      ...dynamicAttributeWordingNames(definition),
    ]),
  ];
};

type Definitions = Readonly<Record<string, unknown>>;

/** The ids of the dynamic attributes that `names` name, in order. */
const dynamicAttributeIdsIn = (names: readonly string[]): string[] =>
  names.flatMap((name) => {
    const parsed = parseDynamicValueName(name);
    return parsed?.kind === 'dynamicAttribute' ? [parsed.id] : [];
  });

/**
 * The dynamic attributes of `definitions` that the wording of the dynamic
 * attribute `id` shows, directly or through the wording of the ones it
 * shows, each once. Includes `id` itself when it shows itself, directly or
 * through others. One that `definitions` lacks is left out.
 */
export const dynamicAttributesShownBy = (
  id: string,
  definitions: Definitions,
): ReadonlySet<string> => {
  const shown = new Set<string>();
  const pending = [id];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === undefined || !Object.hasOwn(definitions, next)) continue;
    for (const shownId of dynamicAttributeIdsIn(
      dynamicAttributeWordingNames(definitions[next]),
    )) {
      if (shown.has(shownId) || !Object.hasOwn(definitions, shownId)) {
        continue;
      }
      shown.add(shownId);
      pending.push(shownId);
    }
  }
  return shown;
};

/**
 * Whether the wording of the dynamic attribute `id` may show the dynamic
 * attribute `candidate`: not itself, and not one that shows it, directly or
 * through others, which would never finish showing. What the Attribute menu
 * of a version's wording offers.
 */
export const dynamicAttributeMayShow = (
  id: string,
  candidate: string,
  definitions: Definitions,
): boolean =>
  candidate !== id && !dynamicAttributesShownBy(candidate, definitions).has(id);

/**
 * Every value name that the dynamic attributes named in `names` read, through
 * their logic and their wording and through the dynamic attributes their
 * wording shows, each once, with none of the dynamic attributes' own names:
 * what a text that shows them needs to be read. A dynamic attribute that
 * `definitions` lacks reads nothing.
 */
export const valueNamesReadThrough = (
  names: readonly string[],
  definitions: Definitions,
): readonly string[] => {
  const read = new Set<string>();
  const visited = new Set<string>();
  const pending = [...names];
  while (pending.length > 0) {
    const name = pending.shift();
    if (name === undefined) continue;
    const parsed = parseDynamicValueName(name);
    if (parsed?.kind !== 'dynamicAttribute') {
      read.add(name);
      continue;
    }
    if (visited.has(parsed.id) || !Object.hasOwn(definitions, parsed.id)) {
      continue;
    }
    visited.add(parsed.id);
    pending.push(...dynamicAttributeValueNames(definitions[parsed.id]));
  }
  return [...read];
};
