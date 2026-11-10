import type { LocalizedString } from '../schemas/9/localized-string.ts';
import { findDuplicateDiseaseLabels } from '../schemas/9/stages/narrative-pedigree.ts';
import type { CurrentProtocol } from '../schemas/index.ts';
import { findDuplicateOptionLabels } from './duplicateLabels.ts';
import type { LocaleTag, LocalizationDeclaration } from './localeTag.ts';
import { messageText } from './messageSyntax.ts';

/**
 * The rules some participant-facing texts are held to beyond their own
 * declaration: rules that compare a text with its neighbours, or that the
 * editors apply while a protocol is being written. Each is defined once, and
 * every place a researcher can edit the text asks it: the stage or codebook
 * editor that owns the text, and Architect's translation table, which reads
 * them all through `findFieldTextProblems`.
 *
 * Label uniqueness, for diseases and for options, is part of the protocol
 * schema (`findDuplicateLocalizedLabels`). The stage name's length and the
 * interview text's default language are not, so a protocol that breaks them
 * is still valid; the editors refuse to write one.
 */

/** A rule in this module, as `findFieldTextProblems` names it. */
export type FieldTextRule =
  /** Two diseases a participant would read the same way (schema rule). */
  | 'duplicateDiseaseLabel'
  /**
   * Two options of one attribute a participant would read the same way
   * (schema rule).
   */
  | 'duplicateOptionLabel'
  /** A stage name longer than the editors let one be written. */
  | 'stageLabelTooLong'
  /** Interview text with no words in the protocol's default language. */
  | 'interfaceTextWithoutDefaultLanguage';

export type FieldTextProblem = Readonly<{
  rule: FieldTextRule;
  /** The text's path in the protocol, as `collectLocalizedStrings` gives it. */
  path: readonly (string | number)[];
  /** The language a participant reads the problem in. */
  locale: LocaleTag;
}>;

const isLocalizedString = (value: unknown): value is LocalizedString =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((text) => typeof text === 'string');

/**
 * The most characters a stage's name may have in any language, as the editors
 * let it be typed. A name is shown in narrow places, such as the timeline and
 * the interview's stage menu.
 *
 * Not a schema rule: a protocol holding a longer name is valid.
 */
export const STAGE_LABEL_MAX_LENGTH = 50;

/** Whether `message`, as a stage's name in one language, is too long. */
export const isStageLabelTooLong = (message: string): boolean =>
  messageText(message).length > STAGE_LABEL_MAX_LENGTH;

/**
 * Whether interview text the protocol holds has no words in its default
 * language. Every one needs them while the protocol is being written, so the
 * interview's own words always have a text to fall back to. The schema allows
 * it of a protocol being written, and requires it only of one leaving its
 * editor where Network Canvas has no wording to supply.
 */
export const lacksDefaultLanguageText = (
  value: LocalizedString,
  defaultLocale: LocaleTag,
): boolean => (value[defaultLocale] ?? '').trim() === '';

type Variables = Readonly<Record<string, unknown>> | undefined;

const variableProblems = (
  variables: Variables,
  at: readonly (string | number)[],
  localization: LocalizationDeclaration,
): FieldTextProblem[] =>
  Object.entries(variables ?? {}).flatMap(
    ([id, variable]): FieldTextProblem[] => {
      if (typeof variable !== 'object' || variable === null) return [];
      const options: unknown = Reflect.get(variable, 'options');
      return findDuplicateOptionLabels(options, localization).flatMap(
        (duplicate) =>
          [duplicate.firstIndex, duplicate.index].map((index) => ({
            rule: 'duplicateOptionLabel' as const,
            path: [...at, 'variables', id, 'options', index, 'label'],
            locale: duplicate.locale,
          })),
      );
    },
  );

/**
 * Every place a protocol breaks one of the rules in this module, by the text
 * and the language. Both texts of a pair that read the same are named, so a
 * place editing either can say so.
 */
export const findFieldTextProblems = (
  protocol: CurrentProtocol,
): FieldTextProblem[] => {
  const { localization, codebook } = protocol;
  const problems: FieldTextProblem[] = [];

  protocol.stages.forEach((stage, stageIndex) => {
    for (const [locale, message] of Object.entries(stage.label)) {
      if (isStageLabelTooLong(message)) {
        problems.push({
          rule: 'stageLabelTooLong',
          path: ['stages', stageIndex, 'label'],
          locale,
        });
      }
    }
    if (stage.type !== 'NarrativePedigree') return;
    const labelPath = (index: number) => [
      'stages',
      stageIndex,
      'diseases',
      index,
      'label',
    ];
    for (const duplicate of findDuplicateDiseaseLabels(
      stage.diseases,
      localization,
    )) {
      for (const index of [duplicate.firstIndex, duplicate.index]) {
        problems.push({
          rule: 'duplicateDiseaseLabel',
          path: labelPath(index),
          locale: duplicate.locale,
        });
      }
    }
  });

  for (const entity of ['node', 'edge'] as const) {
    for (const [type, definition] of Object.entries(codebook[entity] ?? {})) {
      problems.push(
        ...variableProblems(
          definition.variables,
          ['codebook', entity, type],
          localization,
        ),
      );
    }
  }
  problems.push(
    ...variableProblems(
      codebook.ego?.variables,
      ['codebook', 'ego'],
      localization,
    ),
  );

  for (const [group, entries] of Object.entries(protocol.interfaceText ?? {})) {
    for (const [key, value] of Object.entries(entries ?? {})) {
      if (
        isLocalizedString(value) &&
        lacksDefaultLanguageText(value, localization.defaultLocale)
      ) {
        problems.push({
          rule: 'interfaceTextWithoutDefaultLanguage',
          path: ['interfaceText', group, key],
          locale: localization.defaultLocale,
        });
      }
    }
  }

  return problems;
};
