import { isRecord, valueAtPath } from '@codaco/shared-consts';

import { localesShowingDynamicAttribute } from '../../localization/dynamicAttributeLocales.ts';
import { dynamicValueNamesIn } from '../../localization/dynamicValueMessages.ts';
import { getLocaleMetadata } from '../../localization/localeMetadata.ts';
import type { Logic } from '../../localization/logic.ts';
import { resolveLocalizedString } from '../../localization/resolveLocalizedString.ts';
import { ownTextNames } from '../../utils/ownTextNames.ts';
import { textOwnersOf } from '../../utils/textOwners.ts';
import { isOwnTextOf, textPlaceOf } from '../../utils/textPlace.ts';
import {
  DynamicAttributeSchema,
  dynamicAttributesShownBy,
  type DynamicAttributeVersion,
  dynamicAttributeVersions,
  logicOfDynamicAttribute,
} from './dynamic-attributes.ts';
import {
  dynamicValueNameFor,
  parseDynamicValueName,
} from './dynamic-value-names.ts';
import { stageDynamicValueContext } from './dynamic-value-validation.ts';
import {
  CASED_VARIABLE_TYPES,
  type DynamicValueSiteContext,
  dynamicValueStatus,
  NUMERIC_VARIABLE_TYPES,
} from './dynamic-values.ts';
import { nodeLabelValueContext } from './node-label.ts';

type Path = (string | number)[];

type DynamicAttributeProblem = Readonly<{
  path: Path;
  message: string;
  /**
   * What a host may need to explain the problem in its own words: for a
   * version without wording (`VERSION_WITHOUT_WORDING`), the rule and the
   * language that needs the wording.
   */
  params?: Readonly<{ rule: string; locale: string }>;
}>;

/**
 * The rule that a version's wording is in each language in which the
 * dynamic attribute is shown, or in the language that it falls back to, as
 * the issue of a version without it carries the rule.
 */
export const VERSION_WITHOUT_WORDING = 'versionWithoutWording';

type TextHit = Readonly<{
  path: Path;
  value: Readonly<Record<string, string>>;
}>;

/** A stage or a node type's label, which declares dynamic attributes. */
type Owner = Readonly<{
  path: Path;
  /** How a problem names the owner: "on this stage", "in this label". */
  where: string;
  conditions: unknown;
  dynamicAttributes: Readonly<Record<string, unknown>>;
  context: DynamicValueSiteContext;
}>;

const ownersOf = (
  protocol: Readonly<{ codebook: unknown; stages: readonly unknown[] }>,
): Owner[] =>
  textOwnersOf(protocol).flatMap((path): Owner[] => {
    const owner = valueAtPath(protocol, path);
    if (!isRecord(owner) || !isRecord(owner.dynamicAttributes)) return [];
    if (path[0] === 'stages') {
      return [
        {
          path: [...path],
          where: 'on this stage',
          conditions: owner.conditions,
          dynamicAttributes: owner.dynamicAttributes,
          context: stageDynamicValueContext({
            codebook: protocol.codebook,
            stage: owner,
          }),
        },
      ];
    }
    return [
      {
        path: [...path],
        where: 'in this label',
        conditions: owner.conditions,
        dynamicAttributes: owner.dynamicAttributes,
        context: nodeLabelValueContext({
          codebook: protocol.codebook,
          nodeType: path[2],
          conditions: owner.conditions,
          dynamicAttributes: owner.dynamicAttributes,
        }),
      },
    ];
  });

/** A protocol's languages, when it declares them as the schema requires. */
const localizationOf = (
  localization:
    | Readonly<{ defaultLocale?: unknown; locales?: unknown }>
    | undefined,
) => {
  const defaultLocale = localization?.defaultLocale;
  const locales = localization?.locales;
  if (typeof defaultLocale !== 'string' || !Array.isArray(locales)) {
    return undefined;
  }
  return {
    defaultLocale,
    locales: locales.filter(
      (locale): locale is string => typeof locale === 'string',
    ),
  };
};

/** The English name of a language, or its tag when it has none. */
const languageName = (locale: string): string => {
  try {
    return getLocaleMetadata(locale, 'en').label;
  } catch {
    return locale;
  }
};

/**
 * The problems with the value whose answers or number a dynamic attribute
 * reads. `versions` are the dynamic attribute's (`dynamicAttributeVersions`).
 */
const valueProblems = (
  logic: Extract<Logic<unknown>, { kind: 'answers' | 'number' }>,
  versions: readonly DynamicAttributeVersion[],
  context: DynamicValueSiteContext,
  path: Path,
): DynamicAttributeProblem[] => {
  const parsed = parseDynamicValueName(logic.value);
  const wanted =
    logic.kind === 'answers'
      ? 'Only a categorical, ordinal or Boolean attribute can have a different wording for each answer.'
      : 'Only a number or scalar attribute can have wording for singular or plural numbers.';
  if (parsed?.kind !== 'attribute') {
    return [{ path: [...path, 'value'], message: wanted }];
  }
  const status = dynamicValueStatus(parsed, context, [], logic.value);
  // A value that the owner's text cannot read is reported where the text
  // shows the dynamic attribute.
  if (status.status === 'unknown') {
    return [
      {
        path: [...path, 'value'],
        message: `This dynamic attribute ${status.problem}.`,
      },
    ];
  }
  if (status.status !== 'available') return [];
  const variables = context.variablesFor(parsed.role);
  const type =
    variables !== undefined && Object.hasOwn(variables, parsed.variableId)
      ? variables[parsed.variableId]?.type
      : undefined;
  const types =
    logic.kind === 'answers' ? CASED_VARIABLE_TYPES : NUMERIC_VARIABLE_TYPES;
  if (type === undefined || !types.has(type)) {
    return [{ path: [...path, 'value'], message: wanted }];
  }
  if (logic.kind !== 'answers') return [];
  const problems: DynamicAttributeProblem[] = [];
  const seen = new Set<string>();
  for (const { role, key: answer, keyPath } of versions) {
    if (role !== 'answer' || answer === undefined || keyPath === undefined)
      continue;
    const answerPath = [...path, ...keyPath];
    if (seen.has(answer)) {
      problems.push({
        path: answerPath,
        message: 'This answer already has a version.',
      });
    }
    seen.add(answer);
    const own = dynamicValueStatus(parsed, context, [answer], logic.value);
    if (own.status !== 'available') {
      problems.push({
        path: answerPath,
        message:
          'This version is for an answer that the attribute does not have.',
      });
    }
  }
  return problems;
};

const SHOWS_ITSELF =
  'A dynamic attribute cannot show itself. Remove it from the wording of its own version.';
const SHOWS_ITSELF_THROUGH =
  'This wording shows a dynamic attribute whose wording shows this dynamic attribute. A dynamic attribute cannot show itself, either directly or through another dynamic attribute.';

/**
 * The versions of the dynamic attribute `id` whose wording shows it again,
 * in each language: itself, or a dynamic attribute of its owner whose
 * wording shows it, directly or through others (`dynamicAttributesShownBy`).
 * Such wording could never finish being shown.
 */
const showsItselfProblems = (
  id: string,
  versions: readonly DynamicAttributeVersion[],
  definitions: Readonly<Record<string, unknown>>,
  path: Path,
): DynamicAttributeProblem[] =>
  versions.flatMap((version) =>
    Object.entries(version.wording).flatMap(
      ([locale, message]): DynamicAttributeProblem[] => {
        const shown = dynamicValueNamesIn(message).flatMap((name) => {
          const parsed = parseDynamicValueName(name);
          return parsed?.kind === 'dynamicAttribute' ? [parsed.id] : [];
        });
        const shownProblem = shown.includes(id)
          ? SHOWS_ITSELF
          : shown.some((other) =>
                dynamicAttributesShownBy(other, definitions).has(id),
              )
            ? SHOWS_ITSELF_THROUGH
            : undefined;
        return shownProblem === undefined
          ? []
          : [
              {
                path: [...path, ...version.path, locale],
                message: shownProblem,
              },
            ];
      },
    ),
  );

/**
 * Every problem with the dynamic attributes of the protocol's stages and node
 * type labels:
 * - each is shown by at least one text of its owner, in some language;
 * - a `conditions` dynamic attribute's cases name conditions of its owner;
 * - an `answers` dynamic attribute reads a categorical, ordinal or Boolean
 *   attribute, and each of its answers is one of the attribute's, once;
 * - a `number` dynamic attribute reads a number or scalar attribute;
 * - no version's wording shows the dynamic attribute itself, directly or
 *   through the wording of other dynamic attributes;
 * - in each language in which a text of its owner shows it
 *   (`localesShowingDynamicAttribute`), each version has wording, or wording
 *   in the language that language falls back to (`resolveLocalizedString`).
 *   An empty version (`""`) is written, and shows nothing; a language with
 *   no key has not been written yet. A version written in no language at all
 *   is reported in every language that shows it. A language in which no
 *   text shows it needs no wording for it.
 *
 * Whether the values that a dynamic attribute reads can be read where it is
 * shown is checked with each text that shows it (`dynamicValueStatus`,
 * through `findDynamicValueProblems`). `hits` are the protocol's localized strings
 * (`collectLocalizedStrings`).
 */
export const findDynamicAttributeProblems = (
  protocol: Readonly<{
    codebook: unknown;
    stages: readonly unknown[];
    localization?: Readonly<{ defaultLocale?: unknown; locales?: unknown }>;
  }>,
  hits: readonly TextHit[],
): DynamicAttributeProblem[] => {
  const problems: DynamicAttributeProblem[] = [];
  const localization = localizationOf(protocol.localization);
  const placed = hits.map((hit) => ({ ...hit, place: textPlaceOf(hit.path) }));
  for (const owner of ownersOf(protocol)) {
    const ownTexts = placed.filter((hit) => isOwnTextOf(hit.place, owner.path));
    const names = ownTextNames(ownTexts, owner.path, owner.dynamicAttributes);
    for (const [id, raw] of Object.entries(owner.dynamicAttributes)) {
      const path = [...owner.path, 'dynamicAttributes', id];
      // A dynamic attribute that the schema refuses is reported by the schema.
      const parsed = DynamicAttributeSchema.safeParse(raw);
      if (!parsed.success) continue;
      const logic = logicOfDynamicAttribute(parsed.data);
      const versions = dynamicAttributeVersions(parsed.data);

      if (!names.has(dynamicValueNameFor({ kind: 'dynamicAttribute', id }))) {
        problems.push({
          path,
          message: `This dynamic attribute is not used anywhere ${owner.where}.`,
        });
      }

      for (const { role, key: conditionId, keyPath } of versions) {
        if (
          role === 'condition' &&
          conditionId !== undefined &&
          keyPath !== undefined &&
          valueAtPath(owner.conditions, [conditionId]) === undefined
        ) {
          problems.push({
            path: [...path, ...keyPath],
            message: 'The rules that choose this version no longer exist.',
          });
        }
      }
      if (logic.kind === 'answers' || logic.kind === 'number') {
        problems.push(...valueProblems(logic, versions, owner.context, path));
      }
      problems.push(
        ...showsItselfProblems(id, versions, owner.dynamicAttributes, path),
      );

      if (localization === undefined) continue;
      const shownIn = localesShowingDynamicAttribute(
        dynamicValueNameFor({ kind: 'dynamicAttribute', id }),
        ownTexts,
        protocol,
        localization,
        owner.dynamicAttributes,
      );
      for (const version of versions) {
        const { wording } = version;
        if (!isRecord(wording)) continue;
        const messages: Record<string, string> = {};
        for (const locale of localization.locales) {
          const message = wording[locale];
          if (typeof message === 'string') messages[locale] = message;
        }
        // A version with no wording in any of the protocol's languages (`{}`)
        // was never written, and no language can fall back to it: it is
        // reported in every language that shows the dynamic attribute. The
        // schema alone accepts it, and so does the stage's schema, which
        // hosts check a stage with; the protocol's check of text without
        // translations leaves it to this one (`findEmptyTextPaths`).
        const written = Object.keys(messages).length > 0;
        for (const locale of shownIn) {
          // Wording in the language, or in the language it falls back to.
          if (
            written &&
            resolveLocalizedString(messages, localization, [locale])
              .matchedBy !== 'any'
          ) {
            continue;
          }
          problems.push({
            path: [...path, ...version.path, locale],
            message: `Write this version in ${languageName(locale)}.`,
            params: { rule: VERSION_WITHOUT_WORDING, locale },
          });
        }
      }
    }
  }
  return problems;
};
