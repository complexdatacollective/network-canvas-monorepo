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

import type {
  FamilyPedigreeWording,
  LocalizedString,
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
  useResolveLocalizedMessage,
  useResolveLocalizedMessageParts,
} from '../../localization/ProtocolLocalizationProvider';

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

/**
 * The words a Family Pedigree stage shows, as the stage holds them, and how
 * they are formatted in the protocol's language.
 */
export type PedigreeWords = Readonly<{
  wording: FamilyPedigreeWording;
  text: PedigreeText;
  piped: PedigreePiped;
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
export function usePedigreeWordsOf(
  wording: FamilyPedigreeWording,
): PedigreeWords {
  const text = usePedigreeText();
  const piped = usePedigreePiped();
  const locale = useKinshipLocale(wording);
  return useMemo(
    () => ({ wording, text, piped, locale }),
    [wording, text, piped, locale],
  );
}

/** The language a stage's kinship words are shown in, which can differ from
 * the interview's when the stage has no translation for it. */
export function useKinshipLocale(
  wording: FamilyPedigreeWording | undefined,
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

/**
 * A word the stage holds only while its configuration is on, such as the
 * framing question while participants choose the words. The stage's schema
 * requires it then, so it is always there when the interface asks for it.
 */
export function configuredWord(
  value: LocalizedString | undefined,
): LocalizedString {
  invariant(
    value !== undefined,
    'A Family Pedigree stage holds the words its configuration shows',
  );
  return value;
}
