import { isBlankMessage } from '../../localization/blankText.ts';
import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import type { EntityAttributeReferenceHit } from '../../utils/collectEntityAttributeReferences.ts';
import {
  collectLocalizedStrings,
  type LocalizedStringHit,
} from '../../utils/collectLocalizedStrings.ts';
import { findInterfaceOwnedOptionBindings } from '../../utils/findExclusiveVariableConflicts.ts';
import { isSuppliedOptionLabelSet } from './family-pedigree-option-labels.ts';
import { interfaceTextShownBy } from './interface-text.ts';
import type { LocalizedString } from './localized-string.ts';
import {
  stageWordingShown,
  suppliedStageSettingPaths,
} from './supplied-stage-text.ts';

type Path = readonly (string | number)[];

const keyOf = (path: Path): string => JSON.stringify(path);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Where a protocol holds the labels of the Family Pedigree's answers: copied
 * into the protocol's codebook, so they are held text, not text the interview
 * supplies when the protocol omits it.
 */
const suppliedOptionLabelPaths = (
  protocol: unknown,
  references?: readonly EntityAttributeReferenceHit[],
): ReadonlySet<string> => {
  const paths = new Set<string>();
  if (!isRecord(protocol)) return paths;
  for (const binding of findInterfaceOwnedOptionBindings(
    protocol,
    references,
  )) {
    if (!isSuppliedOptionLabelSet(binding.optionSet)) continue;
    const { entity, type } = binding.subject;
    if (entity !== 'ego' && type === undefined) continue;
    const variables = [
      'codebook',
      ...(entity === 'ego' ? ['ego'] : [entity, type ?? '']),
      'variables',
      binding.variableId,
    ];
    const variable = variables
      .slice(1)
      .reduce<unknown>(
        (current, key) => (isRecord(current) ? current[key] : undefined),
        protocol.codebook,
      );
    const options = isRecord(variable) ? variable.options : undefined;
    if (!Array.isArray(options)) continue;
    options.forEach((_option: unknown, index) => {
      paths.add(keyOf([...variables, 'options', index, 'label']));
    });
  }

  return paths;
};

/**
 * Where a protocol may hold wording Network Canvas supplies: its interface
 * text, the settings of each stage whose wording it supplies, and the labels
 * of the Family Pedigree's answers. Network Canvas has this wording only in
 * the languages it supplies, so in any other language (Mexican Spanish,
 * Swahili) the researcher writes it.
 *
 * The finish stage's closing and finished screens are left to
 * `findFinishStageTextProblems`, which knows which of them a stage shows.
 */
export const builtInWordingPaths = (
  protocol: unknown,
  references?: readonly EntityAttributeReferenceHit[],
): ReadonlySet<string> => {
  const paths = new Set<string>();
  if (!isRecord(protocol)) return paths;

  const { interfaceText, stages } = protocol;
  if (isRecord(interfaceText)) {
    for (const [group, entries] of Object.entries(interfaceText)) {
      if (!isRecord(entries)) continue;
      for (const key of Object.keys(entries)) {
        paths.add(keyOf(['interfaceText', group, key]));
      }
    }
  }

  if (Array.isArray(stages)) {
    stages.forEach((stage: unknown, index) => {
      if (!isRecord(stage) || typeof stage.type !== 'string') return;
      for (const path of suppliedStageSettingPaths(stage.type)) {
        paths.add(keyOf(['stages', index, ...path]));
      }
    });
  }

  for (const path of suppliedOptionLabelPaths(protocol, references)) {
    paths.add(path);
  }

  return paths;
};

/** Whether a path is one where a protocol may hold supplied wording. */
const isBuiltInWordingPath = (
  paths: ReadonlySet<string>,
  path: Path,
): boolean => paths.has(keyOf(path));

/**
 * The paths of text with no translation at all that may not be empty: any
 * but text declared as possibly empty (`mayBeEmpty`) and wording Network
 * Canvas supplies, which a protocol in a language it has no wording in holds
 * empty until the researcher writes it (`findBuiltInWordingProblems`).
 */
export const findEmptyTextPaths = (
  protocol: unknown,
  localizedStrings: readonly LocalizedStringHit[],
  references?: readonly EntityAttributeReferenceHit[],
): readonly (readonly (string | number)[])[] => {
  const empty = localizedStrings.filter(
    (hit) => hit.mayBeEmpty !== true && Object.keys(hit.value).length === 0,
  );
  if (empty.length === 0) return [];
  const paths = builtInWordingPaths(protocol, references);
  return empty
    .filter((hit) => !isBuiltInWordingPath(paths, hit.path))
    .map((hit) => hit.path);
};

/**
 * Wording the protocol shows that has no text in its default language,
 * counting Network Canvas's own wording for that language: every supplied
 * text the protocol shows must have text there. In a default language
 * Network Canvas has wording in (`en`, or `en-US`), the protocol needs to
 * hold none; in one it has none in (Swahili), every text shown and not held
 * in that language, until the researcher writes it or makes a language
 * Network Canvas has wording in the default. The labels of the Family
 * Pedigree's answers are copied into the codebook, so a held label without
 * text in the default language is a problem too. A protocol being written
 * may have these; one leaving its editor may not, as participants reading
 * the default language would have no words there.
 */
export type BuiltInWordingProblem = Readonly<{
  path: readonly (string | number)[];
  /** The protocol's default language, which the wording is missing in. */
  locale: LocaleTag;
}>;

const lacksText = (value: LocalizedString, locale: LocaleTag): boolean => {
  const text = Object.hasOwn(value, locale) ? value[locale] : undefined;
  return text === undefined || isBlankMessage(text);
};

export const findBuiltInWordingProblems = (
  protocol: Readonly<{
    localization: LocalizationDeclaration;
    codebook?: unknown;
    stages?: readonly unknown[];
    interfaceText?: unknown;
  }>,
): readonly BuiltInWordingProblem[] => {
  const { localization } = protocol;
  const locale = localization.defaultLocale;
  const problem = (path: Path): BuiltInWordingProblem => ({ path, locale });

  const interfaceProblems = interfaceTextShownBy(protocol)
    .filter(({ value }) => lacksText(value, locale))
    .map(({ group, key }) => problem(['interfaceText', group, key]));

  const stageProblems = (protocol.stages ?? []).flatMap(
    (stage: unknown, index) =>
      !isRecord(stage) || typeof stage.type !== 'string'
        ? []
        : stageWordingShown({ ...stage, type: stage.type }, localization)
            .filter(({ shown, value }) => shown && lacksText(value, locale))
            .map(({ path }) => problem(['stages', index, ...path])),
  );

  const optionPaths = suppliedOptionLabelPaths(protocol);
  const optionProblems = collectLocalizedStrings(protocol)
    .filter(
      (hit) =>
        isBuiltInWordingPath(optionPaths, hit.path) &&
        lacksText(hit.value, locale),
    )
    .map((hit) => problem(hit.path));

  return [...interfaceProblems, ...stageProblems, ...optionProblems];
};
