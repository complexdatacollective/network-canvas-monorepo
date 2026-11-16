'use client';

import { invariant } from 'es-toolkit';
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import {
  type CompleteFamilyPedigreeWording,
  isCompleteFamilyPedigreeWording,
  type LocalizationDeclaration,
  type LocalizedString,
} from '@codaco/protocol-validation';

import { DynamicTextParts } from '../../dynamicValues/DynamicText';
import type {
  DynamicText,
  DynamicTextPart,
} from '../../dynamicValues/resolveDynamicText';
import type { LocalizedMessageValues } from '../../localization/messageFormatter';
import {
  type LocalizedMessagePartValues,
  useContentLocale,
  useLocalizedString,
  useResolveLocalizedMessage,
  useResolveLocalizedMessageParts,
} from '../../localization/ProtocolLocalizationProvider';
import {
  type StageWording,
  stageWordingOf,
} from '../../localization/useStageWording';

/** Formats one of the stage's words, with the values its message takes. */
export type PedigreeText = (
  value: LocalizedString,
  values?: LocalizedMessageValues,
) => string;

/**
 * Formats one of the stage's words with each value it shows (a person's
 * name, an answer) kept apart from its words, as piped text is, so that it
 * is shown marked out as filled in by the interview: tinted, and not in
 * quotes (`showPiped`). A list value names each of its items.
 */
export type PedigreePiped = (
  value: LocalizedString,
  values?: LocalizedMessagePartValues,
) => DynamicText;

/** A message's parts, with the sentence they read as. */
const asDynamicText = (parts: readonly DynamicTextPart[]): DynamicText => ({
  parts,
  text: parts
    .map((part) => (typeof part === 'string' ? part : part.text))
    .join(''),
});

/** `PedigreePiped` from a way of splitting a word into its parts. */
export const pedigreePipedFrom =
  (
    partsOf: (
      value: LocalizedString,
      values: LocalizedMessagePartValues,
    ) => readonly DynamicTextPart[],
  ): PedigreePiped =>
  (value, values = {}) =>
    asDynamicText(partsOf(value, values));

/** Sentences said one after another, as one text. Undefined with none. */
export const joinPiped = (
  sentences: readonly (DynamicText | undefined)[],
): DynamicText | undefined => {
  const said = sentences.filter((sentence) => sentence !== undefined);
  if (said.length === 0) return undefined;
  return asDynamicText(
    said.flatMap((sentence, index) =>
      index === 0 ? sentence.parts : [' ', ...sentence.parts],
    ),
  );
};

/**
 * Shows a piped text as piped text is shown, values marked out. The parts sit
 * in one span, so a flex container such as a button lays the sentence out as
 * one item rather than putting its gap between a value and its words.
 */
export const showPiped = (piped: DynamicText | undefined): ReactNode =>
  piped &&
  createElement(
    'span',
    null,
    createElement(DynamicTextParts, { parts: piped.parts }),
  );

/** The stage whose words a Family Pedigree interface shows. */
type WordedPedigreeStage = Parameters<typeof stageWordingOf>[0];

/**
 * A Family Pedigree stage's `wording` as the interview shows it: the stage's
 * own text for each word in each language it holds, and Network Canvas's
 * wording in each language it does not. Every word has a text, whether or
 * not the stage's configuration shows it.
 */
const pedigreeWordingFrom = (
  stageWording: StageWording,
): CompleteFamilyPedigreeWording => {
  const wording = stageWording.below('wording');
  invariant(
    isCompleteFamilyPedigreeWording(wording),
    'Network Canvas supplies wording for every Family Pedigree word',
  );
  return wording;
};

/** `pedigreeWordingFrom` for a stage, in the protocol's languages. */
export const pedigreeWordingOf = (
  stage: WordedPedigreeStage,
  localization: LocalizationDeclaration,
): CompleteFamilyPedigreeWording =>
  pedigreeWordingFrom(stageWordingOf(stage, localization));

/**
 * The wording of a Family Pedigree's completeness tracker as the interview
 * shows it, by the kind of thing the tracker says is missing: the stage's own
 * text where it holds it, and Network Canvas's wording where it does not.
 */
export type CompletenessWording = Readonly<{
  itemText: Readonly<{
    parents: Readonly<{ listItem: LocalizedString }>;
    siblings: Readonly<{
      listItem: LocalizedString;
      noneButton: LocalizedString;
      question: LocalizedString;
    }>;
    children: Readonly<{
      listItem: LocalizedString;
      noneButton: LocalizedString;
      question: LocalizedString;
    }>;
    details: Readonly<{ listItem: LocalizedString }>;
  }>;
  recommendedNote: LocalizedString;
}>;

export const completenessWordingFrom = (
  stageWording: StageWording,
): CompletenessWording => {
  const item = (...path: readonly string[]) =>
    stageWording.text('completeness', 'itemText', ...path);
  return {
    itemText: {
      parents: { listItem: item('parents', 'listItem') },
      siblings: {
        listItem: item('siblings', 'listItem'),
        noneButton: item('siblings', 'noneButton'),
        question: item('siblings', 'question'),
      },
      children: {
        listItem: item('children', 'listItem'),
        noneButton: item('children', 'noneButton'),
        question: item('children', 'question'),
      },
      details: { listItem: item('details', 'listItem') },
    },
    recommendedNote: stageWording.text('completeness', 'recommendedNote'),
  };
};

/**
 * The words a Family Pedigree stage shows (`pedigreeWordingOf`), and how they
 * are formatted in the protocol's language.
 */
export type PedigreeWords = Readonly<{
  wording: CompleteFamilyPedigreeWording;
  text: PedigreeText;
  piped: PedigreePiped;
  /** What the participant is called, as the stage words it: its dynamic
   * values (an ego attribute, such as their name from an earlier form) are
   * written in. */
  you: string;
  /** The language the stage's kinship words are shown in, which decides how
   * one is written inside a label ("Ana’s parent"). */
  locale: string;
}>;

/** Formats a Family Pedigree word in the protocol's language. */
export function usePedigreeText(): PedigreeText {
  const resolveMessage = useResolveLocalizedMessage();
  return useCallback(
    (value, values = {}) => resolveMessage(value, values).text,
    [resolveMessage],
  );
}

/** Formats a Family Pedigree word as piped text (see `PedigreePiped`). */
export function usePedigreePiped(): PedigreePiped {
  const partsOf = useResolveLocalizedMessageParts();
  return useMemo(() => pedigreePipedFrom(partsOf), [partsOf]);
}

/** The words of the stage a Family Pedigree interface is showing. */
export function usePedigreeWordsOf(stageWording: StageWording): PedigreeWords {
  const wording = useMemo(
    () => pedigreeWordingFrom(stageWording),
    [stageWording],
  );
  const text = usePedigreeText();
  const piped = usePedigreePiped();
  const locale = useKinshipLocale(wording);
  const { text: you } = useLocalizedString(wording.you);
  return useMemo(
    () => ({ wording, text, piped, you, locale }),
    [wording, text, piped, you, locale],
  );
}

/** The language a stage's kinship words are shown in, which can differ from
 * the interview's when the stage has no translation for it. */
export function useKinshipLocale(
  wording: CompleteFamilyPedigreeWording | undefined,
): string {
  const resolveMessage = useResolveLocalizedMessage();
  const contentLocale = useContentLocale();
  return wording
    ? resolveMessage(wording.relativeTerm, { term: 'other' }).locale
    : contentLocale;
}

const PedigreeWordsContext = createContext<PedigreeWords | null>(null);

/** Gives the interface's parts the words of the stage it shows. */
export const PedigreeWordsProvider = PedigreeWordsContext.Provider;

export function usePedigreeWords(): PedigreeWords {
  const words = useContext(PedigreeWordsContext);
  invariant(
    words,
    'The Family Pedigree words are only available inside a Family Pedigree',
  );
  return words;
}
