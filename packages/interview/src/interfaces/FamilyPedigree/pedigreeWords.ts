'use client';

import { invariant } from 'es-toolkit';
import { createContext, useCallback, useContext, useMemo } from 'react';

import type {
  FamilyPedigreeWording,
  LocalizedString,
} from '@codaco/protocol-validation';

import type { LocalizedMessageValues } from '../../localization/messageFormatter';
import { useResolveLocalizedMessage } from '../../localization/ProtocolLocalizationProvider';

/** Formats one of the stage's words, with the values its message takes. */
export type PedigreeText = (
  value: LocalizedString,
  values?: LocalizedMessageValues,
) => string;

/**
 * The words a Family Pedigree stage shows, as the stage holds them, and how
 * they are formatted in the protocol's language.
 */
export type PedigreeWords = Readonly<{
  wording: FamilyPedigreeWording;
  text: PedigreeText;
}>;

/** Formats a Family Pedigree word in the protocol's language. */
export function usePedigreeText(): PedigreeText {
  const resolveMessage = useResolveLocalizedMessage();
  return useCallback(
    (value, values = {}) => resolveMessage(value, values).text,
    [resolveMessage],
  );
}

/** The words of the stage a Family Pedigree interface is showing. */
export function usePedigreeWordsOf(
  wording: FamilyPedigreeWording,
): PedigreeWords {
  const text = usePedigreeText();
  return useMemo(() => ({ wording, text }), [wording, text]);
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
